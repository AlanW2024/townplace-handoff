# System Architecture

## Data Flow

```
WhatsApp Message
       │
       ▼
POST /api/messages  ─or─  POST /api/upload (batch)
       │
       ▼
┌──────────────────────────────────────────────────┐
│  ingest.ts — ingestMessage() / ingestMessagesBatch()  │
│                                                        │
│  1. getDeptFromSender()        ← parser.ts             │
│  2. parseMessageWithAI()       ← ai/parse-message.ts   │
│  3. enforceHandoffSafety()     ← message-parsing.ts    │
│  4. analyzeHandoffSignal()     ← message-parsing.ts    │
│  5. isSummaryMessage()         ← ingest.ts             │
│  6. shouldRequireReview()      ← ingest.ts + policy    │
│  7. Create handoffs (if allowed)                       │
│  8. applyRoomStatusUpdate()    ← ingest.ts + policy    │
└──────────────────────────────────────────────────┘
       │
       ▼
┌──────────────────────────┐
│  store.ts — withStoreWrite()  │
│  • Process queue (serial)     │
│  • Directory-based file lock  │
│  • Atomic tmp-rename write    │
└──────────────────────────┘
       │
       ▼
  .demo-store.json
```

## Module Dependency Graph

```
types.ts                  ← shared type definitions (all modules import this)
    │
    ├── policy/types.ts   ← PolicyConfig, ReviewPolicy, HandoffPolicy, etc.
    │       │
    │       └── policy/defaults.ts  ← DEFAULT_POLICY, mergePolicy()
    │
    ├── parser.ts         ← getDeptFromSender(), parseWhatsAppMessage()
    │       │               uses: policy/defaults (action patterns, staff directory)
    │       │               uses: message-parsing (extractRooms, analyzeHandoffSignal)
    │       │
    │       └── message-parsing.ts  ← analyzeHandoffSignal(), enforceHandoffSafety()
    │               uses: policy/defaults (handoff policy patterns)
    │
    ├── ai/parse-message.ts  ← parseMessageWithAI() — hybrid rule + LLM parser
    │
    ├── ingest.ts         ← ingestMessage(), applyRoomStatusUpdate()
    │       uses: parser, message-parsing, ai/parse-message, store, policy
    │
    ├── store.ts          ← getStore(), withStoreWrite(), saveStore()
    │       uses: parser (for seed data)
    │
    ├── storage/types.ts  ← Repository interface (future abstraction)
    │
    ├── permissions.ts    ← role-based access control, getCurrentUser()
    │
    ├── audit.ts          ← createAuditLog(), field-level change tracking
    │
    ├── notifications.ts  ← generateNotifications() — computed, not persisted
    │       uses: store
    │
    └── suggestions.ts    ← generateSuggestions() — 8 rule-based analyzers
            uses: store, notifications
```

## Policy Engine Layer

The policy engine (`src/lib/policy/`) externalizes all business rules into
configuration objects:

| Config                     | Controls                                      |
|----------------------------|-----------------------------------------------|
| `ActionPatternConfig[]`    | Keyword-to-action mapping for message parsing  |
| `staffDirectory`           | Staff name-to-department resolution             |
| `HandoffPolicy`            | Positive/negative/future handoff regex patterns |
| `ReviewPolicy`             | Confidence threshold and review triggers        |
| `DocumentPipelineConfig`   | Document status progression and step limits     |
| `NotificationThresholds`   | Timeout, overdue, and lookahead durations       |
| `RoomStatusRule[]`         | Action-to-room-state transition functions       |

`DEFAULT_POLICY` provides the baseline configuration. Use `mergePolicy()` to
override individual sections without replacing the entire config.

Functions that accept policy overrides:
- `parseWhatsAppMessage(..., config?)` — action patterns, staff directory
- `analyzeHandoffSignal(text, policy?)` — handoff signal patterns
- `shouldRequireReview(parsed, signals, policy?)` — review thresholds
- `applyRoomStatusUpdate(room, action, dept, sender, rules?)` — room rules

## Storage Abstraction

The `Repository` interface (`src/lib/storage/types.ts`) defines CRUD methods for
all entities plus `withTransaction<T>()`. Currently only the JSON-file backend
exists (`store.ts`). The interface is defined but not yet wired into the
ingestion pipeline. A `PostgresRepo` implementation is planned.

## Auth Abstraction

```
getCurrentUser(request) → User
```

Currently returns a hardcoded admin user (`src/lib/permissions.ts`).
Middleware (`src/middleware.ts`) checks the `tp-auth=authenticated` cookie.

The permissions module enforces role-based access:

| Role     | Capabilities                                                |
|----------|-------------------------------------------------------------|
| admin    | All actions                                                  |
| manager  | Status changes, document advances, reviews, followup close   |
| operator | Own-department status changes, handoff approvals, followups  |
| viewer   | Read-only                                                    |

## API Route Conventions

All mutation routes follow these patterns:

1. **`withStoreWrite()`** wraps all data mutations
2. **`actor` + `reason`** are mandatory fields for status changes
3. **Status transition guards** prevent invalid progressions
4. **Audit logs** with `AuditFieldChange[]` track field-level changes
5. **Property scoping** via `property_id` on all entities

## Department Codes

| Code       | Name         |
|------------|--------------|
| `eng`      | Engineering  |
| `conc`     | Concierge    |
| `clean`    | Cleaning     |
| `hskp`     | Housekeeping |
| `mgmt`     | Management   |
| `lease`    | Leasing      |
| `comm`     | Community    |
| `security` | Security     |
