import { DeptCode, HandoffType, ParseResult } from './types';

// ===========================
// Staff → Department mapping
// ===========================
const STAFF_DEPT_MAP: Record<string, DeptCode> = {
    '𝕋𝕒𝕟𝕃': 'eng', 'tanl': 'eng', 'vic lee': 'eng', 'vic': 'eng',
    'kaho': 'eng', 'g.a.r.y': 'eng', 'gary eng': 'eng',
    'wing哥': 'eng', 'wing': 'eng', '阿豪': 'eng',
    'michael': 'conc', 'josephine': 'conc', 'kelvin': 'conc',
    '艾倫黃': 'conc', 'renee': 'conc', 'gary': 'conc', 'concierge': 'conc',
    'ooo': 'hskp', '英姐': 'hskp', 'nana': 'hskp', '洛': 'hskp',
    'don ho': 'clean', 'don': 'clean', 'hugo': 'clean',
    'karen townplace': 'mgmt', 'karen chan soho': 'mgmt', 'karen chan': 'mgmt',
    'karen': 'mgmt', 'alice': 'mgmt',
    'angel': 'lease', 'dennis': 'lease', 'cindy': 'lease', 'karen man': 'lease',
    'karen lung': 'comm', 'eva': 'comm',
    'eric': 'security',
};

// ===========================
// Room number regex
// ===========================
const ROOM_REGEX = /\b(\d{1,2}[A-Ma-m])\b/g;

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
    senderDept?: DeptCode
): ParseResult {
    const normalizedText = rawText.replace(/\s+/g, ' ').trim();

    // 1. Extract room numbers
    const rooms: string[] = [];
    const roomMatches = Array.from(rawText.matchAll(ROOM_REGEX));
    for (const match of roomMatches) {
        const room = match[1].toUpperCase();
        const floor = parseInt(room.slice(0, -1));
        if (floor >= 1 && floor <= 32) {
            if (!rooms.includes(room)) rooms.push(room);
        }
    }

    // 2. Determine sender department
    let fromDept: DeptCode | null = senderDept || null;
    if (!fromDept && senderName) {
        const normalizedName = senderName.toLowerCase().trim();
        for (const [name, dept] of Object.entries(STAFF_DEPT_MAP)) {
            if (normalizedName === name.toLowerCase() || normalizedName.includes(name.toLowerCase())) {
                fromDept = dept;
                break;
            }
        }
    }

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

    // 3. Match action patterns
    let bestMatch: ActionPattern | null = null;
    let bestConfidence = 0;

    for (const pattern of ACTION_PATTERNS) {
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
        if (rooms.length > 0 && fromDept === 'eng' && /(已?完成|done)/i.test(normalizedText)) {
            return {
                rooms,
                action: '工程完成',
                type: 'update',
                from_dept: 'eng',
                to_dept: null,
                confidence: 0.88,
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
export function getDeptFromSender(senderName: string): DeptCode | null {
    const normalizedName = senderName.toLowerCase().trim();
    for (const [name, dept] of Object.entries(STAFF_DEPT_MAP)) {
        if (normalizedName === name.toLowerCase() || normalizedName.includes(name.toLowerCase())) {
            return dept;
        }
    }
    return null;
}
