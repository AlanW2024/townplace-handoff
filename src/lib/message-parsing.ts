import { ParseResult, RoomReference } from './types';
import { HandoffPolicy } from './policy/types';
import { DEFAULT_HANDOFF_POLICY } from './policy/defaults';
import { extractRoomReferences } from './room-lifecycle';

export const ROOM_REGEX = /\b(\d{1,2}[A-Ma-m])\b/g;

const POSITIVE_HANDOFF_REGEX = /(可清(?:潔)?|ready\s*for\s*clean(?:ing)?|不影響可清(?:潔)?)/i;
const NEGATIVE_HANDOFF_REGEX = /((?:仲)?未可清(?:潔)?|暫時唔可清(?:潔)?|唔可清(?:潔)?|不可清(?:潔)?|not\s+ready\s+for\s*clean(?:ing)?)/i;
const FUTURE_HANDOFF_REGEX = /((?:明天|聽日|稍後|稍后|之後|遲啲|遲些|later|tomorrow|afterwards|later\s+on)\s*(?:先)?\s*(?:可以)?\s*(?:ready\s*for\s*clean(?:ing)?|可清(?:潔)?)|(?:ready\s*for\s*clean(?:ing)?|可清(?:潔)?).{0,8}(?:明天|聽日|稍後|稍后|之後|遲啲|遲些|later|tomorrow|afterwards|later\s+on))/i;

export interface HandoffSignalAnalysis {
    hasExplicitPositiveHandoff: boolean;
    hasNegativeContext: boolean;
    hasFutureContext: boolean;
    allowsImmediateHandoff: boolean;
}

function normalizeText(rawText: string): string {
    return rawText.replace(/\s+/g, ' ').trim();
}

function isImmediateHandoffCandidate(result: ParseResult): boolean {
    return result.type === 'handoff' || result.action === '工程完成 → 可清潔';
}

function buildSafetyExplanation(result: ParseResult, analysis: HandoffSignalAnalysis): string {
    const base = result.explanation?.trim();
    const reason = analysis.hasNegativeContext
        ? '原文包含否定語境（例如未可清 / not ready for cleaning），不能建立即時 handoff。'
        : analysis.hasFutureContext
            ? '原文包含明天 / 稍後 / 之後等未來語境，不能視為即時 handoff。'
            : '原文沒有明確正向 handoff 關鍵字，不能建立 handoff。';

    return base ? `${base} ${reason}` : reason;
}

export function extractRooms(rawText: string): string[] {
    return extractRoomReferences(rawText).map(ref => ref.physical_room_id);
}

export function extractRoomRefs(rawText: string): RoomReference[] {
    return extractRoomReferences(rawText);
}

export function analyzeHandoffSignal(rawText: string, policy?: HandoffPolicy): HandoffSignalAnalysis {
    const normalized = normalizeText(rawText);

    const positiveRegex = policy
        ? new RegExp(`(${policy.positivePatterns.join('|')})`, 'i')
        : POSITIVE_HANDOFF_REGEX;
    const negativeRegex = policy
        ? new RegExp(`(${policy.negativePatterns.join('|')})`, 'i')
        : NEGATIVE_HANDOFF_REGEX;
    const futureRegex = policy
        ? new RegExp(`(${policy.futurePatterns.join('|')})`, 'i')
        : FUTURE_HANDOFF_REGEX;

    const hasExplicitPositiveHandoff = positiveRegex.test(normalized);
    const hasNegativeContext = negativeRegex.test(normalized);
    const hasFutureContext = futureRegex.test(normalized);

    return {
        hasExplicitPositiveHandoff,
        hasNegativeContext,
        hasFutureContext,
        allowsImmediateHandoff: hasExplicitPositiveHandoff && !hasNegativeContext && !hasFutureContext,
    };
}

export function enforceHandoffSafety(rawText: string, result: ParseResult, fallback?: ParseResult): ParseResult {
    if (!isImmediateHandoffCandidate(result)) {
        return result;
    }

    const analysis = analyzeHandoffSignal(rawText);
    if (analysis.allowsImmediateHandoff) {
        return result;
    }

    const safeFallback = fallback && !isImmediateHandoffCandidate(fallback) ? fallback : null;
    let confidence = safeFallback?.confidence ?? result.confidence;

    // Future / tentative "可清" should stay conservative and route to review.
    if (analysis.hasFutureContext) {
        confidence = Math.min(confidence, 0.55);
    } else if (analysis.hasNegativeContext) {
        confidence = Math.min(confidence, 0.82);
    }

    return {
        rooms: result.rooms.length > 0 ? result.rooms : safeFallback?.rooms ?? [],
        room_refs: result.room_refs ?? safeFallback?.room_refs,
        action: safeFallback?.action ?? '工程進度更新',
        type: safeFallback?.type ?? 'update',
        from_dept: safeFallback?.from_dept ?? result.from_dept,
        to_dept: safeFallback?.type === 'handoff' ? null : (safeFallback?.to_dept ?? null),
        confidence,
        explanation: buildSafetyExplanation(result, analysis),
    };
}
