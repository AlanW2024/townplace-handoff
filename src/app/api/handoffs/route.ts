import { NextResponse } from 'next/server';
import { getStore, withStoreWrite } from '@/lib/store';
import { HandoffStatus } from '@/lib/types';

export const dynamic = 'force-dynamic';

const VALID_HANDOFF_STATUSES: HandoffStatus[] = ['pending', 'acknowledged', 'completed'];

export async function GET() {
    const store = getStore();
    return NextResponse.json([...store.handoffs].sort((a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    ));
}

export async function PUT(request: Request) {
    const body = await request.json();
    const { id, status } = body as { id: string; status: HandoffStatus };

    if (!VALID_HANDOFF_STATUSES.includes(status)) {
        return NextResponse.json({ error: 'Invalid handoff status' }, { status: 400 });
    }

    try {
        const updated = await withStoreWrite(store => {
            const idx = store.handoffs.findIndex(h => h.id === id);
            if (idx === -1) {
                throw new Error('Handoff not found');
            }

            store.handoffs[idx].status = status;
            store.handoffs[idx].acknowledged_at = status === 'acknowledged'
                ? (store.handoffs[idx].acknowledged_at || new Date().toISOString())
                : store.handoffs[idx].acknowledged_at;

            return store.handoffs[idx];
        });

        return NextResponse.json(updated);
    } catch (error) {
        const message = error instanceof Error ? error.message : '更新交接失敗';
        return NextResponse.json({ error: message }, { status: message === 'Handoff not found' ? 404 : 400 });
    }
}
