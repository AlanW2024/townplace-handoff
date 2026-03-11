# Production Hardening Plan

This document outlines the steps required to move TOWNPLACE SOHO from its current
demo/prototype state to a production-ready deployment.

---

## 1. Storage Migration: JSON File to PostgreSQL

### Current State

All data lives in `.demo-store.json`. Reads use `getStore()`, writes use
`withStoreWrite()` with a directory-based file lock and atomic tmp-rename.

### Migration Path

The `Repository` interface (`src/lib/storage/types.ts`) already defines the
target abstraction with methods for each entity (rooms, messages, handoffs,
documents, bookings, followups, parse_reviews, audit_logs) plus
`withTransaction<T>()`.

Steps:

1. **Implement `PostgresRepository`** that satisfies the `Repository` interface.
   Use a connection pool (e.g. `pg` + `pgpool`) and map each entity collection
   to a Postgres table.
2. **Replace direct `store.*` mutations in `ingestMessageIntoStore()`** with
   `Repository` method calls.  The ingestion pipeline currently mutates the
   in-memory `StoreData` object directly — each `store.messages.push(...)` call
   becomes `repo.createMessage(...)`.
3. **Replace `withStoreWrite()` callers in API routes** with
   `repo.withTransaction()`. Every API route under `src/app/api/` that calls
   `withStoreWrite()` needs to be migrated.
4. **Wire through `RepositoryConfig`** so the repository type is selected by
   environment variable (`STORE_BACKEND=postgres`).
5. **Write a one-time migration script** that reads `.demo-store.json` and
   inserts all seed data into Postgres tables.

### Schema Considerations

- Add `version` column to every mutable table (rooms, documents, handoffs,
  followups, parse_reviews) for optimistic locking.
- Add `property_id` indexes — all queries are scoped by property.
- Use `JSONB` for `AuditLog.changes` (array of `AuditFieldChange`).

---

## 2. Concurrency Control

### Implemented: Optimistic Locking with Version Field

Every mutable entity carries a `version` integer field (starting at 1).  On
update, the repository issues:

```sql
UPDATE rooms
SET ..., version = version + 1
WHERE id = $1 AND property_id = $2 AND version = $3
RETURNING *;
```

If `RETURNING` yields zero rows, a `StaleVersionError` is thrown and the caller
retries or surfaces a conflict to the user.

This replaces the file-system directory lock (`acquireStoreLock`) used by the
JSON store, which cannot scale beyond a single process.

### Write Path Summary

```
API Route
  → repo.withTransaction()
    → SELECT ... FOR UPDATE (where needed)
    → UPDATE ... WHERE version = $current
    → COMMIT or ROLLBACK on StaleVersionError
```

Batch ingestion (`ingestMessagesBatch`) runs inside a single transaction to
ensure atomicity across multiple messages.

---

## 3. Authentication Upgrade

### Current State

- **Middleware** (`src/middleware.ts`): checks cookie `tp-auth=authenticated`.
- **`getCurrentUser()`** (`src/lib/permissions.ts`): returns a hardcoded admin
  `User` object regardless of request.

### Target: JWTAuthProvider

1. **Replace cookie check** with JWT verification in middleware.  Extract the
   bearer token from `Authorization` header or a secure `HttpOnly` cookie.
2. **Implement `JWTAuthProvider`** that decodes the token, validates signature
   (RS256 with rotating keys), and returns a `User` object.
3. **Replace `getCurrentUser()`** to call the auth provider and resolve the
   real user from the JWT claims (`sub`, `email`, `role`, `dept`,
   `property_ids`).
4. **Enforce property scoping**: every API route already receives
   `property_id` — validate that the authenticated user's `property_ids`
   includes it.
5. **Preserve role-based permissions**: the existing `permissions.ts` module
   (`canChangeRoomStatus`, `canApproveHandoff`, `canEditDocument`,
   `canAdvanceDocument`, `canCloseFollowup`, `canApproveReview`) already
   enforces role checks.  These work unchanged once `getCurrentUser()` returns
   real data.

### Auth Provider Interface

```typescript
interface AuthProvider {
  getCurrentUser(request: Request): Promise<User | null>;
}

class DemoAuthProvider implements AuthProvider { /* current hardcoded logic */ }
class JWTAuthProvider implements AuthProvider  { /* production logic */ }
```

Select via `AUTH_PROVIDER=jwt` environment variable.

---

## 4. Privacy: WhatsApp Data Retention

### Policy

WhatsApp message content (`raw_text`, `sender_name`) is retained for **90 days**
from `created_at`, then purged.

### Implementation

1. **Scheduled job** (daily cron) queries messages older than 90 days.
2. For each expired message:
   - Redact `raw_text` to `[REDACTED]`.
   - Redact `sender_name` to the department code (e.g. `eng`).
   - Preserve `parsed_room`, `parsed_action`, `parsed_type`, `confidence` — these
     are operational metadata, not personal data.
3. Cascade to `ParseReview.raw_text` and `ParseReview.sender_name`.
4. Audit the purge: create an `AuditLog` entry per batch with
   `action: 'field_updated'` and reason `'90-day data retention policy'`.

### Considerations

- Handoffs and room status updates derived from messages are kept indefinitely
  (they contain no raw WhatsApp content).
- The retention window is configurable via `DATA_RETENTION_DAYS` env var.

---

## 5. Observability

### Current State

No structured logging. Errors surface as unhandled exceptions or JSON error
responses in API routes.

### Target: ObservabilityHook

Inject a structured JSON logger at key pipeline stages:

```typescript
interface ObservabilityHook {
  onMessageIngested(msg: Message, result: IngestResult): void;
  onHandoffCreated(handoff: Handoff): void;
  onReviewRouted(review: ParseReview, reason: string): void;
  onRoomStatusChanged(roomId: string, field: string, from: string, to: string): void;
  onError(context: string, error: Error, meta?: Record<string, unknown>): void;
}
```

### Key Metrics to Track

| Metric                          | Source                     |
|---------------------------------|----------------------------|
| Messages ingested / min         | `onMessageIngested`        |
| Auto-handoff rate               | handoffs created / messages |
| Review queue depth              | `onReviewRouted`           |
| Parse confidence distribution   | `msg.confidence` histogram |
| Handoff acknowledgment latency  | handoff created→acknowledged |
| API route latency (p50/p99)     | middleware timer            |

### Deployment

- Use `LOG_LEVEL` env var (`debug`, `info`, `warn`, `error`).
- Pipe structured logs to an aggregator (ELK, Datadog, CloudWatch).
- Set alerts on: review queue depth > 20, handoff timeout > 4h, API p99 > 2s.

---

## Migration Priority

| Phase | Item                     | Effort | Risk if Skipped         |
|-------|--------------------------|--------|-------------------------|
| 1     | Postgres migration       | High   | Data loss, no scaling   |
| 1     | Concurrency control      | Medium | Race conditions         |
| 2     | JWT authentication       | Medium | Unauthorized access     |
| 2     | Observability            | Medium | Blind to failures       |
| 3     | Data retention           | Low    | Privacy non-compliance  |
