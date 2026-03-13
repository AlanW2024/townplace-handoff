import { describe, expect, it } from 'vitest';
import { withTempWorkspace, jsonRequest } from './helpers';

interface AuditEntry {
    action: string;
    from_status: string | null;
    to_status: string | null;
    changes: Array<{ field: string; from: string | null; to: string | null }>;
}

describe.sequential('Document Pipeline', () => {
    it('GET returns archived room display code when document is attached to archived cycle', async () => {
        await withTempWorkspace(async () => {
            const storeMod = await import('../src/lib/store');
            const { GET } = await import('../src/app/api/documents/route');

            await storeMod.withStoreWrite((store: any) => {
                store.documents.push({
                    id: 'doc-ex-2a',
                    property_id: 'tp-soho',
                    room_id: '2A',
                    room_cycle_id: 'cycle-ex-2a',
                    doc_type: 'TA',
                    status: 'preparing',
                    current_holder: 'Leasing',
                    notes: '歷史週期文件',
                    days_outstanding: 1,
                    updated_at: new Date().toISOString(),
                    version: 1,
                });
                store.room_cycles.push({
                    id: 'cycle-ex-2a',
                    property_id: 'tp-soho',
                    room_id: '2A',
                    display_code: 'EX 2A',
                    scope: 'archived',
                    lifecycle_status: 'archived',
                    tenant_name: 'Former Tenant',
                    check_in_at: null,
                    check_out_at: new Date().toISOString(),
                    archived_from_code: '2A',
                    migrated: true,
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                });
            });

            const response = await GET();
            expect(response.status).toBe(200);

            const data = await response.json() as Array<{ id: string; room_display_code?: string }>;
            const record = data.find(item => item.id === 'doc-ex-2a');
            expect(record?.room_display_code).toBe('EX 2A');
        });
    });

    // ── Valid transitions: forward 5 ──

    it('1. not_started → preparing (doc-004): status=200, audit action=status_advanced', async () => {
        await withTempWorkspace(async () => {
            const { PUT } = await import('../src/app/api/documents/route');

            const response = await PUT(jsonRequest('http://localhost/api/documents', 'PUT', {
                id: 'doc-004',
                status: 'preparing',
                actor: 'Tester',
                reason: '開始準備文件',
            }));

            expect(response.status).toBe(200);

            const data = await response.json() as { status: string; audit_logs: AuditEntry[] };

            expect(data.status).toBe('preparing');
            const log = data.audit_logs.find(l => l.action === 'status_advanced');
            expect(log).toBeDefined();
            expect(log!.from_status).toBe('not_started');
            expect(log!.to_status).toBe('preparing');
        });
    });

    it('2. preparing → pending_sign (doc-001): status=200', async () => {
        await withTempWorkspace(async () => {
            const { PUT } = await import('../src/app/api/documents/route');

            const response = await PUT(jsonRequest('http://localhost/api/documents', 'PUT', {
                id: 'doc-001',
                status: 'pending_sign',
                actor: 'Tester',
                reason: '文件準備完成，待簽署',
            }));

            expect(response.status).toBe(200);

            const data = await response.json() as { status: string; audit_logs: AuditEntry[] };

            expect(data.status).toBe('pending_sign');
            expect(data.audit_logs.some(l => l.action === 'status_advanced')).toBe(true);
        });
    });

    it('3. pending_sign → with_tenant (doc-002): status=200', async () => {
        await withTempWorkspace(async () => {
            const { PUT } = await import('../src/app/api/documents/route');

            const response = await PUT(jsonRequest('http://localhost/api/documents', 'PUT', {
                id: 'doc-002',
                status: 'with_tenant',
                actor: 'Tester',
                reason: '已交予租客',
            }));

            expect(response.status).toBe(200);

            const data = await response.json() as { status: string; audit_logs: AuditEntry[] };

            expect(data.status).toBe('with_tenant');
            expect(data.audit_logs.some(l => l.action === 'status_advanced')).toBe(true);
        });
    });

    it('4. with_tenant → with_company (doc-006): status=200', async () => {
        await withTempWorkspace(async () => {
            const { PUT } = await import('../src/app/api/documents/route');

            const response = await PUT(jsonRequest('http://localhost/api/documents', 'PUT', {
                id: 'doc-006',
                status: 'with_company',
                actor: 'Tester',
                reason: '租客已歸還文件',
            }));

            expect(response.status).toBe(200);

            const data = await response.json() as { status: string; audit_logs: AuditEntry[] };

            expect(data.status).toBe('with_company');
            expect(data.audit_logs.some(l => l.action === 'status_advanced')).toBe(true);
        });
    });

    it('5. with_company → completed (doc-003): status=200', async () => {
        await withTempWorkspace(async () => {
            const { PUT } = await import('../src/app/api/documents/route');

            const response = await PUT(jsonRequest('http://localhost/api/documents', 'PUT', {
                id: 'doc-003',
                status: 'completed',
                actor: 'Tester',
                reason: '文件流程完成',
            }));

            expect(response.status).toBe(200);

            const data = await response.json() as { status: string; audit_logs: AuditEntry[] };

            expect(data.status).toBe('completed');
            expect(data.audit_logs.some(l => l.action === 'status_advanced')).toBe(true);
        });
    });

    // ── Valid transitions: revert 1 ──

    it('6. preparing → not_started (doc-001): status=200, audit action=status_reverted', async () => {
        await withTempWorkspace(async () => {
            const { PUT } = await import('../src/app/api/documents/route');

            const response = await PUT(jsonRequest('http://localhost/api/documents', 'PUT', {
                id: 'doc-001',
                status: 'not_started',
                actor: 'Tester',
                reason: '需要重新準備',
            }));

            expect(response.status).toBe(200);

            const data = await response.json() as { status: string; audit_logs: AuditEntry[] };

            expect(data.status).toBe('not_started');
            const log = data.audit_logs.find(l => l.action === 'status_reverted');
            expect(log).toBeDefined();
            expect(log!.from_status).toBe('preparing');
            expect(log!.to_status).toBe('not_started');
        });
    });

    // ── Invalid transitions ──

    it('7. not_started → pending_sign (skip step): status=400, error contains 逐步', async () => {
        await withTempWorkspace(async () => {
            const { PUT } = await import('../src/app/api/documents/route');

            const response = await PUT(jsonRequest('http://localhost/api/documents', 'PUT', {
                id: 'doc-004',
                status: 'pending_sign',
                actor: 'Tester',
                reason: '嘗試跳步',
            }));

            expect(response.status).toBe(400);
            const data = await response.json() as { error: string };
            expect(data.error).toContain('逐步');
        });
    });

    it('8. not_started → completed (skip multiple): status=400', async () => {
        await withTempWorkspace(async () => {
            const { PUT } = await import('../src/app/api/documents/route');

            const response = await PUT(jsonRequest('http://localhost/api/documents', 'PUT', {
                id: 'doc-004',
                status: 'completed',
                actor: 'Tester',
                reason: '嘗試直接完成',
            }));

            expect(response.status).toBe(400);
            const data = await response.json() as { error: string };
            expect(data.error).toContain('逐步');
        });
    });

    it('9. completed → preparing (skip back multiple, doc-005): status=400', async () => {
        await withTempWorkspace(async () => {
            const { PUT } = await import('../src/app/api/documents/route');

            const response = await PUT(jsonRequest('http://localhost/api/documents', 'PUT', {
                id: 'doc-005',
                status: 'preparing',
                actor: 'Tester',
                reason: '嘗試退回多步',
            }));

            expect(response.status).toBe(400);
            const data = await response.json() as { error: string };
            expect(data.error).toContain('逐步');
        });
    });

    // ── Field updates ──

    it('10. Update current_holder only (doc-001): audit action=field_updated', async () => {
        await withTempWorkspace(async () => {
            const { PUT } = await import('../src/app/api/documents/route');

            const response = await PUT(jsonRequest('http://localhost/api/documents', 'PUT', {
                id: 'doc-001',
                actor: 'Tester',
                reason: '轉交文件',
                current_holder: 'Leasing',
            }));

            expect(response.status).toBe(200);

            const data = await response.json() as { audit_logs: AuditEntry[] };
            const fieldLog = data.audit_logs.find(l => l.action === 'field_updated');
            expect(fieldLog).toBeDefined();
            expect(fieldLog!.changes).toEqual(
                expect.arrayContaining([
                    { field: 'current_holder', from: 'Concierge', to: 'Leasing' },
                ])
            );
        });
    });

    it('11. Update notes only (doc-001): audit action=field_updated', async () => {
        await withTempWorkspace(async () => {
            const { PUT } = await import('../src/app/api/documents/route');

            const response = await PUT(jsonRequest('http://localhost/api/documents', 'PUT', {
                id: 'doc-001',
                actor: 'Tester',
                reason: '補充備註',
                notes: 'new notes',
            }));

            expect(response.status).toBe(200);

            const data = await response.json() as { audit_logs: AuditEntry[] };
            const fieldLog = data.audit_logs.find(l => l.action === 'field_updated');
            expect(fieldLog).toBeDefined();
            expect(fieldLog!.changes).toEqual(
                expect.arrayContaining([
                    { field: 'notes', from: '退房文件處理中', to: 'new notes' },
                ])
            );
        });
    });

    it('12. Update both current_holder and notes simultaneously: changes array has 2 entries', async () => {
        await withTempWorkspace(async () => {
            const { PUT } = await import('../src/app/api/documents/route');

            const response = await PUT(jsonRequest('http://localhost/api/documents', 'PUT', {
                id: 'doc-001',
                actor: 'Tester',
                reason: '更新持有人及備註',
                current_holder: 'Leasing',
                notes: '已更新文件資料',
            }));

            expect(response.status).toBe(200);

            const data = await response.json() as { audit_logs: AuditEntry[] };
            const fieldLog = data.audit_logs.find(l => l.action === 'field_updated');
            expect(fieldLog).toBeDefined();
            expect(fieldLog!.changes).toHaveLength(2);
            expect(fieldLog!.changes).toEqual(
                expect.arrayContaining([
                    { field: 'current_holder', from: 'Concierge', to: 'Leasing' },
                    { field: 'notes', from: '退房文件處理中', to: '已更新文件資料' },
                ])
            );
        });
    });

    // ── Validation ──

    it('13. Missing actor: status=400, error=請填寫操作人', async () => {
        await withTempWorkspace(async () => {
            const { PUT } = await import('../src/app/api/documents/route');

            const response = await PUT(jsonRequest('http://localhost/api/documents', 'PUT', {
                id: 'doc-001',
                status: 'pending_sign',
                reason: '推進文件',
            }));

            expect(response.status).toBe(400);
            const data = await response.json() as { error: string };
            expect(data.error).toBe('請填寫操作人');
        });
    });

    it('14. Missing reason: status=400, error=請填寫操作原因', async () => {
        await withTempWorkspace(async () => {
            const { PUT } = await import('../src/app/api/documents/route');

            const response = await PUT(jsonRequest('http://localhost/api/documents', 'PUT', {
                id: 'doc-001',
                status: 'pending_sign',
                actor: 'Tester',
            }));

            expect(response.status).toBe(400);
            const data = await response.json() as { error: string };
            expect(data.error).toBe('請填寫操作原因');
        });
    });

    it('15. Non-existent document id: status=404', async () => {
        await withTempWorkspace(async () => {
            const { PUT } = await import('../src/app/api/documents/route');

            const response = await PUT(jsonRequest('http://localhost/api/documents', 'PUT', {
                id: 'doc-999',
                status: 'preparing',
                actor: 'Tester',
                reason: '不存在的文件',
            }));

            expect(response.status).toBe(404);
            const data = await response.json() as { error: string };
            expect(data.error).toBe('Document not found');
        });
    });
});
