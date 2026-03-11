import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
    applyRoomStatusUpdate,
    isSummaryMessage,
    isAmbiguousEngineeringCompletion,
} from '../src/lib/ingest';

const originalCwd = process.cwd();

function isoNow(offsetMs = 0): string {
    return new Date(Date.now() + offsetMs).toISOString();
}

function makeRoom(id: string, overrides: Record<string, unknown> = {}) {
    const floor = Number(id.slice(0, -1));
    return {
        id,
        floor,
        unit_letter: id.slice(-1),
        room_type: 'Studio',
        eng_status: 'n_a',
        clean_status: 'n_a',
        lease_status: 'vacant',
        tenant_name: null,
        lease_start: null,
        lease_end: null,
        notes: null,
        last_updated_at: isoNow(),
        last_updated_by: null,
        needs_attention: false,
        attention_reason: null,
        ...overrides,
    };
}

async function withTempWorkspace(run: () => Promise<void>) {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'townplace-ingest-'));
    process.chdir(tempDir);
    vi.resetModules();
    try {
        await run();
    } finally {
        process.chdir(originalCwd);
        vi.resetModules();
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
}

// ===========================
// 2A: applyRoomStatusUpdate
// ===========================
describe.sequential('applyRoomStatusUpdate', () => {
    it('1. 工程完成 → 可清潔 sets eng=completed, clean=pending', () => {
        const room = makeRoom('10F');
        applyRoomStatusUpdate(room, '工程完成 → 可清潔', 'eng', 'Vic Lee');
        expect(room.eng_status).toBe('completed');
        expect(room.clean_status).toBe('pending');
        expect(room.needs_attention).toBe(true);
        expect(room.attention_reason).toBe('待清潔接手');
    });

    it('2. 工程完成 sets eng=completed, needs_attention=false', () => {
        const room = makeRoom('10F');
        applyRoomStatusUpdate(room, '工程完成', 'eng', 'Vic Lee');
        expect(room.eng_status).toBe('completed');
        expect(room.needs_attention).toBe(false);
        expect(room.attention_reason).toBeNull();
    });

    it('3. 部分工程完成 with clean_status=n_a sets eng=in_progress', () => {
        const room = makeRoom('10F', { clean_status: 'n_a' });
        applyRoomStatusUpdate(room, '部分工程完成', 'eng', 'Vic Lee');
        expect(room.eng_status).toBe('in_progress');
        expect(room.needs_attention).toBe(true);
        expect(room.attention_reason).toBe('已完成部分工程，未可清');
    });

    it('4. 部分工程完成 with clean_status=pending protects eng from change', () => {
        const room = makeRoom('10F', { eng_status: 'completed', clean_status: 'pending' });
        applyRoomStatusUpdate(room, '部分工程完成', 'eng', 'Vic Lee');
        expect(room.eng_status).toBe('completed');
        expect(room.needs_attention).toBe(true);
        expect(room.attention_reason).toBe('已完成部分工程，未可清');
    });

    it('5. 工程進度更新 with clean_status=n_a sets eng=in_progress', () => {
        const room = makeRoom('10F', { clean_status: 'n_a' });
        applyRoomStatusUpdate(room, '工程進度更新', 'eng', 'Vic Lee');
        expect(room.eng_status).toBe('in_progress');
        expect(room.needs_attention).toBe(true);
        expect(room.attention_reason).toBe('工程仍在進行，未可清');
    });

    it('6. 工程進度更新 with clean_status=pending protects eng from change', () => {
        const room = makeRoom('10F', { eng_status: 'completed', clean_status: 'pending' });
        applyRoomStatusUpdate(room, '工程進度更新', 'eng', 'Vic Lee');
        expect(room.eng_status).toBe('completed');
        expect(room.needs_attention).toBe(true);
        expect(room.attention_reason).toBe('工程仍在進行，未可清');
    });

    it('7. 深層清潔完成 sets clean=completed, needs_attention=false when lease != checkout', () => {
        const room = makeRoom('10F', { lease_status: 'vacant' });
        applyRoomStatusUpdate(room, '深層清潔完成', 'clean', 'Don Ho');
        expect(room.clean_status).toBe('completed');
        expect(room.needs_attention).toBe(false);
        expect(room.attention_reason).toBeNull();
    });

    it('8. 清潔完成 sets clean=completed', () => {
        const room = makeRoom('10F');
        applyRoomStatusUpdate(room, '清潔完成', 'clean', 'Don Ho');
        expect(room.clean_status).toBe('completed');
    });

    it('9. 清潔完成 with lease_status=checkout keeps needs_attention=true', () => {
        const room = makeRoom('10F', { lease_status: 'checkout', needs_attention: true, attention_reason: '退房後待跟進' });
        applyRoomStatusUpdate(room, '清潔完成', 'clean', 'Don Ho');
        expect(room.clean_status).toBe('completed');
        expect(room.needs_attention).toBe(true);
    });

    it('10. 執修中 sets eng=in_progress, needs_attention=true', () => {
        const room = makeRoom('18A');
        applyRoomStatusUpdate(room, '執修中', 'eng', 'Michael');
        expect(room.eng_status).toBe('in_progress');
        expect(room.needs_attention).toBe(true);
    });

    it('11. 報修 — 需要維修 sets eng=pending, needs_attention=true', () => {
        const room = makeRoom('25B');
        applyRoomStatusUpdate(room, '報修 — 需要維修', 'conc', 'Concierge');
        expect(room.eng_status).toBe('pending');
        expect(room.needs_attention).toBe(true);
    });

    it('12. 退房 sets lease=checkout, needs_attention=true', () => {
        const room = makeRoom('17J', { lease_status: 'occupied' });
        applyRoomStatusUpdate(room, '退房', 'conc', 'Concierge');
        expect(room.lease_status).toBe('checkout');
        expect(room.needs_attention).toBe(true);
    });

    it('13. 入住 sets lease=newlet, needs_attention=true', () => {
        const room = makeRoom('3M', { lease_status: 'vacant' });
        applyRoomStatusUpdate(room, '入住', 'lease', 'Karen');
        expect(room.lease_status).toBe('newlet');
        expect(room.needs_attention).toBe(true);
    });

    it('14. 吱膠工程 with eng=n_a sets eng=in_progress', () => {
        const room = makeRoom('9J', { eng_status: 'n_a' });
        applyRoomStatusUpdate(room, '吱膠工程', 'eng', '𝕋𝕒𝕟𝕃');
        expect(room.eng_status).toBe('in_progress');
        expect(room.needs_attention).toBe(true);
    });

    it('15. 吱膠工程 with eng=completed keeps eng=completed', () => {
        const room = makeRoom('9J', { eng_status: 'completed' });
        applyRoomStatusUpdate(room, '吱膠工程', 'eng', '𝕋𝕒𝕟𝕃');
        expect(room.eng_status).toBe('completed');
        expect(room.needs_attention).toBe(true);
    });

    it('16. 清潔安排通知 with clean=n_a sets clean=pending', () => {
        const room = makeRoom('10F', { clean_status: 'n_a' });
        applyRoomStatusUpdate(room, '清潔安排通知', 'mgmt', 'Karen');
        expect(room.clean_status).toBe('pending');
        expect(room.needs_attention).toBe(true);
    });

    it('17. 清潔安排通知 with clean=completed keeps clean=completed', () => {
        const room = makeRoom('10F', { clean_status: 'completed' });
        applyRoomStatusUpdate(room, '清潔安排通知', 'mgmt', 'Karen');
        expect(room.clean_status).toBe('completed');
        expect(room.needs_attention).toBe(true);
    });

    it('18. 查詢進度 sets needs_attention=true with reason 待回覆進度', () => {
        const room = makeRoom('22C');
        applyRoomStatusUpdate(room, '查詢進度', 'conc', 'Concierge');
        expect(room.needs_attention).toBe(true);
        expect(room.attention_reason).toBe('待回覆進度');
    });

    it('19. null action makes no changes', () => {
        const room = makeRoom('10F', {
            eng_status: 'completed',
            clean_status: 'pending',
            lease_status: 'vacant',
            needs_attention: true,
            attention_reason: '待清潔接手',
        });
        const before = { ...room };
        applyRoomStatusUpdate(room, null, 'eng', 'Vic Lee');
        expect(room.eng_status).toBe(before.eng_status);
        expect(room.clean_status).toBe(before.clean_status);
        expect(room.lease_status).toBe(before.lease_status);
        expect(room.needs_attention).toBe(before.needs_attention);
        expect(room.attention_reason).toBe(before.attention_reason);
        expect(room.last_updated_at).toBe(before.last_updated_at);
        expect(room.last_updated_by).toBe(before.last_updated_by);
    });
});

