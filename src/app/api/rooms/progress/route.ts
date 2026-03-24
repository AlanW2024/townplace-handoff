import { NextResponse } from 'next/server';
import { getStore } from '@/lib/store';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const roomFilter = searchParams.get('room');
    const categoryFilter = searchParams.get('category');
    const dateFrom = searchParams.get('from');
    const dateTo = searchParams.get('to');

    const store = getStore();
    let entries = store.room_progress;

    if (roomFilter) {
        entries = entries.filter(e => e.room_id === roomFilter);
    }
    if (categoryFilter) {
        entries = entries.filter(e => e.category === categoryFilter);
    }
    if (dateFrom) {
        entries = entries.filter(e => e.summary_date >= dateFrom);
    }
    if (dateTo) {
        entries = entries.filter(e => e.summary_date <= dateTo);
    }

    // Sort by date descending, then room ascending
    entries.sort((a, b) => {
        const dateCmp = b.summary_date.localeCompare(a.summary_date);
        if (dateCmp !== 0) return dateCmp;
        return a.room_id.localeCompare(b.room_id);
    });

    return NextResponse.json({ entries, total: entries.length });
}
