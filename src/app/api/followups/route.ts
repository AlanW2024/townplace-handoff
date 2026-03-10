import { NextResponse } from 'next/server';
import { getStore, saveStore } from '@/lib/store';
import { createAuditLog, getEntityAuditLogs, getLatestEntityAuditLog } from '@/lib/audit';
import { Followup, FollowupStatus } from '@/lib/types';

export const dynamic = 'force-dynamic';

const FOLLOWUP_STATUS_ORDER: Record<FollowupStatus, number> = {
    open: 0,
    in_progress: 1,
    done: 2,
    dismissed: 3,
};

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
    const store = getStore();
    const body = await request.json();

    // Prevent duplicate followups from same suggestion
    if (body.source_type === 'suggestion' && body.source_id) {
        const existing = store.followups.find(
            f => f.source_type === 'suggestion' && f.source_id === body.source_id
        );
        if (existing) {
            return NextResponse.json(
                { error: '此建議已建立跟進事項', existing_id: existing.id },
                { status: 409 }
            );
        }
    }

    const now = new Date().toISOString();
    const followup: Followup = {
        id: `fu-${Date.now()}`,
        title: body.title || '',
        description: body.description || '',
        source_type: body.source_type || 'manual',
        source_id: body.source_id || '',
        priority: body.priority || 'info',
        assigned_dept: body.assigned_dept || 'mgmt',
        assigned_to: body.assigned_to || null,
        related_rooms: body.related_rooms || [],
        status: 'open',
        due_at: body.due_at || null,
        created_at: now,
        updated_at: now,
    };

    store.followups.push(followup);
    store.audit_logs.push(createAuditLog({
        entity_type: 'followup',
        entity_id: followup.id,
        action: 'created',
        actor: typeof body.actor === 'string' && body.actor.trim()
            ? body.actor.trim()
            : body.source_type === 'suggestion'
                ? 'AI 建議'
                : 'System',
        reason: typeof body.reason === 'string' && body.reason.trim()
            ? body.reason.trim()
            : body.source_type === 'suggestion'
                ? '由 AI 建議建立跟進事項'
                : '建立跟進事項',
        from_status: null,
        to_status: followup.status,
    }));
    saveStore(store);

    return NextResponse.json({
        ...followup,
        audit_logs: getEntityAuditLogs(store.audit_logs, 'followup', followup.id),
        last_log: getLatestEntityAuditLog(store.audit_logs, 'followup', followup.id),
    }, { status: 201 });
}

export async function PUT(request: Request) {
    const store = getStore();
    const body = await request.json();
    const { id, status, assigned_dept, assigned_to, due_at, actor, reason } = body;

    const idx = store.followups.findIndex(f => f.id === id);
    if (idx === -1) {
        return NextResponse.json({ error: 'Followup not found' }, { status: 404 });
    }

    const actorName = typeof actor === 'string' ? actor.trim() : '';
    const actionReason = typeof reason === 'string' ? reason.trim() : '';
    const current = store.followups[idx];
    const nextFollowup = { ...current };
    let hasChange = false;
    let auditAction: 'status_changed' | 'status_reverted' | 'field_updated' | null = null;
    let fromStatus: string | null = current.status;
    let toStatus: string | null = current.status;

    if (typeof status === 'string' && status !== current.status) {
        if (!(status in FOLLOWUP_STATUS_ORDER)) {
            return NextResponse.json({ error: 'Invalid followup status' }, { status: 400 });
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
        nextFollowup.assigned_dept = assigned_dept;
        hasChange = true;
    }
    if (typeof assigned_to !== 'undefined' && assigned_to !== current.assigned_to) {
        nextFollowup.assigned_to = assigned_to || null;
        hasChange = true;
    }
    if (typeof due_at !== 'undefined' && due_at !== current.due_at) {
        nextFollowup.due_at = due_at || null;
        hasChange = true;
    }

    if (!auditAction && hasChange) {
        auditAction = 'field_updated';
    }

    if (!hasChange || !auditAction) {
        return NextResponse.json({ error: '沒有可更新的內容' }, { status: 400 });
    }

    if (!actorName) {
        return NextResponse.json({ error: '請填寫操作人' }, { status: 400 });
    }

    if (!actionReason) {
        return NextResponse.json({ error: '請填寫操作原因' }, { status: 400 });
    }

    nextFollowup.updated_at = new Date().toISOString();
    store.followups[idx] = nextFollowup;
    store.audit_logs.push(createAuditLog({
        entity_type: 'followup',
        entity_id: current.id,
        action: auditAction,
        actor: actorName,
        reason: actionReason,
        from_status: fromStatus,
        to_status: toStatus,
    }));

    saveStore(store);
    return NextResponse.json({
        ...store.followups[idx],
        audit_logs: getEntityAuditLogs(store.audit_logs, 'followup', current.id),
        last_log: getLatestEntityAuditLog(store.audit_logs, 'followup', current.id),
    });
}
