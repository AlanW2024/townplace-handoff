import { NextResponse } from 'next/server';
import { getDeptFromSender } from '@/lib/parser';
import { parseMessageWithAI } from '@/lib/ai/parse-message';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
    const body = await request.json();
    const { text, sender_name, sender_dept } = body;

    if (!text) {
        return NextResponse.json({ error: 'Missing text' }, { status: 400 });
    }

    const dept = sender_dept || (sender_name ? getDeptFromSender(sender_name) : null);
    const result = await parseMessageWithAI({
        rawText: text,
        senderName: sender_name,
        senderDept: dept || undefined,
    });

    return NextResponse.json(result);
}
