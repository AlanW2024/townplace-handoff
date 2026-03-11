import { NextResponse } from 'next/server';
import { getStore, withStoreWrite } from '@/lib/store';
import { roomNeedsAttention } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    const store = getStore();
    const { searchParams } = new URL(request.url);

    let rooms = [...store.rooms];

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
        rooms = rooms.filter(roomNeedsAttention);
    }

    return NextResponse.json(rooms);
}

export async function PUT(request: Request) {
    const body = await request.json();
    const { id, ...updates } = body;

    try {
        const updated = await withStoreWrite(store => {
            const idx = store.rooms.findIndex(r => r.id === id);
            if (idx === -1) {
                throw new Error('Room not found');
            }

            store.rooms[idx] = { ...store.rooms[idx], ...updates, last_updated_at: new Date().toISOString() };
            return store.rooms[idx];
        });

        return NextResponse.json(updated);
    } catch (error) {
        const message = error instanceof Error ? error.message : '更新房間失敗';
        return NextResponse.json({ error: message }, { status: message === 'Room not found' ? 404 : 400 });
    }
}
