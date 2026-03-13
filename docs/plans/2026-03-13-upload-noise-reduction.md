# Upload 噪音過濾升級 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 大幅減少 WhatsApp 匯出上傳後進入人工審核隊列的無關訊息，讓操作員只需覆核真正需要判斷的內容。

**Architecture:** 三層噪音過濾 — (1) 上傳時預過濾擴展，把明顯無關訊息攔在門外不入庫；(2) 批次分析分類邏輯優化，減少「review」誤判；(3) 審核頁面加入批量操作，高效處理剩餘項目。

**Tech Stack:** TypeScript, Next.js 14 App Router, Vitest, Tailwind CSS

---

## 專案背景（給執行者）

### 這個專案在做什麼？

TOWNPLACE SOHO 是一個服務式公寓物業管理系統。三個部門（工程部、清潔部、禮賓部）每天通過 WhatsApp 群組溝通房間狀態，例如：

- 工程師：「10F 已完成，可清潔」→ 系統自動建立「工程→清潔」交接
- 清潔部：「23D Deep clean 完成」→ 系統更新房間清潔狀態
- 禮賓部：「25B 浴室門手柄脫落」→ 系統記錄維修請求

### Upload 的流程是什麼？

```
用戶匯出 WhatsApp 對話 (.txt/.zip)
  → POST /api/upload
  → 逐行解析 WhatsApp 格式（日期、發送者、內容）
  → shouldSkipMessage() 過濾系統訊息/媒體
  → ingestMessagesBatch() 存入所有訊息（不建立交接）
  → queueAiBatchAnalysis() 異步批次分析
    → 每條訊息分類為 actionable/context/irrelevant/review
    → 只有 classification='review' + 有房號的訊息 → 建立 ParseReview
  → 用戶在 /reviews 頁面逐條審核
```

### 問題在哪？

WhatsApp 群組對話大約 70-80% 是噪音：
- 確認回覆：「ok」「收到」「noted」「👍」
- 寒暄閒聊：「早晨」「食咗飯未」
- 純表情符號/貼圖
- 重複確認：「10F ok」「23D 收到」
- 無上下文的短訊：「跟」「好」「盡做」

目前 `shouldSkipMessage()` 只過濾 ~5%（系統訊息、媒體佔位符）。剩下 95% 全部入庫，然後靠批次分析分類。即使分類正確標記為 `irrelevant`，訊息仍佔用儲存空間並增加處理時間。更重要的是，有些帶房號的噪音訊息（如「10F ok」）可能被分類為 `review`，導致審核隊列膨脹。

### 方案摘要

| 層 | 位置 | 目標 |
|----|------|------|
| L1 | `shouldSkipMessage()` | 上傳時攔截明顯噪音，不入庫 |
| L2 | `classifyMessageForOperationalQueue()` | 批次分析時減少 review 誤判 |
| L3 | `/reviews` 頁面 | 批量略過剩餘低價值審核項 |

---

## 關鍵檔案地圖

| 檔案 | 用途 |
|------|------|
| `src/app/api/upload/route.ts` | Upload endpoint，含 `shouldSkipMessage()` |
| `src/lib/review-queue.ts` | 批次分析分類邏輯 `classifyMessageForOperationalQueue()` |
| `src/lib/ai/batch-analyze.ts` | AI 批次分析主流程 |
| `src/lib/ingest.ts` | 訊息處理管線（非 bulk 路徑的 review 判斷） |
| `src/app/reviews/page.tsx` | 審核隊列 UI |
| `tests/review-fixes.test.ts` | Upload 相關整合測試 |

---

## Task 1: 擴展 `shouldSkipMessage()` 預過濾

**Files:**
- Modify: `src/app/api/upload/route.ts:92-104`
- Create: `tests/upload-noise-filter.test.ts`

**Step 1: Write the failing tests**

