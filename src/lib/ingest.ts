import {
    Message,
    Handoff,
    ParseReview,
    DeptCode,
    ChatType,
    ParseResult,
    AiMessageClassification,
    RoomReference,
} from './types';
import { parseMessageWithAI, ParseStrategy } from './ai/parse-message';
import { getDeptFromSender } from './parser';
import { analyzeHandoffSignal, enforceHandoffSafety, HandoffSignalAnalysis } from './message-parsing';
import { StoreData, withStoreWrite } from './store';
import { ReviewPolicy, RoomStatusRule } from './policy/types';
import { DEFAULT_REVIEW_POLICY } from './policy/defaults';
import { emitEvent } from './observability';
import { ensureRoomCycleForReference } from './room-lifecycle';

// ===========================
// Shared message ingestion logic
// Used by: /api/messages (manual send) and /api/upload (file upload)
// ===========================

interface IngestInput {
    raw_text: string;
    sender_name: string;
    sender_dept?: DeptCode | null;
    wa_group?: string;
    chat_name?: string;
    chat_type?: ChatType;
    sent_at?: string;       // ISO string; defaults to now
    id_prefix?: string;     // e.g. "msg" or "msg-upload"
    upload_batch_id?: string | null;
}

export interface IngestResult {
    message: Message;
    handoffs: Handoff[];
    review: ParseReview | null;
}

export interface ParsePreviewResult {
    senderDept: DeptCode | null;
    parsed: ParseResult;
    safeParsed: ParseResult;
    handoffSignal: HandoffSignalAnalysis;
    signals: {
        isSummary: boolean;
        isAmbiguousCompletion: boolean;
        hasFutureHandoffLanguage: boolean;
    };
    needsReview: boolean;
}

interface PreviewOptions {
    strategy?: ParseStrategy;
    reviewMode?: 'default' | 'bulk_upload';
    suppressSideEffects?: boolean;
    suppressReviews?: boolean;
    defaultClassification?: AiMessageClassification | null;
}

let ingestCounter = 0;

/**
 * Detect summary / aggregate messages that should go to review queue
 * instead of being auto-applied with a single action across all rooms.
 */
export function isSummaryMessage(rawText: string, parsed: { rooms: string[]; action: string | null }): boolean {
    const text = rawText.trim();
    const handoffSignal = analyzeHandoffSignal(text);

    // Starts with "是日跟進" or similar daily summary headers
    if (/^是日跟進|^今日跟進|^daily\s*follow/i.test(text)) return true;

    // Multi-line bullet list (2+ lines starting with - or •)
    const bulletLines = text.split('\n').filter(l => /^\s*[-•·]\s/.test(l));
    if (bulletLines.length >= 2) return true;

    if (parsed.rooms.length >= 2 && handoffSignal.allowsImmediateHandoff && !text.includes('\n')) {
        return false;
    }

    // Multiple rooms + multiple distinct action keywords in one message
    if (parsed.rooms.length >= 2) {
        const actionFamilies = [
            /[Cc]heck\s*out|退房/, /[Cc]heck\s*in|入住/, /[Ff]inal/,
            /執修|維修/, /清潔完成|[Dd]eep\s*clean/,
            /脫落|壞|漏水/, /吱膠|打膠/, /[Ll]ogged/,
        ];
        const matchedCount = actionFamilies.filter(kw => kw.test(text)).length + (handoffSignal.allowsImmediateHandoff ? 1 : 0);
        if (matchedCount >= 2) return true;
    }

    return false;
}

