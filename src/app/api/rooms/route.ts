import { NextResponse } from 'next/server';
import { getStore, saveStore } from '@/lib/store';
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
    const store = getStore();
    const body = await request.json();
    const { id, ...updates } = body;

    const idx = store.rooms.findIndex(r => r.id === id);
    if (idx === -1) return NextResponse.json({ error: 'Room not found' }, { status: 404 });

    store.rooms[idx] = { ...store.rooms[idx], ...updates, last_updated_at: new Date().toISOString() };
    saveStore(store);
    return NextResponse.json(store.rooms[idx]);
}
