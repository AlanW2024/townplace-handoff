import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';
import { NextResponse } from 'next/server';
import { ingestMessage } from '@/lib/ingest';
import { Message, ChatType } from '@/lib/types';

export const dynamic = 'force-dynamic';

interface ParsedHeader {
    dateStr: string;
    meridiem: string | null;
    timePart: string;
    sender: string;
    text: string;
}

function normalizeChatName(fileName: string): string {
    return fileName
        .replace(/\.(txt|zip)$/i, '')
        .replace(/^WhatsApp Chat -\s*/i, '')
        .replace(/^與/, '')
        .replace(/的 WhatsApp 對話$/i, '')
        .trim();
}

function inferChatType(fileName: string, overrideType: FormDataEntryValue | null): ChatType {
    if (overrideType === 'group' || overrideType === 'direct') {
        return overrideType;
    }
    return 'group';
}

function parseHeader(line: string): ParsedHeader | null {
    const bracketChinese = line.match(/^\[(\d{1,2}\/\d{1,2}\/\d{2,4})\s+(上午|下午)(\d{1,2}:\d{2}:\d{2})\]\s*([^:]+):\s*([\s\S]*)$/);
    if (bracketChinese) {
        const [, dateStr, meridiem, timePart, sender, text] = bracketChinese;
        return { dateStr, meridiem, timePart, sender: sender.trim(), text };
    }

    const bracket24 = line.match(/^\[(\d{1,2}\/\d{1,2}\/\d{2,4}),?\s*(\d{1,2}:\d{2}(?::\d{2})?)\]\s*([^:]+):\s*([\s\S]*)$/);
    if (bracket24) {
        const [, dateStr, timePart, sender, text] = bracket24;
        return { dateStr, meridiem: null, timePart, sender: sender.trim(), text };
    }

    const dashChinese = line.match(/^(\d{1,2}\/\d{1,2}\/\d{2,4})\s+(上午|下午)?(\d{1,2}:\d{2}(?::\d{2})?)\s+-\s+([^:]+):\s*([\s\S]*)$/);
    if (dashChinese) {
        const [, dateStr, meridiem, timePart, sender, text] = dashChinese;
        return { dateStr, meridiem: meridiem || null, timePart, sender: sender.trim(), text };
    }

    return null;
}

function parseWhatsAppDate(dateStr: string, meridiem: string | null, timePart: string): string {
    const [dayRaw, monthRaw, yearRaw] = dateStr.split('/');
    const year = yearRaw.length === 2 ? Number(`20${yearRaw}`) : Number(yearRaw);
    const month = Number(monthRaw) - 1;
    const day = Number(dayRaw);

    const [hourRaw, minuteRaw, secondRaw = '0'] = timePart.split(':');
    let hour = Number(hourRaw);
    const minute = Number(minuteRaw);
    const second = Number(secondRaw);

    if (meridiem === '下午' && hour < 12) hour += 12;
    if (meridiem === '上午' && hour === 12) hour = 0;

    return new Date(year, month, day, hour, minute, second).toISOString();
}

function shouldSkipMessage(sender: string, rawText: string): boolean {
    const normalizedSender = sender.replace(/[\u200e\u202f]/g, '').trim();
    const text = rawText.replace(/[\u200e\u202f]/g, '').trim();

    if (!text) return true;
    if (/圖片已略去|影片已略去|文件已略去|<Media omitted>/i.test(text)) return true;
    if (/訊息和通話經端對端加密/.test(text)) return true;
    if (/建立了此群組|新增了你|你現已成為管理員|changed this group's icon|changed the subject/i.test(text)) return true;
    if (/不明用戶/.test(normalizedSender) && /建立了此群組|加入了|離開了/.test(text)) return true;

    return false;
}

function findFirstTextFile(dir: string): string | null {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            const nested = findFirstTextFile(fullPath);
            if (nested) return nested;
        } else if (entry.isFile() && /\.txt$/i.test(entry.name)) {
            return fullPath;
        }
    }
    return null;
}

async function readUploadedText(file: File): Promise<string> {
    if (!file.name.toLowerCase().endsWith('.zip')) {
        return file.text();
    }

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'townplace-wa-'));
    const safeName = file.name.replace(/[^\w.-]+/g, '_');
    const zipPath = path.join(tmpDir, safeName || 'whatsapp.zip');
    const extractDir = path.join(tmpDir, 'extracted');

    try {
        fs.mkdirSync(extractDir, { recursive: true });
        fs.writeFileSync(zipPath, Buffer.from(await file.arrayBuffer()));
        execFileSync('/usr/bin/ditto', ['-x', '-k', zipPath, extractDir]);

        const textFile = findFirstTextFile(extractDir);
        if (!textFile) {
            throw new Error('zip 內找不到 WhatsApp 文字檔');
        }

        return fs.readFileSync(textFile, 'utf8');
    } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    }
}

export async function POST(request: Request) {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const overrideChatName = (formData.get('chat_name') || '').toString().trim();
    const overrideChatType = formData.get('chat_type');

    if (!file) {
        return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
    }

    const chatName = overrideChatName || normalizeChatName(file.name) || '未命名對話';
    const chatType = inferChatType(file.name, overrideChatType);
    const text = await readUploadedText(file);
    const lines = text.split(/\r?\n/);

    const newMessages: Message[] = [];
    let parsedCount = 0;
    let handoffCount = 0;

    let pendingMessage: ParsedHeader | null = null;

    const processPendingMessage = () => {
        if (!pendingMessage) return;

        const rawText = pendingMessage.text.trim();
        const sender = pendingMessage.sender.replace(/^[~‎\s]+/, '').trim();

        if (shouldSkipMessage(sender, rawText)) {
            pendingMessage = null;
            return;
        }

        const sentAt = parseWhatsAppDate(
            pendingMessage.dateStr,
            pendingMessage.meridiem,
            pendingMessage.timePart
        );

        const result = ingestMessage({
            raw_text: rawText,
            sender_name: sender,
            sent_at: sentAt,
            id_prefix: 'msg-upload',
            chat_name: chatName,
            chat_type: chatType,
            wa_group: chatName,
        });

        newMessages.push(result.message);
        parsedCount++;
        handoffCount += result.handoffs.length;
        pendingMessage = null;
    };

    for (const line of lines) {
        const header = parseHeader(line);
        if (header) {
            processPendingMessage();
            pendingMessage = header;
        } else if (pendingMessage) {
            pendingMessage.text += `\n${line}`;
        }
    }

    processPendingMessage();

    return NextResponse.json({
        total_lines: lines.length,
        parsed_messages: parsedCount,
        handoffs_created: handoffCount,
        chat_name: chatName,
        chat_type: chatType,
        messages: newMessages,
    });
}