```typescript
// tests/upload-noise-filter.test.ts
import { describe, expect, it } from 'vitest';

// shouldSkipMessage is not currently exported; we'll need to export it first.
// For now, test via the upload POST endpoint integration.
import { withTempWorkspace, jsonRequest } from './helpers';

describe('Upload noise filter', () => {
    // --- Messages that SHOULD be skipped ---

    it('skips emoji-only messages', async () => {
        await withTempWorkspace(async () => {
            const { POST } = await import('../src/app/api/upload/route');
            const text = [
                '03/11/26, 9:15 AM - Vic Lee: 10F 已完成，可清潔',
                '03/11/26, 9:16 AM - Kaho: 👍',
                '03/11/26, 9:17 AM - Kaho: 👍👍',
                '03/11/26, 9:18 AM - Kaho: 🙏✅',
            ].join('\n');

            const formData = new FormData();
            formData.append('file', new File([text], 'test.txt', { type: 'text/plain' }));
            const res = await POST(new Request('http://localhost/api/upload', { method: 'POST', body: formData }));
            const data = await res.json() as { parsed_messages: number };
            expect(data.parsed_messages).toBe(1);
        });
    });

    it('skips pure acknowledgment messages', async () => {
        await withTempWorkspace(async () => {
            const { POST } = await import('../src/app/api/upload/route');
            const text = [
                '03/11/26, 9:15 AM - Vic Lee: 10F 已完成，可清潔',
                '03/11/26, 9:16 AM - Kaho: ok',
                '03/11/26, 9:17 AM - Kaho: 收到',
                '03/11/26, 9:18 AM - Kaho: noted',
                '03/11/26, 9:19 AM - Kaho: 好的',
                '03/11/26, 9:20 AM - Kaho: 明白',
                '03/11/26, 9:21 AM - Kaho: 知道了',
                '03/11/26, 9:22 AM - Kaho: 了解',
                '03/11/26, 9:23 AM - Kaho: 多謝',
                '03/11/26, 9:24 AM - Kaho: thx',
                '03/11/26, 9:25 AM - Kaho: got it',
                '03/11/26, 9:26 AM - Kaho: 盡做',
            ].join('\n');

            const formData = new FormData();
            formData.append('file', new File([text], 'test.txt', { type: 'text/plain' }));
            const res = await POST(new Request('http://localhost/api/upload', { method: 'POST', body: formData }));
            const data = await res.json() as { parsed_messages: number };
            expect(data.parsed_messages).toBe(1);
        });
    });

    it('skips deleted messages', async () => {
        await withTempWorkspace(async () => {
            const { POST } = await import('../src/app/api/upload/route');
            const text = [
                '03/11/26, 9:15 AM - Vic Lee: 10F 已完成，可清潔',
                '03/11/26, 9:16 AM - Kaho: 此訊息已被刪除',
                '03/11/26, 9:17 AM - Kaho: This message was deleted',
                '03/11/26, 9:18 AM - Kaho: You deleted this message',
            ].join('\n');

            const formData = new FormData();
            formData.append('file', new File([text], 'test.txt', { type: 'text/plain' }));
            const res = await POST(new Request('http://localhost/api/upload', { method: 'POST', body: formData }));
            const data = await res.json() as { parsed_messages: number };
            expect(data.parsed_messages).toBe(1);
        });
    });

    // --- Messages that should NOT be skipped ---

    it('keeps operational messages with room numbers', async () => {
        await withTempWorkspace(async () => {
            const { POST } = await import('../src/app/api/upload/route');
            const text = [
                '03/11/26, 9:15 AM - Vic Lee: 10F 已完成，可清潔',
                '03/11/26, 9:16 AM - Vic Lee: 23D 已完成油漆',
                '03/11/26, 9:17 AM - Michael: 18A 執修',
            ].join('\n');

            const formData = new FormData();
            formData.append('file', new File([text], 'test.txt', { type: 'text/plain' }));
            const res = await POST(new Request('http://localhost/api/upload', { method: 'POST', body: formData }));
            const data = await res.json() as { parsed_messages: number };
            expect(data.parsed_messages).toBe(3);
        });
    });

    it('keeps messages with operational keywords even without room numbers', async () => {
        await withTempWorkspace(async () => {
            const { POST } = await import('../src/app/api/upload/route');
            const text = [
                '03/11/26, 9:15 AM - Karen: 吉房清潔安排，FYI',
                '03/11/26, 9:16 AM - Karen: 是日跟進 17 Jul 25',
            ].join('\n');

            const formData = new FormData();
            formData.append('file', new File([text], 'test.txt', { type: 'text/plain' }));
            const res = await POST(new Request('http://localhost/api/upload', { method: 'POST', body: formData }));
            const data = await res.json() as { parsed_messages: number };
            expect(data.parsed_messages).toBe(2);
        });
    });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/upload-noise-filter.test.ts`