// ===========================
// 2B: isSummaryMessage
// ===========================
describe('isSummaryMessage', () => {
    it('1. detects 是日跟進 header as summary', () => {
        const text = '是日跟進 17 Jul 25\n- 17J已Check out\n- 8J已做Final';
        const result = isSummaryMessage(text, { rooms: ['17J', '8J'], action: null });
        expect(result).toBe(true);
    });

    it('2. detects 2+ bullet lines as summary', () => {
        const text = '- item1\n- item2';
        const result = isSummaryMessage(text, { rooms: [], action: null });
        expect(result).toBe(true);
    });

    it('3. multi-room + multi-action families returns true', () => {
        const text = '17J Check out, 8J 維修';
        const result = isSummaryMessage(text, { rooms: ['17J', '8J'], action: null });
        expect(result).toBe(true);
    });

    it('4. multi-room + single handoff + single line returns false', () => {
        const text = '28G,28F 完成，可清';
        const result = isSummaryMessage(text, { rooms: ['28G', '28F'], action: '工程完成 → 可清潔' });
        expect(result).toBe(false);
    });

    it('5. single room single action returns false', () => {
        const text = '10F 已完成，可清潔';
        const result = isSummaryMessage(text, { rooms: ['10F'], action: '工程完成 → 可清潔' });
        expect(result).toBe(false);
    });

    it('6. detects 今日跟進 header as summary', () => {
        const text = '今日跟進 items';
        const result = isSummaryMessage(text, { rooms: [], action: null });
        expect(result).toBe(true);
    });
});

