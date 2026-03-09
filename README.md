# TOWNPLACE SOHO — Cross-Department Handoff Bridge System

這是一個為 TOWNPLACE SOHO（服務式住宅）設計的**跨部門交接與通訊整合系統**原型 (Prototype)。

## 專案背景與痛點

目前物業管理的 6 個不同部門（禮賓部、工程部、房務部、清潔部、租務部、管理層等）主要透過 WhatsApp 群組進行繁雜的日常溝通。
關鍵的狀態變更（例如：「10F工程已完成 → 可以開始清潔」）很容易在每天上百則的訊息中被淹沒，導致各部門間的「交接時刻 (Handoff moments)」缺乏有效的系統追蹤。

## 解決方案

本系統作為現有 WhatsApp 群組與物業管理系統之間的「橋樑 (Bridge)」。
核心特色：**工作流程零改變**。前線員工依然在熟悉的 WhatsApp 中溝通，而本系統會自動即時解析這些對話，提取出結構化的房號、動作與交接信號，並統一呈現在一個清晰的即時儀表板上。

## 主要功能模組

1. **訊息中心即時動態 (Message Feed)**：自動分類顯示原始 WhatsApp 訊息，並展示 AI 標籤化的解析結果（房號、置信度、發出對象）。
2. **部門交接信號面板 (Handoff Signals)**：自動捕獲如「工程部 → 清潔部」的待辦事項，讓負責部門能夠在此面板點擊「確認」接收。
3. **房間狀態總覽看板 (Room Status Board)**：以網格視覺化方式，展示全棟 200+ 個單位的最新工程、清潔與租務狀態。支援顏色警告與多維度過濾。
4. **文件追蹤系統 (Document Tracker)**：追蹤租務交接相關文件 (DRF, TA, Surrender, Inventory) 的簽署進度，以及逾期警告。
5. **預約日曆 (Bookings)**：整合睇樓、拍攝及住客活動的排期時間表。
6. **WhatsApp 匯出檔解析器 (Upload Demo Parser)**：支援手動上傳由 WhatsApp 手機端匯出的 `.txt` 紀錄檔，系統會精準合併多段訊息並批次解析為交接任務。（目前為取代 Twilio API 的 Demo 備案）
7. **每日報告自動產生 (Auto Daily Report)**：系統能依據當日的溝通紀錄，一鍵生成原本需人工整理的「是日跟進」文字報告，方便直接貼回 WhatsApp。

## 技術架構 (Technology Stack)

目前版本為 **Phase 1 (Core MVP)** 的前端與邏輯展示原型。

- **框架：** Next.js 14+ (App Router), React 18, TypeScript
- **樣式：** Tailwind CSS, 玻璃擬物化設計 (Glassmorphism)
- **圖示庫：** Lucide React
- **資料儲存：** In-Memory Store (`src/lib/store.ts`) — *註：後續可無縫銜接 Supabase (PostgreSQL)*
- **AI 解析：** 目前採用進階的 Regex 與關鍵字圖譜結合的方式模擬大語言模型的提取效果 (`src/lib/parser.ts`)，以達成極低的延遲及無須 API Token 的離線展示能力。

## 如何在本地端運行 (How to Run Locally)

1. 安裝套件：
   ```bash
   npm install
   ```

2. 啟動開發伺服器：
   ```bash
   npm run dev
   ```

3. 開啟瀏覽器並前往 `http://localhost:3000` 即可開始體驗。

## 示範與測試指南 (Demo Guide)

針對系統展示，你可以依照以下劇本操作：

1. 點擊頂部導航前往 **「上傳訊息」**。
2. 準備一份真實的 WhatsApp `.txt` 匯出檔並拖曳上傳（系統會自動過濾系統訊息、合併多行對話，並解析出其中的「房號」與「動作」）。
3. 前往 **「訊息中心」**，你會看到剛才匯入的對話已被彩色標籤化。右側的「交接信號」列表也會出現這批訊息所觸發的跨部門任務。
4. 點擊待確認事項的「確認」按鈕。
5. 前往 **「房間看板」**，觀察到觸發事件的相關房間（如完成了工程）狀態已由綠轉黃，並亮出警告圖示。
6. 前往 **「每日報告」**，系統已經把剛才的事件全部梳理為點列式的「是日跟進」摘要。

## 目錄結構簡介

- `/src/app/`：Next.js App Router 的所有分頁路由與頁面元件。
- `/src/app/api/`：模擬後端資料庫讀寫的 API 路由。
- `/src/components/`：跨頁面使用的獨立 UI 元件（如側邊導覽列 `Sidebar.tsx`）。
- `/src/lib/`：核心業務邏輯。
  - `store.ts`：記憶體資料庫實作與初始假資料固定種子 (Deterministic Seeds)。
  - `parser.ts`：WhatsApp 訊息的意圖辨識與實體擷取引擎。
  - `ingest.ts`：統一的資料寫入中樞，處理從接收訊息到觸發狀態變更的完整生命週期。
  - `types.ts`：全域 TypeScript 型別定義。
  - `utils.ts`：共用的幫助函式（如時間格式化、Tailwind CSS class 合併）。
