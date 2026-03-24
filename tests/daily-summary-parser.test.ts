import { describe, expect, it } from 'vitest';
import {
    isDailySummaryMessage,
    toSummaryDate,
    extractRooms,
    classifyCategory,
    inferStatus,
    splitSummaryLines,
    parseDailySummary,
} from '../src/lib/daily-summary-parser';

// ── isDailySummaryMessage ──

describe('isDailySummaryMessage', () => {
    it('detects 是日跟進 marker', () => {
        expect(isDailySummaryMessage('是日跟進\n- 10F 已完成')).toBe(true);
    });

    it('returns false for normal message', () => {
        expect(isDailySummaryMessage('10F 已完成，可清潔')).toBe(false);
    });

    it('detects marker mid-line', () => {
        expect(isDailySummaryMessage('以下是日跟進事項：')).toBe(true);
    });
});

// ── toSummaryDate ──

describe('toSummaryDate', () => {
    it('extracts YYYY-MM-DD from ISO string', () => {
        expect(toSummaryDate('2025-11-15T09:30:00.000Z')).toBe('2025-11-15');
    });
});

// ── extractRooms ──

describe('extractRooms', () => {
    it('extracts single room', () => {
        expect(extractRooms('10F 已完成')).toEqual(['10F']);
    });

    it('extracts multiple rooms from one line', () => {
        expect(extractRooms('12E 7H 20J已換大門電')).toEqual(['12E', '7H', '20J']);
    });

    it('extracts comma-separated rooms', () => {
        expect(extractRooms('10L,22F Final done')).toEqual(['10L', '22F']);
    });

    it('deduplicates repeated rooms', () => {
        expect(extractRooms('10F 維修中, 10F 需跟進')).toEqual(['10F']);
    });

    it('returns empty for no rooms', () => {
        expect(extractRooms('全部冷氣已安排')).toEqual([]);
    });

    it('handles single-digit floors', () => {
        expect(extractRooms('3M 清潔完成')).toEqual(['3M']);
    });

    it('does not match beyond M', () => {
        expect(extractRooms('10N invalid')).toEqual([]);
    });
});

// ── classifyCategory ──

describe('classifyCategory', () => {
    it('classifies check-in', () => {
        expect(classifyCategory('已入住')).toBe('check_in');
        expect(classifyCategory('check in done')).toBe('check_in');
    });

    it('classifies check-out', () => {
        expect(classifyCategory('已out')).toBe('check_out');
        expect(classifyCategory('checkout 完成')).toBe('check_out');
    });

    it('classifies final', () => {
        expect(classifyCategory('Final done')).toBe('final');
    });

    it('classifies AC', () => {
        expect(classifyCategory('冷氣維修')).toBe('ac');
    });

    it('classifies plumbing', () => {
        expect(classifyCategory('漏水')).toBe('plumbing');
        expect(classifyCategory('滴水問題')).toBe('plumbing');
    });

    it('classifies paint', () => {
        expect(classifyCategory('油漆已完成')).toBe('paint');
    });

    it('classifies mold', () => {
        expect(classifyCategory('發霉情況')).toBe('mold');
    });

    it('classifies cleaning', () => {
        expect(classifyCategory('清潔完成')).toBe('cleaning');
        expect(classifyCategory('HSKP 做房')).toBe('cleaning');
    });

    it('classifies appliance', () => {
        expect(classifyCategory('洗衣機壞')).toBe('appliance');
        expect(classifyCategory('電視無訊號')).toBe('appliance');
    });

    it('classifies door/lock', () => {
        expect(classifyCategory('已換大門電')).toBe('door_lock');
        expect(classifyCategory('門鎖更換')).toBe('door_lock');
    });

    it('classifies pest control', () => {
        expect(classifyCategory('滅蟲安排')).toBe('pest_control');
    });

    it('classifies maintenance (general)', () => {
        expect(classifyCategory('工程部已修理')).toBe('maintenance');
        expect(classifyCategory('已換燈泡')).toBe('maintenance');
    });

    it('falls back to other', () => {
        expect(classifyCategory('租約續期通知')).toBe('other');
    });
});

// ── inferStatus ──

