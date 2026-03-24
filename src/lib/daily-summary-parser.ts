/**
 * Daily Summary Parser — 是日跟進
 *
 * Extracts room-level progress entries from WhatsApp "是日跟進" summary messages.
 * Pure functions, no side effects, no store access.
 */

import { ProgressCategory, ProgressStatus } from './types';

// ── Detection ──

const SUMMARY_MARKER = '是日跟進';

export function isDailySummaryMessage(text: string): boolean {
    return text.includes(SUMMARY_MARKER);
}

// ── Date extraction ──

/**
 * Extract the summary date from the message timestamp.
 * Returns YYYY-MM-DD.
 */
export function toSummaryDate(isoTimestamp: string): string {
    return isoTimestamp.slice(0, 10);
}

// ── Room extraction ──

const ROOM_RE = /\b(\d{1,2}[A-M])\b/g;

export function extractRooms(line: string): string[] {
    const matches: string[] = [];
    let m: RegExpExecArray | null;
    // Reset lastIndex for safety
    ROOM_RE.lastIndex = 0;
    while ((m = ROOM_RE.exec(line)) !== null) {
        matches.push(m[1]);
    }
    return Array.from(new Set(matches));
}

// ── Category classification ──

const CATEGORY_RULES: Array<{ category: ProgressCategory; pattern: RegExp }> = [
    { category: 'check_in',     pattern: /check.?in|已入住|入住|已check in/i },
    { category: 'check_out',    pattern: /check.?out|已out|out機|退房/i },
    { category: 'final',        pattern: /\bfinal\b/i },
    { category: 'ac',           pattern: /冷氣|ac\b|大金|daikin/i },
    { category: 'plumbing',     pattern: /滴水|漏水|滲水|水喉/i },
    { category: 'paint',        pattern: /油漆|批灰|髹漆/i },
    { category: 'mold',         pattern: /霉|mold|發毛/i },
    { category: 'cleaning',     pattern: /清潔|hskp|做房|吸塵/i },
    { category: 'appliance',    pattern: /洗衣機|西門子|乾衣機|電視|雪櫃|微波爐/i },
    { category: 'door_lock',    pattern: /大門|換電|門鎖|電子鎖|密碼/i },
    { category: 'pest_control', pattern: /pest|滅蟲|蟑螂|老鼠/i },
    // maintenance is broad — checked last as fallback for repair-like keywords
    { category: 'maintenance',  pattern: /工程部|維修|已修|已換|更換|安裝|拆除|修理/i },
];

export function classifyCategory(line: string): ProgressCategory {
    for (const rule of CATEGORY_RULES) {
        if (rule.pattern.test(line)) return rule.category;
    }
    return 'other';
}

// ── Status inference ──

const STATUS_RULES: Array<{ status: ProgressStatus; pattern: RegExp }> = [
    { status: 'completed',   pattern: /已完成|done|completed|已修|已換|已入住|已out|已清潔|已裝|ok|✅|已處理|已安排|已做/i },
    { status: 'in_progress', pattern: /進行中|處理中|安排中|跟進中|維修中|waiting|pending reply|排期/i },
    { status: 'follow_up',   pattern: /需跟進|跟進|follow.?up|待覆|f\/u|fu\b/i },
];

export function inferStatus(line: string): ProgressStatus {
    for (const rule of STATUS_RULES) {
        if (rule.pattern.test(line)) return rule.status;
    }
    return 'pending';
}

// ── Line splitting ──

/**
 * Split the body of a "是日跟進" message into individual action lines.
 * Handles `-` bullets, `。` bullets, numbered lists, and plain newlines.
 */
export function splitSummaryLines(bodyText: string): string[] {
    const lines = bodyText.split(/\r?\n/);
    const result: string[] = [];

    for (const raw of lines) {
        // Strip bullet prefixes: "- ", "。", "• ", "· ", "1. ", "2) " etc.
        const trimmed = raw
            .replace(/^\s*[-。•·]\s*/, '')
            .replace(/^\s*\d+[.)]\s+/, '')
            .trim();
        if (!trimmed) continue;
        // Skip the header line itself
        if (trimmed.includes(SUMMARY_MARKER)) continue;
        result.push(trimmed);
    }

    return result;
}

// ── Main parser ──

export interface ParsedProgressLine {
    rooms: string[];
    category: ProgressCategory;
    status: ProgressStatus;
    raw_line: string;
}

/**
 * Parse a full "是日跟進" message body into room progress entries.
 * Returns one ParsedProgressLine per bullet line that mentions at least one room.
 */
export function parseDailySummary(messageText: string): ParsedProgressLine[] {
    // Find body: everything after the first line containing 是日跟進
    const markerIdx = messageText.indexOf(SUMMARY_MARKER);
    if (markerIdx === -1) return [];

    // Get text after the marker line
    const afterMarker = messageText.slice(markerIdx);
    const firstNewline = afterMarker.indexOf('\n');
    const body = firstNewline === -1 ? '' : afterMarker.slice(firstNewline + 1);

    const actionLines = splitSummaryLines(body);
    const results: ParsedProgressLine[] = [];

    for (const line of actionLines) {
        const rooms = extractRooms(line);
        if (rooms.length === 0) continue;

        results.push({
            rooms,
            category: classifyCategory(line),
            status: inferStatus(line),
            raw_line: line,
        });
    }

    return results;
}
