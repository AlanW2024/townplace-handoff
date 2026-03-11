# GEMINI FRONTEND SPEC — TOWNPLACE SOHO 全新前端

> 註：這份 spec 用來產生最初的 `/gemini` 替代前端。現時 repo 已把 `/gemini/*` 定位為純設計實驗場，只作風格比較，不會寫入正式資料。

## 你的任務

為 TOWNPLACE SOHO 物業管理系統建立一套**完整的替代前端**，放在 `src/app/gemini/` 路徑下。你寫的所有頁面都在 `/gemini/*` URL 下運行，與現有前端完全隔離。

**你可以自由發揮 UI/UX 設計風格**，不需要模仿現有前端。展現你認為最好的物業管理系統 UI 應該長什麼樣。

---

## 嚴格規則

1. **所有新頁面放在 `src/app/gemini/` 下** — 不要動 `src/app/page.tsx`、`src/app/ai/`、`src/app/rooms/` 等現有頁面
2. **不要修改任何 `src/app/api/` 路由** — 這些是共用的 backend，直接呼叫它們
3. **不要修改 `src/lib/` 下的任何檔案** — 這是 backend 邏輯
4. **不要修改 `src/components/Sidebar.tsx`** — 你要建立自己的 sidebar/navigation
5. **可以建立自己的 components** — 放在 `src/app/gemini/components/` 或 `src/components/gemini/`
6. **可以建立自己的 layout** — `src/app/gemini/layout.tsx`

---

## 項目背景

TOWNPLACE SOHO 是一個香港服務式公寓的物業管理系統，管理工程部、清潔部、禮賓部之間的交接流程。系統從 WhatsApp 群組接收訊息，用 AI/規則引擎分析後，自動建立跨部門交接信號。

**用戶**：物業管理層（manager），需要一頁看全局、快速決策。
**語言**：繁體中文 UI，部分英文術語可保留。

---

## 你需要建立的頁面（10 頁）

### 1. `/gemini` — 首頁 Dashboard
**API**: `GET /api/messages`, `GET /api/handoffs`, `GET /api/rooms`
**功能**：
- 全局 overview：今日訊息數、待處理交接數、需關注房間數
- 訊息列表（顯示 raw_text + AI 解析結果 + 信心度）
- 交接信號列表（顯示 from_dept → to_dept + 狀態 + 確認按鈕）
- 可以發送模擬訊息（POST /api/messages，body: `{ raw_text, sender_name, chat_name, chat_type }`)

### 2. `/gemini/rooms` — 房間看板
**API**: `GET /api/rooms`, `PUT /api/rooms`
**功能**：
- 顯示所有房間的 `eng_status`、`clean_status`、`lease_status`
- 可按樓層、狀態篩選
- 點擊房間可修改狀態
- `needs_attention = true` 的房間要明顯標示

### 3. `/gemini/documents` — 文件追蹤
**API**: `GET /api/documents`, `PUT /api/documents`
**功能**：
- 文件有 6 級 pipeline：`not_started → preparing → pending_sign → with_tenant → with_company → completed`
- 只能逐步前進或退回一步
- 每次操作必須填寫 `actor`（操作人）和 `reason`（原因）
- PUT body: `{ id, status, actor, reason }`（也可帶 `current_holder`, `notes`）
- 顯示每份文件的 audit trail（API response 包含 `audit_logs` 和 `last_log`）
- `days_outstanding > 3` 的文件要警告

### 4. `/gemini/ai` — AI 管理建議
**API**: `GET /api/suggestions`, `GET /api/followups`, `POST /api/followups`
**功能**：
- 建議有 3 個優先級：`urgent`、`warning`、`info`
- 建議有 8 個分類：`cleaning_backlog`、`engineering_bottleneck`、`handoff_delay`、`document_overdue`、`booking_conflict`、`checkout_followup`、`workload_imbalance`、`daily_priority`
- 可篩選優先級
- 每條建議顯示：分類標籤、優先級、標題、描述、受影響房號、建議行動
- 「一鍵建立跟進事項」按鈕（POST /api/followups）
- POST body: `{ title, description, source_type: 'suggestion', source_id, priority, assigned_dept, related_rooms }`

