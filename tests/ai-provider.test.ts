import { afterEach, describe, expect, it, vi } from 'vitest';
import { withTempWorkspace } from './helpers';

const originalFetch = globalThis.fetch;

function mockOpenAICompatibleJson() {
    return {
        choices: [
            {
                message: {
                    content: JSON.stringify({
                        rooms: ['10F'],
                        action: '工程完成 → 可清潔',
                        type: 'handoff',
                        from_dept: 'eng',
                        to_dept: 'clean',
                        confidence: 0.97,
                        explanation: 'OpenRouter 測試回應',
                    }),
                },
            },
        ],
    };
}

afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    globalThis.fetch = originalFetch;
});

describe.sequential('AI Provider', () => {
    it('uses OpenRouter endpoint and headers when OPENROUTER_API_KEY is set', async () => {
        await withTempWorkspace(async () => {
            vi.stubEnv('OPENROUTER_API_KEY', 'sk-or-test');
            vi.stubEnv('OPENROUTER_MODEL', 'openrouter/free');
            vi.stubEnv('OPENROUTER_BASE_URL', 'https://openrouter.ai/api/v1');
            vi.stubEnv('OPENROUTER_SITE_URL', 'http://localhost:3000');
            vi.stubEnv('OPENROUTER_APP_NAME', 'Townplace Test');

            const fetchMock = vi.fn().mockResolvedValue({
                ok: true,
                json: async () => mockOpenAICompatibleJson(),
            });
            globalThis.fetch = fetchMock as typeof fetch;

            const { parseMessageWithAI } = await import('../src/lib/ai/parse-message');
            const result = await parseMessageWithAI({
                rawText: '10F 已完成，可清潔',
                senderName: 'Vic Lee',
                senderDept: 'eng',
            });

            expect(fetchMock).toHaveBeenCalledTimes(1);
            const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
            const headers = init.headers as Record<string, string>;

            expect(url).toBe('https://openrouter.ai/api/v1/chat/completions');
            expect(headers.authorization).toBe('Bearer sk-or-test');
            expect(headers['HTTP-Referer']).toBe('http://localhost:3000');
            expect(headers['X-OpenRouter-Title']).toBe('Townplace Test');
            expect(result.engine).toBe('openrouter');
            expect(result.model).toBe('openrouter/free');
            expect(result.action).toBe('工程完成 → 可清潔');
        });
    });

    it('prefers OpenRouter over OpenAI when both keys are set', async () => {
        await withTempWorkspace(async () => {
            vi.stubEnv('OPENROUTER_API_KEY', 'sk-or-test');
            vi.stubEnv('OPENROUTER_MODEL', 'openrouter/free');
            vi.stubEnv('OPENAI_API_KEY', 'sk-openai-test');
            vi.stubEnv('OPENAI_MODEL', 'gpt-4o-mini');

            const fetchMock = vi.fn().mockResolvedValue({
                ok: true,
                json: async () => mockOpenAICompatibleJson(),
            });
            globalThis.fetch = fetchMock as typeof fetch;

            const { parseMessageWithAI } = await import('../src/lib/ai/parse-message');
            const result = await parseMessageWithAI({
                rawText: '10F 已完成，可清潔',
                senderName: 'Vic Lee',
                senderDept: 'eng',
            });

            const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
            expect(url).toContain('openrouter.ai/api/v1/chat/completions');
            expect(result.engine).toBe('openrouter');
        });
    });
});
