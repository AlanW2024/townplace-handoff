import { NextResponse } from 'next/server';
import { getStore, saveStore } from '@/lib/store';

export async function GET() {
    const store = getStore();
    return NextResponse.json(store.handoffs.sort((a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    ));
}

export async function PUT(request: Request) {
    const store = getStore();
    const body = await request.json();
    const { id, status } = body;

    const idx = store.handoffs.findIndex(h => h.id === id);
    if (idx === -1) return NextResponse.json({ error: 'Handoff not found' }, { status: 404 });

    store.handoffs[idx].status = status;
    if (status === 'acknowledged') {
        store.handoffs[idx].acknowledged_at = new Date().toISOString();
    }

    saveStore(store);

    return NextResponse.json(store.handoffs[idx]);
}
