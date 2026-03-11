import { describe, expect, it } from 'vitest';
import {
  createAuditLog,
  sortAuditLogsDesc,
  getEntityAuditLogs,
  getLatestEntityAuditLog,
} from '../src/lib/audit';
import { AuditLog } from '../src/lib/types';

describe('audit', () => {
  it('createAuditLog generates an audit log with correct fields', () => {
    const log = createAuditLog({
      entity_type: 'document',
      entity_id: 'doc-001',
      action: 'created',
      actor: ' Test ',
      reason: ' reason ',
      from_status: null,
      to_status: 'preparing',
    });

    expect(log.id).toMatch(/^audit-/);
    expect(log.entity_type).toBe('document');
    expect(log.entity_id).toBe('doc-001');
    expect(log.action).toBe('created');
    expect(log.actor).toBe('Test');
    expect(log.reason).toBe('reason');
    expect(log.from_status).toBeNull();
    expect(log.to_status).toBe('preparing');
    expect(log.created_at).toBeDefined();
    expect(log.changes).toBeDefined();
  });

  it('createAuditLog defaults from_status, to_status, changes, and created_at', () => {
    const log = createAuditLog({
      entity_type: 'followup',
      entity_id: 'fu-001',
      action: 'created',
      actor: 'admin',
      reason: 'initial creation',
    });

    expect(log.from_status).toBeNull();
    expect(log.to_status).toBeNull();
    expect(log.changes).toEqual([]);
    // created_at should be a valid ISO string
    const parsed = new Date(log.created_at);
    expect(parsed.toISOString()).toBe(log.created_at);
  });

  it('createAuditLog preserves field changes', () => {
    const changes = [{ field: 'notes', from: null, to: 'updated' }];
    const log = createAuditLog({
      entity_type: 'document',
      entity_id: 'doc-002',
      action: 'field_updated',
      actor: 'editor',
      reason: 'updated notes',
      changes,
    });

    expect(log.changes).toEqual([{ field: 'notes', from: null, to: 'updated' }]);
  });

  it('sortAuditLogsDesc sorts newest first', () => {
    const logs: AuditLog[] = [
      createAuditLog({
        entity_type: 'document',
        entity_id: 'doc-001',
        action: 'created',
        actor: 'a',
        reason: 'r',
        created_at: '2024-01-01T00:00:00.000Z',
      }),
      createAuditLog({
        entity_type: 'document',
        entity_id: 'doc-001',
        action: 'status_advanced',
        actor: 'b',
        reason: 'r',
        created_at: '2024-03-01T00:00:00.000Z',
      }),
      createAuditLog({
        entity_type: 'document',
        entity_id: 'doc-001',
        action: 'status_changed',
        actor: 'c',
        reason: 'r',
        created_at: '2024-02-01T00:00:00.000Z',
      }),
    ];

    const sorted = sortAuditLogsDesc(logs);

    expect(sorted[0].created_at).toBe('2024-03-01T00:00:00.000Z');
    expect(sorted[1].created_at).toBe('2024-02-01T00:00:00.000Z');
    expect(sorted[2].created_at).toBe('2024-01-01T00:00:00.000Z');
  });

  it('sortAuditLogsDesc returns a new array without mutating the original', () => {
    const logs: AuditLog[] = [
      createAuditLog({
        entity_type: 'document',
        entity_id: 'doc-001',
        action: 'created',
        actor: 'a',
        reason: 'r',
        created_at: '2024-02-01T00:00:00.000Z',
      }),
      createAuditLog({
        entity_type: 'document',
        entity_id: 'doc-001',
        action: 'status_advanced',
        actor: 'b',
        reason: 'r',
        created_at: '2024-01-01T00:00:00.000Z',
      }),
    ];

    const originalFirst = logs[0];
    const sorted = sortAuditLogsDesc(logs);

    // Must be a different array reference
    expect(sorted).not.toBe(logs);
    // Original array is not mutated
    expect(logs[0]).toBe(originalFirst);
  });

  it('getEntityAuditLogs filters by entity type and id, sorted desc', () => {
    const logs: AuditLog[] = [
      createAuditLog({
        entity_type: 'document',
        entity_id: 'doc-001',
        action: 'created',
        actor: 'a',
        reason: 'r',
        created_at: '2024-01-01T00:00:00.000Z',
      }),
      createAuditLog({
        entity_type: 'document',
        entity_id: 'doc-002',
        action: 'created',
        actor: 'b',
        reason: 'r',
        created_at: '2024-01-02T00:00:00.000Z',
      }),
      createAuditLog({
        entity_type: 'followup',
        entity_id: 'fu-001',
        action: 'created',
        actor: 'c',
        reason: 'r',
        created_at: '2024-01-03T00:00:00.000Z',
      }),
      createAuditLog({
        entity_type: 'document',
        entity_id: 'doc-001',
        action: 'status_advanced',
        actor: 'd',
        reason: 'r',
        created_at: '2024-02-01T00:00:00.000Z',
      }),
    ];

    const result = getEntityAuditLogs(logs, 'document', 'doc-001');

    expect(result).toHaveLength(2);
    expect(result.every((l) => l.entity_type === 'document' && l.entity_id === 'doc-001')).toBe(
      true
    );
    // Should be sorted descending
    expect(result[0].created_at).toBe('2024-02-01T00:00:00.000Z');
    expect(result[1].created_at).toBe('2024-01-01T00:00:00.000Z');
  });

  it('getLatestEntityAuditLog returns latest for existing entity or null for non-existent', () => {
    const logs: AuditLog[] = [
      createAuditLog({
        entity_type: 'document',
        entity_id: 'doc-001',
        action: 'created',
        actor: 'a',
        reason: 'r',
        created_at: '2024-01-01T00:00:00.000Z',
      }),
      createAuditLog({
        entity_type: 'document',
        entity_id: 'doc-001',
        action: 'status_advanced',
        actor: 'b',
        reason: 'r',
        created_at: '2024-03-01T00:00:00.000Z',
      }),
    ];

    const latest = getLatestEntityAuditLog(logs, 'document', 'doc-001');
    expect(latest).not.toBeNull();
    expect(latest!.created_at).toBe('2024-03-01T00:00:00.000Z');

    const missing = getLatestEntityAuditLog(logs, 'followup', 'fu-999');
    expect(missing).toBeNull();
  });
});
