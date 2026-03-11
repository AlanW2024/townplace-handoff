import { NextResponse } from 'next/server';
import { getStore, withStoreWrite } from '@/lib/store';
import { createAuditLog, getEntityAuditLogs, getLatestEntityAuditLog } from '@/lib/audit';
import { AuditFieldChange, DeptCode, Followup, FollowupStatus } from '@/lib/types';
import { parseJsonBody } from '@/lib/api-utils';

export const dynamic = 'force-dynamic';

const FOLLOWUP_STATUS_ORDER: Record<FollowupStatus, number> = {
    open: 0,
    in_progress: 1,
    done: 2,
    dismissed: 3,
};
const VALID_DEPTS: DeptCode[] = ['eng', 'conc', 'clean', 'hskp', 'mgmt', 'lease', 'comm', 'security'];
const VALID_PRIORITIES = ['info', 'warning', 'urgent'] as const;

function buildFollowupResponse(store: ReturnType<typeof getStore>) {
    return store.followups.map(followup => ({
        ...followup,
        audit_logs: getEntityAuditLogs(store.audit_logs, 'followup', followup.id),
        last_log: getLatestEntityAuditLog(store.audit_logs, 'followup', followup.id),
    }));
}

export async function GET() {
    const store = getStore();
    const sorted = buildFollowupResponse(store).sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
    return NextResponse.json(sorted);
}

export async function POST(request: Request) {
    const parsed = await parseJsonBody<{
        actor?: string;
        reason?: string;
        source_type?: string;
        source_id?: string;
        property_id?: string;
        title?: string;
        description?: string;
        priority?: string;
        assigned_dept?: string;
        assigned_to?: string | null;
        related_rooms?: string[];
        due_at?: string | null;
    }>(request);
    if ('error' in parsed) return parsed.error;
    const body = parsed.data;

    const actorName = typeof body.actor === 'string' ? body.actor.trim() : '';
    const actionReason = typeof body.reason === 'string' ? body.reason.trim() : '';
    const sourceType = body.source_type || 'manual';

    if (sourceType !== 'suggestion' && !actorName) {
        return NextResponse.json({ error: '手動建立跟進事項必須填寫操作人' }, { status: 400 });
    }

    if (sourceType !== 'suggestion' && !actionReason) {
        return NextResponse.json({ error: '手動建立跟進事項必須填寫原因' }, { status: 400 });
    }

    if (body.assigned_dept && !VALID_DEPTS.includes(body.assigned_dept as DeptCode)) {
        return NextResponse.json({ error: 'Invalid assigned_dept' }, { status: 400 });
    }

    if (body.priority !== undefined && !VALID_PRIORITIES.includes(body.priority as typeof VALID_PRIORITIES[number])) {
        return NextResponse.json({ error: 'priority 必須是 info、warning 或 urgent' }, { status: 400 });
    }

    try {
        const created = await withStoreWrite(store => {
            if (sourceType === 'suggestion' && body.source_id) {
                const existing = store.followups.find(
                    followup => followup.source_type === 'suggestion' && followup.source_id === body.source_id
                );
                if (existing) {
                    throw new Error(`DUPLICATE:${existing.id}`);
                }
            }

            const now = new Date().toISOString();
            const followup: Followup = {
                id: `fu-${Date.now()}`,
                property_id: body.property_id || 'tp-soho',
                title: body.title || '',
                description: body.description || '',
                source_type: sourceType as Followup['source_type'],
                source_id: body.source_id || '',
                priority: (body.priority as Followup['priority']) || 'info',
                assigned_dept: (body.assigned_dept as DeptCode) || 'mgmt',
                assigned_to: body.assigned_to || null,
                related_rooms: body.related_rooms || [],
                status: 'open',
                due_at: body.due_at || null,
                created_at: now,
                updated_at: now,
                version: 1,
            };

            store.followups.push(followup);
            store.audit_logs.push(createAuditLog({
                entity_type: 'followup',
                entity_id: followup.id,
                action: 'created',
                actor: actorName || 'AI 建議',
                reason: actionReason || '由 AI 建議建立跟進事項',
                from_status: null,
                to_status: followup.status,
            }));

            return {
                ...followup,
                audit_logs: getEntityAuditLogs(store.audit_logs, 'followup', followup.id),
                last_log: getLatestEntityAuditLog(store.audit_logs, 'followup', followup.id),
            };
        });

        return NextResponse.json(created, { status: 201 });
    } catch (error) {
        const message = error instanceof Error ? error.message : '建立失敗';
        if (message.startsWith('DUPLICATE:')) {
            return NextResponse.json(
                { error: '此建議已建立跟進事項', existing_id: message.replace('DUPLICATE:', '') },
                { status: 409 }
            );
        }
        return NextResponse.json({ error: message }, { status: 400 });
    }
}

