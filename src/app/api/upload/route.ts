import AdmZip from 'adm-zip';
import { NextResponse } from 'next/server';
import { ingestMessagesBatch } from '@/lib/ingest';
import { Message, ChatType, UploadBatch, AiBatchRun } from '@/lib/types';
import { withStoreWrite } from '@/lib/store';
import { generateId } from '@/lib/utils';
import { queueAiBatchAnalysis } from '@/lib/ai/batch-analyze';

export const dynamic = 'force-dynamic';

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

interface ParsedHeader {
    dateStr: string;
    dateOrder: 'dmy' | 'mdy';
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
        return { dateStr, dateOrder: 'dmy', meridiem, timePart, sender: sender.trim(), text };
    }

    const bracket24 = line.match(/^\[(\d{1,2}\/\d{1,2}\/\d{2,4}),?\s*(\d{1,2}:\d{2}(?::\d{2})?)\]\s*([^:]+):\s*([\s\S]*)$/);
    if (bracket24) {
        const [, dateStr, timePart, sender, text] = bracket24;
        return { dateStr, dateOrder: 'dmy', meridiem: null, timePart, sender: sender.trim(), text };
    }

    const dashChinese = line.match(/^(\d{1,2}\/\d{1,2}\/\d{2,4})\s+(上午|下午)?(\d{1,2}:\d{2}(?::\d{2})?)\s+-\s+([^:]+):\s*([\s\S]*)$/);
    if (dashChinese) {
        const [, dateStr, meridiem, timePart, sender, text] = dashChinese;
        return { dateStr, dateOrder: 'dmy', meridiem: meridiem || null, timePart, sender: sender.trim(), text };
    }

    const dashEnglish = line.match(/^(\d{1,2}\/\d{1,2}\/\d{2,4}),\s*(\d{1,2}:\d{2}(?::\d{2})?)\s*(AM|PM)\s+-\s+([^:]+):\s*([\s\S]*)$/i);
    if (dashEnglish) {
        const [, dateStr, timePart, meridiem, sender, text] = dashEnglish;
        return { dateStr, dateOrder: 'mdy', meridiem: meridiem.toUpperCase(), timePart, sender: sender.trim(), text };
    }

    return null;
}

function isSystemMessageHeader(line: string): boolean {
    return [
        /^\[\d{1,2}\/\d{1,2}\/\d{2,4}\s+(上午|下午)\d{1,2}:\d{2}:\d{2}\]\s*[\s\S]+$/,
        /^\[\d{1,2}\/\d{1,2}\/\d{2,4},?\s*\d{1,2}:\d{2}(?::\d{2})?\]\s*[\s\S]+$/,
        /^\d{1,2}\/\d{1,2}\/\d{2,4}\s+(上午|下午)?\d{1,2}:\d{2}(?::\d{2})?\s+-\s+[\s\S]+$/,
        /^\d{1,2}\/\d{1,2}\/\d{2,4},\s*\d{1,2}:\d{2}(?::\d{2})?\s*(AM|PM)\s+-\s+[\s\S]+$/i,
    ].some(regex => regex.test(line) && !/:\s/.test(line));
}

function parseWhatsAppDate(dateStr: string, meridiem: string | null, timePart: string, dateOrder: 'dmy' | 'mdy'): string {
    const [partOne, partTwo, yearRaw] = dateStr.split('/');
    const year = yearRaw.length === 2 ? Number(`20${yearRaw}`) : Number(yearRaw);
    const day = dateOrder === 'mdy' ? Number(partTwo) : Number(partOne);
    const month = (dateOrder === 'mdy' ? Number(partOne) : Number(partTwo)) - 1;

    const [hourRaw, minuteRaw, secondRaw = '0'] = timePart.split(':');
    let hour = Number(hourRaw);
    const minute = Number(minuteRaw);
    const second = Number(secondRaw);

    if ((meridiem === '下午' || meridiem === 'PM') && hour < 12) hour += 12;
    if ((meridiem === '上午' || meridiem === 'AM') && hour === 12) hour = 0;

    return new Date(year, month, day, hour, minute, second).toISOString();
}

function shouldSkipMessage(sender: string, rawText: string): boolean {
    const normalizedSender = sender.replace(/[\u200e\u202f]/g, '').trim();
    const text = rawText.replace(/[\u200e\u202f]/g, '').trim();

    if (!text) return true;
    if (/^\uFEFF/.test(text)) return true;
    if (/圖片已略去|影片已略去|文件已略去|語音通話已略去|<Media omitted>|image omitted|video omitted|audio omitted|document omitted|<attached:/i.test(text)) return true;
    if (/訊息和通話經端對端加密|Messages and calls are end-to-end encrypted/i.test(text)) return true;
    if (/建立了此群組|新增了你|你現已成為管理員|changed this group's icon|changed the subject|created group|added|left|joined using this group's invite link|security code changed/i.test(text)) return true;
    if (/不明用戶/.test(normalizedSender) && /建立了此群組|加入了|離開了/.test(text)) return true;

    return false;
}