describe('inferStatus', () => {
    it('detects completed', () => {
        expect(inferStatus('已完成')).toBe('completed');
        expect(inferStatus('done')).toBe('completed');
        expect(inferStatus('已修好')).toBe('completed');
        expect(inferStatus('已換完')).toBe('completed');
    });

    it('detects in_progress', () => {
        expect(inferStatus('安排中')).toBe('in_progress');
        expect(inferStatus('進行中')).toBe('in_progress');
    });

    it('detects follow_up', () => {
        expect(inferStatus('需跟進')).toBe('follow_up');
        expect(inferStatus('follow up needed')).toBe('follow_up');
    });

    it('defaults to pending', () => {
        expect(inferStatus('10F 冷氣問題')).toBe('pending');
    });
});

// ── splitSummaryLines ──

describe('splitSummaryLines', () => {
    it('splits dash-prefixed lines', () => {
        const body = '是日跟進\n- 10F 清潔\n- 7B 維修';
        const lines = splitSummaryLines(body);
        expect(lines).toEqual(['10F 清潔', '7B 維修']);
    });

    it('splits 。-prefixed lines', () => {
        const body = '是日跟進\n。10F 清潔\n。7B 維修';
        const lines = splitSummaryLines(body);
        expect(lines).toEqual(['10F 清潔', '7B 維修']);
    });

    it('skips empty lines', () => {
        const body = '是日跟進\n\n- 10F 清潔\n\n- 7B 維修\n';
        const lines = splitSummaryLines(body);
        expect(lines).toEqual(['10F 清潔', '7B 維修']);
    });

    it('handles numbered list', () => {
        const body = '是日跟進\n1. 10F 清潔\n2. 7B 維修';
        const lines = splitSummaryLines(body);
        expect(lines).toEqual(['10F 清潔', '7B 維修']);
    });

    it('strips the marker line itself', () => {
        const body = '是日跟進\n- 10F done';
        const lines = splitSummaryLines(body);
        expect(lines).not.toContain('是日跟進');
    });
});

// ── parseDailySummary (integration) ──

describe('parseDailySummary', () => {
    it('parses a typical summary', () => {
        const msg = `是日跟進
- 10F 清潔已完成
- 7B 冷氣維修中
- 32A checkout done`;

        const entries = parseDailySummary(msg);
        expect(entries).toHaveLength(3);

        expect(entries[0]).toEqual({
            rooms: ['10F'],
            category: 'cleaning',
            status: 'completed',
            raw_line: '10F 清潔已完成',
        });

        expect(entries[1]).toEqual({
            rooms: ['7B'],
            category: 'ac',
            status: 'in_progress',
            raw_line: '7B 冷氣維修中',
        });

        expect(entries[2]).toEqual({
            rooms: ['32A'],
            category: 'check_out',
            status: 'completed',
            raw_line: '32A checkout done',
        });
    });

    it('handles multi-room lines', () => {
        const msg = `是日跟進
- 12E 7H 20J 已換大門電`;

        const entries = parseDailySummary(msg);
        expect(entries).toHaveLength(1);
        expect(entries[0].rooms).toEqual(['12E', '7H', '20J']);
        expect(entries[0].category).toBe('door_lock');
        expect(entries[0].status).toBe('completed');
    });

    it('skips lines without room references', () => {
        const msg = `是日跟進
- 全部冷氣已安排
- 10F final done`;

        const entries = parseDailySummary(msg);
        expect(entries).toHaveLength(1);
        expect(entries[0].rooms).toEqual(['10F']);
    });

    it('returns empty for non-summary messages', () => {
        expect(parseDailySummary('10F 已完成，可清潔')).toEqual([]);
    });

    it('handles marker in middle of line', () => {
        const msg = `以下是日跟進事項：
- 3M 油漆已完成`;

        const entries = parseDailySummary(msg);
        expect(entries).toHaveLength(1);
        expect(entries[0].rooms).toEqual(['3M']);
        expect(entries[0].category).toBe('paint');
    });

    it('handles 。 bullet format', () => {
        const msg = `是日跟進
。7J 洗衣機已換
。8J 滅蟲安排中`;

        const entries = parseDailySummary(msg);
        expect(entries).toHaveLength(2);
        expect(entries[0].category).toBe('appliance');
        expect(entries[0].status).toBe('completed');
        expect(entries[1].category).toBe('pest_control');
        expect(entries[1].status).toBe('in_progress');
    });

    it('handles comma-separated rooms', () => {
        const msg = `是日跟進
- 10L,22F Final done`;

        const entries = parseDailySummary(msg);
        expect(entries).toHaveLength(1);
        expect(entries[0].rooms).toEqual(['10L', '22F']);
        expect(entries[0].category).toBe('final');
        expect(entries[0].status).toBe('completed');
    });
});
