import { Message, Handoff, ParseReview, DeptCode } from './types';
import { parseWhatsAppMessage, getDeptFromSender } from './parser';
import { getStore, saveStore } from './store';

// ===========================
// Shared message ingestion logic
// Used by: /api/messages (manual send) and /api/upload (file upload)
// ===========================

interface IngestInput {
    raw_text: string;
    sender_name: string;
    sender_dept?: DeptCode | null;
    wa_group?: string;
    sent_at?: string;       // ISO string; defaults to now
    id_prefix?: string;     // e.g. "msg" or "msg-upload"
}

interface IngestResult {
    message: Message;
    handoffs: Handoff[];
    review: ParseReview | null;
}

let ingestCounter = 0;

/**
 * Detect summary / aggregate messages that should go to review queue
 * instead of being auto-applied with a single action across all rooms.
 */
function isSummaryMessage(rawText: string, parsed: { rooms: string[]; action: string | null }): boolean {
    const text = rawText.trim();

    // Starts with "是日跟進" or similar daily summary headers
    if (/^是日跟進|^今日跟進|^daily\s*follow/i.test(text)) return true;

    // Multi-line bullet list (2+ lines starting with - or •)
    const bulletLines = text.split('\n').filter(l => /^\s*[-•·]\s/.test(l));
    if (bulletLines.length >= 2) return true;

    // Multiple rooms + multiple distinct action keywords in one message
    if (parsed.rooms.length >= 2) {
        const actionKeywords = [
            /[Cc]heck\s*out|退房/, /[Cc]heck\s*in|入住/, /[Ff]inal/,
            /完成.*可清|可清潔|可清$/, /執修|維修/, /清潔完成|[Dd]eep\s*clean/,
            /脫落|壞|漏水/, /吱膠|打膠/, /[Ll]ogged/,
        ];
        const matchedCount = actionKeywords.filter(kw => kw.test(text)).length;
        if (matchedCount >= 2) return true;
    }

    return false;
}

export function ingestMessage(input: IngestInput): IngestResult {
    const store = getStore();
    ingestCounter++;

    // 1. Determine sender department
    const senderDept: DeptCode | null =
        input.sender_dept || getDeptFromSender(input.sender_name);

    // 2. Parse message with AI-simulated parser
    const parsed = parseWhatsAppMessage(
        input.raw_text,
        input.sender_name,
        senderDept || undefined
    );

    // 3. Build message object
    const now = new Date().toISOString();
    const sentAt = input.sent_at || now;
    const prefix = input.id_prefix || 'msg';

    const msg: Message = {
        id: `${prefix}-${Date.now()}-${ingestCounter}`,
        raw_text: input.raw_text,
        sender_name: input.sender_name,
        sender_dept: senderDept || 'conc',
        wa_group: input.wa_group || '工程+禮賓',
        sent_at: sentAt,
        parsed_room: parsed.rooms,
        parsed_action: parsed.action,
        parsed_type: parsed.type,
        confidence: parsed.confidence,
        created_at: now,
    };

    // 4. Add message to store
    store.messages.push(msg);

    // 5. Check if review is needed
    const isSummary = isSummaryMessage(input.raw_text, parsed);
    const needsReview = parsed.confidence < 0.75 || !parsed.action || isSummary;
    let review: ParseReview | null = null;

    if (needsReview) {
        // Create a review entry — defer side effects until approved
        review = {
            id: `rev-${Date.now()}-${ingestCounter}`,
            message_id: msg.id,
            raw_text: input.raw_text,
            sender_name: input.sender_name,
            sender_dept: senderDept || 'conc',
            confidence: parsed.confidence,
            suggested_rooms: parsed.rooms,
            suggested_action: parsed.action,
            suggested_type: parsed.type,
            suggested_from_dept: parsed.from_dept,
            suggested_to_dept: parsed.to_dept,
            reviewed_rooms: parsed.rooms,
            reviewed_action: parsed.action,
            reviewed_type: parsed.type,
            reviewed_from_dept: parsed.from_dept,
            reviewed_to_dept: parsed.to_dept,
            review_status: 'pending',
            reviewed_by: null,
            reviewed_at: null,
            created_at: now,
            updated_at: now,
        };
        store.parse_reviews.push(review);
    }

    // 6. Apply side effects — only if confidence is high enough
    const handoffs: Handoff[] = [];

    if (!needsReview) {
        const effectFromDept = parsed.from_dept || senderDept;
        const effectToDept = parsed.to_dept;

        // Create handoffs for handoff-type messages
        if (parsed.type === 'handoff' && effectFromDept && effectToDept) {
            for (const roomId of parsed.rooms) {
                const ho: Handoff = {
                    id: `ho-${Date.now()}-${ingestCounter}-${roomId}`,
                    room_id: roomId,
                    from_dept: effectFromDept,
                    to_dept: effectToDept,
                    action: parsed.action || '',
                    status: 'pending',
                    triggered_by: msg.id,
                    created_at: sentAt,
                    acknowledged_at: null,
                };
                store.handoffs.push(ho);
                handoffs.push(ho);
            }
        }

        // Update room statuses based on parsed action
        for (const roomId of parsed.rooms) {
            const room = store.rooms.find(r => r.id === roomId);
            if (!room) continue;

            applyRoomStatusUpdate(room, parsed.action, effectFromDept || null, msg.sender_name);
        }
    }

    saveStore(store);

    return { message: msg, handoffs, review };
}