export function isAmbiguousEngineeringCompletion(
    rawText: string,
    parsed: { rooms: string[]; action: string | null; from_dept: DeptCode | null; confidence: number }
): boolean {
    const text = rawText.trim();
    const isEngineeringContext = parsed.from_dept === 'eng' || /工程部|師傅/.test(text);
    const hasCompletionWords = /(已?完成|done|完成咗)/i.test(text);
    const hasExplicitHandoff = /(可清(?:潔)?|ready\s*for\s*clean(?:ing)?|不影響可清(?:潔)?)/i.test(text);

    if (!isEngineeringContext || parsed.rooms.length === 0 || !hasCompletionWords || hasExplicitHandoff) {
        return false;
    }

    // Parser already considers this uncertain. Keep it out of auto-handoff / auto-clean.
    return parsed.action === '工程進度更新' && parsed.confidence < 0.75;
}

export async function previewMessageParsing(
    input: Pick<IngestInput, 'raw_text' | 'sender_name' | 'sender_dept' | 'wa_group' | 'chat_name'>,
    options?: PreviewOptions
): Promise<ParsePreviewResult> {
    const senderDept: DeptCode | null =
        input.sender_dept || getDeptFromSender(input.sender_name);

    const parsed = await parseMessageWithAI({
        rawText: input.raw_text,
        senderName: input.sender_name,
        senderDept: senderDept || undefined,
        chatName: input.chat_name || input.wa_group || 'SOHO 前線🏡🧹🦫🐿️',
    }, options);
    const safeParsed = enforceHandoffSafety(input.raw_text, parsed);
    const handoffSignal = analyzeHandoffSignal(input.raw_text);
    const isSummary = isSummaryMessage(input.raw_text, safeParsed);
    const ambiguousCompletion = isAmbiguousEngineeringCompletion(input.raw_text, safeParsed);
    const hasFutureHandoffLanguage = handoffSignal.hasExplicitPositiveHandoff && handoffSignal.hasFutureContext;
    const baseNeedsReview = shouldRequireReview(safeParsed, {
        isSummary,
        isAmbiguousCompletion: ambiguousCompletion,
        hasFutureHandoffLanguage,
    });
    const needsReview = options?.reviewMode === 'bulk_upload'
        ? shouldQueueBulkUploadReview(baseNeedsReview, safeParsed)
        : baseNeedsReview;

    return {
        senderDept,
        parsed,
        safeParsed,
        handoffSignal,
        signals: {
            isSummary,
            isAmbiguousCompletion: ambiguousCompletion,
            hasFutureHandoffLanguage,
        },
        needsReview,
    };
}

function shouldQueueBulkUploadReview(
    baseNeedsReview: boolean,
    parsed: { rooms: string[] }
): boolean {
    if (!baseNeedsReview) return false;

    // Bulk imports should keep all chat history visible without flooding the review queue
    // with room-less chatter. Ambiguous messages that still point to concrete rooms remain reviewable.
    return parsed.rooms.length > 0;
}

function deriveInitialClassification(
    preview: ParsePreviewResult,
    override?: AiMessageClassification | null
): AiMessageClassification | null {
    if (override) return override;
    if (preview.needsReview) return 'review';
    if (preview.safeParsed.action && preview.safeParsed.rooms.length > 0) return 'actionable';
    if (preview.safeParsed.action || preview.safeParsed.rooms.length > 0) return 'context';
    return 'irrelevant';
}

function getRoomRefs(parsed: ParseResult): RoomReference[] {
    return parsed.room_refs ?? parsed.rooms.map(room => ({
        physical_room_id: room,
        display_code: room,
        scope: 'active',
        raw_match: room,
    }));
}

