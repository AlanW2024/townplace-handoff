import { NextResponse } from 'next/server';
import { getStore, withStoreWrite } from '@/lib/store';
import { createAuditLog } from '@/lib/audit';
import { parseJsonBody } from '@/lib/api-utils';
import { canChangeRoomStatus } from '@/lib/permissions';
import {
    assertAllowed,
    assertExpectedVersion,
    getRouteErrorStatus,
    requireAuthenticatedUser,
    resolveReason,
} from '@/lib/route-mutations';
import { deriveRoomAttentionState, roomNeedsAttention } from '@/lib/utils';
import { AuditFieldChange, CleanStatus, DeptCode, EngStatus, LeaseStatus, Room } from '@/lib/types';
import { roomNeedsAttention as roomNeedsAttentionRule } from '@/lib/utils';

export const dynamic = 'force-dynamic';

const VALID_ENG_STATUSES: EngStatus[] = ['completed', 'in_progress', 'pending', 'n_a'];
const VALID_CLEAN_STATUSES: CleanStatus[] = ['completed', 'in_progress', 'pending', 'n_a'];
const VALID_LEASE_STATUSES: LeaseStatus[] = ['occupied', 'vacant', 'newlet', 'checkout'];
const ROOM_FIELD_DEPTS = {
    eng_status: 'eng',
    clean_status: 'clean',
    lease_status: 'lease',
    tenant_name: 'lease',
    lease_start: 'lease',
    lease_end: 'lease',
    notes: 'mgmt',
} as const satisfies Record<string, DeptCode>;

type AllowedRoomField = keyof typeof ROOM_FIELD_DEPTS;
type RoomUpdateBody = {
    id?: string;
    actor?: string;
    reason?: string;
    expectedVersion?: number;
} & Partial<Pick<Room, AllowedRoomField>>;

function isNullableString(value: unknown): value is string | null {
    return value === null || typeof value === 'string';
}

function normalizeRoomUpdates(body: RoomUpdateBody): { updates: Partial<Pick<Room, AllowedRoomField>>; changes: AllowedRoomField[] } {
    const allowedKeys = new Set<AllowedRoomField>(Object.keys(ROOM_FIELD_DEPTS) as AllowedRoomField[]);
    const bodyKeys = Object.keys(body).filter(key => !['id', 'actor', 'reason', 'expectedVersion'].includes(key));
    const extraKeys = bodyKeys.filter(key => !allowedKeys.has(key as AllowedRoomField));

    if (extraKeys.length > 0) {
        throw new Error(`不支援更新欄位：${extraKeys.join(', ')}`);
    }

    const updates: Partial<Pick<Room, AllowedRoomField>> = {};
    const changes: AllowedRoomField[] = [];

    if (body.eng_status !== undefined) {
        if (!VALID_ENG_STATUSES.includes(body.eng_status)) {
            throw new Error('Invalid eng_status');
        }
        updates.eng_status = body.eng_status;
        changes.push('eng_status');
    }

    if (body.clean_status !== undefined) {
        if (!VALID_CLEAN_STATUSES.includes(body.clean_status)) {
            throw new Error('Invalid clean_status');
        }
        updates.clean_status = body.clean_status;
        changes.push('clean_status');
    }

    if (body.lease_status !== undefined) {
        if (!VALID_LEASE_STATUSES.includes(body.lease_status)) {
            throw new Error('Invalid lease_status');
        }
        updates.lease_status = body.lease_status;
        changes.push('lease_status');
    }

    if (body.tenant_name !== undefined) {
        if (!isNullableString(body.tenant_name)) {
            throw new Error('tenant_name 必須是字串或 null');
        }
        updates.tenant_name = body.tenant_name;
        changes.push('tenant_name');
    }

    if (body.lease_start !== undefined) {
        if (!isNullableString(body.lease_start)) {
            throw new Error('lease_start 必須是字串或 null');
        }
        if (typeof body.lease_start === 'string' && Number.isNaN(new Date(body.lease_start).getTime())) {
            throw new Error('lease_start 必須是有效日期');
        }
        updates.lease_start = body.lease_start;
        changes.push('lease_start');
    }

    if (body.lease_end !== undefined) {
        if (!isNullableString(body.lease_end)) {
            throw new Error('lease_end 必須是字串或 null');
        }
        if (typeof body.lease_end === 'string' && Number.isNaN(new Date(body.lease_end).getTime())) {
            throw new Error('lease_end 必須是有效日期');
        }
        updates.lease_end = body.lease_end;
        changes.push('lease_end');
    }

    if (body.notes !== undefined) {
        if (!isNullableString(body.notes)) {
            throw new Error('notes 必須是字串或 null');
        }
        updates.notes = body.notes;
        changes.push('notes');
    }

    return { updates, changes };
}

function assertSafeRoomState(nextRoom: Pick<Room, 'eng_status' | 'clean_status'>): void {
    if (nextRoom.eng_status === 'pending' && (nextRoom.clean_status === 'pending' || nextRoom.clean_status === 'in_progress')) {
        throw new Error('工程仍待處理時，不能直接把清潔狀態設為待處理或進行中');
    }
}