Expected: Tests fail because emoji/ack/deleted messages are not yet filtered.

**Step 3: Implement the expanded `shouldSkipMessage()`**

In `src/app/api/upload/route.ts`, replace the `shouldSkipMessage` function:

```typescript
function shouldSkipMessage(sender: string, rawText: string): boolean {
    const normalizedSender = sender.replace(/[\u200e\u202f]/g, '').trim();
    const text = rawText.replace(/[\u200e\u202f]/g, '').trim();

    // Empty
    if (!text) return true;

    // BOM artifact
    if (/^\uFEFF/.test(text)) return true;

    // Media omitted / attachments
    if (/圖片已略去|影片已略去|文件已略去|語音通話已略去|<Media omitted>|image omitted|video omitted|audio omitted|document omitted|<attached:/i.test(text)) return true;

    // End-to-end encryption notice
    if (/訊息和通話經端對端加密|Messages and calls are end-to-end encrypted/i.test(text)) return true;

    // WhatsApp system messages
    if (/建立了此群組|新增了你|你現已成為管理員|changed this group's icon|changed the subject|created group|added|left|joined using this group's invite link|security code changed/i.test(text)) return true;
    if (/不明用戶/.test(normalizedSender) && /建立了此群組|加入了|離開了/.test(text)) return true;

    // ── NEW FILTERS ──

    // Deleted messages
    if (/^(此訊息已被刪除|This message was deleted|You deleted this message)\.?$/i.test(text)) return true;

    // Emoji-only (no letters, digits, or CJK characters)
    if (!/[a-zA-Z0-9\u4e00-\u9fff\u3400-\u4dbf]/.test(text)) return true;

    // Voice / location / contact / poll placeholders
    if (/^(語音訊息|voice message|location:|位置：|聯絡人卡片|contact card)/i.test(text)) return true;

    // Pure acknowledgment (exact match, case-insensitive)
    const ACKNOWLEDGMENT = /^(ok+|okay|o\.?k\.?|noted|roger|copy|收到|好的?|嗯|明白|知道了?|了解|多謝|唔該|thanks?|thank\s*you|thx|tks|got\s*it|will\s*do|sure|yes|no\s*problem|冇問題|盡做|跟|跟住|遵命|好嘅|是的?|係|noted\s*with\s*thanks|received?|ack|okay?👍)$/i;
    if (ACKNOWLEDGMENT.test(text.trim())) return true;

    return false;
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/upload-noise-filter.test.ts`
Expected: All 5 tests PASS.

**Step 5: Run full test suite to check for regressions**

Run: `npx vitest run`
Expected: All tests pass. The existing upload test in `review-fixes.test.ts` should still pass because its operational messages are not affected.

**Step 6: Commit**

```bash
git add src/app/api/upload/route.ts tests/upload-noise-filter.test.ts
git commit -m "feat: expand upload noise filter to skip emoji, acks, and deleted messages"
```

---

## Task 2: 優化批次分類邏輯 — 減少 review 誤判

**Files:**
- Modify: `src/lib/review-queue.ts:37-128`
- Create: `tests/review-queue.test.ts`

**Step 1: Write the failing tests**

