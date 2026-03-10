import { AuditAction, AuditEntityType, AuditLog } from './types';

interface CreateAuditLogInput {
    entity_type: AuditEntityType;
    entity_id: string;
    action: AuditAction;
    actor: string;
    reason: string;
    from_status?: string | null;
    to_status?: string | null;
}

export function createAuditLog(input: CreateAuditLogInput): AuditLog {
    return {
        id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        entity_type: input.entity_type,
        entity_id: input.entity_id,
        action: input.action,
        actor: input.actor.trim(),
        reason: input.reason.trim(),
        from_status: input.from_status ?? null,
        to_status: input.to_status ?? null,
        created_at: new Date().toISOString(),
    };
}

export function sortAuditLogsDesc<T extends AuditLog>(logs: T[]): T[] {
    return [...logs].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
}

export function getEntityAuditLogs(
    logs: AuditLog[],
    entityType: AuditEntityType,
    entityId: string
): AuditLog[] {
    return sortAuditLogsDesc(
        logs.filter(log => log.entity_type === entityType && log.entity_id === entityId)
    );
}

export function getLatestEntityAuditLog(
    logs: AuditLog[],
    entityType: AuditEntityType,
    entityId: string
): AuditLog | null {
    return getEntityAuditLogs(logs, entityType, entityId)[0] ?? null;
}
