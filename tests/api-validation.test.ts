import { describe, expect, it } from 'vitest';
import { withTempWorkspace, jsonRequest, isoNow } from './helpers';

describe.sequential('API Validation', () => {
    it('invalid JSON body → 400 response', async () => {
        await withTempWorkspace(async () => {
            const { POST } = await import('../src/app/api/messages/route');

            const req = new Request('http://localhost/api/messages', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: 'not json',
            });

            const res = await POST(req);
            expect(res.status).toBe(400);

            const data = await res.json();
            expect(data.error).toBeDefined();
        });
    });

    it('followup POST with invalid priority → 400', async () => {
        await withTempWorkspace(async () => {
            const { POST } = await import('../src/app/api/followups/route');

            const res = await POST(jsonRequest('http://localhost/api/followups', 'POST', {
                title: '測試',
                description: '測試',
                actor: 'Tester',
                reason: '測試',
                assigned_dept: 'eng',
                priority: 'super_urgent',
            }));

            expect(res.status).toBe(400);
            const data = await res.json();
            expect(data.error).toContain('priority');
        });
    });

    it('bookings POST with negative duration_minutes → 400', async () => {
        await withTempWorkspace(async () => {
            const { POST } = await import('../src/app/api/bookings/route');

            const res = await POST(jsonRequest('http://localhost/api/bookings', 'POST', {
                booking_type: 'viewing',
                dept: 'lease',
                scheduled_at: isoNow(24 * 60 * 60 * 1000),
                duration_minutes: -30,
                room_id: '10F',
                booked_by: 'Tester',
            }));

            expect(res.status).toBe(400);
            const data = await res.json();
            expect(data.error).toContain('duration_minutes');
        });
    });

    it('messages POST with empty raw_text → 400', async () => {
        await withTempWorkspace(async () => {
            const { POST } = await import('../src/app/api/messages/route');

            const res = await POST(jsonRequest('http://localhost/api/messages', 'POST', {
                raw_text: '',
                sender_name: 'Tester',
                sender_dept: 'eng',
            }));

            expect(res.status).toBe(400);
            const data = await res.json();
            expect(data.error).toContain('raw_text');
        });
    });

    it('handoff PUT without actor → 400', async () => {
        await withTempWorkspace(async () => {
            const { PUT } = await import('../src/app/api/handoffs/route');

            const res = await PUT(jsonRequest('http://localhost/api/handoffs', 'PUT', {
                id: 'ho-1',
                status: 'acknowledged',
                reason: '測試',
            }));

            expect(res.status).toBe(400);
            const data = await res.json();
            expect(data.error).toContain('操作人');
        });
    });

    it('handoff PUT without reason → 400', async () => {
        await withTempWorkspace(async () => {
            const { PUT } = await import('../src/app/api/handoffs/route');

            const res = await PUT(jsonRequest('http://localhost/api/handoffs', 'PUT', {
                id: 'ho-1',
                status: 'acknowledged',
                actor: 'Tester',
            }));

            expect(res.status).toBe(400);
            const data = await res.json();
            expect(data.error).toContain('原因');
        });
    });

    it('handoff PUT invalid state transition (completed → pending) → 400', async () => {
        await withTempWorkspace(async () => {
            const storeMod = await import('../src/lib/store');
            const { PUT } = await import('../src/app/api/handoffs/route');

            // Create a completed handoff
            await storeMod.withStoreWrite((store: any) => {
                store.handoffs.push({
                    id: 'ho-completed-1',
                    property_id: 'tp-soho',
                    room_id: '10F',
                    from_dept: 'eng',
                    to_dept: 'clean',
                    action: '工程完成 → 可清潔',
                    status: 'completed',
                    triggered_by: 'msg-1',
                    created_at: isoNow(),
                    acknowledged_at: isoNow(),
                    version: 1,
                });
            });

            const res = await PUT(jsonRequest('http://localhost/api/handoffs', 'PUT', {
                id: 'ho-completed-1',
                status: 'pending',
                actor: 'Tester',
                reason: '想退回',
            }));

            expect(res.status).toBe(400);
            const data = await res.json();
            expect(data.error).toBeDefined();
        });
    });

    it('document PUT with expectedVersion mismatch → 409', async () => {
        await withTempWorkspace(async () => {
            const { PUT } = await import('../src/app/api/documents/route');

            // Seed doc-001 has version=1
            const res = await PUT(jsonRequest('http://localhost/api/documents', 'PUT', {
                id: 'doc-001',
                status: 'pending_sign',
                actor: 'Tester',
                reason: '推進',
                expectedVersion: 999, // wrong version
            }));

            expect(res.status).toBe(409);
            const data = await res.json();
            expect(data.error).toContain('版本衝突');
        });
    });
});