### 5. `/gemini/followups` — 跟進事項
**API**: `GET /api/followups`, `POST /api/followups`, `PUT /api/followups`
**功能**：
- 狀態：`open → in_progress → done`（也可 `dismissed`）
- 每次狀態變更必須填 `actor` 和 `reason`
- PUT body: `{ id, status, actor, reason }`（也可帶 `assigned_dept`, `assigned_to`, `due_at`）
- 顯示 audit trail
- 可按狀態、優先級篩選

### 6. `/gemini/reviews` — 人工覆核
**API**: `GET /api/reviews`, `PUT /api/reviews`
**功能**：
- 低信心度或 aggregate 訊息會進入 review queue
- 每條 review 顯示：原文、AI 建議的房號/動作/類型、信心度
- 操作：批准（approved）、修正（corrected）、略過（dismissed）
- 批准 = 接受 AI 判斷，修正 = 覆寫為正確的值
- PUT body: `{ id, review_status: 'approved'|'corrected'|'dismissed', reviewed_by, reviewed_rooms?, reviewed_action?, reviewed_type? }`

### 7. `/gemini/notifications` — 通知中心
**API**: `GET /api/notifications`
**功能**：
- 8 種通知類型：`handoff_timeout`、`doc_overdue`、`booking_conflict`、`review_pending`、`followup_urgent`、`followup_due`、`checkout_pending`、`cleaning_waiting`
- 每條通知有 `level`（`critical` / `warning` / `info`）
- 顯示相關房號、相關部門、建議行動
- 可按 level 篩選

### 8. `/gemini/bookings` — 預約日曆
**API**: `GET /api/bookings`
**功能**：
- 顯示所有預約：房間預約（viewing、shooting）和公共設施預約（event、tenant_booking）
- 顯示日期、時間、時長、預約人、部門、備註
- 可按日期或類型篩選

### 9. `/gemini/report` — 每日報告
**API**: `GET /api/daily-report`
**功能**：
- API 回傳 `{ report: string, items: number }`
- `report` 是純文字格式的每日跟進摘要
- 顯示報告內容，可複製

### 10. `/gemini/upload` — 上傳訊息
**API**: `POST /api/upload`
**功能**：
- 上傳 WhatsApp 匯出的 `.txt` 或 `.zip` 檔案
- 可選填：chat_name（對話名稱）、chat_type（group/direct）、sender_dept（部門）
- 用 FormData 上傳：`file`（必填）、`chat_name`、`chat_type`、`sender_dept`
- 顯示上傳結果：parsed_messages 數量、skipped_lines 數量

---

## 共用數據型別（參考用，不要 import `src/lib/types.ts`，自己定義前端需要的 interface）

