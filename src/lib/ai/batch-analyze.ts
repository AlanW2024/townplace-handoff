import { getStore, withStoreWrite } from '../store';
import { classifyMessageForOperationalQueue } from '../review-queue';
import { ensureRoomCycleForReference } from '../room-lifecycle';
import { AiBatchRun, AiExtractedEvent, Message, ParseReview, RoomReference } from '../types';
import { generateId } from '../utils';
import { callStructuredJsonModel, getProviderConfig } from './parse-message';
import { BatchChunkAnalysis, BatchEventCandidate, BatchMessageClassification, BatchMessageView } from './batch-types';
import { chunkMessages } from './chunk-messages';
import { mergeChunkAnalyses } from './merge-events';

const runningRuns = new Set<string>();
const queuedRuns: string[] = [];
let drainingQueue = false;

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
    const decision = classifyMessageForOperationalQueue({
        raw_text: message.raw_text,
        parsed_room_refs: message.parsed_room_refs,
        parsed_action: message.parsed_action,
        parsed_type: message.parsed_type,
        confidence: message.confidence,
        sender_dept: message.sender_dept,
    });

    return {
        message_id: message.id,
        classification: decision.classification,
        reason: decision.reason,
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
        '⚠️ 分類指引（嚴格遵守）：',
        '- irrelevant：確認回覆（ok、收到、noted、好的、👍）、寒暄（早晨、食咗飯未）、',
        '  純感謝（多謝、thx）、表情符號、無上下文短語（跟、盡做）、已刪除訊息。',
        '  即使提及房號，若核心內容只是確認/感謝，仍標記為 irrelevant。',
        '  例：「10F ok」→ irrelevant，「收到，23D」→ irrelevant，「23D 多謝師傅」→ irrelevant。',
        '- context：有營運背景但不需要立即行動的訊息（問題、安排、FYI、進度報告）。',
        '  例：「10F 幾時搞好？」→ context，「吉房清潔安排，FYI」→ context。',
        '- review：有房號 + 模糊的完成/狀態語句，無法確定應否建立 handoff。',
        '  例：「19C 完成」→ review（因為無「可清」，不確定是否可清潔）。',
        '- actionable：有明確房號 + 明確動作 + 高信心度。',
        '  例：「10F 已完成，可清潔」→ actionable。',
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
    const fallbackMap = new Map(fallback.message_classifications.map(item => [item.message_id, item]));

    const aiMessageClassifications: BatchMessageClassification[] = Array.isArray(raw?.message_classifications)
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

    const aiClassificationMap = new Map(aiMessageClassifications.map(item => [item.message_id, item]));
    const message_classifications: BatchMessageClassification[] = messages.map(message => {
        const guarded = fallbackMap.get(message.id) ?? classificationForMessage(message);
        const suggested = aiClassificationMap.get(message.id);
        if (!suggested) return guarded;

        if (suggested.classification === 'review' && guarded.classification !== 'review') {
            return {
                message_id: message.id,
                classification: guarded.classification,
                reason: guarded.reason,
            };
        }

        if (guarded.classification === 'review' && suggested.classification !== 'review') {
            return {
                message_id: message.id,
                classification: 'review',
                reason: guarded.reason,
            };
        }

        return suggested;
    });

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
        if (!run || run.status === 'completed' || run.status === 'failed') return;

        const batchMessages = initialStore.messages
            .filter(message => message.upload_batch_id === run.upload_batch_id)
            .sort((a, b) => new Date(a.sent_at).getTime() - new Date(b.sent_at).getTime());
        const chunks = chunkMessages(batchMessages.map(toBatchMessageView), { maxMessages: 300 });

        await markRunProgress(runId, {
            status: 'running',
            started_at: new Date().toISOString(),
            total_chunks: chunks.length,
            completed_chunks: 0,
        });

        const AI_CONCURRENCY = 5;
        const chunkAnalyses: BatchChunkAnalysis[] = new Array(chunks.length);
        let completedCount = 0;

        const processChunk = async (idx: number) => {
            chunkAnalyses[idx] = await analyzeChunk(chunks[idx]);
            completedCount++;
            await markRunProgress(runId, {
                completed_chunks: completedCount,
                provider: chunkAnalyses[idx].provider,
                model: chunkAnalyses[idx].model,
            });
        };

        let nextIndex = 0;
        const worker = async () => {
            while (nextIndex < chunks.length) {
                const idx = nextIndex++;
                await processChunk(idx);
            }
        };

        await Promise.all(
            Array.from({ length: Math.min(AI_CONCURRENCY, chunks.length) }, () => worker())
        );

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
        void drainQueuedAnalyses();
    }
}

