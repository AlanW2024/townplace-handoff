import { BatchChunkAnalysis, BatchEventCandidate, BatchMessageClassification } from './batch-types';

function eventKey(event: BatchEventCandidate): string {
    const rooms = event.room_refs.map(ref => ref.display_code).sort().join('|');
    const evidence = [...event.evidence_message_ids].sort().join('|');
    return `${event.event_type}::${event.title}::${rooms}::${evidence}`;
}

export function mergeChunkAnalyses(chunks: BatchChunkAnalysis[]) {
    const messageMap = new Map<string, BatchMessageClassification>();
    const eventMap = new Map<string, BatchEventCandidate>();
    const digests: string[] = [];

    for (const chunk of chunks) {
        if (chunk.summary_digest.trim()) {
            digests.push(chunk.summary_digest.trim());
        }

        for (const classification of chunk.message_classifications) {
            messageMap.set(classification.message_id, classification);
        }

        for (const event of chunk.events) {
            const key = eventKey(event);
            const existing = eventMap.get(key);
            if (!existing) {
                eventMap.set(key, {
                    ...event,
                    evidence_message_ids: Array.from(new Set(event.evidence_message_ids)),
                });
                continue;
            }

            existing.confidence = Math.max(existing.confidence, event.confidence);
            existing.evidence_message_ids = Array.from(new Set([
                ...existing.evidence_message_ids,
                ...event.evidence_message_ids,
            ]));
        }
    }

    return {
        message_classifications: Array.from(messageMap.values()),
        events: Array.from(eventMap.values()),
        summary_digest: digests.slice(0, 4).join('\n\n'),
    };
}
