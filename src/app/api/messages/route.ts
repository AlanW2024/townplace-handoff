import { NextResponse } from 'next/server';
import { getStore } from '@/lib/store';

export async function GET() {
    const store = getStore();
    return NextResponse.json(store.messages.sort((a, b) =>
        new Date(b.sent_at).getTime() - new Date(a.sent_at).getTime()
    ));
}

export async function POST(request: Request) {
    const body = await request.json();

    const { ingestMessage } = await import('@/lib/ingest');

    // Pass everything to the central ingestion function
    const result = ingestMessage({
        raw_text: body.raw_text,
        sender_name: body.sender_name || 'Unknown',
        sender_dept: body.sender_dept,
        wa_group: body.wa_group || '工程+禮賓',
    });

    // The store is updated synchronously in-memory including handoffs and rooms.
    return NextResponse.json(result.message, { status: 201 });
}
