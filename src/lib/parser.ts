import { DeptCode, HandoffType, ParseResult } from './types';
import { analyzeHandoffSignal, extractRooms } from './message-parsing';
import { ActionPatternConfig } from './policy/types';
import { DEFAULT_ACTION_PATTERNS, DEFAULT_STAFF_DIRECTORY } from './policy/defaults';

const COMPLETION_REGEX = /(已?完成|done|完成咗)/i;
const PROGRESS_WORK_REGEX = /(已調整|調整完成|已處理|處理完成|已安裝|安裝完成|已更換|更換完成|已修復|修復完成|回復正常|已吱膠|已打膠|logged)/i;
const WORK_SCOPE_REGEX = /(油漆|門鉸|止回閥|掃口|熱水爐|安全掣|門柄|門手柄|牆身|天花|窗台|燈糟|大門|喉|閥|玻璃|床尾|膠|油|冷氣|爐|安裝|更換|調整|修補|修復|fix|logged)/i;
const CONTINUATION_REGEX = /(明天|聽日|下週|下星期|再跟進|仲有|尚有|未完|未完成|差少少|等料|等待|繼續|需時|本週|下次|tomorrow|next week)/i;

const STAFF_DEPT_ENTRIES = Object.entries(DEFAULT_STAFF_DIRECTORY).sort(
    ([aliasA], [aliasB]) => aliasB.length - aliasA.length
);

// ===========================
// Action keyword patterns
// ===========================
interface ActionPattern {
    keywords: RegExp[];
    action: string;
    type: HandoffType;
    from_dept?: DeptCode;
    to_dept?: DeptCode;
}

const COMPILED_ACTION_PATTERNS: ActionPattern[] = DEFAULT_ACTION_PATTERNS.map(p => ({
    keywords: p.keywords.map(k => new RegExp(k, 'i')),
    action: p.action,
    type: p.type,
    from_dept: p.from_dept,
    to_dept: p.to_dept,
}));

