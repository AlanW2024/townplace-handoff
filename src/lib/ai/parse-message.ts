import { DeptCode, HandoffType, ParseEngine, ParseResult } from '../types';
import { parseWhatsAppMessage } from '../parser';
import { analyzeHandoffSignal, extractRooms } from '../message-parsing';

const VALID_TYPES: HandoffType[] = ['handoff', 'request', 'update', 'trigger', 'query', 'escalation'];
const VALID_DEPTS: DeptCode[] = ['eng', 'conc', 'clean', 'hskp', 'mgmt', 'lease', 'comm', 'security'];

interface ParseWithAIInput {
    rawText: string;
    senderName?: string;
    senderDept?: DeptCode | null;
    chatName?: string | null;
}

function clampConfidence(value: unknown, fallback = 0.5): number {
    const numeric = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(numeric)) return fallback;
    return Math.min(1, Math.max(0, Math.round(numeric * 100) / 100));
}

function buildRuleExplanation(rawText: string, result: ParseResult): string {
    if (!result.action) {
        return '規則引擎未能穩定識別明確動作或交接關係，因此保守地標記為待覆核。';
    }

    const rooms = result.rooms.length > 0 ? result.rooms.join('、') : '未識別房號';
    const handoffSignal = analyzeHandoffSignal(rawText);
    const handoffHint = handoffSignal.allowsImmediateHandoff
        ? '偵測到明確 handoff 關鍵字'
        : handoffSignal.hasNegativeContext
            ? '偵測到否定 handoff 語境'
            : handoffSignal.hasFutureContext
                ? '偵測到未來式 handoff 語境'
                : '根據房號、關鍵字和發送者部門規則';

    switch (result.type) {
        case 'handoff':
            return `${handoffHint}，判定 ${rooms} 為可交接訊息，因此建立跨部門 handoff。`;
        case 'query':
            return `系統偵測到詢問進度的語句，並關聯到 ${rooms}。這類訊息不直接改房態，只會標記需要注意。`;
        case 'trigger':
            return `系統把這則訊息視為外部事件觸發，關聯到 ${rooms}，後續由相關部門跟進。`;
        case 'request':
            return `系統偵測到報修 / 要求處理的語意，關聯到 ${rooms}，因此標記為請求型訊息。`;
        default:
            return `系統根據房號、關鍵字與部門規則，將訊息解析為「${result.action}」。`;
    }
}

function getProviderConfig(): { engine: 'anthropic' | 'openai'; model: string; apiKey: string } | null {
    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    if (anthropicKey) {
        return {
            engine: 'anthropic',
            model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514',
            apiKey: anthropicKey,
        };
    }

    const openaiKey = process.env.OPENAI_API_KEY;
    if (openaiKey) {
        return {
            engine: 'openai',
            model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
            apiKey: openaiKey,
        };
    }

    return null;
}

function extractJsonObject(text: string): any {
    const trimmed = text.trim();
    try {
        return JSON.parse(trimmed);
    } catch {}

    const match = trimmed.match(/\{[\s\S]*\}/);
    if (!match) {
        throw new Error('AI 回應不是有效 JSON');
    }

    return JSON.parse(match[0]);
}

function normalizeAIResult(rawResult: any, fallback: ParseResult): ParseResult {
    const rooms = Array.isArray(rawResult?.rooms)
        ? rawResult.rooms
            .map((room: unknown) => (typeof room === 'string' ? room.toUpperCase().trim() : ''))
            .filter((room: string) => /^\d{1,2}[A-M]$/.test(room))
            .filter((room: string, index: number, list: string[]) => list.indexOf(room) === index)
        : fallback.rooms;

    const type = typeof rawResult?.type === 'string' && VALID_TYPES.includes(rawResult.type)
        ? rawResult.type
        : fallback.type;

    const fromDept = typeof rawResult?.from_dept === 'string' && VALID_DEPTS.includes(rawResult.from_dept)
        ? rawResult.from_dept
        : fallback.from_dept;

    const toDept = typeof rawResult?.to_dept === 'string' && VALID_DEPTS.includes(rawResult.to_dept)
        ? rawResult.to_dept
        : fallback.to_dept;

    const action = typeof rawResult?.action === 'string'
        ? rawResult.action.trim() || fallback.action
        : fallback.action;

    return {
        rooms: rooms.length > 0 ? rooms : fallback.rooms,
        action,
        type,
        from_dept: fromDept,
        to_dept: toDept,
        confidence: clampConfidence(rawResult?.confidence, fallback.confidence),
        explanation: typeof rawResult?.explanation === 'string' && rawResult.explanation.trim()
            ? rawResult.explanation.trim()
            : fallback.explanation ?? buildRuleExplanation('', fallback),
    };
}

