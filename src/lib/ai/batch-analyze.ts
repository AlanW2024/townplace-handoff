import { getStore, withStoreWrite } from '../store';
import { analyzeHandoffSignal, enforceHandoffSafety } from '../message-parsing';
import { ensureRoomCycleForReference } from '../room-lifecycle';
import { AiBatchRun, AiExtractedEvent, AiMessageClassification, Message, ParseReview, RoomReference } from '../types';
import { generateId } from '../utils';
import { callStructuredJsonModel, getProviderConfig } from './parse-message';
import { BatchChunkAnalysis, BatchEventCandidate, BatchMessageClassification, BatchMessageView } from './batch-types';
import { chunkMessages } from './chunk-messages';
import { mergeChunkAnalyses } from './merge-events';

const runningRuns = new Set<string>();

function toBatchMessageView(message: Message): BatchMessageView {
    return {
        id: message.id,
        raw_text: message.raw_text,
        sender_name: message.sender_name,
        sender_dept: message.sender_dept,
        sent_at: message.sent_at,
        chat_name: message.chat_name,
        parsed_room_refs: message.parsed_room_refs ?? message.parsed_room.map(room => ({
            physical_room_id: room,
            display_code: room,
            scope: 'active',
            raw_match: room,
        })),
        parsed_action: message.parsed_action,
        parsed_type: message.parsed_type,
        confidence: message.confidence,
    };
}

function summarizeClassifications(classifications: BatchMessageClassification[]) {
    const counts = {
        actionable: 0,
        context: 0,
        irrelevant: 0,
        review: 0,
    };
    for (const item of classifications) {
        counts[item.classification] += 1;
    }
    return counts;
}

function classificationForMessage(message: BatchMessageView): BatchMessageClassification {
    const handoffSignal = analyzeHandoffSignal(message.raw_text);
    const safeParsed = enforceHandoffSafety(message.raw_text, {
        rooms: message.parsed_room_refs.map(ref => ref.physical_room_id),
        room_refs: message.parsed_room_refs,
        action: message.parsed_action,
        type: (message.parsed_type as any) ?? null,
        from_dept: null,
        to_dept: null,
        confidence: message.confidence,
        explanation: null,
    });

    if (safeParsed.action && safeParsed.rooms.length > 0 && handoffSignal.allowsImmediateHandoff) {
        return {
            message_id: message.id,
            classification: 'actionable',
            reason: '訊息明確指向房間，且 handoff 語句屬即時正向，可作可操作事件。',
        };
    }

    if (safeParsed.rooms.length > 0 && (!safeParsed.action || safeParsed.confidence < 0.72)) {
        return {
            message_id: message.id,
            classification: 'review',
            reason: '訊息提到房間，但動作或語意仍不夠穩定，交由覆核層處理。',
        };
    }

    if (safeParsed.action && safeParsed.rooms.length > 0) {
        return {
            message_id: message.id,
            classification: 'actionable',
            reason: '訊息具房間和可理解動作，可歸入營運事件。',
        };
    }

    if (safeParsed.action || /(check[\s-]?out|check[\s-]?in|退房|入住|文件|inventory|surrender|TA|newlet|viewing|clean|清潔|工程|維修)/i.test(message.raw_text)) {
        return {
            message_id: message.id,
            classification: 'context',
            reason: '訊息與營運流程有關，但不足以直接形成事件或交接。',
        };
    }

    return {
        message_id: message.id,
        classification: 'irrelevant',
        reason: '訊息未指向可操作房間或營運動作，保留作原始對話記錄。',
    };
}

function buildFallbackEvents(
    messages: BatchMessageView[],
    classifications: BatchMessageClassification[]
): BatchEventCandidate[] {
    const classificationMap = new Map(classifications.map(item => [item.message_id, item]));
    const events: BatchEventCandidate[] = [];

    for (const message of messages) {
        const classification = classificationMap.get(message.id);
        if (!classification) continue;

        if (classification.classification === 'actionable' && message.parsed_action) {
            events.push({
                event_type: /入住|退房/.test(message.parsed_action) ? 'room_progress_update' : 'operational_event',
                title: `${message.parsed_room_refs.map(ref => ref.display_code).join('、') || '未指定房間'} ${message.parsed_action}`,
                description: classification.reason,
                room_refs: message.parsed_room_refs,
                confidence: message.confidence,
                evidence_message_ids: [message.id],
            });
        }

        if (classification.classification === 'review' && message.parsed_room_refs.length > 0) {
            events.push({
                event_type: 'review_candidate',
                title: `${message.parsed_room_refs.map(ref => ref.display_code).join('、')} 需人工覆核`,
                description: classification.reason,
                room_refs: message.parsed_room_refs,
                confidence: Math.max(0.4, message.confidence),
                evidence_message_ids: [message.id],
            });
        }
    }

    return events;
}

