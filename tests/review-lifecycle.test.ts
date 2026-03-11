import { describe, expect, it } from 'vitest';
import { withTempWorkspace, jsonRequest, isoNow } from './helpers';

async function seedReview(storeMod: any, opts: {
    reviewId: string; messageId: string; rawText: string; senderName: string; senderDept: string;
    rooms: string[]; action: string; type: string; fromDept: string; toDept: string | null;
    confidence?: number;
}) {
    await storeMod.withStoreWrite((store: any) => {
        const now = isoNow();
        store.messages.push({
            id: opts.messageId, raw_text: opts.rawText, sender_name: opts.senderName,
            sender_dept: opts.senderDept, wa_group: 'Test', chat_name: 'Test', chat_type: 'group',
            sent_at: now, parsed_room: opts.rooms, parsed_action: opts.action, parsed_type: opts.type,
            confidence: opts.confidence ?? 0.5, parsed_explanation: 'test', parsed_by: 'rules',
            parsed_model: 'rule-engine', created_at: now,
        });
        store.parse_reviews.push({
            id: opts.reviewId, message_id: opts.messageId, raw_text: opts.rawText,
            sender_name: opts.senderName, sender_dept: opts.senderDept,
            confidence: opts.confidence ?? 0.5, suggested_rooms: opts.rooms,
            suggested_action: opts.action, suggested_type: opts.type,
            suggested_from_dept: opts.fromDept, suggested_to_dept: opts.toDept,
            reviewed_rooms: opts.rooms, reviewed_action: opts.action, reviewed_type: opts.type,
            reviewed_from_dept: opts.fromDept, reviewed_to_dept: opts.toDept,
            review_status: 'pending', reviewed_by: null, reviewed_at: null,
            created_at: now, updated_at: now,
        });
    });
}

