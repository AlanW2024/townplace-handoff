# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Code Review

Codex will review your code after completion.

## Project Overview

TOWNPLACE SOHO 物業管理系統 — 管理工程部、清潔部、禮賓部之間的交接流程。系統從 WhatsApp 群組接收訊息，用 AI/規則引擎分析後自動建立跨部門交接信號。

## Commands

```bash
npm run dev           # Start dev server (Next.js)
npm run build         # Production build — use to verify zero errors
npm run lint          # ESLint
npm run test          # Vitest — 322 tests across 23 files
npm run test:coverage # Vitest with v8 coverage report
```

## Architecture

### Stack
- **Next.js 14 App Router** with TypeScript (strict mode)
- **Tailwind CSS** for styling
- **File-based JSON store** (`.demo-store.json`) — no database
- **Cookie auth** (`tp-auth=authenticated`) via `src/middleware.ts` → `isAuthenticated()` from `auth.ts`
- **Vitest** for testing (322 tests)

### Data Flow
```
WhatsApp message → POST /api/messages or /api/upload
  → src/lib/ingest.ts (parseMessageWithAI + enforceHandoffSafety)
  → Store: message + optional handoff + optional parse_review
  → Room status updates (applyRoomStatusUpdate)
  → Observability: emitEvent('message.ingested', ...)
```

### Key Backend Modules (`src/lib/`)
- **`store.ts`** — `getStore()` / `withStoreWrite()` with process queue + file lock + atomic tmp-rename. Emits `store.write` observability events.
- **`ingest.ts`** — Message ingestion pipeline; creates messages, handoffs, reviews. Uses `shouldRequireReview()` with `DEFAULT_REVIEW_POLICY`. Exports `isSummaryMessage`, `isAmbiguousEngineeringCompletion`, `shouldRequireReview`, `applyRoomStatusUpdate`. Emits `message.ingested` events.
- **`message-parsing.ts`** — Handoff signal analysis (positive/negative/future regex); `enforceHandoffSafety()` triple gate (single call point in `ingest.ts`). Accepts optional `HandoffPolicy` config.
- **`ai/parse-message.ts`** — Hybrid parser: rule engine + optional Anthropic/OpenAI API. Returns raw AI result; safety enforcement deferred to `ingest.ts`.
- **`parser.ts`** — `parseWhatsAppMessage()` and `getDeptFromSender()`. Action patterns and staff directory sourced from `policy/defaults.ts` (no duplication).
- **`suggestions.ts`** — Rule-based suggestions engine (8 analyzers), deduplicates against notifications. Accepts optional `NotificationThresholds`.
- **`notifications.ts`** — Computed notifications (not persisted), aggregated by dept/severity. Uses `DEFAULT_NOTIFICATION_THRESHOLDS` from policy; accepts optional thresholds override.
- **`audit.ts`** — `createAuditLog()` with field-level change tracking (`AuditFieldChange`)
- **`api-utils.ts`** — `parseJsonBody<T>()` for safe JSON parsing with 400 error on invalid body. Emits `api.error` events.
- **`observability.ts`** — `ObservabilityHook` interface + `consoleHook`. `emitEvent()` wired into store writes, message ingestion, and API error handling.
- **`daily-summary-parser.ts`** — Pure-function parser for extracting room-level progress from WhatsApp「是日跟進」daily summary messages. Detects summary marker, splits bullet lines, extracts room IDs (`\b\d{1,2}[A-M]\b`), classifies into 13 categories and 4 statuses. No side effects, no store access.
- **`ai/batch-analyze.ts`** — Instant rules-based classification + parallel AI batch analysis for uploaded messages.

### Policy Engine (`src/lib/policy/`)
Configurable business rules consumed by parser, notifications, and suggestions:
- **`types.ts`** — `ActionPatternConfig`, `HandoffPolicy`, `ReviewPolicy`, `RoomStatusRule`, `NotificationThresholds`, `PolicyConfig`
- **`defaults.ts`** — `DEFAULT_ACTION_PATTERNS`, `DEFAULT_STAFF_DIRECTORY`, `DEFAULT_HANDOFF_POLICY`, `DEFAULT_REVIEW_POLICY`, `DEFAULT_NOTIFICATION_THRESHOLDS`, `DEFAULT_ROOM_STATUS_RULES`, `mergePolicy()` (deep merge)
- **Consumers**: `parser.ts` uses `DEFAULT_ACTION_PATTERNS` + `DEFAULT_STAFF_DIRECTORY`; `notifications.ts` uses `DEFAULT_NOTIFICATION_THRESHOLDS`; `ingest.ts` uses `DEFAULT_REVIEW_POLICY` via `shouldRequireReview()`

### Permissions & Auth
- **`permissions.ts`** — RBAC: `canChangeRoomStatus`, `canApproveHandoff`, `canEditDocument`, `canAdvanceDocument`, `canCloseFollowup`, `canApproveReview`. Roles: admin/manager/operator/viewer
- **`auth.ts`** — `AuthProvider` interface + `DemoAuthProvider` + `isAuthenticated()` (used by middleware). Not yet enforced in API routes.

### Database Future Work (not active architecture)
- **`storage/types.ts`** — `Repository` interface (find/create/update for all entities)
- **`storage/json-store.ts`** — `JsonStoreRepository` wrapping existing store.ts
- **Status**: Kept only as a future migration sketch for a real database. All routes still import `getStore`/`withStoreWrite` directly.

