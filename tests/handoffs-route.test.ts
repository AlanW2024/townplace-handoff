import { describe, expect, it } from 'vitest';
import { withTempWorkspace, jsonRequest, isoNow } from './helpers';

async function seedHandoff(storeMod: any, opts: {
    id: string;
    roomId: string;
    status?: string;
    createdAt?: string;
}) {
    await storeMod.withStoreWrite((store: any) => {
        store.handoffs.push({
            id: opts.id,
            property_id: 'tp-soho',
            room_id: opts.roomId,
            from_dept: 'eng',
            to_dept: 'clean',
            action: '工程完成 → 可清潔',
            status: opts.status || 'pending',
            triggered_by: 'msg-seed',
            created_at: opts.createdAt || isoNow(),
            acknowledged_at: null,
            version: 1,
        });
    });
}

describe.sequential('Handoffs Route', () => {
    it('GET returns room_display_code for archived cycle handoff', async () => {
        await withTempWorkspace(async () => {
            const storeMod = await import('../src/lib/store');
            const { GET } = await import('../src/app/api/handoffs/route');

            await storeMod.withStoreWrite((store: any) => {
                store.room_cycles.push({
                    id: 'cycle-ex-17j',
                    property_id: 'tp-soho',
                    room_id: '17J',
                    display_code: 'EX 17J',
                    scope: 'archived',
                    lifecycle_status: 'archived',
                    tenant_name: 'Former Tenant',
                    check_in_at: null,
                    check_out_at: isoNow(-24 * 60 * 60 * 1000),
                    archived_from_code: '17J',
                    migrated: true,
                    created_at: isoNow(-48 * 60 * 60 * 1000),
                    updated_at: isoNow(-24 * 60 * 60 * 1000),
                });
                store.handoffs.push({
                    id: 'ho-ex-17j',
                    property_id: 'tp-soho',
                    room_id: '17J',
                    room_cycle_id: 'cycle-ex-17j',
                    from_dept: 'eng',
                    to_dept: 'clean',
                    action: '歷史週期清潔交接',
                    status: 'completed',
                    triggered_by: 'msg-ex-17j',
                    created_at: isoNow(-1000),
                    acknowledged_at: isoNow(-500),
                    version: 1,
                });
            });

            const res = await GET();
            expect(res.status).toBe(200);
            const data = await res.json();
            const archived = data.find((item: { id: string }) => item.id === 'ho-ex-17j');
            expect(archived?.room_display_code).toBe('EX 17J');
        });
    });

    it('GET returns handoffs sorted by date desc', async () => {
        await withTempWorkspace(async () => {
            const storeMod = await import('../src/lib/store');
            const { GET } = await import('../src/app/api/handoffs/route');

            await seedHandoff(storeMod, { id: 'ho-old', roomId: '10F', createdAt: isoNow(-60 * 60 * 1000) });
            await seedHandoff(storeMod, { id: 'ho-new', roomId: '23D', createdAt: isoNow() });

            const res = await GET();
            expect(res.status).toBe(200);

            const data = await res.json();
            expect(Array.isArray(data)).toBe(true);
            expect(data.length).toBeGreaterThanOrEqual(2);

            // Verify sorted desc by created_at
            for (let i = 1; i < data.length; i++) {
                expect(new Date(data[i - 1].created_at).getTime()).toBeGreaterThanOrEqual(
                    new Date(data[i].created_at).getTime()
                );
            }
        });
    });

    it('PUT with valid transition pending → acknowledged', async () => {
        await withTempWorkspace(async () => {
            const storeMod = await import('../src/lib/store');
            const { PUT } = await import('../src/app/api/handoffs/route');

            await seedHandoff(storeMod, { id: 'ho-ack-1', roomId: '10F' });

            const res = await PUT(jsonRequest('http://localhost/api/handoffs', 'PUT', {
                id: 'ho-ack-1',
                status: 'acknowledged',
                actor: 'Tester',
                reason: '確認收到',
            }));

            expect(res.status).toBe(200);
            const data = await res.json();
            expect(data.status).toBe('acknowledged');
            expect(data.acknowledged_at).toBeTruthy();
        });
    });

    it('PUT with valid transition pending → completed', async () => {
        await withTempWorkspace(async () => {
            const storeMod = await import('../src/lib/store');
            const { PUT } = await import('../src/app/api/handoffs/route');

            await seedHandoff(storeMod, { id: 'ho-comp-1', roomId: '10F' });

            const res = await PUT(jsonRequest('http://localhost/api/handoffs', 'PUT', {
                id: 'ho-comp-1',
                status: 'completed',
                actor: 'Tester',
                reason: '已完成交接',
            }));

            expect(res.status).toBe(200);
            const data = await res.json();
            expect(data.status).toBe('completed');
        });
    });

    it('PUT with valid transition acknowledged → completed', async () => {
        await withTempWorkspace(async () => {
            const storeMod = await import('../src/lib/store');
            const { PUT } = await import('../src/app/api/handoffs/route');

            await seedHandoff(storeMod, { id: 'ho-ack-comp-1', roomId: '10F' });

            // First transition: pending → acknowledged
            await PUT(jsonRequest('http://localhost/api/handoffs', 'PUT', {
                id: 'ho-ack-comp-1',
                status: 'acknowledged',
                actor: 'Tester',
                reason: '確認收到',
            }));

            // Second transition: acknowledged → completed
            const res = await PUT(jsonRequest('http://localhost/api/handoffs', 'PUT', {
                id: 'ho-ack-comp-1',
                status: 'completed',
                actor: 'Tester',
                reason: '已完成',
            }));

            expect(res.status).toBe(200);
            const data = await res.json();
            expect(data.status).toBe('completed');
        });
    });

    it('PUT invalid transition completed → pending → 400', async () => {
        await withTempWorkspace(async () => {
            const storeMod = await import('../src/lib/store');
            const { PUT } = await import('../src/app/api/handoffs/route');

            await seedHandoff(storeMod, { id: 'ho-inv-1', roomId: '10F', status: 'completed' });

            const res = await PUT(jsonRequest('http://localhost/api/handoffs', 'PUT', {
                id: 'ho-inv-1',
                status: 'pending',
                actor: 'Tester',
                reason: '想退回',
            }));

            expect(res.status).toBe(400);
            const data = await res.json();
            expect(data.error).toBeDefined();
        });
    });

    it('PUT missing actor → 400', async () => {
        await withTempWorkspace(async () => {
            const { PUT } = await import('../src/app/api/handoffs/route');

            const res = await PUT(jsonRequest('http://localhost/api/handoffs', 'PUT', {
                id: 'ho-1',
                status: 'acknowledged',
                reason: '確認',
            }));

            expect(res.status).toBe(400);
            const data = await res.json();
            expect(data.error).toContain('操作人');
        });
    });

    it('PUT missing reason → 400', async () => {
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

    it('PUT non-existent handoff → 404', async () => {
        await withTempWorkspace(async () => {
            const { PUT } = await import('../src/app/api/handoffs/route');

            const res = await PUT(jsonRequest('http://localhost/api/handoffs', 'PUT', {
                id: 'ho-nonexistent-999',
                status: 'acknowledged',
                actor: 'Tester',
                reason: '確認',
            }));

            expect(res.status).toBe(404);
            const data = await res.json();
            expect(data.error).toBe('Handoff not found');
        });
    });

    it('PUT creates audit log with actor and reason', async () => {
        await withTempWorkspace(async () => {
            const storeMod = await import('../src/lib/store');
            const { PUT } = await import('../src/app/api/handoffs/route');

            await seedHandoff(storeMod, { id: 'ho-audit-1', roomId: '10F' });

            const auditCountBefore = storeMod.getStore().audit_logs.length;

            await PUT(jsonRequest('http://localhost/api/handoffs', 'PUT', {
                id: 'ho-audit-1',
                status: 'acknowledged',
                actor: 'AuditTester',
                reason: '測試審計日誌',
            }));

            const storeAfter = storeMod.getStore();
            expect(storeAfter.audit_logs.length).toBe(auditCountBefore + 1);

            const latestLog = storeAfter.audit_logs[storeAfter.audit_logs.length - 1];
            expect(latestLog.entity_type).toBe('handoff');
            expect(latestLog.entity_id).toBe('ho-audit-1');
            expect(latestLog.actor).toBe('AuditTester');
            expect(latestLog.reason).toBe('測試審計日誌');
            expect(latestLog.from_status).toBe('pending');
            expect(latestLog.to_status).toBe('acknowledged');
        });
    });

    it('PUT increments version', async () => {
        await withTempWorkspace(async () => {
            const storeMod = await import('../src/lib/store');
            const { PUT } = await import('../src/app/api/handoffs/route');

            await seedHandoff(storeMod, { id: 'ho-ver-1', roomId: '10F' });

            const res = await PUT(jsonRequest('http://localhost/api/handoffs', 'PUT', {
                id: 'ho-ver-1',
                status: 'acknowledged',
                actor: 'Tester',
                reason: '確認',
            }));

            expect(res.status).toBe(200);
            const data = await res.json();
            expect(data.version).toBe(2);
        });
    });
});
