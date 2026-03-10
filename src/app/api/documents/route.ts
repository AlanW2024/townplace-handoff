import { NextResponse } from 'next/server';
import { getStore, saveStore } from '@/lib/store';
import { createAuditLog, getEntityAuditLogs, getLatestEntityAuditLog } from '@/lib/audit';
import { DocStatus } from '@/lib/types';

export const dynamic = 'force-dynamic';

const DOC_PIPELINE: DocStatus[] = ['not_started', 'preparing', 'pending_sign', 'with_tenant', 'with_company', 'completed'];

function buildDocumentResponse(store: ReturnType<typeof getStore>) {
    return store.documents.map(document => ({
        ...document,
        audit_logs: getEntityAuditLogs(store.audit_logs, 'document', document.id),
        last_log: getLatestEntityAuditLog(store.audit_logs, 'document', document.id),
    }));
}

export async function GET() {
    const store = getStore();
    return NextResponse.json(buildDocumentResponse(store));
}

export async function PUT(request: Request) {
    const store = getStore();
    const body = await request.json();
    const { id, status, actor, reason, current_holder, notes } = body;

    const idx = store.documents.findIndex(d => d.id === id);
    if (idx === -1) return NextResponse.json({ error: 'Document not found' }, { status: 404 });

    const actorName = typeof actor === 'string' ? actor.trim() : '';
    const actionReason = typeof reason === 'string' ? reason.trim() : '';
    const current = store.documents[idx];
    const nextDocument = { ...current };
    let auditAction: 'status_advanced' | 'status_reverted' | 'field_updated' | null = null;
    let fromStatus: string | null = current.status;
    let toStatus: string | null = current.status;

    if (typeof status === 'string' && status !== current.status) {
        const currentIdx = DOC_PIPELINE.indexOf(current.status);
        const nextIdx = DOC_PIPELINE.indexOf(status as DocStatus);

        if (nextIdx === -1) {
            return NextResponse.json({ error: 'Invalid document status' }, { status: 400 });
        }

        if (Math.abs(nextIdx - currentIdx) !== 1) {
            return NextResponse.json({ error: '文件只可逐步推進或退回一步' }, { status: 400 });
        }

        nextDocument.status = status as DocStatus;
        auditAction = nextIdx > currentIdx ? 'status_advanced' : 'status_reverted';
        fromStatus = current.status;
        toStatus = status;
    }

    let hasFieldChange = false;
    if (typeof current_holder !== 'undefined' && current_holder !== current.current_holder) {
        nextDocument.current_holder = current_holder || null;
        hasFieldChange = true;
    }
    if (typeof notes !== 'undefined' && notes !== current.notes) {
        nextDocument.notes = notes || null;
        hasFieldChange = true;
    }

    if (!auditAction && hasFieldChange) {
        auditAction = 'field_updated';
    }

    if (!auditAction) {
        return NextResponse.json({ error: '沒有可更新的內容' }, { status: 400 });
    }

    if (!actorName) {
        return NextResponse.json({ error: '請填寫操作人' }, { status: 400 });
    }

    if (!actionReason) {
        return NextResponse.json({ error: '請填寫操作原因' }, { status: 400 });
    }

    nextDocument.updated_at = new Date().toISOString();
    store.documents[idx] = nextDocument;
    store.audit_logs.push(createAuditLog({
        entity_type: 'document',
        entity_id: current.id,
        action: auditAction,
        actor: actorName,
        reason: actionReason,
        from_status: fromStatus,
        to_status: toStatus,
    }));

    saveStore(store);
    return NextResponse.json({
        ...store.documents[idx],
        audit_logs: getEntityAuditLogs(store.audit_logs, 'document', current.id),
        last_log: getLatestEntityAuditLog(store.audit_logs, 'document', current.id),
    });
}
