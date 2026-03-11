import { describe, expect, it } from 'vitest';
import { withTempWorkspace, jsonRequest } from './helpers';

describe.sequential('Followup States', () => {
    // ── POST tests ──

    it('1. Manual followup with actor + reason → 201, status=open, source_type=manual', async () => {
        await withTempWorkspace(async () => {
            const { POST } = await import('../src/app/api/followups/route');

            const response = await POST(jsonRequest('http://localhost/api/followups', 'POST', {
                title: '檢查 10F 冷氣',
                description: '住戶投訴冷氣不冷',
                actor: 'Tester',
                reason: '住戶投訴',
                assigned_dept: 'eng',
            }));

            expect(response.status).toBe(201);

            const data = await response.json() as {
                id: string;
                status: string;
                source_type: string;
                last_log: { action: string };
            };

            expect(data.status).toBe('open');
            expect(data.source_type).toBe('manual');
            expect(data.last_log.action).toBe('created');
        });
    });

    it('2. Suggestion followup without actor/reason → 201, actor defaults to AI 建議', async () => {
        await withTempWorkspace(async () => {
            const { POST } = await import('../src/app/api/followups/route');

            const response = await POST(jsonRequest('http://localhost/api/followups', 'POST', {
                title: 'AI 建議跟進清潔',
                description: '系統偵測到清潔延遲',
                source_type: 'suggestion',
                source_id: 'sug-001',
                assigned_dept: 'clean',
            }));

            expect(response.status).toBe(201);

            const data = await response.json() as {
                status: string;
                source_type: string;
                last_log: { actor: string; action: string };
            };

            expect(data.status).toBe('open');
            expect(data.source_type).toBe('suggestion');
            expect(data.last_log.actor).toBe('AI 建議');
            expect(data.last_log.action).toBe('created');
        });
    });

    it('3. Duplicate suggestion (same source_id) → 409 with existing_id', async () => {
        await withTempWorkspace(async () => {
            const { POST } = await import('../src/app/api/followups/route');

            const first = await POST(jsonRequest('http://localhost/api/followups', 'POST', {
                title: '重複建議測試',
                description: '第一次建立',
                source_type: 'suggestion',
                source_id: 'sug-dup-001',
                assigned_dept: 'eng',
            }));

            expect(first.status).toBe(201);

            const firstData = await first.json() as { id: string };

            const second = await POST(jsonRequest('http://localhost/api/followups', 'POST', {
                title: '重複建議測試',
                description: '第二次建立',
                source_type: 'suggestion',
                source_id: 'sug-dup-001',
                assigned_dept: 'eng',
            }));

            expect(second.status).toBe(409);

            const secondData = await second.json() as { error: string; existing_id: string };

            expect(secondData.error).toContain('已建立');
            expect(secondData.existing_id).toBe(firstData.id);
        });
    });

    it('4. Invalid assigned_dept → 400', async () => {
        await withTempWorkspace(async () => {
            const { POST } = await import('../src/app/api/followups/route');

            const response = await POST(jsonRequest('http://localhost/api/followups', 'POST', {
                title: '無效部門測試',
                description: '部門代碼不存在',
                actor: 'Tester',
                reason: '測試',
                assigned_dept: 'invalid_dept',
            }));

            expect(response.status).toBe(400);
        });
    });

    it('5. Manual without actor → 400 手動建立跟進事項必須填寫操作人', async () => {
        await withTempWorkspace(async () => {
            const { POST } = await import('../src/app/api/followups/route');

            const response = await POST(jsonRequest('http://localhost/api/followups', 'POST', {
                title: '缺少操作人',
                description: '測試缺少操作人',
                reason: '測試原因',
                assigned_dept: 'eng',
            }));

            expect(response.status).toBe(400);

            const data = await response.json() as { error: string };

            expect(data.error).toBe('手動建立跟進事項必須填寫操作人');
        });
    });

    // ── PUT tests ──

    it('6. open → in_progress: status=200, last_log.action=status_changed', async () => {
        await withTempWorkspace(async () => {
            const { POST, PUT } = await import('../src/app/api/followups/route');

            const created = await POST(jsonRequest('http://localhost/api/followups', 'POST', {
                title: '狀態推進測試',
                description: '測試 open → in_progress',
                actor: 'Tester',
                reason: '建立跟進',
                assigned_dept: 'eng',
            }));

            expect(created.status).toBe(201);

            const createdData = await created.json() as { id: string };

            const response = await PUT(jsonRequest('http://localhost/api/followups', 'PUT', {
                id: createdData.id,
                status: 'in_progress',
                actor: 'Tester',
                reason: '開始處理',
            }));

            expect(response.status).toBe(200);

            const data = await response.json() as {
                status: string;
                last_log: { action: string; from_status: string; to_status: string };
            };

            expect(data.status).toBe('in_progress');
            expect(data.last_log.action).toBe('status_changed');
            expect(data.last_log.from_status).toBe('open');
            expect(data.last_log.to_status).toBe('in_progress');
        });
    });

    it('7. in_progress → done: status=200', async () => {
        await withTempWorkspace(async () => {
            const { POST, PUT } = await import('../src/app/api/followups/route');

            const created = await POST(jsonRequest('http://localhost/api/followups', 'POST', {
                title: '狀態推進測試',
                description: '測試 in_progress → done',
                actor: 'Tester',
                reason: '建立跟進',
                assigned_dept: 'eng',
            }));

            const createdData = await created.json() as { id: string };

            await PUT(jsonRequest('http://localhost/api/followups', 'PUT', {
                id: createdData.id,
                status: 'in_progress',
                actor: 'Tester',
                reason: '開始處理',
            }));

            const response = await PUT(jsonRequest('http://localhost/api/followups', 'PUT', {
                id: createdData.id,
                status: 'done',
                actor: 'Tester',
                reason: '已完成',
            }));

            expect(response.status).toBe(200);

            const data = await response.json() as {
                status: string;
                last_log: { action: string; from_status: string; to_status: string };
            };

            expect(data.status).toBe('done');
            expect(data.last_log.action).toBe('status_changed');
        });
    });

    it('8. open → done (skip forward): status=200, last_log.action=status_changed', async () => {
        await withTempWorkspace(async () => {
            const { POST, PUT } = await import('../src/app/api/followups/route');

            const created = await POST(jsonRequest('http://localhost/api/followups', 'POST', {
                title: '跳步推進測試',
                description: '測試 open → done',
                actor: 'Tester',
                reason: '建立跟進',
                assigned_dept: 'eng',
            }));

            const createdData = await created.json() as { id: string };

            const response = await PUT(jsonRequest('http://localhost/api/followups', 'PUT', {
                id: createdData.id,
                status: 'done',
                actor: 'Tester',
                reason: '直接完成',
            }));

            expect(response.status).toBe(200);

            const data = await response.json() as {
                status: string;
                last_log: { action: string; from_status: string; to_status: string };
            };

            expect(data.status).toBe('done');
            expect(data.last_log.action).toBe('status_changed');
            expect(data.last_log.from_status).toBe('open');
            expect(data.last_log.to_status).toBe('done');
        });
    });

    it('9. done → open (revert): status=200, last_log.action=status_reverted', async () => {
        await withTempWorkspace(async () => {
            const { POST, PUT } = await import('../src/app/api/followups/route');

            const created = await POST(jsonRequest('http://localhost/api/followups', 'POST', {
                title: '狀態退回測試',
                description: '測試 done → open',
                actor: 'Tester',
                reason: '建立跟進',
                assigned_dept: 'eng',
            }));

            const createdData = await created.json() as { id: string };

            await PUT(jsonRequest('http://localhost/api/followups', 'PUT', {
                id: createdData.id,
                status: 'done',
                actor: 'Tester',
                reason: '完成',
            }));

            const response = await PUT(jsonRequest('http://localhost/api/followups', 'PUT', {
                id: createdData.id,
                status: 'open',
                actor: 'Tester',
                reason: '需要重新處理',
            }));

            expect(response.status).toBe(200);

            const data = await response.json() as {
                status: string;
                last_log: { action: string; from_status: string; to_status: string };
            };

            expect(data.status).toBe('open');
            expect(data.last_log.action).toBe('status_reverted');
            expect(data.last_log.from_status).toBe('done');
            expect(data.last_log.to_status).toBe('open');
        });
    });

    it('10. Update assigned_dept field: changes array contains the field change', async () => {
        await withTempWorkspace(async () => {
            const { POST, PUT } = await import('../src/app/api/followups/route');

            const created = await POST(jsonRequest('http://localhost/api/followups', 'POST', {
                title: '部門更新測試',
                description: '測試更新 assigned_dept',
                actor: 'Tester',
                reason: '建立跟進',
                assigned_dept: 'mgmt',
            }));

            const createdData = await created.json() as { id: string };

            const response = await PUT(jsonRequest('http://localhost/api/followups', 'PUT', {
                id: createdData.id,
                assigned_dept: 'eng',
                actor: 'Tester',
                reason: '轉交工程部',
            }));

            expect(response.status).toBe(200);

            const data = await response.json() as {
                assigned_dept: string;
                last_log: { action: string; changes: Array<{ field: string; from: string | null; to: string | null }> };
            };

            expect(data.assigned_dept).toBe('eng');
            expect(data.last_log.action).toBe('field_updated');
            expect(data.last_log.changes).toEqual(
                expect.arrayContaining([
                    { field: 'assigned_dept', from: 'mgmt', to: 'eng' },
                ])
            );
        });
    });

    it('11. Update assigned_to + due_at simultaneously: changes has 2 entries', async () => {
        await withTempWorkspace(async () => {
            const { POST, PUT } = await import('../src/app/api/followups/route');

            const created = await POST(jsonRequest('http://localhost/api/followups', 'POST', {
                title: '多欄位更新測試',
                description: '測試同時更新 assigned_to 及 due_at',
                actor: 'Tester',
                reason: '建立跟進',
                assigned_dept: 'eng',
            }));

            const createdData = await created.json() as { id: string };

            const dueDate = '2026-04-01T00:00:00.000Z';

            const response = await PUT(jsonRequest('http://localhost/api/followups', 'PUT', {
                id: createdData.id,
                assigned_to: 'Vic Lee',
                due_at: dueDate,
                actor: 'Tester',
                reason: '指定負責人及期限',
            }));

            expect(response.status).toBe(200);

            const data = await response.json() as {
                assigned_to: string;
                due_at: string;
                last_log: { action: string; changes: Array<{ field: string; from: string | null; to: string | null }> };
            };

            expect(data.assigned_to).toBe('Vic Lee');
            expect(data.due_at).toBe(dueDate);
            expect(data.last_log.action).toBe('field_updated');
            expect(data.last_log.changes).toHaveLength(2);
            expect(data.last_log.changes).toEqual(
                expect.arrayContaining([
                    { field: 'assigned_to', from: null, to: 'Vic Lee' },
                    { field: 'due_at', from: null, to: dueDate },
                ])
            );
        });
    });

    it('12. No changes (PUT same values) → 400 沒有可更新的內容', async () => {
        await withTempWorkspace(async () => {
            const { POST, PUT } = await import('../src/app/api/followups/route');

            const created = await POST(jsonRequest('http://localhost/api/followups', 'POST', {
                title: '無變更測試',
                description: '測試沒有任何變更',
                actor: 'Tester',
                reason: '建立跟進',
                assigned_dept: 'eng',
            }));

            const createdData = await created.json() as { id: string; status: string };

            const response = await PUT(jsonRequest('http://localhost/api/followups', 'PUT', {
                id: createdData.id,
                status: createdData.status,
                actor: 'Tester',
                reason: '嘗試無變更更新',
            }));

            expect(response.status).toBe(400);

            const data = await response.json() as { error: string };

            expect(data.error).toBe('沒有可更新的內容');
        });
    });

    it('13. Non-existent followup id → 404', async () => {
        await withTempWorkspace(async () => {
            const { PUT } = await import('../src/app/api/followups/route');

            const response = await PUT(jsonRequest('http://localhost/api/followups', 'PUT', {
                id: 'fu-nonexistent-999',
                status: 'in_progress',
                actor: 'Tester',
                reason: '嘗試更新不存在的跟進',
            }));

            expect(response.status).toBe(404);

            const data = await response.json() as { error: string };

            expect(data.error).toBe('Followup not found');
        });
    });
});
