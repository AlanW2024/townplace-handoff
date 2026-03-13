import { NextResponse } from 'next/server';
import { getStore, withStoreWrite } from '@/lib/store';
import { createAuditLog, getEntityAuditLogs, getLatestEntityAuditLog } from '@/lib/audit';
import { AuditFieldChange, DocStatus } from '@/lib/types';
import { parseJsonBody } from '@/lib/api-utils';
import { canAdvanceDocument, canEditDocument } from '@/lib/permissions';
import { resolveRoomCycleDisplayCode } from '@/lib/room-lifecycle';
import {
    assertAllowed,
    assertExpectedVersion,
    getRouteErrorStatus,
    requireAuthenticatedUser,
    resolveReason,
} from '@/lib/route-mutations';

export const dynamic = 'force-dynamic';

const DOC_PIPELINE: DocStatus[] = ['not_started', 'preparing', 'pending_sign', 'with_tenant', 'with_company', 'completed'];
const DOCUMENT_OWNER_DEPT = 'lease' as const;

function buildDocumentResponse(store: ReturnType<typeof getStore>) {
    return store.documents.map(document => ({
        ...document,
        room_display_code: resolveRoomCycleDisplayCode(store, document.room_id, document.room_cycle_id),
        audit_logs: getEntityAuditLogs(store.audit_logs, 'document', document.id),
        last_log: getLatestEntityAuditLog(store.audit_logs, 'document', document.id),
    }));
}

export async function GET() {
    const store = getStore();
    return NextResponse.json(buildDocumentResponse(store));
}

export async function PUT(request: Request) {
    const parsed = await parseJsonBody<{
        id: string;
        status?: string;
        actor?: string;
        reason?: string;
        current_holder?: string;
        notes?: string;
        expectedVersion?: number;
    }>(request);
    if ('error' in parsed) return parsed.error;
    const { id, status, actor, reason, current_holder, notes, expectedVersion } = parsed.data;

    const actorName = typeof actor === 'string' ? actor.trim() : '';
    const actionReason = resolveReason(reason);

    if (!actorName) {
        return NextResponse.json({ error: '請填寫操作人' }, { status: 400 });
    }

    if (!actionReason) {
        return NextResponse.json({ error: '請填寫操作原因' }, { status: 400 });
    }

    const auth = await requireAuthenticatedUser(request);
    if ('error' in auth) return auth.error;

    try {
        const updated = await withStoreWrite(store => {
            const idx = store.documents.findIndex(document => document.id === id);
            if (idx === -1) {
                throw new Error('Document not found');
            }

            const current = store.documents[idx];
            assertAllowed(canEditDocument(auth.user, DOCUMENT_OWNER_DEPT));
            assertExpectedVersion(expectedVersion, current.version, '文件');

            const nextDocument = { ...current };
            const changes: AuditFieldChange[] = [];
            let auditAction: 'status_advanced' | 'status_reverted' | 'field_updated' | null = null;
            let fromStatus: string | null = current.status;
            let toStatus: string | null = current.status;
            let hasFieldChange = false;

            if (typeof status === 'string' && status !== current.status) {
                const currentIdx = DOC_PIPELINE.indexOf(current.status);
                const nextIdx = DOC_PIPELINE.indexOf(status as DocStatus);

                if (nextIdx === -1) {
                    throw new Error('Invalid document status');
                }

                if (Math.abs(nextIdx - currentIdx) !== 1) {
                    throw new Error('文件只可逐步推進或退回一步');
                }

                assertAllowed(canAdvanceDocument(auth.user));
                nextDocument.status = status as DocStatus;
                auditAction = nextIdx > currentIdx ? 'status_advanced' : 'status_reverted';
                fromStatus = current.status;
                toStatus = status;
            }

            if (typeof current_holder !== 'undefined' && current_holder !== current.current_holder) {
                changes.push({ field: 'current_holder', from: current.current_holder, to: current_holder || null });
                nextDocument.current_holder = current_holder || null;
                hasFieldChange = true;
            }

            if (typeof notes !== 'undefined' && notes !== current.notes) {
                changes.push({ field: 'notes', from: current.notes, to: notes || null });
                nextDocument.notes = notes || null;
                hasFieldChange = true;
            }

            if (!auditAction && hasFieldChange) {
                auditAction = 'field_updated';
            }

            if (!auditAction) {
                throw new Error('沒有可更新的內容');
            }

            nextDocument.updated_at = new Date().toISOString();
            nextDocument.version = (current.version || 1) + 1;
            store.documents[idx] = nextDocument;
            store.audit_logs.push(createAuditLog({
                entity_type: 'document',
                entity_id: current.id,
                action: auditAction,
                actor: actorName,
                actor_id: auth.user.id,
                reason: actionReason,
                from_status: fromStatus,
                to_status: toStatus,
                changes,
            }));

            return {
                ...store.documents[idx],
                room_display_code: resolveRoomCycleDisplayCode(
                    store,
                    store.documents[idx].room_id,
                    store.documents[idx].room_cycle_id
                ),
                audit_logs: getEntityAuditLogs(store.audit_logs, 'document', current.id),
                last_log: getLatestEntityAuditLog(store.audit_logs, 'document', current.id),
            };
        });

        return NextResponse.json(updated);
    } catch (error) {
        const message = error instanceof Error ? error.message : '更新失敗';
        const statusCode = getRouteErrorStatus(error, 'Document not found');
        return NextResponse.json({ error: message }, { status: statusCode });
    }
}
