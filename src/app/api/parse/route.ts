import { NextResponse } from 'next/server';
import { parseWhatsAppMessage, getDeptFromSender } from '@/lib/parser';

export async function POST(request: Request) {
    const body = await request.json();
    const { text, sender_name, sender_dept } = body;

    if (!text) {
        return NextResponse.json({ error: 'Missing text' }, { status: 400 });
    }

    const dept = sender_dept || (sender_name ? getDeptFromSender(sender_name) : null);
    const result = parseWhatsAppMessage(text, sender_name, dept || undefined);

    return NextResponse.json(result);
}