describe.sequential('Review Lifecycle', () => {
    it('approve handoff → creates handoff + updates room', async () => {
        await withTempWorkspace(async () => {
            const storeMod = await import('../src/lib/store');
            const { PUT } = await import('../src/app/api/reviews/route');

            await seedReview(storeMod, {
                reviewId: 'rev-1', messageId: 'msg-1', rawText: '10F 已完成，可清潔',
                senderName: 'Vic Lee', senderDept: 'eng',
                rooms: ['10F'], action: '工程完成 → 可清潔', type: 'handoff',
                fromDept: 'eng', toDept: 'clean',
            });

            const res = await PUT(jsonRequest('http://localhost/api/reviews', 'PUT', {
                id: 'rev-1', review_status: 'approved', reviewed_by: 'Tester',
            }));

            expect(res.status).toBe(200);
            const data = await res.json();
            expect(data.review_status).toBe('approved');

            const store = storeMod.getStore();
            const handoff = store.handoffs.find(h => h.room_id === '10F' && h.triggered_by === 'msg-1');
            expect(handoff).toBeDefined();
            expect(handoff!.from_dept).toBe('eng');
            expect(handoff!.to_dept).toBe('clean');

            const room = store.rooms.find(r => r.id === '10F');
            expect(room!.eng_status).toBe('completed');
            expect(room!.clean_status).toBe('pending');
        });
    });

    it('approve update → updates room, no handoff', async () => {
        await withTempWorkspace(async () => {
            const storeMod = await import('../src/lib/store');
            const { PUT } = await import('../src/app/api/reviews/route');

            await seedReview(storeMod, {
                reviewId: 'rev-2', messageId: 'msg-2', rawText: '18A執修',
                senderName: 'Michael', senderDept: 'conc',
                rooms: ['18A'], action: '執修中', type: 'update',
                fromDept: 'conc', toDept: 'eng',
            });

            const res = await PUT(jsonRequest('http://localhost/api/reviews', 'PUT', {
                id: 'rev-2', review_status: 'approved', reviewed_by: 'Tester',
            }));

            expect(res.status).toBe(200);

            const store = storeMod.getStore();
            const handoffs = store.handoffs.filter(h => h.room_id === '18A' && h.triggered_by === 'msg-2');
            expect(handoffs).toHaveLength(0);

            const room = store.rooms.find(r => r.id === '18A');
            expect(room!.eng_status).toBe('in_progress');
        });
    });

    it('correct with new rooms/action → uses corrections', async () => {
        await withTempWorkspace(async () => {
            const storeMod = await import('../src/lib/store');
            const { PUT } = await import('../src/app/api/reviews/route');

            await seedReview(storeMod, {
                reviewId: 'rev-3', messageId: 'msg-3', rawText: '10F 可清',
                senderName: 'Vic Lee', senderDept: 'eng',
                rooms: ['10F'], action: '工程進度更新', type: 'update',
                fromDept: 'eng', toDept: null,
            });

            const res = await PUT(jsonRequest('http://localhost/api/reviews', 'PUT', {
                id: 'rev-3', review_status: 'corrected', reviewed_by: 'Tester',
                reviewed_rooms: ['10F'], reviewed_action: '工程完成 → 可清潔',
                reviewed_type: 'handoff', reviewed_from_dept: 'eng', reviewed_to_dept: 'clean',
            }));

            expect(res.status).toBe(200);

            const store = storeMod.getStore();
            // rawText '10F 可清' has positive handoff signal and no negative/future context
            const handoff = store.handoffs.find(h => h.room_id === '10F' && h.triggered_by === 'msg-3');
            expect(handoff).toBeDefined();
            expect(handoff!.from_dept).toBe('eng');
            expect(handoff!.to_dept).toBe('clean');

            const room = store.rooms.find(r => r.id === '10F');
            expect(room!.eng_status).toBe('completed');
            expect(room!.clean_status).toBe('pending');
        });
    });

    it('dismiss → no side effects', async () => {
        await withTempWorkspace(async () => {
            const storeMod = await import('../src/lib/store');
            const { PUT } = await import('../src/app/api/reviews/route');

            await seedReview(storeMod, {
                reviewId: 'rev-4', messageId: 'msg-4', rawText: '10F 已完成，可清潔',
                senderName: 'Vic Lee', senderDept: 'eng',
                rooms: ['10F'], action: '工程完成 → 可清潔', type: 'handoff',
                fromDept: 'eng', toDept: 'clean',
            });

            const storeBefore = storeMod.getStore();
            const handoffCountBefore = storeBefore.handoffs.length;

            const res = await PUT(jsonRequest('http://localhost/api/reviews', 'PUT', {
                id: 'rev-4', review_status: 'dismissed', reviewed_by: 'Tester',
            }));

            expect(res.status).toBe(200);
            const data = await res.json();
            expect(data.review_status).toBe('dismissed');

            const storeAfter = storeMod.getStore();
            expect(storeAfter.handoffs.length).toBe(handoffCountBefore);

            // Room should not have changed due to this review
            const roomBefore = storeBefore.rooms.find(r => r.id === '10F');
            const roomAfter = storeAfter.rooms.find(r => r.id === '10F');
            expect(roomAfter!.eng_status).toBe(roomBefore!.eng_status);
            expect(roomAfter!.clean_status).toBe(roomBefore!.clean_status);
        });
    });

    it('duplicate approval → 409', async () => {
        await withTempWorkspace(async () => {
            const storeMod = await import('../src/lib/store');
            const { PUT } = await import('../src/app/api/reviews/route');

            await seedReview(storeMod, {
                reviewId: 'rev-5', messageId: 'msg-5', rawText: '10F 已完成，可清潔',
                senderName: 'Vic Lee', senderDept: 'eng',
                rooms: ['10F'], action: '工程完成 → 可清潔', type: 'handoff',
                fromDept: 'eng', toDept: 'clean',
            });

            const first = await PUT(jsonRequest('http://localhost/api/reviews', 'PUT', {
                id: 'rev-5', review_status: 'approved', reviewed_by: 'Tester',
            }));
            expect(first.status).toBe(200);

            const second = await PUT(jsonRequest('http://localhost/api/reviews', 'PUT', {
                id: 'rev-5', review_status: 'approved', reviewed_by: 'Tester',
            }));
            expect(second.status).toBe(409);

            const body = await second.json();
            expect(body.error).toContain('已處理');
        });
    });

    it('conflicting pending reviews → 409', async () => {
        await withTempWorkspace(async () => {
            const storeMod = await import('../src/lib/store');
            const { PUT } = await import('../src/app/api/reviews/route');

            // Seed two pending reviews for the same room (10F)
            await seedReview(storeMod, {
                reviewId: 'rev-6a', messageId: 'msg-6a', rawText: '10F 已完成，可清潔',
                senderName: 'Vic Lee', senderDept: 'eng',
                rooms: ['10F'], action: '工程完成 → 可清潔', type: 'handoff',
                fromDept: 'eng', toDept: 'clean',
            });
            await seedReview(storeMod, {
                reviewId: 'rev-6b', messageId: 'msg-6b', rawText: '10F 執修中',
                senderName: 'Michael', senderDept: 'conc',
                rooms: ['10F'], action: '執修中', type: 'update',
                fromDept: 'conc', toDept: 'eng',
            });

            // Try to approve the first one — should fail because the other overlaps on room 10F
            const res = await PUT(jsonRequest('http://localhost/api/reviews', 'PUT', {
                id: 'rev-6a', review_status: 'approved', reviewed_by: 'Tester',
            }));

            expect(res.status).toBe(409);
            const body = await res.json();
            expect(body.error).toContain('衝突');
        });
    });

    it('handoff deduplication', async () => {
        await withTempWorkspace(async () => {
            const storeMod = await import('../src/lib/store');
            const { PUT } = await import('../src/app/api/reviews/route');

            await seedReview(storeMod, {
                reviewId: 'rev-7', messageId: 'msg-7', rawText: '10F 已完成，可清潔',
                senderName: 'Vic Lee', senderDept: 'eng',
                rooms: ['10F'], action: '工程完成 → 可清潔', type: 'handoff',
                fromDept: 'eng', toDept: 'clean',
            });

            // Pre-create an identical handoff in the store
            await storeMod.withStoreWrite((store: any) => {
                store.handoffs.push({
                    id: 'ho-existing', room_id: '10F', from_dept: 'eng', to_dept: 'clean',
                    action: '工程完成 → 可清潔', status: 'pending', triggered_by: 'msg-7',
                    created_at: isoNow(), acknowledged_at: null,
                });
            });

            const countBefore = storeMod.getStore().handoffs.filter(h => h.room_id === '10F').length;

            const res = await PUT(jsonRequest('http://localhost/api/reviews', 'PUT', {
                id: 'rev-7', review_status: 'approved', reviewed_by: 'Tester',
            }));

            expect(res.status).toBe(200);

            const countAfter = storeMod.getStore().handoffs.filter(h => h.room_id === '10F').length;
            expect(countAfter).toBe(countBefore);
        });
    });

    it('invalid review_status → 400', async () => {
        await withTempWorkspace(async () => {
            const { PUT } = await import('../src/app/api/reviews/route');

            const res = await PUT(jsonRequest('http://localhost/api/reviews', 'PUT', {
                id: 'rev-any', review_status: 'pending',
            }));

            expect(res.status).toBe(400);
        });
    });

    it('non-existent review → 404', async () => {
        await withTempWorkspace(async () => {
            const { PUT } = await import('../src/app/api/reviews/route');

            const res = await PUT(jsonRequest('http://localhost/api/reviews', 'PUT', {
                id: 'nonexistent', review_status: 'approved', reviewed_by: 'Tester',
            }));

            expect(res.status).toBe(404);
            const body = await res.json();
            expect(body.error).toBe('Review not found');
        });
    });

    it('approve updates linked message', async () => {
        await withTempWorkspace(async () => {
            const storeMod = await import('../src/lib/store');
            const { PUT } = await import('../src/app/api/reviews/route');

            await seedReview(storeMod, {
                reviewId: 'rev-10', messageId: 'msg-10', rawText: '10F 已完成，可清潔',
                senderName: 'Vic Lee', senderDept: 'eng',
                rooms: ['10F'], action: '工程完成 → 可清潔', type: 'handoff',
                fromDept: 'eng', toDept: 'clean',
            });

            const res = await PUT(jsonRequest('http://localhost/api/reviews', 'PUT', {
                id: 'rev-10', review_status: 'approved', reviewed_by: 'Tester',
            }));

            expect(res.status).toBe(200);

            const store = storeMod.getStore();
            const msg = store.messages.find(m => m.id === 'msg-10');
            expect(msg).toBeDefined();
            expect(msg!.parsed_by).toBe('review');
            expect(msg!.parsed_model).toBe('human-review');
        });
    });

    it('corrected with enforceHandoffSafety blocking', async () => {
        await withTempWorkspace(async () => {
            const storeMod = await import('../src/lib/store');
            const { PUT } = await import('../src/app/api/reviews/route');

            // rawText contains negative context '未可清潔'
            await seedReview(storeMod, {
                reviewId: 'rev-11', messageId: 'msg-11', rawText: '10F 未可清潔',
                senderName: 'Vic Lee', senderDept: 'eng',
                rooms: ['10F'], action: '工程完成 → 可清潔', type: 'handoff',
                fromDept: 'eng', toDept: 'clean',
            });

            const res = await PUT(jsonRequest('http://localhost/api/reviews', 'PUT', {
                id: 'rev-11', review_status: 'corrected', reviewed_by: 'Tester',
                reviewed_type: 'handoff',
            }));

            expect(res.status).toBe(200);

            const store = storeMod.getStore();
            // enforceHandoffSafety should block handoff creation because raw text has negative context
            // analyzeHandoffSignal('10F 未可清潔') => hasNegativeContext=true => allowsImmediateHandoff=false
            const handoff = store.handoffs.find(h => h.room_id === '10F' && h.triggered_by === 'msg-11');
            expect(handoff).toBeUndefined();

            // enforceHandoffSafety downgrades the type from 'handoff' to 'update'
            const review = store.parse_reviews.find(r => r.id === 'rev-11');
            expect(review).toBeDefined();
            expect(review!.reviewed_type).not.toBe('handoff');

            // Confidence should be capped by enforceHandoffSafety (negative context caps to 0.82)
            const msg = store.messages.find(m => m.id === 'msg-11');
            expect(msg).toBeDefined();
            expect(msg!.confidence).toBeLessThanOrEqual(0.82);
        });
    });

    it('approve non-handoff type with room → room updated, no handoff', async () => {
        await withTempWorkspace(async () => {
            const storeMod = await import('../src/lib/store');
            const { PUT } = await import('../src/app/api/reviews/route');

            await seedReview(storeMod, {
                reviewId: 'rev-12', messageId: 'msg-12', rawText: '25B 漏水',
                senderName: 'Concierge', senderDept: 'conc',
                rooms: ['25B'], action: '報修 — 需要維修', type: 'request',
                fromDept: 'conc', toDept: 'eng',
            });

            const res = await PUT(jsonRequest('http://localhost/api/reviews', 'PUT', {
                id: 'rev-12', review_status: 'approved', reviewed_by: 'Tester',
            }));

            expect(res.status).toBe(200);

            const store = storeMod.getStore();
            // Type is 'request', not 'handoff', so no handoff should be created
            const handoffs = store.handoffs.filter(h => h.room_id === '25B' && h.triggered_by === 'msg-12');
            expect(handoffs).toHaveLength(0);

            // Room should be updated based on '報修 — 需要維修' action
            const room = store.rooms.find(r => r.id === '25B');
            expect(room!.eng_status).toBe('pending');
        });
    });
});