function buildFallbackChunkAnalysis(messages: BatchMessageView[]): BatchChunkAnalysis {
    const classifications = messages.map(classificationForMessage);
    const events = buildFallbackEvents(messages, classifications);
    const counts = summarizeClassifications(classifications);

    return {
        message_classifications: classifications,
        events,
        summary_digest: `本段訊息共 ${messages.length} 則；可操作 ${counts.actionable}、背景 ${counts.context}、無關 ${counts.irrelevant}、需覆核 ${counts.review}。`,
        provider: 'rules',
        model: 'fallback-batch-analysis',
    };
}

function buildChunkPrompt(messages: BatchMessageView[]): string {
    return [
        '請扮演 TOWNPLACE SOHO 的 WhatsApp 群組營運分析員。',
        '你的任務不是總結聊天氣氛，而是抽取可執行的營運事件、房間進度和需覆核項目。',
        '關鍵規則：',
        '1. 只把與房號、工程、清潔、入住、退房、文件、預約、跟進有關的內容視為營運訊息。',
        '2. 普通寒暄、無房號閒聊、FYI 噪音應標記為 irrelevant。',
        '3. 「未可清 / not ready for cleaning / 明天可清」不是即時 handoff。',
        '4. `EX 2A` 代表房間 `2A` 的 archived lifecycle，不是另一間新房。',
        '5. 所有事件必須附 evidence_message_ids。',
        '6. 請輸出 JSON，不要輸出 Markdown。',
        '',
        'JSON schema：',
        JSON.stringify({
            message_classifications: [
                { message_id: 'msg-1', classification: 'actionable', reason: '...' },
            ],
            operational_events: [
                {
                    title: '10F 工程完成 → 可清潔',
                    description: '...',
                    room_refs: [{ physical_room_id: '10F', display_code: '10F', scope: 'active', raw_match: '10F' }],
                    confidence: 0.93,
                    evidence_message_ids: ['msg-1'],
                },
            ],
            room_progress_updates: [],
            followup_candidates: [],
            review_candidates: [],
            summary_digest: '...',
        }, null, 2),
        '',
        '以下是訊息：',
        ...messages.map(message => JSON.stringify({
            id: message.id,
            sent_at: message.sent_at,
            sender_name: message.sender_name,
            sender_dept: message.sender_dept,
            chat_name: message.chat_name,
            raw_text: message.raw_text,
            parsed_room_refs: message.parsed_room_refs,
            parsed_action: message.parsed_action,
            parsed_type: message.parsed_type,
            confidence: message.confidence,
        })),
    ].join('\n');
}

function normalizeRoomRefs(rawRoomRefs: unknown): RoomReference[] {
    if (!Array.isArray(rawRoomRefs)) return [];
    return rawRoomRefs
        .filter(item => typeof item === 'object' && item !== null)
        .map((item: any): RoomReference => {
            const scope: RoomReference['scope'] = item.scope === 'archived' ? 'archived' : 'active';
            return {
                physical_room_id: typeof item.physical_room_id === 'string' ? item.physical_room_id.toUpperCase().trim() : '',
                display_code: typeof item.display_code === 'string' ? item.display_code.toUpperCase().replace(/\s+/g, ' ').trim() : '',
                scope,
                raw_match: typeof item.raw_match === 'string' ? item.raw_match : '',
            };
        })
        .filter(ref => /^\d{1,2}[A-M]$/.test(ref.physical_room_id) && ref.display_code.length > 0);
}

