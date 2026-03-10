# TOWNPLACE SOHO Prototype — Session Handoff for Claude Review

## 1. 目前系統狀態

這個 prototype 現時是 **可展示的 demo / PoC**，不是 production system。

已確認：

- `npm run lint` 通過
- `npm run build` 通過
- `next start` 可正常跑
- 現時主要資料仍為 **file-backed demo store**
  - `.demo-store.json`

目前最核心的產品結構是：

- 左邊：建議配合真實 WhatsApp Web 分屏作 fact check
- 中間：`訊息中心 / AI 解析`
- 右邊：`交接信號`

首頁已朝這個方向整理，不再把左邊 raw feed 當成最終產品做死。

---

## 2. 這個 session 內已完成的重要改動

以下是「目前 codebase 已包含」的重要變更，Claude review 時請以現況為準。

### A. 專案穩定化

- 修正過 `build` / `lint` 問題
- 修正過 `.next` chunk/cache 壞掉導致的 dev/prod 錯誤
- `documents / followups / daily-report` 相關 API 已改為 dynamic route，避免 production 下出現靜態化錯誤

主要檔案：

- `/Users/yeehowong/.gemini/antigravity/scratch/townplace-handoff/src/app/api/documents/route.ts`
- `/Users/yeehowong/.gemini/antigravity/scratch/townplace-handoff/src/app/api/followups/route.ts`
- `/Users/yeehowong/.gemini/antigravity/scratch/townplace-handoff/src/app/api/messages/route.ts`
- `/Users/yeehowong/.gemini/antigravity/scratch/townplace-handoff/src/app/api/upload/route.ts`

### B. WhatsApp 匯入與 chat metadata

已加入：

- `chat_name`
- `chat_type` (`group` / `direct`)

upload 現在支援：

- 單一 WhatsApp `.txt`
- 單一 WhatsApp `.zip`
- 常見中英 WhatsApp 匯出時間格式
- 多行訊息合併
- 跳過 system / media omitted 訊息

主要檔案：

- `/Users/yeehowong/.gemini/antigravity/scratch/townplace-handoff/src/app/api/upload/route.ts`
- `/Users/yeehowong/.gemini/antigravity/scratch/townplace-handoff/src/lib/types.ts`
- `/Users/yeehowong/.gemini/antigravity/scratch/townplace-handoff/src/lib/store.ts`

### C. parser / ingest 邏輯修正

重要業務規則已調整：

#### 1. `完成` 不等於 `handoff`

現在只會在明確出現：

- `可清`
- `可清潔`
- `ready for cleaning`

才建立真正 `eng -> clean` handoff。

像：

- `23D 已完成油漆`
- `31K 已調整大門鉸，回復正常`

現在會被當成：

- `部分工程完成`
- 或 `工程進度更新`

而不是直接交去清潔。

#### 2. summary / aggregate message 會進 review queue

例如：

- `是日跟進 ...`
- 多行 bullet summary
- 一則訊息多房號 + 多種 action

這些不會直接改 room status / handoff，而是進人工覆核。

#### 3. 模糊工程完成訊息會保守處理

像：

- `19C 完成`

這類低信心 / 模糊完成訊息，現在會進 review queue，而不是自動交接。

主要檔案：

- `/Users/yeehowong/.gemini/antigravity/scratch/townplace-handoff/src/lib/parser.ts`
- `/Users/yeehowong/.gemini/antigravity/scratch/townplace-handoff/src/lib/ingest.ts`
- `/Users/yeehowong/.gemini/antigravity/scratch/townplace-handoff/src/app/api/reviews/route.ts`

### D. Reviews / Notifications / Follow-ups / AI Suggestions

目前系統已經有：

- `AI 建議`
- `跟進事項`
- `人工覆核`
- `通知中心`

其中重要增補包括：

- review queue 的 `GET / POST / PUT`
- review 批准 / 修正後，會把結果寫回 message / room / handoff
- notifications 已加入：
  - handoff timeout
  - overdue docs
  - booking conflict
  - pending reviews
  - urgent followups
  - followup due
  - checkout pending
  - cleaning waiting
- notifications 已做基本聚合，不再每件小事一張卡
- notifications 頁已可跳去 `rooms / followups / reviews / documents`

主要檔案：

- `/Users/yeehowong/.gemini/antigravity/scratch/townplace-handoff/src/lib/notifications.ts`
- `/Users/yeehowong/.gemini/antigravity/scratch/townplace-handoff/src/app/notifications/page.tsx`
- `/Users/yeehowong/.gemini/antigravity/scratch/townplace-handoff/src/app/reviews/page.tsx`
- `/Users/yeehowong/.gemini/antigravity/scratch/townplace-handoff/src/app/followups/page.tsx`

### E. documents / followups 的 audit logging、原因、可退回

這是最新一輪重要改動。

已加入統一 audit log：

- `AuditLog`
- `audit_logs` store collection
- `createAuditLog()` helper

documents 現在：

- 任何推進 / 退回都要填 `操作人`
- 任何推進 / 退回都要填 `原因`
- 只可逐步推進 / 逐步退回一步
- 每張文件卡會顯示最近操作紀錄
- 可以追到誰做、何時做、原因是什麼、由哪步去到哪步

followups 現在：

- `開始處理 / 完成 / 略過 / 退回 / reopen` 全部都要填 `操作人 + 原因`
- 每次狀態改變都會留下 audit log
- followup 建立時也會留下 `created` log

