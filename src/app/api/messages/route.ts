import { NextResponse } from 'next/server';
import { getStore } from '@/lib/store';
import { ChatType, DeptCode } from '@/lib/types';
import { parseJsonBody } from '@/lib/api-utils';
import { canIngestMessage } from '@/lib/permissions';
import { assertAllowed, requireAuthenticatedUser } from '@/lib/route-mutations';

export const dynamic = 'force-dynamic';

export async function GET() {
    const store = getStore();
    return NextResponse.json(store.messages.sort((a, b) =>
        new Date(b.sent_at).getTime() - new Date(a.sent_at).getTime()
    ));
}

export async function POST(request: Request) {
    const parsed = await parseJsonBody<{
        raw_text?: string;
        sender_name?: string;
        sender_dept?: DeptCode | null;
        wa_group?: string;
        chat_name?: string;
        chat_type?: ChatType;
    }>(request);
    if ('error' in parsed) return parsed.error;
    const body = parsed.data;

    if (typeof body.raw_text !== 'string' || body.raw_text.trim() === '') {
        return NextResponse.json({ error: 'raw_text 必須是非空字串' }, { status: 400 });
    }

    const auth = await requireAuthenticatedUser(request);
    if ('error' in auth) return auth.error;
    try {
        assertAllowed(canIngestMessage(auth.user));
    } catch (error) {
        return NextResponse.json(
            { error: error instanceof Error ? error.message : '權限不足' },
            { status: 403 }
        );
    }

    const { ingestMessage } = await import('@/lib/ingest');

    // Pass everything to the central ingestion function
    const result = await ingestMessage({
        raw_text: body.raw_text,
        sender_name: body.sender_name || 'Unknown',
        sender_dept: body.sender_dept,
        wa_group: body.wa_group,
        chat_name: body.chat_name || body.wa_group || 'SOHO 前線🏡🧹🦫🐿️',
        chat_type: body.chat_type || 'group',
    });

    return NextResponse.json(result.message, { status: 201 });
}