```typescript
// tests/review-queue.test.ts
import { describe, expect, it } from 'vitest';
import { classifyMessageForOperationalQueue } from '../src/lib/review-queue';

describe('classifyMessageForOperationalQueue', () => {
    // --- Should be 'irrelevant' ---

    it('marks short no-room greetings as irrelevant', () => {
        const result = classifyMessageForOperationalQueue({
            raw_text: '早晨',
        });
        expect(result.classification).toBe('irrelevant');
    });

    it('marks casual chat as irrelevant', () => {
        const result = classifyMessageForOperationalQueue({
            raw_text: '食咗飯未',
        });
        expect(result.classification).toBe('irrelevant');
    });

    // --- Should be 'context', NOT 'review' ---

    it('marks room + acknowledgment as context, not review', () => {
        const result = classifyMessageForOperationalQueue({
            raw_text: '10F ok',
            parsed_room_refs: [{ physical_room_id: '10F', display_code: '10F', scope: 'active', raw_match: '10F' }],
        });
        expect(result.classification).toBe('context');
    });

    it('marks room + received as context, not review', () => {
        const result = classifyMessageForOperationalQueue({
            raw_text: '收到，23D',
            parsed_room_refs: [{ physical_room_id: '23D', display_code: '23D', scope: 'active', raw_match: '23D' }],
        });
        expect(result.classification).toBe('context');
    });

    it('marks room + thanks as context, not review', () => {
        const result = classifyMessageForOperationalQueue({
            raw_text: '23D 多謝師傅',
            parsed_room_refs: [{ physical_room_id: '23D', display_code: '23D', scope: 'active', raw_match: '23D' }],
        });
        expect(result.classification).toBe('context');
    });

    it('marks room + question as context, not review', () => {
        const result = classifyMessageForOperationalQueue({
            raw_text: '10F 幾時搞好？',
            parsed_room_refs: [{ physical_room_id: '10F', display_code: '10F', scope: 'active', raw_match: '10F' }],
        });
        expect(result.classification).toBe('context');
    });

    // --- Should be 'review' (genuine ambiguity) ---

    it('marks room + ambiguous completion as review', () => {
        const result = classifyMessageForOperationalQueue({
            raw_text: '19C 完成',
            parsed_room_refs: [{ physical_room_id: '19C', display_code: '19C', scope: 'active', raw_match: '19C' }],
        });
        expect(result.classification).toBe('review');
    });

    // --- Should be 'actionable' ---

    it('marks room + parsed action as actionable', () => {
        const result = classifyMessageForOperationalQueue({
            raw_text: '10F 已完成，可清潔',
            parsed_room_refs: [{ physical_room_id: '10F', display_code: '10F', scope: 'active', raw_match: '10F' }],
            parsed_action: '工程完成 → 可清潔',
            parsed_type: 'handoff',
            confidence: 0.9,
        });
        expect(result.classification).toBe('actionable');
    });
});
```

**Step 2: Run tests to verify which fail**

Run: `npx vitest run tests/review-queue.test.ts`
Expected: Some tests may already pass (the classification logic is decent), some may fail (room+ack combo might not be handled).

**Step 3: Add room + acknowledgment pattern to classification**

In `src/lib/review-queue.ts`, add a new check AFTER the `isSummaryLike` check and BEFORE `isAmbiguousCompletion`:

```typescript
// Add after line 35 (isSummaryLike function)
function isRoomAcknowledgment(text: string): boolean {
    const ACK_WORDS = /\b(ok+|okay|收到|好的?|noted|roger|copy|thx|thanks?|多謝|唔該|明白|知道|了解|got\s*it|will\s*do|sure|盡做)\b/i;
    const stripped = text.replace(/\d{1,2}[A-Ma-m]/g, '').replace(/\bEX\s+/gi, '').trim();
    return ACK_WORDS.test(stripped) && stripped.length < 30;
}
```

Then in `classifyMessageForOperationalQueue`, add a check after the `isBriefRoomContext` block (around line 96):

