import { NextResponse } from 'next/server';
import { getStore, saveStore } from '@/lib/store';
import { Followup } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function GET() {
    const store = getStore();
    const sorted = store.followups.sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
    return NextResponse.json(sorted);
}

export async function POST(request: Request) {
    const store = getStore();
    const body = await request.json();

    // Prevent duplicate followups from same suggestion
    if (body.source_type === 'suggestion' && body.source_id) {
        const existing = store.followups.find(
            f => f.source_type === 'suggestion' && f.source_id === body.source_id
        );
        if (existing) {
            return NextResponse.json(
                { error: '此建議已建立跟進事項', existing_id: existing.id },
                { status: 409 }
            );
        }
    }

    const now = new Date().toISOString();
    const followup: Followup = {
        id: `fu-${Date.now()}`,
        title: body.title || '',
        description: body.description || '',
        source_type: body.source_type || 'manual',
        source_id: body.source_id || '',
        priority: body.priority || 'info',
        assigned_dept: body.assigned_dept || 'mgmt',
        assigned_to: body.assigned_to || null,
        related_rooms: body.related_rooms || [],
        status: 'open',
        due_at: body.due_at || null,
        created_at: now,
        updated_at: now,
    };

    store.followups.push(followup);
    saveStore(store);

    return NextResponse.json(followup, { status: 201 });
}

export async function PUT(request: Request) {
    const store = getStore();
    const body = await request.json();
    const { id, ...updates } = body;

    const idx = store.followups.findIndex(f => f.id === id);
    if (idx === -1) {
        return NextResponse.json({ error: 'Followup not found' }, { status: 404 });
    }

    const allowed = ['status', 'assigned_dept', 'assigned_to', 'due_at'] as const;
    for (const key of allowed) {
        if (key in updates) {
            (store.followups[idx] as any)[key] = updates[key];
        }
    }
    store.followups[idx].updated_at = new Date().toISOString();

    saveStore(store);
    return NextResponse.json(store.followups[idx]);
}