/**
 * Update room status based on the parsed action.
 * Rules:
 *  - 工程完成 → 可清潔: eng=completed, clean=pending
 *  - 深層清潔完成 / 清潔完成: clean=completed
 *  - 執修中: eng=in_progress
 *  - 報修 — 需要維修: eng=pending
 *  - 退房: lease=checkout
 *  - 入住: lease=newlet
 *  - Final 檢查: (no direct room status change, already tracked)
 *  - 吱膠工程: eng=in_progress (minor work)
 *  - 查詢進度: no status change, but mark room updated
 */
function applyRoomStatusUpdate(
    room: {
        eng_status: string;
        clean_status: string;
        lease_status: string;
        last_updated_at: string;
        last_updated_by: string | null;
        needs_attention: boolean;
        attention_reason: string | null;
    },
    action: string | null,
    fromDept: DeptCode | null,
    senderName: string
): void {
    if (!action) return;

    const now = new Date().toISOString();
    room.last_updated_at = now;
    room.last_updated_by = senderName;

    switch (action) {
        case '工程完成 → 可清潔':
            room.eng_status = 'completed';
            room.clean_status = 'pending';
            room.needs_attention = true;
            room.attention_reason = '待清潔接手';
            break;
        case '工程完成':
            room.eng_status = 'completed';
            room.attention_reason = null;
            break;
        case '深層清潔完成':
        case '清潔完成':
            room.clean_status = 'completed';
            if (room.lease_status !== 'checkout') {
                room.needs_attention = false;
                room.attention_reason = null;
            }
            break;
        case '執修中':
            room.eng_status = 'in_progress';
            room.needs_attention = true;
            room.attention_reason = '工程跟進中';
            break;
        case '報修 — 需要維修':
            room.eng_status = 'pending';
            room.needs_attention = true;
            room.attention_reason = '待工程處理';
            break;
        case '退房':
            room.lease_status = 'checkout';
            room.needs_attention = true;
            room.attention_reason = '退房後待跟進';
            break;
        case '入住':
            room.lease_status = 'newlet';
            room.needs_attention = true;
            room.attention_reason = '入住前準備';
            break;
        case '吱膠工程':
            if (room.eng_status === 'n_a') {
                room.eng_status = 'in_progress';
            }
            room.needs_attention = true;
            room.attention_reason = '工程跟進中';
            break;
        case '清潔安排通知':
            if (room.clean_status === 'n_a') {
                room.clean_status = 'pending';
            }
            room.needs_attention = true;
            room.attention_reason = '已安排清潔';
            break;
        case '查詢進度':
            room.needs_attention = true;
            room.attention_reason = '待回覆進度';
            break;
        // query / update / acknowledgment: no room status change needed
        default:
            break;
    }
}