function normalizeChunkAnalysis(raw: any, messages: BatchMessageView[], provider: ReturnType<typeof getProviderConfig>): BatchChunkAnalysis {
    const validIds = new Set(messages.map(message => message.id));
    const fallback = buildFallbackChunkAnalysis(messages);

    const message_classifications: BatchMessageClassification[] = Array.isArray(raw?.message_classifications)
        ? raw.message_classifications
            .filter((item: any) => validIds.has(item?.message_id))
            .map((item: any) => ({
                message_id: item.message_id,
                classification: ['actionable', 'context', 'irrelevant', 'review'].includes(item?.classification)
                    ? item.classification
                    : 'context',
                reason: typeof item?.reason === 'string' && item.reason.trim() ? item.reason.trim() : 'AI 未提供額外原因。',
            }))
        : fallback.message_classifications;

    const normalizeEventList = (rawEvents: unknown, event_type: BatchEventCandidate['event_type']): BatchEventCandidate[] => {
        if (!Array.isArray(rawEvents)) return [];
        return rawEvents
            .filter(item => typeof item === 'object' && item !== null)
            .map((item: any) => ({
                event_type,
                title: typeof item.title === 'string' ? item.title.trim() : '',
                description: typeof item.description === 'string' ? item.description.trim() : '',
                room_refs: normalizeRoomRefs(item.room_refs),
                confidence: typeof item.confidence === 'number' ? Math.min(1, Math.max(0, item.confidence)) : 0.6,
                evidence_message_ids: Array.isArray(item.evidence_message_ids)
                    ? item.evidence_message_ids.filter((id: unknown) => typeof id === 'string' && validIds.has(id))
                    : [],
            }))
            .filter(event => event.title.length > 0 && event.evidence_message_ids.length > 0);
    };

    const events = [
        ...normalizeEventList(raw?.operational_events, 'operational_event'),
        ...normalizeEventList(raw?.room_progress_updates, 'room_progress_update'),
        ...normalizeEventList(raw?.followup_candidates, 'followup_candidate'),
        ...normalizeEventList(raw?.review_candidates, 'review_candidate'),
    ];

    return {
        message_classifications: message_classifications.length > 0 ? message_classifications : fallback.message_classifications,
        events: events.length > 0 ? events : fallback.events,
        summary_digest: typeof raw?.summary_digest === 'string' && raw.summary_digest.trim()
            ? raw.summary_digest.trim()
            : fallback.summary_digest,
        provider: provider?.engine ?? fallback.provider,
        model: provider?.model ?? fallback.model,
    };
}

async function analyzeChunk(messages: BatchMessageView[]): Promise<BatchChunkAnalysis> {
    const provider = getProviderConfig();
    if (!provider) {
        return buildFallbackChunkAnalysis(messages);
    }

    try {
        const raw = await callStructuredJsonModel(
            buildChunkPrompt(messages),
            provider,
            '你是 WhatsApp 群組營運分析員，只能輸出 JSON。'
        );
        return normalizeChunkAnalysis(raw, messages, provider);
    } catch {
        return buildFallbackChunkAnalysis(messages);
    }
}

function buildReviewFromMessage(message: Message, reason: string, roomCycleIds: string[]): ParseReview {
    const now = new Date().toISOString();
    return {
        id: `rev-ai-${generateId()}`,
        property_id: message.property_id,
        message_id: message.id,
        raw_text: message.raw_text,
        sender_name: message.sender_name,
        sender_dept: message.sender_dept,
        confidence: message.confidence,
        suggested_rooms: message.parsed_room,
        room_cycle_ids: roomCycleIds,
        suggested_action: message.parsed_action,
        suggested_type: message.parsed_type,
        suggested_from_dept: message.sender_dept,
        suggested_to_dept: null,
        reviewed_rooms: message.parsed_room,
        reviewed_action: message.parsed_action,
        reviewed_type: message.parsed_type,
        reviewed_from_dept: message.sender_dept,
        reviewed_to_dept: null,
        review_status: 'pending',
        reviewed_by: null,
        reviewed_at: null,
        created_at: now,
        updated_at: now,
        version: 1,
    };
}

function createEventRecord(
    run: AiBatchRun,
    uploadBatchId: string,
    event: BatchEventCandidate,
    roomCycleIds: string[]
): AiExtractedEvent {
    const now = new Date().toISOString();
    return {
        id: `aievt-${generateId()}`,
        property_id: run.property_id,
        upload_batch_id: uploadBatchId,
        ai_batch_run_id: run.id,
        event_type: event.event_type,
        title: event.title,
        description: event.description,
        room_ids: event.room_refs.map(ref => ref.physical_room_id),
        room_cycle_ids: roomCycleIds,
        room_display_codes: event.room_refs.map(ref => ref.display_code),
        confidence: event.confidence,
        evidence_message_ids: event.evidence_message_ids,
        status: 'candidate',
        created_at: now,
        updated_at: now,
    };
}

async function markRunProgress(runId: string, statusPatch: Partial<AiBatchRun>): Promise<void> {
    await withStoreWrite(store => {
        const run = store.ai_batch_runs.find(item => item.id === runId);
        if (!run) return;
        Object.assign(run, statusPatch, { updated_at: new Date().toISOString() });
        const batch = store.upload_batches.find(item => item.id === run.upload_batch_id);
        if (batch && statusPatch.status) {
            batch.status = statusPatch.status === 'failed' ? 'failed' : statusPatch.status === 'completed' ? 'completed' : 'analyzing';
            batch.updated_at = new Date().toISOString();
        }
    });
}