export async function PUT(request: Request) {
    const parsed = await parseJsonBody<{
        id: string;
        status?: string;
        assigned_dept?: string;
        assigned_to?: string;
        due_at?: string;
        actor?: string;
        reason?: string;
        expectedVersion?: number;
    }>(request);
    if ('error' in parsed) return parsed.error;
    const { id, status, assigned_dept, assigned_to, due_at, actor, reason, expectedVersion } = parsed.data;

    const actorName = typeof actor === 'string' ? actor.trim() : '';
    const actionReason = typeof reason === 'string' ? reason.trim() : '';

    if (!actorName) {
        return NextResponse.json({ error: '請填寫操作人' }, { status: 400 });
    }

    if (!actionReason) {
        return NextResponse.json({ error: '請填寫操作原因' }, { status: 400 });
    }
    if (typeof assigned_dept !== 'undefined' && assigned_dept !== null && !VALID_DEPTS.includes(assigned_dept as DeptCode)) {
        return NextResponse.json({ error: 'Invalid assigned_dept' }, { status: 400 });
    }

    try {
        const updated = await withStoreWrite(store => {
            const idx = store.followups.findIndex(f => f.id === id);
            if (idx === -1) {
                throw new Error('Followup not found');
            }

            const current = store.followups[idx];

            if (expectedVersion !== undefined && expectedVersion !== current.version) {
                throw new Error('版本衝突：此跟進事項已被其他人修改，請重新載入');
            }

            const nextFollowup = { ...current };
            const changes: AuditFieldChange[] = [];
            let hasChange = false;
            let auditAction: 'status_changed' | 'status_reverted' | 'field_updated' | null = null;
            let fromStatus: string | null = current.status;
            let toStatus: string | null = current.status;

            if (typeof status === 'string' && status !== current.status) {
                if (!(status in FOLLOWUP_STATUS_ORDER)) {
                    throw new Error('Invalid followup status');
                }

                nextFollowup.status = status as FollowupStatus;
                hasChange = true;
                auditAction = FOLLOWUP_STATUS_ORDER[status as FollowupStatus] < FOLLOWUP_STATUS_ORDER[current.status]
                    ? 'status_reverted'
                    : 'status_changed';
                fromStatus = current.status;
                toStatus = status;
            }

            if (typeof assigned_dept !== 'undefined' && assigned_dept !== current.assigned_dept) {
                changes.push({ field: 'assigned_dept', from: current.assigned_dept, to: assigned_dept });
                nextFollowup.assigned_dept = assigned_dept as DeptCode;
                hasChange = true;
            }
            if (typeof assigned_to !== 'undefined' && assigned_to !== current.assigned_to) {
                changes.push({ field: 'assigned_to', from: current.assigned_to, to: assigned_to || null });
                nextFollowup.assigned_to = assigned_to || null;
                hasChange = true;
            }
            if (typeof due_at !== 'undefined' && due_at !== current.due_at) {
                changes.push({ field: 'due_at', from: current.due_at, to: due_at || null });
                nextFollowup.due_at = due_at || null;
                hasChange = true;
            }

            if (!auditAction && hasChange) {
                auditAction = 'field_updated';
            }

            if (!hasChange || !auditAction) {
                throw new Error('沒有可更新的內容');
            }

            nextFollowup.updated_at = new Date().toISOString();
            nextFollowup.version = (current.version || 1) + 1;
            store.followups[idx] = nextFollowup;
            store.audit_logs.push(createAuditLog({
                entity_type: 'followup',
                entity_id: current.id,
                action: auditAction,
                actor: actorName,
                reason: actionReason,
                from_status: fromStatus,
                to_status: toStatus,
                changes,
            }));

            return {
                ...store.followups[idx],
                audit_logs: getEntityAuditLogs(store.audit_logs, 'followup', current.id),
                last_log: getLatestEntityAuditLog(store.audit_logs, 'followup', current.id),
            };
        });

        return NextResponse.json(updated);
    } catch (error) {
        const message = error instanceof Error ? error.message : '更新失敗';
        const statusCode = message === 'Followup not found' ? 404 : message.includes('版本衝突') ? 409 : 400;
        return NextResponse.json({ error: message }, { status: statusCode });
    }
}
