import { NextResponse } from 'next/server';
import { getStore, saveStore } from '@/lib/store';

export async function GET() {
    const store = getStore();
    return NextResponse.json(store.documents);
}

export async function PUT(request: Request) {
    const store = getStore();
    const body = await request.json();
    const { id, ...updates } = body;

    const idx = store.documents.findIndex(d => d.id === id);
    if (idx === -1) return NextResponse.json({ error: 'Document not found' }, { status: 404 });

    store.documents[idx] = { ...store.documents[idx], ...updates, updated_at: new Date().toISOString() };
    saveStore(store);
    return NextResponse.json(store.documents[idx]);
}
