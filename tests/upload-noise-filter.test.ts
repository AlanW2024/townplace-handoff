import { describe, expect, it } from 'vitest';
import { withTempWorkspace } from './helpers';

/**
 * Tests for the expanded shouldSkipMessage() noise filter in the upload route.
 *
 * Each test uploads a WhatsApp-formatted text file containing a single message
 * and checks whether it was ingested (parsed_messages === 1) or skipped (=== 0).
 */

function waLine(sender: string, text: string): string {
    return `03/11/26, 9:15 AM - ${sender}: ${text}`;
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

describe.sequential('Upload noise filter — shouldSkipMessage', () => {
    // ── Emoji-only messages should be SKIPPED ──

    it('skips single emoji 👍', async () => {
        await withTempWorkspace(async () => {
            const data = await uploadSingleMessage('👍');
            expect(data.parsed_messages).toBe(0);
        });
    });

    it('skips repeated emoji 👍👍', async () => {
        await withTempWorkspace(async () => {
            const data = await uploadSingleMessage('👍👍');
            expect(data.parsed_messages).toBe(0);
        });
    });

    it('skips multi-emoji 🙏✅', async () => {
        await withTempWorkspace(async () => {
            const data = await uploadSingleMessage('🙏✅');
            expect(data.parsed_messages).toBe(0);
        });
    });

    // ── Pure acknowledgment messages should be SKIPPED ──

    it('skips "ok"', async () => {
        await withTempWorkspace(async () => {
            const data = await uploadSingleMessage('ok');
            expect(data.parsed_messages).toBe(0);
        });
    });

    it('skips "收到"', async () => {
        await withTempWorkspace(async () => {
            const data = await uploadSingleMessage('收到');
            expect(data.parsed_messages).toBe(0);
        });
    });

    it('skips "noted"', async () => {
        await withTempWorkspace(async () => {
            const data = await uploadSingleMessage('noted');
            expect(data.parsed_messages).toBe(0);
        });
    });

    it('skips "好的"', async () => {
        await withTempWorkspace(async () => {
            const data = await uploadSingleMessage('好的');
            expect(data.parsed_messages).toBe(0);
        });
    });

    it('skips "明白"', async () => {
        await withTempWorkspace(async () => {
            const data = await uploadSingleMessage('明白');
            expect(data.parsed_messages).toBe(0);
        });
    });

    it('skips "知道了"', async () => {
        await withTempWorkspace(async () => {
            const data = await uploadSingleMessage('知道了');
            expect(data.parsed_messages).toBe(0);
        });
    });

    it('skips "了解"', async () => {
        await withTempWorkspace(async () => {
            const data = await uploadSingleMessage('了解');
            expect(data.parsed_messages).toBe(0);
        });
    });

    it('skips "多謝"', async () => {
        await withTempWorkspace(async () => {
            const data = await uploadSingleMessage('多謝');
            expect(data.parsed_messages).toBe(0);
        });
    });

    it('skips "thx"', async () => {
        await withTempWorkspace(async () => {
            const data = await uploadSingleMessage('thx');
            expect(data.parsed_messages).toBe(0);
        });
    });

    it('skips "got it"', async () => {
        await withTempWorkspace(async () => {
            const data = await uploadSingleMessage('got it');
            expect(data.parsed_messages).toBe(0);
        });
    });

    it('skips "盡做"', async () => {
        await withTempWorkspace(async () => {
            const data = await uploadSingleMessage('盡做');
            expect(data.parsed_messages).toBe(0);
        });
    });

    // ── Deleted messages should be SKIPPED ──

    it('skips "此訊息已被刪除"', async () => {
        await withTempWorkspace(async () => {
            const data = await uploadSingleMessage('此訊息已被刪除');
            expect(data.parsed_messages).toBe(0);
        });
    });

    it('skips "This message was deleted"', async () => {
        await withTempWorkspace(async () => {
            const data = await uploadSingleMessage('This message was deleted');
            expect(data.parsed_messages).toBe(0);
        });
    });

    it('skips "You deleted this message"', async () => {
        await withTempWorkspace(async () => {
            const data = await uploadSingleMessage('You deleted this message');
            expect(data.parsed_messages).toBe(0);
        });
    });

    // ── Operational messages WITH room numbers should NOT be skipped ──

    it('keeps operational message with room "10F 已完成，可清潔"', async () => {
        await withTempWorkspace(async () => {
            const data = await uploadSingleMessage('10F 已完成，可清潔');
            expect(data.parsed_messages).toBe(1);
        });
    });

    // ── Messages with operational keywords (no room) should NOT be skipped ──

    it('keeps operational message without room "吉房清潔安排，FYI"', async () => {
        await withTempWorkspace(async () => {
            const data = await uploadSingleMessage('吉房清潔安排，FYI');
            expect(data.parsed_messages).toBe(1);
        });
    });
});
