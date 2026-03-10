import { NextResponse } from 'next/server';
import { ingestMessage } from '@/lib/ingest';
import { Message } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
        return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
    }

    const text = await file.text();
    const lines = text.split('\n');

    // Parse WhatsApp export format:
    // [DD/MM/YYYY, HH:MM:SS] Sender: message
    // or: DD/MM/YYYY, HH:MM - Sender: message
    const waRegex = /^\[?(\d{1,2}\/\d{1,2}\/\d{2,4}),?\s*(\d{1,2}:\d{2}(?::\d{2})?)\]?\s*[-–]?\s*([^:]+):\s*([\s\S]*)$/;

    const newMessages: Message[] = [];
    let parsedCount = 0;
    let handoffCount = 0;

    let pendingMessage: { dateStr: string; timePart: string; sender: string; text: string } | null = null;

    const processPendingMessage = () => {
        if (!pendingMessage) return;

        const rawText = pendingMessage.text.trim();
        // Skip system messages
        if (!rawText || rawText.includes('added') || rawText.includes('left') || rawText.includes('changed') || rawText === '<Media omitted>') {
            pendingMessage = null;
            return;
        }

        const dateParts = pendingMessage.dateStr.split('/');
        let formattedDate: string;
        if (dateParts[2].length === 4) {
            formattedDate = `${dateParts[2]}-${dateParts[1].padStart(2, '0')}-${dateParts[0].padStart(2, '0')}`;
        } else {
            formattedDate = `20${dateParts[2]}-${dateParts[1].padStart(2, '0')}-${dateParts[0].padStart(2, '0')}`;
        }

        let sentAt: string;
        try {
            sentAt = new Date(`${formattedDate}T${pendingMessage.timePart}`).toISOString();
        } catch {
            sentAt = new Date().toISOString();
        }

        const result = ingestMessage({
            raw_text: rawText,
            sender_name: pendingMessage.sender,
            sent_at: sentAt,
            id_prefix: 'msg-upload',
        });

        newMessages.push(result.message);
        parsedCount++;
        handoffCount += result.handoffs.length;

        pendingMessage = null;
    };

    for (const line of lines) {
        const match = line.match(waRegex);
        if (match) {
            // Processing previous message
            processPendingMessage();

            const [, datePart, timePart, senderName, messageText] = match;
            pendingMessage = {
                dateStr: datePart,
                timePart,
                sender: senderName.trim(),
                text: messageText,
            };
        } else if (pendingMessage) {
            // Append multi-line
            pendingMessage.text += '\n' + line;
        }
    }

    // Process the last message
    processPendingMessage();

    return NextResponse.json({
        total_lines: lines.length,
        parsed_messages: parsedCount,
        handoffs_created: handoffCount,
        messages: newMessages,
    });
}
