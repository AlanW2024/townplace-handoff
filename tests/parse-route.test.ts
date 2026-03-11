import { describe, expect, it } from 'vitest';
import { jsonRequest, withTempWorkspace } from './helpers';

describe.sequential('Parse Route', () => {
    it('negative handoff language cannot stay as immediate handoff in preview', async () => {
        await withTempWorkspace(async () => {
            const { POST } = await import('../src/app/api/parse/route');

            const res = await POST(jsonRequest('http://localhost/api/parse', 'POST', {
                text: '10F 未可清',
                sender_name: 'Vic',
                sender_dept: 'eng',
            }));

            expect(res.status).toBe(200);
            const data = await res.json();
            expect(data.type).toBe('update');
            expect(data.action).toBe('工程進度更新');
            expect(data.needs_review).toBe(false);
        });
    });

    it('future handoff language stays conservative and marks preview for review', async () => {
        await withTempWorkspace(async () => {
            const { POST } = await import('../src/app/api/parse/route');

            const res = await POST(jsonRequest('http://localhost/api/parse', 'POST', {
                text: '10F 明天可清',
                sender_name: 'Vic',
                sender_dept: 'eng',
            }));

            expect(res.status).toBe(200);
            const data = await res.json();
            expect(data.type).toBe('update');
            expect(data.action).toBe('工程進度更新');
            expect(data.needs_review).toBe(true);
            expect(data.review_reasons).toContain('future_handoff_language');
        });
    });
});