function buildPrompt(input: ParseWithAIInput, fallback: ParseResult): string {
    return [
        '你是 TOWNPLACE SOHO 的 WhatsApp 物業管理訊息解析器。',
        '目標是把訊息轉成結構化 JSON，供交接系統使用。',
        '重要規則：',
        '1. 只有明確出現「可清 / 可清潔 / ready for cleaning」才可判成工程交接至清潔。',
        '2. 像「完成油漆 / 已調整門鉸 / 已處理部分工程」只屬進度更新，不可直接當可清 handoff。',
        '3. 「未可清 / 仲未可清 / 暫時唔可清 / not ready for cleaning」一定不是 handoff。',
        '4. 「明天可清 / 稍後可清 / 之後可清」屬未來或暫定安排，不是即時 handoff。',
        '5. 若訊息是 summary、bullet list、多房且多動作混雜，confidence 應降低。',
        '6. 若房號或動作不清楚，寧可保守。',
        '',
        `發送者：${input.senderName || 'Unknown'}`,
        `發送者部門：${input.senderDept || 'unknown'}`,
        `對話名稱：${input.chatName || 'unknown'}`,
        `原文：${input.rawText}`,
        '',
        '規則引擎初步結果（可參考但不要盲從）：',
        JSON.stringify({
            rooms: fallback.rooms,
            action: fallback.action,
            type: fallback.type,
            from_dept: fallback.from_dept,
            to_dept: fallback.to_dept,
            confidence: fallback.confidence,
        }, null, 2),
        '',
        '請只輸出 JSON：',
        JSON.stringify({
            rooms: ['10F'],
            action: '工程完成 → 可清潔',
            type: 'handoff',
            from_dept: 'eng',
            to_dept: 'clean',
            confidence: 0.95,
            explanation: '因為訊息明確提到可清潔，屬於工程完成後交接給清潔的訊號。',
        }, null, 2),
    ].join('\n');
}

async function callAnthropic(prompt: string, model: string, apiKey: string): Promise<any> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    try {
        const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01',
            },
            body: JSON.stringify({
                model,
                max_tokens: 700,
                temperature: 0,
                messages: [{ role: 'user', content: prompt }],
            }),
            signal: controller.signal,
        });

        if (!response.ok) {
            throw new Error(`Anthropic API failed: ${response.status}`);
        }

        const data = await response.json();
        const text = Array.isArray(data?.content)
            ? data.content
                .filter((item: any) => item?.type === 'text')
                .map((item: any) => item.text)
                .join('\n')
            : '';
        return extractJsonObject(text);
    } finally {
        clearTimeout(timeout);
    }
}

async function callOpenAI(prompt: string, model: string, apiKey: string): Promise<any> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    try {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model,
                temperature: 0,
                response_format: { type: 'json_object' },
                messages: [
                    {
                        role: 'system',
                        content: '你是物業管理 WhatsApp 訊息解析器，只能輸出 JSON。',
                    },
                    {
                        role: 'user',
                        content: prompt,
                    },
                ],
            }),
            signal: controller.signal,
        });

        if (!response.ok) {
            throw new Error(`OpenAI API failed: ${response.status}`);
        }

        const data = await response.json();
        const text = data?.choices?.[0]?.message?.content || '';
        return extractJsonObject(text);
    } finally {
        clearTimeout(timeout);
    }
}

export async function parseMessageWithAI(input: ParseWithAIInput): Promise<ParseResult> {
    const ruleResult = parseWhatsAppMessage(input.rawText, input.senderName, input.senderDept || undefined);
    const fallback: ParseResult = {
        ...ruleResult,
        explanation: buildRuleExplanation(input.rawText, ruleResult),
        engine: 'rules',
        model: 'rule-engine',
    };

    const provider = getProviderConfig();
    if (!provider) {
        return fallback;
    }

    try {
        const prompt = buildPrompt(input, fallback);
        const rawAIResult = provider.engine === 'anthropic'
            ? await callAnthropic(prompt, provider.model, provider.apiKey)
            : await callOpenAI(prompt, provider.model, provider.apiKey);

        const normalized = normalizeAIResult(rawAIResult, fallback);

        return {
            ...normalized,
            rooms: normalized.rooms.length > 0 ? normalized.rooms : extractRooms(input.rawText),
            engine: provider.engine as ParseEngine,
            model: provider.model,
        };
    } catch {
        return fallback;
    }
}
