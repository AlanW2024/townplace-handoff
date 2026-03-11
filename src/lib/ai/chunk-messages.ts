import { BatchMessageView } from './batch-types';

interface ChunkOptions {
    maxMessages?: number;
    maxWindowMs?: number;
}

export function chunkMessages(
    messages: BatchMessageView[],
    options?: ChunkOptions
): BatchMessageView[][] {
    const maxMessages = options?.maxMessages ?? 120;
    const maxWindowMs = options?.maxWindowMs ?? 6 * 60 * 60 * 1000;
    const sorted = [...messages].sort((a, b) => new Date(a.sent_at).getTime() - new Date(b.sent_at).getTime());
    const chunks: BatchMessageView[][] = [];
    let current: BatchMessageView[] = [];
    let windowStart = 0;

    for (const message of sorted) {
        const sentAt = new Date(message.sent_at).getTime();
        if (current.length === 0) {
            current.push(message);
            windowStart = sentAt;
            continue;
        }

        const windowExceeded = sentAt - windowStart > maxWindowMs;
        const sizeExceeded = current.length >= maxMessages;
        if (windowExceeded || sizeExceeded) {
            chunks.push(current);
            current = [message];
            windowStart = sentAt;
            continue;
        }

        current.push(message);
    }

    if (current.length > 0) {
        chunks.push(current);
    }

    return chunks;
}