主要檔案：

- `/Users/yeehowong/.gemini/antigravity/scratch/townplace-handoff/src/lib/types.ts`
- `/Users/yeehowong/.gemini/antigravity/scratch/townplace-handoff/src/lib/store.ts`
- `/Users/yeehowong/.gemini/antigravity/scratch/townplace-handoff/src/lib/audit.ts`
- `/Users/yeehowong/.gemini/antigravity/scratch/townplace-handoff/src/app/api/documents/route.ts`
- `/Users/yeehowong/.gemini/antigravity/scratch/townplace-handoff/src/app/documents/page.tsx`
- `/Users/yeehowong/.gemini/antigravity/scratch/townplace-handoff/src/app/api/followups/route.ts`
- `/Users/yeehowong/.gemini/antigravity/scratch/townplace-handoff/src/app/followups/page.tsx`

---

## 3. 目前重要產品決策

Claude review 時請留意，以下是刻意的業務決策，不是 accidental behavior：

### A. fact check 優先於「假裝完全自動」

產品方向是：

- 左邊真實 WhatsApp Web
- 中間 AI/規則如何理解
- 右邊交接信號

所以系統不是要完全取代 WhatsApp，而是作為 bridge / control layer。

### B. parser 採保守策略

低信心或 aggregate 訊息寧願進 review queue，也不要直接改錯房態。

### C. 現在的「操作人」不是正式 auth user

documents / followups 頁目前的 `操作人` 是前端欄位，不是真正 identity system。

這是 demo 決策，目的是先補 auditability。

---

## 4. Claude review 時最值得看的檔案

如果要做一次高質 code review，建議先看：

### 核心業務邏輯

- `/Users/yeehowong/.gemini/antigravity/scratch/townplace-handoff/src/lib/parser.ts`
- `/Users/yeehowong/.gemini/antigravity/scratch/townplace-handoff/src/lib/ingest.ts`
- `/Users/yeehowong/.gemini/antigravity/scratch/townplace-handoff/src/lib/notifications.ts`

### 資料層

- `/Users/yeehowong/.gemini/antigravity/scratch/townplace-handoff/src/lib/store.ts`
- `/Users/yeehowong/.gemini/antigravity/scratch/townplace-handoff/src/lib/types.ts`
- `/Users/yeehowong/.gemini/antigravity/scratch/townplace-handoff/src/lib/audit.ts`

### 風險較高的 API

- `/Users/yeehowong/.gemini/antigravity/scratch/townplace-handoff/src/app/api/upload/route.ts`
- `/Users/yeehowong/.gemini/antigravity/scratch/townplace-handoff/src/app/api/reviews/route.ts`
- `/Users/yeehowong/.gemini/antigravity/scratch/townplace-handoff/src/app/api/documents/route.ts`
- `/Users/yeehowong/.gemini/antigravity/scratch/townplace-handoff/src/app/api/followups/route.ts`

### 最新 UI / workflow

- `/Users/yeehowong/.gemini/antigravity/scratch/townplace-handoff/src/app/page.tsx`
- `/Users/yeehowong/.gemini/antigravity/scratch/townplace-handoff/src/app/documents/page.tsx`
- `/Users/yeehowong/.gemini/antigravity/scratch/townplace-handoff/src/app/followups/page.tsx`
- `/Users/yeehowong/.gemini/antigravity/scratch/townplace-handoff/src/app/notifications/page.tsx`
- `/Users/yeehowong/.gemini/antigravity/scratch/townplace-handoff/src/app/reviews/page.tsx`
- `/Users/yeehowong/.gemini/antigravity/scratch/townplace-handoff/src/app/rooms/page.tsx`

---

## 5. 已知限制 / 未完成風險

### A. 仍然不是 production data layer

- store 仍然是 `.demo-store.json`
- 不適合多人同時寫入
- 不適合 serverless / multi-instance

### B. auth 仍然只是 demo gate

- login 不是正式 RBAC
- documents / followups 的 `操作人` 只是頁面輸入欄，不是系統身份

### C. parser / review / notifications 仍然缺 automated tests

最值得補 test 的地方：

- upload parser
- aggregate message -> review queue
- explicit handoff vs progress update
- followup due notifications
- document / followup audit log transitions

### D. notifications 已聚合，但未做到完整「通知消抖 / acknowledgement lifecycle」

現在已有基本聚合，但仍然是 computed notifications，不是完整 persisted alert system。

### E. raw WhatsApp feed 仍未真正實時接入 duty phone

目前方向是：

- 左邊真 WhatsApp Web 分屏
- app 專注 AI reasoning + signal

正式 realtime bridge 仍未做。

---

## 6. 建議 Claude review 重點

請 Claude 優先 review 以下問題，而不是只看 UI：

1. `parser / ingest` 是否仍有會把 progress update 誤當 handoff 的 case
2. `review approve / corrected` 會否重複建立 handoff 或產生 inconsistent room state
3. `documents / followups` audit log 流程是否有可繞過的狀況
4. `notifications` 聚合是否有遺漏或重複
5. `.demo-store.json` 讀寫是否存在 race condition / partial write risk
6. `upload` 對不同 WhatsApp export 格式的 robust 程度

---

## 7. 不需要 review 的雜項

以下項目不是今次 code review 重點：

- `.next`
- `.next.broken.*`
- `.demo-store.json` 裡面的具體內容

重點應該放在 source code 與 workflow。
