import { analyzeHandoffSignal } from './message-parsing';
import { AiMessageClassification, RoomReference } from './types';

type QueueMessage = {
    raw_text: string;
    parsed_room_refs?: RoomReference[];
    parsed_room?: string[];
    parsed_action?: string | null;
    parsed_type?: string | null;
    confidence?: number;
    sender_dept?: string | null;
};

export type QueueDecision = {
    classification: AiMessageClassification;
    reason: string;
};

function getRoomRefs(input: QueueMessage): RoomReference[] {
    if (Array.isArray(input.parsed_room_refs) && input.parsed_room_refs.length > 0) {
        return input.parsed_room_refs;
    }

    return (input.parsed_room ?? []).map(room => ({
        physical_room_id: room,
        display_code: room,
        scope: 'active',
        raw_match: room,
    }));
}

function isRoomAcknowledgment(text: string): boolean {
    const ACK_WORDS = /\b(ok+|okay|收到|好的?|noted|roger|copy|thx|thanks?|多謝|唔該|明白|知道|了解|got\s*it|will\s*do|sure|盡做)\b/i;
    const stripped = text.replace(/\d{1,2}[A-Ma-m]/g, '').replace(/\bEX\s+/gi, '').trim();
    return ACK_WORDS.test(stripped) && stripped.length < 30;
}

function isSummaryLike(text: string, roomCount: number): boolean {
    return /^(是日跟進|today follow\s*up|follow\s*up summary|summary|補充[:：]?)/i.test(text)
        || (roomCount >= 4 && /\n/.test(text));
}

export function classifyMessageForOperationalQueue(input: QueueMessage): QueueDecision {
    const text = input.raw_text.trim();
    const roomRefs = getRoomRefs(input);
    const roomCount = roomRefs.length;
    const handoffSignal = analyzeHandoffSignal(text);

    const hasQuestion = /[?？]|\b(please|can|could|how about|what about|which|when|why)\b|^(請問|有冇|係咪|點樣|點算)/i.test(text);
    const hasScheduling = /\b(book|booking|schedule|prepare|site inspection|handover)\b|安排|星期|聽日|明天|tomorrow|今日|今晚|早上|下午/i.test(text);
    const hasFyi = /\bFYI\b/i.test(text);
    const hasOperationalKeyword = /\b(check[\s-]?in|check[\s-]?out|final|inventory|surrender|newlet|viewing|booking)\b|入住|退房|工程|維修|清潔|文件|冷氣|漏水|門鎖|洗衣機|抽氣扇|燈|熱水爐/i.test(text);
    const hasCompletionWord = /\b(done|finish(?:ed)?|final)\b|完成|已做|已check[\s-]?(?:in|out)|入住|退房/i.test(text);
    const isRoomOnlyPing = roomCount > 0
        && !input.parsed_action
        && text.replace(/[\s,，、/]+/g, '').replace(/^EX/ig, '').match(/^\d{1,2}[A-M]+$/i) !== null;
    const isBriefRoomContext = roomCount > 0
        && !input.parsed_action
        && text.length <= 40
        && !hasQuestion
        && !hasScheduling
        && !hasFyi
        && !hasCompletionWord
        && !handoffSignal.hasExplicitPositiveHandoff;
    const isRoomAck = roomCount > 0 && isRoomAcknowledgment(text);
    const isAmbiguousCompletion = roomCount > 0 && !input.parsed_action && hasCompletionWord;

    if (roomCount === 0) {
        if (input.parsed_action || hasOperationalKeyword || hasScheduling || hasQuestion || hasFyi) {
            return {
                classification: 'context',
                reason: '訊息與營運流程有關，但未指向具體房間，先保留作背景。',
            };
        }

        return {
            classification: 'irrelevant',
            reason: '訊息未形成可操作房間事件，保留在原始訊息即可。',
        };
    }

    if (handoffSignal.hasExplicitPositiveHandoff && !handoffSignal.allowsImmediateHandoff) {
        return {
            classification: 'review',
            reason: '訊息涉及高風險 handoff 語句，但時態或否定語境未夠穩定，需要人工覆核。',
        };
    }

    if (isSummaryLike(text, roomCount)) {
        return {
            classification: 'context',
            reason: '訊息屬多房跟進摘要，保留作整體背景，不直接塞入人工覆核。',
        };
    }

    if (input.parsed_action) {
        return {
            classification: 'actionable',
            reason: '訊息已有穩定房間與動作，可作營運事件處理。',
        };
    }

    if (isRoomOnlyPing || isBriefRoomContext || isRoomAck) {
        return {
            classification: 'context',
            reason: '訊息只提及房號或零碎背景，保留在訊息中心即可，不需要逐條人工覆核。',
        };
    }

    if (hasQuestion || hasScheduling || hasFyi) {
        return {
            classification: 'context',
            reason: '訊息偏查詢、安排或 FYI 背景，不需要逐條人工覆核。',
        };
    }

    if (isAmbiguousCompletion) {
        return {
            classification: 'review',
            reason: '訊息提到房間完成或退房，但動作仍然太模糊，需要人手判斷。',
        };
    }

    if (hasOperationalKeyword || roomCount > 0) {
        return {
            classification: 'context',
            reason: '訊息與房間營運有關，但未去到需要人工覆核的程度。',
        };
    }

    return {
        classification: 'irrelevant',
        reason: '訊息未形成可操作事件，保留在原始紀錄即可。',
    };
}