export async function runAiBatchAnalysis(runId: string): Promise<void> {
    if (runningRuns.has(runId)) return;
    runningRuns.add(runId);

    try {
        const initialStore = getStore();
        const run = initialStore.ai_batch_runs.find(item => item.id === runId);
        if (!run) return;

        const batchMessages = initialStore.messages
            .filter(message => message.upload_batch_id === run.upload_batch_id)
            .sort((a, b) => new Date(a.sent_at).getTime() - new Date(b.sent_at).getTime());
        const chunks = chunkMessages(batchMessages.map(toBatchMessageView), { maxMessages: 60 });

        await markRunProgress(runId, {
            status: 'running',
            started_at: new Date().toISOString(),
            total_chunks: chunks.length,
            completed_chunks: 0,
        });

        const chunkAnalyses: BatchChunkAnalysis[] = [];
        for (let index = 0; index < chunks.length; index++) {
            const chunkAnalysis = await analyzeChunk(chunks[index]);
            chunkAnalyses.push(chunkAnalysis);
            await markRunProgress(runId, {
                completed_chunks: index + 1,
                provider: chunkAnalysis.provider,
                model: chunkAnalysis.model,
            });
        }

        const merged = mergeChunkAnalyses(chunkAnalyses);
        const counts = summarizeClassifications(merged.message_classifications);

        await withStoreWrite(store => {
            const liveRun = store.ai_batch_runs.find(item => item.id === runId);
            if (!liveRun) return;
            const batch = store.upload_batches.find(item => item.id === liveRun.upload_batch_id);
            if (!batch) return;

            const messageClassificationMap = new Map(merged.message_classifications.map(item => [item.message_id, item]));
            const roomCycleIdsByEvent = (roomRefs: RoomReference[]) =>
                roomRefs.map(ref => ensureRoomCycleForReference(store, ref, liveRun.property_id).id);

            store.ai_extracted_events = store.ai_extracted_events.filter(event => event.ai_batch_run_id !== runId);

            for (const event of merged.events) {
                store.ai_extracted_events.push(createEventRecord(
                    liveRun,
                    batch.id,
                    event,
                    roomCycleIdsByEvent(event.room_refs)
                ));
            }

            for (const message of store.messages.filter(item => item.upload_batch_id === batch.id)) {
                const classification = messageClassificationMap.get(message.id);
                if (!classification) continue;
                message.ai_classification = classification.classification;
                message.ai_classification_reason = classification.reason;

                if (
                    classification.classification === 'review' &&
                    !store.parse_reviews.some(review => review.message_id === message.id && review.review_status === 'pending')
                ) {
                    const roomRefs = message.parsed_room_refs ?? [];
                    if (roomRefs.length > 0) {
                        store.parse_reviews.push(buildReviewFromMessage(
                            message,
                            classification.reason,
                            roomCycleIdsByEvent(roomRefs)
                        ));
                    }
                }
            }

            liveRun.status = 'completed';
            liveRun.provider = chunkAnalyses[0]?.provider ?? 'fallback';
            liveRun.model = chunkAnalyses[0]?.model ?? null;
            liveRun.completed_chunks = liveRun.total_chunks;
            liveRun.actionable_count = counts.actionable;
            liveRun.context_count = counts.context;
            liveRun.irrelevant_count = counts.irrelevant;
            liveRun.review_count = counts.review;
            liveRun.summary_digest = merged.summary_digest || `本次 upload 共 ${batch.total_messages} 則訊息，已完成自動分類。`;
            liveRun.error = null;
            liveRun.completed_at = new Date().toISOString();
            liveRun.updated_at = liveRun.completed_at;

            batch.status = 'completed';
            batch.summary_digest = liveRun.summary_digest;
            batch.ai_batch_run_id = liveRun.id;
            batch.updated_at = liveRun.completed_at;
        });
    } catch (error) {
        await markRunProgress(runId, {
            status: 'failed',
            error: error instanceof Error ? error.message : 'AI 批次分析失敗',
            completed_at: new Date().toISOString(),
        });
    } finally {
        runningRuns.delete(runId);
    }
}

export function queueAiBatchAnalysis(runId: string): void {
    setTimeout(() => {
        void runAiBatchAnalysis(runId);
    }, 10);
}