async function readUploadedText(file: File): Promise<string> {
    if (!file.name.toLowerCase().endsWith('.zip')) {
        return (await file.text()).replace(/^\uFEFF/, '');
    }

    const zipBuffer = Buffer.from(await file.arrayBuffer());
    const zip = new AdmZip(zipBuffer);
    const entries = zip.getEntries().filter(entry => !entry.isDirectory && /\.txt$/i.test(entry.entryName));
    if (entries.length === 0) {
        throw new Error('zip 內找不到 WhatsApp 文字檔');
    }

    const firstTextEntry = entries.sort((a, b) => a.entryName.localeCompare(b.entryName))[0];
    return zip.readAsText(firstTextEntry, 'utf8').replace(/^\uFEFF/, '');
}

export async function POST(request: Request) {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const overrideChatName = (formData.get('chat_name') || '').toString().trim();
    const overrideChatType = formData.get('chat_type');

    if (!file) {
        return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
    }

    if (file.size > MAX_UPLOAD_BYTES) {
        return NextResponse.json({ error: '檔案過大，請控制在 10MB 內' }, { status: 413 });
    }

    const chatName = overrideChatName || normalizeChatName(file.name) || '未命名對話';
    const chatType = inferChatType(file.name, overrideChatType);
    const text = await readUploadedText(file);
    const lines = text.split(/\r?\n/);

    const entriesToIngest: Parameters<typeof ingestMessagesBatch>[0] = [];
    let parsedCount = 0;
    let pendingMessage: ParsedHeader | null = null;
    const uploadBatchId = `upload-${generateId()}`;
    const aiBatchRunId = `airun-${generateId()}`;

    const flushPendingMessage = () => {
        if (!pendingMessage) return;

        const rawText = pendingMessage.text.trim();
        const sender = pendingMessage.sender.replace(/^[~‎\s]+/, '').trim();

        if (!shouldSkipMessage(sender, rawText)) {
            entriesToIngest.push({
                raw_text: rawText,
                sender_name: sender,
                sent_at: parseWhatsAppDate(
                    pendingMessage.dateStr,
                    pendingMessage.meridiem,
                    pendingMessage.timePart,
                    pendingMessage.dateOrder
                ),
                id_prefix: 'msg-upload',
                chat_name: chatName,
                chat_type: chatType,
                wa_group: chatName,
                upload_batch_id: uploadBatchId,
            });
            parsedCount++;
        }

        pendingMessage = null;
    };

    for (const rawLine of lines) {
        const line = rawLine.replace(/^\uFEFF/, '');
        const header = parseHeader(line);
        if (header) {
            flushPendingMessage();
            pendingMessage = header;
            continue;
        }

        if (isSystemMessageHeader(line)) {
            flushPendingMessage();
            continue;
        }

        if (pendingMessage) {
            pendingMessage.text += `\n${line}`;
        }
    }

    flushPendingMessage();

    // Bulk uploads first preserve every raw message, then kick off full-conversation AI analysis.
    const results = await ingestMessagesBatch(entriesToIngest, {
        strategy: 'rules_only',
        reviewMode: 'bulk_upload',
        suppressSideEffects: true,
        suppressReviews: true,
        defaultClassification: 'context',
    });
    const newMessages: Message[] = results.map(result => result.message);
    const now = new Date().toISOString();

    await withStoreWrite(store => {
        const uploadBatch: UploadBatch = {
            id: uploadBatchId,
            property_id: 'tp-soho',
            source_file_name: file.name,
            chat_name: chatName,
            chat_type: chatType,
            total_lines: lines.length,
            parsed_messages: parsedCount,
            total_messages: newMessages.length,
            status: 'uploaded',
            ai_batch_run_id: aiBatchRunId,
            summary_digest: null,
            created_at: now,
            updated_at: now,
        };
        const run: AiBatchRun = {
            id: aiBatchRunId,
            property_id: 'tp-soho',
            upload_batch_id: uploadBatchId,
            status: 'queued',
            provider: 'fallback',
            model: null,
            total_chunks: 0,
            completed_chunks: 0,
            actionable_count: 0,
            context_count: 0,
            irrelevant_count: 0,
            review_count: 0,
            summary_digest: null,
            error: null,
            started_at: null,
            completed_at: null,
            created_at: now,
            updated_at: now,
        };

        store.upload_batches.push(uploadBatch);
        store.ai_batch_runs.push(run);
    });

    queueAiBatchAnalysis(aiBatchRunId);

    return NextResponse.json({
        upload_batch_id: uploadBatchId,
        ai_batch_run_id: aiBatchRunId,
        total_lines: lines.length,
        parsed_messages: parsedCount,
        handoffs_created: 0,
        chat_name: chatName,
        chat_type: chatType,
        messages: newMessages,
    });
}