// ===========================
// 2C: isAmbiguousEngineeringCompletion
// ===========================
describe('isAmbiguousEngineeringCompletion', () => {
    it('1. eng context + 完成 + no 可清 + confidence<0.75 + action=工程進度更新 → true', () => {
        const result = isAmbiguousEngineeringCompletion('19C 完成', {
            rooms: ['19C'],
            action: '工程進度更新',
            from_dept: 'eng',
            confidence: 0.6,
        });
        expect(result).toBe(true);
    });

    it('2. has 可清 → false', () => {
        const result = isAmbiguousEngineeringCompletion('19C 完成，可清', {
            rooms: ['19C'],
            action: '工程進度更新',
            from_dept: 'eng',
            confidence: 0.6,
        });
        expect(result).toBe(false);
    });

    it('3. non-eng context → false', () => {
        const result = isAmbiguousEngineeringCompletion('19C 完成', {
            rooms: ['19C'],
            action: '工程進度更新',
            from_dept: 'conc',
            confidence: 0.6,
        });
        expect(result).toBe(false);
    });

    it('4. confidence >= 0.75 → false', () => {
        const result = isAmbiguousEngineeringCompletion('19C 完成', {
            rooms: ['19C'],
            action: '工程進度更新',
            from_dept: 'eng',
            confidence: 0.80,
        });
        expect(result).toBe(false);
    });

    it('5. action != 工程進度更新 → false', () => {
        const result = isAmbiguousEngineeringCompletion('19C 完成', {
            rooms: ['19C'],
            action: '工程完成',
            from_dept: 'eng',
            confidence: 0.6,
        });
        expect(result).toBe(false);
    });
});

// ===========================
// 2D: ingestMessage integration tests
// ===========================
describe.sequential('ingestMessage integration', () => {
    it('1. high confidence handoff creates handoff + updates room + no review', async () => {
        await withTempWorkspace(async () => {
            const { ingestMessage } = await import('../src/lib/ingest');
            const storeMod = await import('../src/lib/store');

            // Ensure room 10F exists with default status
            await storeMod.withStoreWrite(store => {
                const existing = store.rooms.find(r => r.id === '10F');
                if (existing) {
                    existing.eng_status = 'n_a';
                    existing.clean_status = 'n_a';
                }
            });

            const result = await ingestMessage({
                raw_text: '10F 已完成，可清潔',
                sender_name: 'Vic Lee',
                sender_dept: 'eng',
            });

            expect(result.handoffs.length).toBeGreaterThanOrEqual(1);
            expect(result.review).toBeNull();

            const store = storeMod.getStore();
            const room = store.rooms.find(r => r.id === '10F');
            expect(room?.eng_status).toBe('completed');
            expect(room?.clean_status).toBe('pending');
        });
    });

    it('2. low confidence message creates review + no handoff', async () => {
        await withTempWorkspace(async () => {
            const { ingestMessage } = await import('../src/lib/ingest');
            const storeMod = await import('../src/lib/store');

            const result = await ingestMessage({
                raw_text: '一堆文字',
                sender_name: 'Unknown',
                sender_dept: null,
            });

            expect(result.review).not.toBeNull();
            expect(result.handoffs.length).toBe(0);

            const store = storeMod.getStore();
            expect(store.parse_reviews.length).toBeGreaterThanOrEqual(1);
        });
    });

    it('3. summary message creates review', async () => {
        await withTempWorkspace(async () => {
            const { ingestMessage } = await import('../src/lib/ingest');

            const result = await ingestMessage({
                raw_text: '是日跟進 17 Jul 25\n- 17J已Check out\n- 8J已做Final',
                sender_name: 'Concierge',
                sender_dept: 'conc',
            });

            expect(result.review).not.toBeNull();
        });
    });

    it('4. ambiguous eng completion creates review', async () => {
        await withTempWorkspace(async () => {
            const { ingestMessage } = await import('../src/lib/ingest');

            const result = await ingestMessage({
                raw_text: '19C 完成',
                sender_name: '𝕋𝕒𝕟𝕃',
                sender_dept: 'eng',
            });

            expect(result.review).not.toBeNull();
        });
    });

    it('5. future handoff language creates review', async () => {
        await withTempWorkspace(async () => {
            const { ingestMessage } = await import('../src/lib/ingest');

            const result = await ingestMessage({
                raw_text: '10F 明天可清',
                sender_name: 'Vic Lee',
                sender_dept: 'eng',
            });

            expect(result.review).not.toBeNull();
        });
    });

    it('6. batch ingest returns multiple results', async () => {
        await withTempWorkspace(async () => {
            const { ingestMessagesBatch } = await import('../src/lib/ingest');

            const results = await ingestMessagesBatch([
                {
                    raw_text: '10F 已完成，可清潔',
                    sender_name: 'Vic Lee',
                    sender_dept: 'eng',
                },
                {
                    raw_text: '23D 已完成，可清潔',
                    sender_name: 'Vic Lee',
                    sender_dept: 'eng',
                },
            ]);

            expect(results.length).toBe(2);
        });
    });
});
