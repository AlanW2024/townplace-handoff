# Policy Engine Usage Guide

The policy engine (`src/lib/policy/`) externalizes business rules so they can be
adjusted without modifying core logic. All defaults live in
`src/lib/policy/defaults.ts`. Use `mergePolicy()` to override specific sections.

---

## Adding New Action Patterns

Action patterns map message keywords to structured actions. They are defined as
`ActionPatternConfig` objects in `DEFAULT_ACTION_PATTERNS`.

To add a new pattern, append to the array in `DEFAULT_ACTION_PATTERNS`:

```typescript
{
  keywords: ['冷氣維修', 'AC\\s*repair', '冷氣壞'],
  action: 'AC 維修',
  type: 'request',      // 'handoff' | 'request' | 'update' | 'trigger' | 'query'
  from_dept: 'conc',
  to_dept: 'eng',
}
```

Each keyword string is compiled into a case-insensitive `RegExp`. The parser
(`parseWhatsAppMessage`) tests them against the normalized message text.

**Important**: Pattern order matters. The parser iterates top-to-bottom and keeps
the match with the highest confidence. Place more specific patterns before
general ones.

For patterns with `type: 'handoff'`, the parser additionally requires
`analyzeHandoffSignal()` to return `allowsImmediateHandoff === true` before
creating a handoff.

---

## Adding Staff/Department Mappings

The staff directory (`DEFAULT_STAFF_DIRECTORY`) maps sender names to department
codes. Add entries as `'name': DeptCode` pairs.

Resolution (`getDeptFromSender()`): exact match first, then substring match.
Entries are sorted by alias length (longest first), so `'karen man': 'lease'`
takes priority over `'karen': 'mgmt'`.

To override at runtime without modifying defaults:

```typescript
parseWhatsAppMessage(text, sender, dept, {
  staffDirectory: { ...DEFAULT_STAFF_DIRECTORY, 'temp staff': 'clean' },
});
```

---

## Customizing Handoff Signal Patterns

Handoff signals determine whether a message allows an immediate handoff. The
triple gate in `analyzeHandoffSignal()` checks three regex sets:

| Set              | Purpose                                    | Default examples              |
|------------------|--------------------------------------------|-------------------------------|
| positivePatterns | Must match for handoff to be considered    | `可清`, `ready for clean`     |
| negativePatterns | If matched, blocks the handoff             | `未可清`, `not ready`         |
| futurePatterns   | If matched, defers to review queue         | `明天可清`, `tomorrow ready`  |

The handoff is only allowed when:
`positive matched AND NOT negative matched AND NOT future matched`

To customize, spread the defaults and add new entries:

```typescript
const policy = mergePolicy({
  handoffPolicy: {
    ...DEFAULT_HANDOFF_POLICY,
    positivePatterns: [...DEFAULT_HANDOFF_POLICY.positivePatterns, '可以安排清潔'],
    negativePatterns: [...DEFAULT_HANDOFF_POLICY.negativePatterns, '暫停清潔'],
  },
});
```

Then pass `policy.handoffPolicy` to `analyzeHandoffSignal()`.

---

## Adjusting Review Thresholds

The `ReviewPolicy` controls when messages go to the human review queue:

- `minConfidence` (default `0.75`) -- below this threshold triggers review
- `alwaysReviewSummary` -- daily summary messages always go to review
- `alwaysReviewAmbiguousCompletion` -- "completed" without explicit "可清"
- `alwaysReviewFutureHandoff` -- future-tense handoff language

```typescript
const relaxed = mergePolicy({
  reviewPolicy: { minConfidence: 0.60, alwaysReviewSummary: false,
    alwaysReviewAmbiguousCompletion: true, alwaysReviewFutureHandoff: true },
});
// Pass: shouldRequireReview(parsed, signals, relaxed.reviewPolicy)
```

---

## Adding Room Status Rules

Each `RoomStatusRule` has an `action` string and an `apply(room)` function that
mutates `eng_status`, `clean_status`, `lease_status`, `needs_attention`, and
`attention_reason`.

```typescript
const customRules: RoomStatusRule[] = [
  ...DEFAULT_ROOM_STATUS_RULES,
  {
    action: 'AC 維修',
    apply: (room) => {
      room.eng_status = 'in_progress';
      room.needs_attention = true;
      room.attention_reason = 'AC 維修中';
    },
  },
];
// Pass: applyRoomStatusUpdate(room, action, dept, sender, customRules)
```

If no rule matches the action, the function returns with no changes. The
hardcoded `switch` fallback only runs when no `rules` array is provided.

---

## Using mergePolicy()

`mergePolicy()` performs a shallow merge of a partial config with
`DEFAULT_POLICY`. Override only the sections you need:

```typescript
import { mergePolicy, DEFAULT_STAFF_DIRECTORY } from '@/lib/policy';

const config = mergePolicy({
  reviewPolicy: { minConfidence: 0.65, alwaysReviewSummary: true,
    alwaysReviewAmbiguousCompletion: false, alwaysReviewFutureHandoff: true },
  staffDirectory: { ...DEFAULT_STAFF_DIRECTORY, 'new hire': 'eng' },
});
// config.actionPatterns, handoffPolicy, etc. → unchanged defaults
```

**Note**: `mergePolicy()` is a shallow merge. For nested array overrides (e.g.
`handoffPolicy.positivePatterns`), spread the nested default explicitly as shown
in the handoff section above.
