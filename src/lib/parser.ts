import { DeptCode, HandoffType, ParseResult } from './types';
import { analyzeHandoffSignal, extractRooms } from './message-parsing';
import { ActionPatternConfig } from './policy/types';
import { DEFAULT_ACTION_PATTERNS, DEFAULT_STAFF_DIRECTORY } from './policy/defaults';

// ===========================
// Staff → Department mapping
// ===========================
const STAFF_DEPT_MAP: Record<string, DeptCode> = {
    '𝕋𝕒𝕟𝕃': 'eng', 'tanl': 'eng', 'vic lee': 'eng', 'vic': 'eng',
    '𝕋𝕒𝕟𝕃.𝕊𝕚𝕝𝕒𝕤': 'eng',
    'kaho': 'eng', 'g.a.r.y': 'eng', 'gary eng': 'eng',
    'kaho tp soho': 'eng',
    'wing哥': 'eng', 'wing': 'eng', '阿豪': 'eng',
    'michael': 'conc', 'michael townplace': 'conc', 'josephine': 'conc', 'tp-josephine': 'conc', 'kelvin': 'conc', 'kelvin tpsoho': 'conc',
    '艾倫黃': 'conc', 'renee': 'conc', 'renee tp soho': 'conc', 'gary': 'conc', 'concierge': 'conc', '[ concierge ] townplace soho': 'conc',
    'ooo': 'hskp', '英姐': 'hskp', 'nana': 'hskp', '洛': 'hskp', 'lok': 'hskp', 'housekeeping': 'hskp',
    'don ho': 'clean', 'don': 'clean', 'hugo': 'clean', '+852 9771 1310': 'clean',
    'karen townplace': 'mgmt', 'karen chan soho': 'mgmt', 'karen chan': 'mgmt',
    'karen': 'mgmt', 'alice': 'mgmt', 'tp-alice': 'mgmt', 'tp staff karen(duty)': 'mgmt',
    'angel': 'lease', 'dennis': 'lease', 'cindy': 'lease', 'karen man': 'lease',
    'karen lung': 'comm', 'eva': 'comm',
    'eric': 'security',
};

const COMPLETION_REGEX = /(已?完成|done|完成咗)/i;
const PROGRESS_WORK_REGEX = /(已調整|調整完成|已處理|處理完成|已安裝|安裝完成|已更換|更換完成|已修復|修復完成|回復正常|已吱膠|已打膠|logged)/i;
const WORK_SCOPE_REGEX = /(油漆|門鉸|止回閥|掃口|熱水爐|安全掣|門柄|門手柄|牆身|天花|窗台|燈糟|大門|喉|閥|玻璃|床尾|膠|油|冷氣|爐|安裝|更換|調整|修補|修復|fix|logged)/i;
const CONTINUATION_REGEX = /(明天|聽日|下週|下星期|再跟進|仲有|尚有|未完|未完成|差少少|等料|等待|繼續|需時|本週|下次|tomorrow|next week)/i;

const STAFF_DEPT_ENTRIES = Object.entries(STAFF_DEPT_MAP).sort(
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

const ACTION_PATTERNS: ActionPattern[] = [
    // Engineering completion → cleaning handoff
    {
        keywords: [/已?完成.*可清/, /完成[,，]?\s*可清/, /完成.*可清潔/, /可清潔/, /可清$/],
        action: '工程完成 → 可清潔',
        type: 'handoff',
        from_dept: 'eng',
        to_dept: 'clean',
    },
    // Deep clean completion
    {
        keywords: [/[Dd]eep\s*clean.*完成/, /深層清潔.*完成/],
        action: '深層清潔完成',
        type: 'update',
        from_dept: 'clean',
    },
    // Cleaning completion
    {
        keywords: [/清潔完成/, /清潔.*完成/, /clean.*done/i, /clean.*完成/i],
        action: '清潔完成',
        type: 'update',
        from_dept: 'clean',
    },
    // Maintenance request
    {
        keywords: [/執修/, /維修/, /repair/i],
        action: '執修中',
        type: 'update',
        from_dept: 'conc',
        to_dept: 'eng',
    },
    // Damage / maintenance issues
    {
        keywords: [/脫落/, /壞/, /漏水/, /滴水/, /損壞/, /爆/, /裂/],
        action: '報修 — 需要維修',
        type: 'request',
        to_dept: 'eng',
    },
    // Check-out
    {
        keywords: [/[Cc]heck\s*out/, /退房/, /checkout/i],
        action: '退房',
        type: 'trigger',
    },
    // Check-in
    {
        keywords: [/[Cc]heck\s*in/, /入住/, /checkin/i, /有in/],
        action: '入住',
        type: 'trigger',
    },
    // Final inspection
    {
        keywords: [/[Ff]inal/, /最後檢查/],
        action: 'Final 檢查',
        type: 'update',
    },
    // Document related
    {
        keywords: [/DRF/i],
        action: 'DRF 文件',
        type: 'update',
    },
    {
        keywords: [/TA/],
        action: 'TA 文件',
        type: 'update',
    },
    {
        keywords: [/[Ss]urrender/],
        action: 'Surrender 文件',
        type: 'update',
    },
    {
        keywords: [/[Ii]nventory/],
        action: 'Inventory 文件',
        type: 'update',
    },
    // Viewing / shooting
    {
        keywords: [/[Vv]iewing/, /睇樓/, /參觀/],
        action: '預約睇樓',
        type: 'trigger',
        to_dept: 'lease',
    },
    // Silicone sealing
    {
        keywords: [/吱膠/, /打膠/],
        action: '吱膠工程',
        type: 'update',
        from_dept: 'eng',
    },
    // General query about timeline
    {
        keywords: [/幾耐/, /幾時/, /要做幾/, /幾長時間/],
        action: '查詢進度',
        type: 'query',
    },
    // Acknowledgment
    {
        keywords: [/知了/, /收到/, /noted/i, /ok/i, /好的/],
        action: '已確認',
        type: 'update',
    },
    // Cleaning arrangement
    {
        keywords: [/清潔安排/, /吉房清潔/],
        action: '清潔安排通知',
        type: 'trigger',
        from_dept: 'mgmt',
        to_dept: 'clean',
    },
];

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
        : ACTION_PATTERNS;

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