function ingestMessageIntoStore(
    store: StoreData,
    input: IngestInput,
    preview: ParsePreviewResult,
    options?: PreviewOptions
): IngestResult {
    ingestCounter++;
    const senderDept = preview.senderDept;
    const safeParsed = preview.safeParsed;
    const handoffSignal = preview.handoffSignal;
    const roomRefs = getRoomRefs(safeParsed);

    // 3. Build message object
    const now = new Date().toISOString();
    const sentAt = input.sent_at || now;
    const prefix = input.id_prefix || 'msg';
    const chatName = input.chat_name || input.wa_group || 'SOHO 前線🏡🧹🦫🐿️';
    const chatType = input.chat_type || 'group';

    const msg: Message = {
        id: `${prefix}-${Date.now()}-${ingestCounter}`,
        property_id: 'tp-soho',
        raw_text: input.raw_text,
        sender_name: input.sender_name,
        sender_dept: senderDept || 'conc',
        wa_group: chatName,
        chat_name: chatName,
        chat_type: chatType,
        sent_at: sentAt,
        parsed_room: safeParsed.rooms,
        parsed_room_refs: roomRefs,
        parsed_action: safeParsed.action,
        parsed_type: safeParsed.type,
        confidence: safeParsed.confidence,
        parsed_explanation: safeParsed.explanation || null,
        parsed_by: safeParsed.engine || 'rules',
        parsed_model: safeParsed.model || 'rule-engine',
        upload_batch_id: input.upload_batch_id ?? null,
        ai_classification: deriveInitialClassification(preview, options?.defaultClassification),
        ai_classification_reason: options?.suppressSideEffects
            ? '批量匯入階段先保留原始訊息，等待全檔 AI 分析再重新分類。'
            : '由即時解析流程根據房號、動作和安全規則推斷。',
        created_at: now,
    };

    // 4. Add message to store
    store.messages.push(msg);

    // 5. Check if review is needed
    const needsReview = preview.needsReview;
    let review: ParseReview | null = null;

    if (needsReview && !options?.suppressReviews) {
        // Create a review entry — defer side effects until approved
        review = {
            id: `rev-${Date.now()}-${ingestCounter}`,
            property_id: 'tp-soho',
            message_id: msg.id,
            raw_text: input.raw_text,
            sender_name: input.sender_name,
            sender_dept: senderDept || 'conc',
            confidence: safeParsed.confidence,
            suggested_rooms: safeParsed.rooms,
            room_cycle_ids: roomRefs.map(ref => ensureRoomCycleForReference(store, ref).id),
            suggested_action: safeParsed.action,
            suggested_type: safeParsed.type,
            suggested_from_dept: safeParsed.from_dept,
            suggested_to_dept: safeParsed.to_dept,
            reviewed_rooms: safeParsed.rooms,
            reviewed_action: safeParsed.action,
            reviewed_type: safeParsed.type,
            reviewed_from_dept: safeParsed.from_dept,
            reviewed_to_dept: safeParsed.to_dept,
            review_status: 'pending',
            reviewed_by: null,
            reviewed_at: null,
            created_at: now,
            updated_at: now,
            version: 1,
        };
        store.parse_reviews.push(review);
    }

    // 6. Apply side effects — only if confidence is high enough
    const handoffs: Handoff[] = [];

    if (!needsReview && !options?.suppressSideEffects) {
        const effectFromDept = safeParsed.from_dept || senderDept;
        const effectToDept = safeParsed.to_dept;
        const activeRoomRefs = roomRefs.filter(ref => ref.scope === 'active');

        // Create handoffs for handoff-type messages
        if (safeParsed.type === 'handoff' && handoffSignal.allowsImmediateHandoff && effectFromDept && effectToDept) {
            for (const roomRef of activeRoomRefs) {
                const ho: Handoff = {
                    id: `ho-${Date.now()}-${ingestCounter}-${roomRef.physical_room_id}`,
                    property_id: 'tp-soho',
                    room_id: roomRef.physical_room_id,
                    room_cycle_id: ensureRoomCycleForReference(store, roomRef).id,
                    from_dept: effectFromDept,
                    to_dept: effectToDept,
                    action: safeParsed.action || '',
                    status: 'pending',
                    triggered_by: msg.id,
                    created_at: sentAt,
                    acknowledged_at: null,
                    version: 1,
                };
                store.handoffs.push(ho);
                handoffs.push(ho);
            }
        }

        // Update room statuses based on parsed action
        for (const roomRef of activeRoomRefs) {
            const room = store.rooms.find(r => r.id === roomRef.physical_room_id);
            if (!room) continue;

            applyRoomStatusUpdate(room, safeParsed.action, effectFromDept || null, msg.sender_name);
        }
    }

    emitEvent('message.ingested', 'info', {
        messageId: msg.id,
        rooms: safeParsed.rooms,
        action: safeParsed.action,
        needsReview,
        handoffCount: handoffs.length,
    });

    return { message: msg, handoffs, review };
}