// ===========================
// Main parser function
// ===========================
export function parseWhatsAppMessage(
    rawText: string,
    senderName?: string,
    senderDept?: DeptCode,
    config?: { actionPatterns?: ActionPatternConfig[]; staffDirectory?: Record<string, DeptCode> }
): ParseResult {
    const normalizedText = rawText.replace(/\s+/g, ' ').trim();

    // 1. Extract room numbers
    const rooms = extractRooms(rawText);

    // 2. Determine sender department
    let fromDept: DeptCode | null = senderDept || null;
    if (!fromDept && senderName) {
        fromDept = getDeptFromSender(senderName, config?.staffDirectory);
    }

    // Build runtime action patterns from config or use hardcoded defaults
    const runtimePatterns: ActionPattern[] = config?.actionPatterns
        ? config.actionPatterns.map(p => ({
            keywords: p.keywords.map(k => new RegExp(k, 'i')),
            action: p.action,
            type: p.type,
            from_dept: p.from_dept,
            to_dept: p.to_dept,
        }))
        : COMPILED_ACTION_PATTERNS;

    const hasQueryWords = /幾耐|幾時|邊個時間|哪個時間|時間方便|方便|\?|？/.test(normalizedText);
    const hasDamageWords = /脫落|壞|漏水|滴水|損壞|爆|裂/.test(normalizedText);

    if (rooms.length > 0 && hasQueryWords && !hasDamageWords && /維修|工程|執修/.test(normalizedText)) {
        return {
            rooms,
            action: '查詢進度',
            type: 'query',
            from_dept: fromDept,
            to_dept: null,
            confidence: 0.95,
        };
    }

    const handoffSignal = analyzeHandoffSignal(normalizedText);
    const isEngineeringContext = fromDept === 'eng' || /工程部|師傅/.test(normalizedText);
    const hasExplicitHandoff = handoffSignal.allowsImmediateHandoff;
    const hasCompletionWords = COMPLETION_REGEX.test(normalizedText);
    const hasProgressWorkWords = PROGRESS_WORK_REGEX.test(normalizedText);
    const hasScopeDetails = WORK_SCOPE_REGEX.test(normalizedText) || /[(（].+[)）]/.test(normalizedText);
    const hasContinuationWords = CONTINUATION_REGEX.test(normalizedText);

    if (rooms.length > 0 && handoffSignal.hasExplicitPositiveHandoff && !handoffSignal.allowsImmediateHandoff) {
        return {
            rooms,
            action: '工程進度更新',
            type: 'update',
            from_dept: fromDept || (isEngineeringContext ? 'eng' : null),
            to_dept: null,
            confidence: handoffSignal.hasFutureContext ? 0.55 : 0.82,
        };
    }

    // Engineering updates often mention completed work for the day, but that does not
    // mean the whole room is ready for cleaning. Only explicit "可清/可清潔" is handoff.
    if (rooms.length > 0 && isEngineeringContext && !hasExplicitHandoff && (hasCompletionWords || hasProgressWorkWords)) {
        if (hasContinuationWords || (!hasScopeDetails && !hasProgressWorkWords)) {
            return {
                rooms,
                action: '工程進度更新',
                type: 'update',
                from_dept: fromDept || 'eng',
                to_dept: null,
                confidence: 0.68,
            };
        }

        return {
            rooms,
            action: '部分工程完成',
            type: 'update',
            from_dept: fromDept || 'eng',
            to_dept: null,
            confidence: 0.86,
        };
    }

    // 3. Match action patterns
    let bestMatch: ActionPattern | null = null;
    let bestConfidence = 0;

    for (const pattern of runtimePatterns) {
        if (pattern.type === 'handoff' && !handoffSignal.allowsImmediateHandoff) {
            continue;
        }

        for (const keyword of pattern.keywords) {
            if (keyword.test(normalizedText)) {
                const confidence = rooms.length > 0 ? 0.9 : 0.6;
                if (confidence > bestConfidence) {
                    bestConfidence = confidence;
                    bestMatch = pattern;
                }
                break;
            }
        }
    }

    if (!bestMatch) {
        if (rooms.length > 0 && fromDept === 'eng' && COMPLETION_REGEX.test(normalizedText) && !hasExplicitHandoff) {
            return {
                rooms,
                action: '工程進度更新',
                type: 'update',
                from_dept: 'eng',
                to_dept: null,
                confidence: 0.68,
            };
        }

        return {
            rooms,
            action: null,
            type: null,
            from_dept: fromDept,
            to_dept: null,
            confidence: rooms.length > 0 ? 0.3 : 0.1,
        };
    }

    // 4. Determine departments
    const finalFromDept = bestMatch.from_dept || fromDept;
    let finalToDept = bestMatch.to_dept || null;

    // Infer to_dept from action context if not set
    if (!finalToDept && bestMatch.type === 'request' && finalFromDept === 'conc') {
        finalToDept = 'eng';
    }

    // Adjust confidence
    let confidence = bestConfidence;
    if (rooms.length > 0 && bestMatch.action) confidence = Math.min(confidence + 0.05, 0.99);
    if (finalFromDept && finalToDept) confidence = Math.min(confidence + 0.05, 0.99);

    return {
        rooms,
        action: bestMatch.action,
        type: bestMatch.type,
        from_dept: finalFromDept,
        to_dept: finalToDept,
        confidence: Math.round(confidence * 100) / 100,
    };
}

// ===========================
// Determine dept from sender name
// ===========================
export function getDeptFromSender(senderName: string, directory?: Record<string, DeptCode>): DeptCode | null {
    const entries = directory
        ? Object.entries(directory).sort(([a], [b]) => b.length - a.length)
        : STAFF_DEPT_ENTRIES;

    const normalizedName = senderName.toLowerCase().trim();
    for (const [name, dept] of entries) {
        if (normalizedName === name.toLowerCase()) {
            return dept;
        }
    }
    for (const [name, dept] of entries) {
        if (normalizedName.includes(name.toLowerCase())) {
            return dept;
        }
    }
    return null;
}