```typescript
// 部門代碼
type DeptCode = 'eng' | 'conc' | 'clean' | 'hskp' | 'mgmt' | 'lease' | 'comm' | 'security';

// 部門顯示資訊
const DEPT_INFO = {
    eng: { name: '工程部', color: '#F59E0B' },
    conc: { name: '禮賓部', color: '#3B82F6' },
    clean: { name: '清潔部', color: '#10B981' },
    hskp: { name: '房務部', color: '#10B981' },
    mgmt: { name: '管理層', color: '#8B5CF6' },
    lease: { name: '租務部', color: '#EC4899' },
    comm: { name: '社區部', color: '#EF4444' },
    security: { name: '保安部', color: '#6B7280' },
};

// 房間
interface Room {
    id: string;              // e.g. "10F", "23D"
    floor: number;
    unit_letter: string;
    room_type: string;       // "Studio" | "1B" | "2B"
    eng_status: 'completed' | 'in_progress' | 'pending' | 'n_a';
    clean_status: 'completed' | 'in_progress' | 'pending' | 'n_a';
    lease_status: 'occupied' | 'vacant' | 'newlet' | 'checkout';
    needs_attention: boolean;
    attention_reason: string | null;
    last_updated_by: string | null;
}

// 訊息
interface Message {
    id: string;
    raw_text: string;
    sender_name: string;
    sender_dept: DeptCode;
    chat_name: string;
    chat_type: 'group' | 'direct';
    sent_at: string;         // ISO datetime
    parsed_room: string[];
    parsed_action: string | null;
    parsed_type: 'handoff' | 'request' | 'update' | 'trigger' | 'query' | 'escalation' | null;
    confidence: number;      // 0-1
}

// 交接
interface Handoff {
    id: string;
    room_id: string;
    from_dept: DeptCode;
    to_dept: DeptCode;
    action: string;
    status: 'pending' | 'acknowledged' | 'completed';
    created_at: string;
}

// 文件
interface Document {
    id: string;
    room_id: string;
    doc_type: 'DRF' | 'TA' | 'Surrender' | 'Inventory' | 'Newlet';
    status: 'not_started' | 'preparing' | 'pending_sign' | 'with_tenant' | 'with_company' | 'completed';
    current_holder: string | null;
    days_outstanding: number;
    notes: string | null;
    audit_logs: AuditLog[];  // included in API response
    last_log: AuditLog | null;
}

// 建議
interface Suggestion {
    id: string;
    priority: 'urgent' | 'warning' | 'info';
    category: string;
    title: string;
    description: string;
    affected_rooms: string[];
    recommended_action: string;
}

// 跟進事項
interface Followup {
    id: string;
    title: string;
    description: string;
    priority: 'urgent' | 'warning' | 'info';
    assigned_dept: DeptCode;
    status: 'open' | 'in_progress' | 'done' | 'dismissed';
    due_at: string | null;
    related_rooms: string[];
    audit_logs: AuditLog[];
}

// 覆核
interface ParseReview {
    id: string;
    raw_text: string;
    sender_name: string;
    sender_dept: DeptCode;
    confidence: number;
    suggested_rooms: string[];
    suggested_action: string | null;
    suggested_type: string | null;
    review_status: 'pending' | 'approved' | 'corrected' | 'dismissed';
}

// 通知
interface Notification {
    id: string;
    type: string;
    level: 'critical' | 'warning' | 'info';
    title: string;
    body: string;
    related_rooms: string[];
    related_dept: DeptCode;
    created_at: string;
}

// 預約
interface Booking {
    id: string;
    room_id: string | null;
    facility: string | null;
    booking_type: 'viewing' | 'shooting' | 'event' | 'tenant_booking';
    scheduled_at: string;
    duration_minutes: number;
    booked_by: string;
    dept: DeptCode;
    notes: string | null;
}

// 審計記錄
interface AuditLog {
    id: string;
    entity_type: 'document' | 'followup';
    action: 'created' | 'status_advanced' | 'status_reverted' | 'status_changed' | 'field_updated';
    actor: string;
    reason: string;
    from_status: string | null;
    to_status: string | null;
    created_at: string;
}
```

---

## 技術要求

- **Framework**: Next.js App Router（項目已配置）
- **Styling**: Tailwind CSS（項目已配置）
- **所有頁面必須是 `'use client'` component**
- **數據獲取**: `useCallback` + `fetch` + `useEffect` polling（每 5-10 秒）
- **Toast 通知**: 你可以自己做或 import `useToast` from `@/components/Toast`
- **工具函式**: 你可以 import `cn` from `@/lib/utils`（Tailwind class merge utility）
- **Lucide React icons**: 項目已安裝 `lucide-react`，可直接用

---

## 你的 layout (`src/app/gemini/layout.tsx`)

建立你自己的 layout，包含：
- 自己的 sidebar/navigation（連結到所有 `/gemini/*` 頁面）
- 標示「Gemini Frontend」讓用戶知道這是 Gemini 版本
- 可以用完全不同的設計風格（深色主題、不同佈局等）

---

## 檔案結構

```
src/app/gemini/
├── layout.tsx              ← 你的 layout + navigation
├── page.tsx                ← Dashboard 首頁
├── rooms/page.tsx
├── documents/page.tsx
├── ai/page.tsx
├── followups/page.tsx
├── reviews/page.tsx
├── notifications/page.tsx
├── bookings/page.tsx
├── report/page.tsx
├── upload/page.tsx
└── components/             ← 你的共用 components
    └── ...
```

---

## 驗收標準

1. `npm run build` 零錯誤
2. 所有 10 個頁面可在 `/gemini/*` 下訪問
3. 所有頁面正確呼叫對應的 API 並顯示數據
4. 文件和跟進事項的操作（推進/退回）能正常工作
5. 不修改任何 `src/app/api/`、`src/lib/`、`src/app/page.tsx` 等現有檔案
