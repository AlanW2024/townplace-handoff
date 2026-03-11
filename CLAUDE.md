# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

TOWNPLACE SOHO 物業管理系統 — 管理工程部、清潔部、禮賓部之間的交接流程。系統從 WhatsApp 群組接收訊息，用 AI/規則引擎分析後自動建立跨部門交接信號。

## Commands

```bash
npm run dev      # Start dev server (Next.js)
npm run build    # Production build — use to verify zero errors
npm run lint     # ESLint
npm run test     # Vitest — runs tests/review-fixes.test.ts
```

## Architecture

### Stack
- **Next.js 14 App Router** with TypeScript
- **Tailwind CSS** for styling
- **File-based JSON store** (`.demo-store.json`) — no database
- **Cookie auth** (`tp-auth=authenticated`) via `src/middleware.ts`

### Data Flow
```
WhatsApp message → POST /api/messages or /api/upload
  → src/lib/ingest.ts (parseMessageWithAI + enforceHandoffSafety)
  → Store: message + optional handoff + optional parse_review
  → Room status updates (applyRoomStatusUpdate)
```

### Key Backend Modules (`src/lib/`)
- **`store.ts`** — `getStore()` / `withStoreWrite()` with process queue + file lock + atomic tmp-rename
- **`ingest.ts`** — Message ingestion pipeline; creates messages, handoffs, reviews
- **`message-parsing.ts`** — Handoff signal analysis (positive/negative/future regex); `enforceHandoffSafety()` triple gate
- **`ai/parse-message.ts`** — Hybrid parser: rule engine + optional Anthropic/OpenAI API
- **`parser.ts`** — `getDeptFromSender()` staff-to-department mapping (longest-first matching)
- **`suggestions.ts`** — Rule-based suggestions engine (8 analyzers)
- **`notifications.ts`** — Computed notifications (not persisted), aggregated by dept/severity
- **`audit.ts`** — `createAuditLog()` with field-level change tracking (`AuditFieldChange`)

### Frontend Structure
- **Existing frontend**: `src/app/` (page.tsx, rooms/, documents/, ai/, etc.)
- **Gemini comparison frontend**: `src/app/gemini/` (isolated, own layout/sidebar)
- **Shared components**: `src/components/` (Sidebar, LayoutShell, Toast)
- **Path alias**: `@/*` maps to `src/*`

### API Routes (`src/app/api/`)
All routes use `withStoreWrite()` for mutations. Key patterns:
- Mandatory `actor` + `reason` for status changes (documents, followups, reviews)
- Status transition guards (e.g., reviews: only `pending` → approved/corrected/dismissed)
- Audit logs with `AuditFieldChange[]` for field-level tracking

## Critical Rules

1. **Never modify `src/lib/`** or `src/app/api/`** when working on frontend — these are shared backend
2. **Store writes must use `withStoreWrite()`** — never read-modify-write manually
3. **Handoff creation requires `allowsImmediateHandoff === true`** from `analyzeHandoffSignal()`
4. **Low confidence (<0.75) messages route to review queue**, not auto-applied
5. **Documents follow 6-step pipeline** — can only advance or revert one step

## Department Codes
`eng` (工程部), `conc` (禮賓部), `clean` (清潔部), `hskp` (房務部), `mgmt` (管理層), `lease` (租務部), `comm` (社區部), `security` (保安部)