### Daily Progress Tracking
- **Upload integration**: `POST /api/upload` extracts「是日跟進」entries from WhatsApp uploads → stores as `RoomProgressEntry` in `store.room_progress`
- **Progress API**: `GET /api/rooms/progress` — filters by room, category, date range (from/to), sorted by date desc
- **Dashboard**: `/rooms/progress` — manager view grouped by date, filterable by category (13 types), status (4 types), room, date range
- **Types**: `ProgressCategory` (check_in, check_out, final, maintenance, ac, plumbing, paint, mold, cleaning, appliance, door_lock, pest_control, other), `ProgressStatus` (completed, in_progress, pending, follow_up), `RoomProgressEntry`

### Frontend Structure
- **Existing frontend**: `src/app/` (page.tsx, rooms/, rooms/progress/, documents/, ai/, etc.)
- **Gemini comparison frontend**: `src/app/gemini/` (isolated, own layout/sidebar, intentionally UI-only / non-persistent)
- **Shared components**: `src/components/` (Sidebar, LayoutShell, Toast, AuditTrail)
- **Custom hooks**: `src/hooks/usePolling.ts` — visibility-aware polling (pauses when tab hidden)
- **Path alias**: `@/*` maps to `src/*`
- **Pattern**: All pages are `'use client'`, fetch via `usePolling(callback, 5000)` with visibility awareness

### API Routes (`src/app/api/`)
All routes use `withStoreWrite()` for mutations and `parseJsonBody()` for safe JSON parsing. Key patterns:
- Mandatory `actor` + `reason` for status changes (documents, followups, handoffs)
- Status transition guards (reviews: `pending` → approved/corrected/dismissed; handoffs: `pending` → acknowledged/completed, `acknowledged` → completed)
- Audit logs with `AuditFieldChange[]` for field-level tracking (documents, followups, handoffs)
- Optimistic locking via `version` increment + optional `expectedVersion` check (409 on mismatch)
- Input validation: priority enum, duration positive integer, non-empty raw_text

## Critical Rules

1. **Never modify `src/lib/` or `src/app/api/` when working on frontend** — these are shared backend
2. **Store writes must use `withStoreWrite()`** — never read-modify-write manually
3. **Handoff creation requires `allowsImmediateHandoff === true`** from `analyzeHandoffSignal()`
4. **Low confidence (<0.75) messages route to review queue**, not auto-applied
5. **Documents follow 6-step pipeline** — can only advance or revert one step
6. **`enforceHandoffSafety` is called once** in `ingest.ts` — do not add additional calls

## Known Issues (remaining)

### Medium Priority
- **ID generation uses `Date.now()`** — collision risk in concurrent/serverless scenarios
- **Permissions not enforced in API routes** — RBAC functions defined but not wired into request handlers

### Low Priority
- **`JsonStoreRepository.withTransaction()` is misleading** — kept only as future database sketch, not real transaction semantics
- **Default dept fallback to `'conc'`** when sender unknown (ingest.ts line 112) — implicit business assumption
- **`normalizeRoom` inconsistency**: `needs_attention=false` can coexist with non-null `attention_reason`
- **No Error Boundary** in frontend — fetch failures only show toast

## Test Coverage

### Covered (322 tests across 23 files)
- `tests/parser.test.ts` (34) — message parsing + dept mapping + word boundary regression
- `tests/message-parsing.test.ts` (28) — room extraction + handoff signals + safety gates
- `tests/ingest.test.ts` (36) — room status updates + summary detection + integration
- `tests/audit.test.ts` (7) — audit log creation + queries
- `tests/document-pipeline.test.ts` (15) — 6-step pipeline transitions
- `tests/followup-states.test.ts` (13) — status transitions + suggestion dedup
- `tests/review-lifecycle.test.ts` (12) — approve/correct/dismiss + conflict detection
- `tests/policy.test.ts` (12) — regression guards + custom policy + deep merge
- `tests/permissions.test.ts` (24) — RBAC permission matrix + isAuthenticated
- `tests/review-fixes.test.ts` (5) — cross-module integration
- `tests/notifications.test.ts` (13) — handoff timeout, doc overdue, booking conflict, custom thresholds
- `tests/suggestions.test.ts` (11) — analyzer triggers, notification overlap suppression
- `tests/store.test.ts` (8) — normalizeStore, seed data, persistence, reset
- `tests/api-validation.test.ts` (8) — invalid JSON, priority enum, version mismatch
- `tests/handoffs-route.test.ts` (10) — transition matrix, actor/reason, audit logging, version
- `tests/daily-summary-parser.test.ts` (40) — 是日跟進 detection, room extraction, category/status classification, bullet parsing, integration
- `tests/upload-noise-filter.test.ts` (13) — upload filter system message skipping
- `tests/review-queue.test.ts` (14) — review queue operations
- `tests/ai-provider.test.ts` (2) — AI provider configuration

### Shared Test Helpers (`tests/helpers.ts`)
- `withTempWorkspace(run, prefix?)` — isolated temp directory with vi.resetModules()
- `jsonRequest(url, method, body)` — construct JSON Request object
- `isoNow(offsetMs?)` — ISO timestamp with optional offset
- `makeRoom(id, overrides?)` — complete Room object with defaults

### Not Covered
- `ai/parse-message.ts` (depends on external AI APIs)
- `middleware.ts` (edge runtime)
- API routes: auth, daily-report, parse, rooms GET, upload (partially covered in review-fixes)

## Department Codes
`eng` (工程部), `conc` (禮賓部), `clean` (清潔部), `hskp` (房務部), `mgmt` (管理層), `lease` (租務部), `comm` (社區部), `security` (保安部)