export async function GET(request: Request) {
    const store = getStore();
    const { searchParams } = new URL(request.url);
    const scope = searchParams.get('scope') === 'archived' ? 'archived' : 'active';

    let rooms: Array<Room & {
        display_code?: string;
        room_scope?: 'active' | 'archived';
        room_cycle_id?: string | null;
        lifecycle_status?: 'active' | 'archived';
        check_out_at?: string | null;
        archived_cycles_count?: number;
    }> = scope === 'archived'
        ? store.room_cycles
            .filter(cycle => cycle.scope === 'archived')
            .map(cycle => {
                const baseRoom = store.rooms.find(room => room.id === cycle.room_id);
                return {
                    ...(baseRoom ?? {
                        id: cycle.room_id,
                        property_id: cycle.property_id,
                        floor: Number(cycle.room_id.slice(0, -1)) || 0,
                        unit_letter: cycle.room_id.slice(-1),
                        room_type: 'Archived',
                        eng_status: 'n_a',
                        clean_status: 'n_a',
                        lease_status: 'checkout',
                        tenant_name: null,
                        lease_start: null,
                        lease_end: null,
                        notes: null,
                        last_updated_at: cycle.updated_at,
                        last_updated_by: null,
                        needs_attention: false,
                        attention_reason: null,
                        version: 1,
                    }),
                    display_code: cycle.display_code,
                    room_scope: cycle.scope,
                    room_cycle_id: cycle.id,
                    lifecycle_status: cycle.lifecycle_status,
                    check_out_at: cycle.check_out_at,
                    tenant_name: cycle.tenant_name,
                    lease_status: 'checkout',
                    last_updated_at: cycle.updated_at,
                    archived_cycles_count: 1,
                };
            })
        : store.rooms.map(room => {
            const activeCycle = store.room_cycles.find(cycle =>
                cycle.room_id === room.id &&
                cycle.scope === 'active' &&
                cycle.lifecycle_status === 'active'
            );
            const archivedCount = store.room_cycles.filter(cycle =>
                cycle.room_id === room.id &&
                cycle.scope === 'archived'
            ).length;
            return {
                ...room,
                display_code: activeCycle?.display_code ?? room.id,
                room_scope: 'active' as const,
                room_cycle_id: activeCycle?.id ?? null,
                lifecycle_status: activeCycle?.lifecycle_status ?? 'active',
                check_out_at: activeCycle?.check_out_at ?? null,
                archived_cycles_count: archivedCount,
            };
        });

    const floor = searchParams.get('floor');
    if (floor) rooms = rooms.filter(r => r.floor === parseInt(floor));

    const status = searchParams.get('status');
    if (status) {
        rooms = rooms.filter(r =>
            r.eng_status === status ||
            r.clean_status === status ||
            r.lease_status === status
        );
    }

    const hasAlert = searchParams.get('alert');
    if (hasAlert === 'true') {
        rooms = rooms.filter(roomNeedsAttentionRule);
    }

    return NextResponse.json(rooms);
}

export async function PUT(request: Request) {
    const parsed = await parseJsonBody<RoomUpdateBody>(request);
    if ('error' in parsed) return parsed.error;
    const { id, actor, reason, expectedVersion, ...body } = parsed.data;
    const actorName = typeof actor === 'string' ? actor.trim() : '';
    const actionReason = resolveReason(reason);

    if (!id) {
        return NextResponse.json({ error: 'Missing room id' }, { status: 400 });
    }

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
            const idx = store.rooms.findIndex(r => r.id === id);
            if (idx === -1) {
                throw new Error('Room not found');
            }

            const current = store.rooms[idx];
            const { updates, changes } = normalizeRoomUpdates(body);

            if (changes.length === 0) {
                throw new Error('沒有可更新的內容');
            }

            assertExpectedVersion(expectedVersion, current.version, '房間');
            for (const field of changes) {
                assertAllowed(canChangeRoomStatus(auth.user, ROOM_FIELD_DEPTS[field]));
            }

            const nextRoom: Room = {
                ...current,
                ...updates,
                last_updated_at: new Date().toISOString(),
                last_updated_by: actorName,
                version: (current.version || 1) + 1,
            };

            // Keep direct room edits conservative so cleaning cannot jump ahead of pending engineering.
            assertSafeRoomState(nextRoom);
            Object.assign(nextRoom, deriveRoomAttentionState(nextRoom));
            store.rooms[idx] = nextRoom;

            const auditChanges: AuditFieldChange[] = changes
                .filter(field => current[field] !== nextRoom[field])
                .map(field => ({
                    field,
                    from: current[field] === null ? null : String(current[field]),
                    to: nextRoom[field] === null ? null : String(nextRoom[field]),
                }));

            if (auditChanges.length === 0) {
                throw new Error('沒有可更新的內容');
            }

            store.audit_logs.push(createAuditLog({
                entity_type: 'room',
                entity_id: current.id,
                action: 'field_updated',
                actor: actorName,
                actor_id: auth.user.id,
                reason: actionReason,
                changes: auditChanges,
            }));

            return store.rooms[idx];
        });

        return NextResponse.json(updated);
    } catch (error) {
        const message = error instanceof Error ? error.message : '更新房間失敗';
        return NextResponse.json({ error: message }, { status: getRouteErrorStatus(error, 'Room not found') });
    }
}
