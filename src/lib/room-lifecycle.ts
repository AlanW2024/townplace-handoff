import { Room, RoomCycle, RoomReference, RoomScope } from './types';
import { generateId } from './utils';

const ROOM_REFERENCE_REGEX = /\b(?:(EX)\s*)?(\d{1,2}[A-Ma-m])\b/g;

function normalizeDisplayCode(scope: RoomScope, roomId: string): string {
    return scope === 'archived' ? `EX ${roomId}` : roomId;
}

export function extractRoomReferences(rawText: string): RoomReference[] {
    const refs: RoomReference[] = [];
    const matches = Array.from(rawText.matchAll(ROOM_REFERENCE_REGEX));

    for (const match of matches) {
        const scope: RoomScope = match[1] ? 'archived' : 'active';
        const physicalRoomId = match[2].toUpperCase();
        const floor = Number(physicalRoomId.slice(0, -1));
        if (floor < 1 || floor > 32) continue;

        const displayCode = normalizeDisplayCode(scope, physicalRoomId);
        if (refs.some(ref => ref.display_code === displayCode)) continue;

        refs.push({
            physical_room_id: physicalRoomId,
            display_code: displayCode,
            scope,
            raw_match: match[0],
        });
    }

    return refs;
}

export function createActiveCycleFromRoom(room: Room, migrated = false): RoomCycle {
    const now = new Date().toISOString();
    return {
        id: `cycle-${room.id}-active`,
        property_id: room.property_id,
        room_id: room.id,
        display_code: room.id,
        scope: 'active',
        lifecycle_status: 'active',
        tenant_name: room.tenant_name,
        check_in_at: room.lease_start,
        check_out_at: null,
        archived_from_code: null,
        migrated,
        created_at: room.last_updated_at || now,
        updated_at: room.last_updated_at || now,
    };
}

export function normalizeRoomCycles(rooms: Room[], cycles: RoomCycle[] | undefined): RoomCycle[] {
    const normalized = [...(cycles ?? [])];

    for (const room of rooms) {
        const activeExists = normalized.some(cycle =>
            cycle.room_id === room.id &&
            cycle.scope === 'active' &&
            cycle.lifecycle_status === 'active'
        );
        if (!activeExists) {
            normalized.push(createActiveCycleFromRoom(room, true));
        }
    }

    return normalized.map(cycle => ({
        ...cycle,
        display_code: cycle.display_code || normalizeDisplayCode(cycle.scope, cycle.room_id),
        scope: cycle.scope || (cycle.display_code?.toUpperCase().startsWith('EX') ? 'archived' : 'active'),
        lifecycle_status: cycle.lifecycle_status || (cycle.display_code?.toUpperCase().startsWith('EX') ? 'archived' : 'active'),
        tenant_name: cycle.tenant_name ?? null,
        check_in_at: cycle.check_in_at ?? null,
        check_out_at: cycle.check_out_at ?? null,
        archived_from_code: cycle.archived_from_code ?? null,
        migrated: cycle.migrated ?? false,
        created_at: cycle.created_at || new Date().toISOString(),
        updated_at: cycle.updated_at || cycle.created_at || new Date().toISOString(),
    }));
}

export function findRoomCycleByReference(store: { room_cycles: RoomCycle[] }, ref: RoomReference): RoomCycle | null {
    return store.room_cycles.find(cycle =>
        cycle.room_id === ref.physical_room_id &&
        cycle.display_code === ref.display_code &&
        cycle.scope === ref.scope
    ) ?? null;
}

export function ensureRoomCycleForReference(store: { room_cycles: RoomCycle[] }, ref: RoomReference, propertyId = 'tp-soho'): RoomCycle {
    const existing = findRoomCycleByReference(store, ref);
    if (existing) return existing;

    const now = new Date().toISOString();
    const nextCycle: RoomCycle = {
        id: `cycle-${generateId()}`,
        property_id: propertyId,
        room_id: ref.physical_room_id,
        display_code: ref.display_code,
        scope: ref.scope,
        lifecycle_status: ref.scope === 'archived' ? 'archived' : 'active',
        tenant_name: null,
        check_in_at: null,
        check_out_at: ref.scope === 'archived' ? now : null,
        archived_from_code: ref.scope === 'archived' ? ref.physical_room_id : null,
        migrated: true,
        created_at: now,
        updated_at: now,
    };
    store.room_cycles.push(nextCycle);
    return nextCycle;
}

export function getActiveRoomCycle(store: { room_cycles: RoomCycle[] }, roomId: string): RoomCycle | null {
    return store.room_cycles.find(cycle =>
        cycle.room_id === roomId &&
        cycle.scope === 'active' &&
        cycle.lifecycle_status === 'active'
    ) ?? null;
}

export function resolveRoomCycleDisplayCode(
    store: { room_cycles: RoomCycle[] },
    roomId: string,
    roomCycleId?: string | null
): string {
    if (roomCycleId) {
        const cycle = store.room_cycles.find(item => item.id === roomCycleId);
        if (cycle) return cycle.display_code;
    }
    return roomId;
}

export function resolveRoomDisplayCodes(
    store: { room_cycles: RoomCycle[] },
    roomIds: string[] = [],
    roomCycleIds: string[] = []
): string[] {
    if (roomCycleIds.length > 0) {
        return Array.from(new Set(
            roomCycleIds
                .map(roomCycleId => store.room_cycles.find(cycle => cycle.id === roomCycleId)?.display_code)
                .filter((displayCode): displayCode is string => Boolean(displayCode))
        ));
    }

    return Array.from(new Set(roomIds));
}
