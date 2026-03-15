import { describe, expect, it } from 'vitest';
import { withTempWorkspace } from './helpers';

/**
 * Tests for shouldSkipMessage() in the upload route.
 *
 * Only WhatsApp system/meta messages are skipped.
 * ALL user-sent messages (including emoji, acks, deleted placeholders) are kept.
 */

function waLine(sender: string, text: string): string {
    return `03/11/26, 9:15 AM - ${sender}: ${text}`;
}

function waSystemLine(text: string): string {
    // System messages have no sender colon — they match isSystemMessageHeader
    return `03/11/26, 9:15 AM - ${text}`;
}

async function uploadSingleMessage(text: string, sender = 'Vic Lee') {
    const { POST } = await import('../src/app/api/upload/route');
    const content = waLine(sender, text);
    const formData = new FormData();
    formData.append('file', new File([content], 'WhatsApp Chat - Filter Test.txt', { type: 'text/plain' }));

    const response = await POST(new Request('http://localhost/api/upload', {
        method: 'POST',
        body: formData,
    }));

    expect(response.status).toBe(200);
    return (await response.json()) as {
        upload_batch_id: string;
        parsed_messages: number;
        stored_messages: number;
    };
}

describe.sequential('Upload filter — keeps all user messages', () => {
    // ── Emoji messages should be KEPT ──

    it('keeps single emoji 👍', async () => {
        await withTempWorkspace(async () => {
            const data = await uploadSingleMessage('👍');
            expect(data.parsed_messages).toBe(1);
        });
    });

    it('keeps multi-emoji 🙏✅', async () => {
        await withTempWorkspace(async () => {
            const data = await uploadSingleMessage('🙏✅');
            expect(data.parsed_messages).toBe(1);
        });
    });

    // ── Acknowledgment messages should be KEPT ──

    it('keeps "ok"', async () => {
        await withTempWorkspace(async () => {
            const data = await uploadSingleMessage('ok');
            expect(data.parsed_messages).toBe(1);
        });
    });

    it('keeps "收到"', async () => {
        await withTempWorkspace(async () => {
            const data = await uploadSingleMessage('收到');
            expect(data.parsed_messages).toBe(1);
        });
    });

    it('keeps "noted"', async () => {
        await withTempWorkspace(async () => {
            const data = await uploadSingleMessage('noted');
            expect(data.parsed_messages).toBe(1);
        });
    });

    it('keeps "多謝"', async () => {
        await withTempWorkspace(async () => {
            const data = await uploadSingleMessage('多謝');
            expect(data.parsed_messages).toBe(1);
        });
    });

    // ── Deleted message placeholders should be KEPT ──

    it('keeps "此訊息已被刪除"', async () => {
        await withTempWorkspace(async () => {
            const data = await uploadSingleMessage('此訊息已被刪除');
            expect(data.parsed_messages).toBe(1);
        });
    });

    it('keeps "This message was deleted"', async () => {
        await withTempWorkspace(async () => {
            const data = await uploadSingleMessage('This message was deleted');
            expect(data.parsed_messages).toBe(1);
        });
    });

    // ── Media placeholders should be KEPT ──

    it('keeps "<Media omitted>"', async () => {
        await withTempWorkspace(async () => {
            const data = await uploadSingleMessage('<Media omitted>');
            expect(data.parsed_messages).toBe(1);
        });
    });

    // ── Operational messages should be KEPT ──

    it('keeps operational message with room "10F 已完成，可清潔"', async () => {
        await withTempWorkspace(async () => {
            const data = await uploadSingleMessage('10F 已完成，可清潔');
            expect(data.parsed_messages).toBe(1);
        });
    });

    it('keeps operational message without room "吉房清潔安排，FYI"', async () => {
        await withTempWorkspace(async () => {
            const data = await uploadSingleMessage('吉房清潔安排，FYI');
            expect(data.parsed_messages).toBe(1);
        });
    });
});

describe.sequential('Upload filter — skips system messages', () => {
    it('skips encryption notice', async () => {
        await withTempWorkspace(async () => {
            const data = await uploadSingleMessage('Messages and calls are end-to-end encrypted');
            expect(data.parsed_messages).toBe(0);
        });
    });

    it('skips empty text', async () => {
        await withTempWorkspace(async () => {
            const data = await uploadSingleMessage('');
            expect(data.parsed_messages).toBe(0);
        });
    });
});