async function drainQueuedAnalyses(): Promise<void> {
    if (drainingQueue || runningRuns.size > 0) return;
    drainingQueue = true;

    try {
        while (queuedRuns.length > 0) {
            if (runningRuns.size > 0) return;

            const nextRunId = queuedRuns.shift();
            if (!nextRunId) continue;
            await runAiBatchAnalysis(nextRunId);
        }
    } finally {
        drainingQueue = false;
        if (queuedRuns.length > 0 && runningRuns.size === 0) {
            setTimeout(() => {
                void drainQueuedAnalyses();
            }, 10);
        }
    }
}

export async function runInstantRulesClassification(runId: string): Promise<void> {
    const store = getStore();
    const run = store.ai_batch_runs.find(item => item.id === runId);
    if (!run) return;

    const batchMessages = store.messages
        .filter(message => message.upload_batch_id === run.upload_batch_id)
        .sort((a, b) => new Date(a.sent_at).getTime() - new Date(b.sent_at).getTime());

    const batchViews = batchMessages.map(toBatchMessageView);
    const classifications = batchViews.map(classificationForMessage);
    const counts = summarizeClassifications(classifications);
    const events = buildFallbackEvents(batchViews, classifications);
    const summaryDigest = `本次 upload 共 ${batchMessages.length} 則訊息；可操作 ${counts.actionable}、背景 ${counts.context}、無關 ${counts.irrelevant}、需覆核 ${counts.review}。`;

    const classificationMap = new Map(classifications.map(item => [item.message_id, item]));

    await withStoreWrite(liveStore => {
        const liveRun = liveStore.ai_batch_runs.find(item => item.id === runId);
        if (!liveRun) return;
        const batch = liveStore.upload_batches.find(item => item.id === liveRun.upload_batch_id);
        if (!batch) return;

        const roomCycleIdsForRefs = (roomRefs: RoomReference[]) =>
            roomRefs.map(ref => ensureRoomCycleForReference(liveStore, ref, liveRun.property_id).id);

        // Update message classifications
        for (const message of liveStore.messages.filter(item => item.upload_batch_id === batch.id)) {
            const classification = classificationMap.get(message.id);
            if (!classification) continue;
            message.ai_classification = classification.classification;
            message.ai_classification_reason = classification.reason;

            if (
                classification.classification === 'review' &&
                !liveStore.parse_reviews.some(review => review.message_id === message.id && review.review_status === 'pending')
            ) {
                const roomRefs = message.parsed_room_refs ?? [];
                if (roomRefs.length > 0) {
                    liveStore.parse_reviews.push(buildReviewFromMessage(
                        message,
                        classification.reason,
                        roomCycleIdsForRefs(roomRefs)
                    ));
                }
            }
        }

        // Create event records
        for (const event of events) {
            liveStore.ai_extracted_events.push(createEventRecord(
                liveRun,
                batch.id,
                event,
                roomCycleIdsForRefs(event.room_refs)
            ));
        }

        // Mark run as completed
        const now = new Date().toISOString();
        liveRun.status = 'completed';
        liveRun.provider = 'rules';
        liveRun.model = 'instant-rules-classification';
        liveRun.total_chunks = 1;
        liveRun.completed_chunks = 1;
        liveRun.actionable_count = counts.actionable;
        liveRun.context_count = counts.context;
        liveRun.irrelevant_count = counts.irrelevant;
        liveRun.review_count = counts.review;
        liveRun.summary_digest = summaryDigest;
        liveRun.error = null;
        liveRun.started_at = now;
        liveRun.completed_at = now;
        liveRun.updated_at = now;

        // Update upload batch status
        batch.status = 'completed';
        batch.summary_digest = summaryDigest;
        batch.ai_batch_run_id = liveRun.id;
        batch.updated_at = now;
    });
}

export function queueAiBatchAnalysis(runId: string): void {
    if (runningRuns.has(runId) || queuedRuns.includes(runId)) return;
    queuedRuns.push(runId);
    setTimeout(() => {
        void drainQueuedAnalyses();
    }, 10);
}
