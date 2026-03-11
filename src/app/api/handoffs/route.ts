import { NextResponse } from 'next/server';
import { getStore, withStoreWrite } from '@/lib/store';
import { createAuditLog } from '@/lib/audit';
import { AuditFieldChange, HandoffStatus } from '@/lib/types';
import { parseJsonBody } from '@/lib/api-utils';
import { canApproveHandoff } from '@/lib/permissions';
import {
    assertAllowed,
    assertExpectedVersion,
    getRouteErrorStatus,
    requireAuthenticatedUser,
    resolveReason,
} from '@/lib/route-mutations';

export const dynamic = 'force-dynamic';

const VALID_HANDOFF_STATUSES: HandoffStatus[] = ['pending', 'acknowledged', 'completed'];

const HANDOFF_TRANSITIONS: Record<HandoffStatus, HandoffStatus[]> = {
    pending: ['acknowledged', 'completed'],
    acknowledged: ['completed'],
    completed: [],
};

export async function GET() {
    const store = getStore();
    return NextResponse.json([...store.handoffs].sort((a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    ));
}

export async function PUT(request: Request) {
    const parsed = await parseJsonBody<{
        id: string;
        status: HandoffStatus;
        actor?: string;
        reason?: string;
        expectedVersion?: number;
    }>(request);
    if ('error' in parsed) return parsed.error;
    const { id, status, actor, reason, expectedVersion } = parsed.data;

    const actorName = typeof actor === 'string' ? actor.trim() : '';
    const actionReason = resolveReason(reason);

    if (!actorName) {
        return NextResponse.json({ error: '請填寫操作人' }, { status: 400 });
    }

    if (!actionReason) {
        return NextResponse.json({ error: '請填寫操作原因' }, { status: 400 });
    }

    if (!VALID_HANDOFF_STATUSES.includes(status)) {
        return NextResponse.json({ error: 'Invalid handoff status' }, { status: 400 });
    }

    const auth = await requireAuthenticatedUser(request);
    if ('error' in auth) return auth.error;

    try {
        const updated = await withStoreWrite(store => {
            const idx = store.handoffs.findIndex(h => h.id === id);
            if (idx === -1) {
                throw new Error('Handoff not found');
            }

            const current = store.handoffs[idx];
            assertAllowed(canApproveHandoff(auth.user, current.to_dept));

            assertExpectedVersion(expectedVersion, current.version, '交接');

            const allowedTransitions = HANDOFF_TRANSITIONS[current.status];
            if (!allowedTransitions.includes(status)) {
                throw new Error(`交接狀態不能從「${current.status}」轉為「${status}」`);
            }

            const changes: AuditFieldChange[] = [];
            const fromStatus = current.status;

            store.handoffs[idx] = {
                ...current,
                status,
                acknowledged_at: status === 'acknowledged'
                    ? (current.acknowledged_at || new Date().toISOString())
                    : current.acknowledged_at,
                version: (current.version || 1) + 1,
            };

            changes.push({ field: 'status', from: fromStatus, to: status });

            store.audit_logs.push(createAuditLog({
                entity_type: 'handoff',
                entity_id: current.id,
                action: 'status_changed',
                actor: actorName,
                actor_id: auth.user.id,
                reason: actionReason,
                from_status: fromStatus,
                to_status: status,
                changes,
            }));

            return store.handoffs[idx];
        });

        return NextResponse.json(updated);
    } catch (error) {
        const message = error instanceof Error ? error.message : '更新交接失敗';
        const statusCode = getRouteErrorStatus(error, 'Handoff not found');
        return NextResponse.json({ error: message }, { status: statusCode });
    }
}