```typescript
    // Room + pure acknowledgment → context (not review)
    const isRoomAck = roomCount > 0 && isRoomAcknowledgment(text);

    if (isRoomOnlyPing || isBriefRoomContext || isRoomAck) {
        return {
            classification: 'context',
            reason: '訊息只提及房號或零碎背景，保留在訊息中心即可，不需要逐條人工覆核。',
        };
    }
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/review-queue.test.ts`
Expected: All 8 tests PASS.

**Step 5: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass (no regressions).

**Step 6: Commit**

```bash
git add src/lib/review-queue.ts tests/review-queue.test.ts
git commit -m "feat: classify room+acknowledgment messages as context instead of review"
```

---

## Task 3: 優化 AI 批次分析提示詞

**Files:**
- Modify: `src/lib/ai/batch-analyze.ts:114-159`

**Step 1: No test needed — this is prompt engineering (AI output is non-deterministic)**

**Step 2: Update `buildChunkPrompt()`**

Add explicit noise examples to the prompt. In `src/lib/ai/batch-analyze.ts`, update the `buildChunkPrompt` function's rules section:

```typescript
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
```

**Step 3: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass (prompt change doesn't affect deterministic tests).

**Step 4: Commit**

```bash
git add src/lib/ai/batch-analyze.ts
git commit -m "feat: improve AI batch prompt with explicit noise classification examples"
```

---

## Task 4: 審核頁面增加批量略過功能

**Files:**
- Modify: `src/app/reviews/page.tsx`

**Step 1: No unit test — this is a UI feature (manual smoke test)**

**Step 2: Add bulk dismiss UI**

In `src/app/reviews/page.tsx`, add the following capabilities:

1. A "全部略過低信心項" button that bulk-dismisses all pending reviews where `confidence < 0.5` and `ai_classification === 'irrelevant'`
2. A checkbox-based multi-select with a "略過選中" button

Add a new function and button to the reviews page. The exact insertion point depends on the current page structure, but the core logic is:

```typescript
// Add to the reviews page component, near the filter buttons

const handleBulkDismiss = async (filter: 'low_confidence' | 'selected') => {
    const targetIds = filter === 'low_confidence'
        ? reviews
            .filter(r => r.review_status === 'pending' && r.confidence < 0.5)
            .map(r => r.id)
        : selectedReviewIds;

    if (targetIds.length === 0) return;
    if (!confirm(`確定要略過 ${targetIds.length} 條審核項？`)) return;

    try {
        for (const id of targetIds) {
            await fetch('/api/reviews', {
                method: 'PUT',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({
                    id,
                    review_status: 'dismissed',
                    reviewed_by: operatorName || 'Admin',
                }),
            });
        }
        setSelectedReviewIds([]);
        fetchReviews();
    } catch (e: unknown) {
        setError(e instanceof Error ? e.message : '批量略過失敗');
    }
};
```

Add to the UI (near the status filter buttons):
```tsx
{/* Bulk actions bar */}
{reviews.filter(r => r.review_status === 'pending').length > 0 && (
    <div className="flex gap-2 items-center">
        <button
            onClick={() => handleBulkDismiss('low_confidence')}
            className="px-3 py-1.5 text-sm bg-slate-100 hover:bg-slate-200 rounded-md text-slate-700"
        >
            略過低信心項 ({reviews.filter(r => r.review_status === 'pending' && r.confidence < 0.5).length})
        </button>
        {selectedReviewIds.length > 0 && (
            <button
                onClick={() => handleBulkDismiss('selected')}
                className="px-3 py-1.5 text-sm bg-amber-100 hover:bg-amber-200 rounded-md text-amber-800"
            >
                略過選中 ({selectedReviewIds.length})
            </button>
        )}
    </div>
)}
```

Add `selectedReviewIds` state:
```typescript
const [selectedReviewIds, setSelectedReviewIds] = useState<string[]>([]);
```

Add checkbox to each review item in the list:
```tsx
<input
    type="checkbox"
    checked={selectedReviewIds.includes(review.id)}
    onChange={(e) => {
        if (e.target.checked) {
            setSelectedReviewIds(prev => [...prev, review.id]);
        } else {
            setSelectedReviewIds(prev => prev.filter(id => id !== review.id));
        }
    }}
    className="mr-2"
/>
```

**Step 3: Manual smoke test**

1. Run `npm run dev`
2. Navigate to `/reviews`
3. Verify "略過低信心項" button appears with correct count
4. Select multiple reviews with checkboxes
5. Click "略過選中" and verify they are dismissed

**Step 4: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass.

**Step 5: Commit**

```bash
git add src/app/reviews/page.tsx
git commit -m "feat: add bulk dismiss to review queue for efficient triage"
```

---

## Task 5: 增加上傳結果分類摘要

**Files:**
- Modify: `src/app/upload/page.tsx`

**Step 1: No unit test — UI display change**

**Step 2: Show classification breakdown after batch analysis completes**

The upload page should poll the batch run status and display a breakdown when complete. Add to the upload result display:

```tsx
{batchRunStatus === 'completed' && batchRunData && (
    <div className="mt-4 p-4 bg-slate-50 rounded-lg">
        <h3 className="font-medium mb-2">分類結果</h3>
        <div className="grid grid-cols-4 gap-2 text-sm">
            <div className="text-center p-2 bg-emerald-100 rounded">
                <div className="font-bold text-emerald-800">{batchRunData.actionable_count}</div>
                <div className="text-emerald-600">可操作</div>
            </div>
            <div className="text-center p-2 bg-blue-100 rounded">
                <div className="font-bold text-blue-800">{batchRunData.context_count}</div>
                <div className="text-blue-600">背景</div>
            </div>
            <div className="text-center p-2 bg-slate-100 rounded">
                <div className="font-bold text-slate-800">{batchRunData.irrelevant_count}</div>
                <div className="text-slate-600">無關</div>
            </div>
            <div className="text-center p-2 bg-amber-100 rounded">
                <div className="font-bold text-amber-800">{batchRunData.review_count}</div>
                <div className="text-amber-600">待覆核</div>
            </div>
        </div>
        {batchRunData.summary_digest && (
            <p className="mt-2 text-sm text-slate-600">{batchRunData.summary_digest}</p>
        )}
    </div>
)}
```

**Step 3: Manual smoke test**

1. Run `npm run dev`
2. Upload a WhatsApp export file
3. Wait for batch analysis to complete
4. Verify classification breakdown appears

**Step 4: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass.

**Step 5: Commit**

```bash
git add src/app/upload/page.tsx
git commit -m "feat: show classification breakdown after upload batch analysis"
```

---

## Task 6: Final verification

**Step 1: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass.

**Step 2: TypeScript check**

Run: `npx tsc --noEmit`
Expected: Zero errors.

**Step 3: Build check**

Run: `npm run build`
Expected: Build succeeds.

**Step 4: Commit all remaining changes**

```bash
git add -A
git commit -m "chore: upload noise reduction complete — expanded filters, smarter classification, bulk dismiss UI"
```

---

## Expected Impact

| Metric | Before | After (estimated) |
|--------|--------|-------------------|
| Messages filtered at upload | ~5% | ~25-35% |
| Messages classified as 'irrelevant' | ~15% | ~40-50% |
| Messages routed to review queue | ~15-20% | ~5-8% |
| Time to clear review queue | ~30 min | ~5-10 min |

## Verification Checklist

- [ ] Upload a real WhatsApp export — confirm fewer messages ingested
- [ ] Check review queue — confirm fewer pending items
- [ ] Confirm operational messages (handoffs, completions) still correctly processed
- [ ] Confirm ambiguous messages (「19C 完成」) still routed to review
- [ ] Bulk dismiss works on review page
- [ ] Upload page shows classification breakdown