export async function ingestMessage(input: IngestInput): Promise<IngestResult> {
    const preview = await previewMessageParsing(input);
    return withStoreWrite(store => ingestMessageIntoStore(store, input, preview));
}

export async function ingestMessagesBatch(
    inputs: IngestInput[],
    options?: PreviewOptions
): Promise<IngestResult[]> {
    const previews: ParsePreviewResult[] = [];
    for (const input of inputs) {
        previews.push(await previewMessageParsing(input, options));
    }

    return withStoreWrite(store =>
        inputs.map((input, index) => ingestMessageIntoStore(store, input, previews[index], options))
    );
}

/**
 * Update room status based on the parsed action.
 * Rules:
 *  - 工程完成 → 可清潔: eng=completed, clean=pending
 *  - 部分工程完成 / 工程進度更新: eng=in_progress, not ready for cleaning
 *  - 深層清潔完成 / 清潔完成: clean=completed
 *  - 執修中: eng=in_progress
 *  - 報修 — 需要維修: eng=pending
 *  - 退房: lease=checkout
 *  - 入住: lease=newlet
 *  - Final 檢查: (no direct room status change, already tracked)
 *  - 吱膠工程: eng=in_progress (minor work)
 *  - 查詢進度: no status change, but mark room updated
 */
/**
 * Determine if a parsed message should be routed to the review queue.
 */
export function shouldRequireReview(
    parsed: { confidence: number; action: string | null },
    signals: {
        isSummary: boolean;
        isAmbiguousCompletion: boolean;
        hasFutureHandoffLanguage: boolean;
    },
    policy?: ReviewPolicy
): boolean {
    const p = policy ?? DEFAULT_REVIEW_POLICY;
    return (
        parsed.confidence < p.minConfidence ||
        !parsed.action ||
        (p.alwaysReviewSummary && signals.isSummary) ||
        (p.alwaysReviewAmbiguousCompletion && signals.isAmbiguousCompletion) ||
        (p.alwaysReviewFutureHandoff && signals.hasFutureHandoffLanguage)
    );
}

export function applyRoomStatusUpdate(
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
    senderName: string,
    rules?: RoomStatusRule[]
): void {
    if (!action) return;

    const now = new Date().toISOString();
    room.last_updated_at = now;
    room.last_updated_by = senderName;

    // Try config-driven rules first
    if (rules) {
        const rule = rules.find(r => r.action === action);
        if (rule) {
            rule.apply(room);
            return;
        }
        // No matching rule — fall through to default switch for unrecognized actions
        return;
    }

    switch (action) {
        case '工程完成 → 可清潔':
            room.eng_status = 'completed';
            room.clean_status = 'pending';
            room.needs_attention = true;
            room.attention_reason = '待清潔接手';
            break;
        case '工程完成':
            room.eng_status = 'completed';
            room.needs_attention = false;
            room.attention_reason = null;
            break;
        case '部分工程完成':
            if (room.clean_status !== 'pending') {
                room.eng_status = 'in_progress';
            }
            room.needs_attention = true;
            room.attention_reason = '已完成部分工程，未可清';
            break;
        case '工程進度更新':
            if (room.clean_status !== 'pending') {
                room.eng_status = 'in_progress';
            }
            room.needs_attention = true;
            room.attention_reason = '工程仍在進行，未可清';
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
        default:
            break;
    }
}
