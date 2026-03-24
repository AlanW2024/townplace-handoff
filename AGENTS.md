# AGENTS.md

This file is the agent guide for the **TOWNPLACE SOHO handoff project** at:

- `/Users/yeehowong/.gemini/antigravity/scratch/townplace-handoff`

Use this file as the quick-start instruction sheet for any coding agent working in this repository.

## Project Purpose

This project is a Next.js operational dashboard for **Townplace Soho**. It helps the team turn WhatsApp messages into:

- parsed operational messages
- room updates
- handoff signals between departments
- review queue items for uncertain cases
- notifications and suggestions

Think of it like a smart sorting desk:

1. WhatsApp messages come in
2. The system reads them
3. It decides which room they belong to
4. It decides whether the message is useful, ambiguous, or actionable
5. It shows the result to operations staff

## Key Commands

Run commands from the project root:

```bash
npm run dev
npm run build
npm run lint
npm run test
npm run test:coverage
```

## Important Files

Read these before making meaningful changes:

- `/Users/yeehowong/.gemini/antigravity/scratch/townplace-handoff/src/lib/ingest.ts`
- `/Users/yeehowong/.gemini/antigravity/scratch/townplace-handoff/src/lib/message-parsing.ts`
- `/Users/yeehowong/.gemini/antigravity/scratch/townplace-handoff/src/lib/parser.ts`
- `/Users/yeehowong/.gemini/antigravity/scratch/townplace-handoff/src/lib/review-queue.ts`
- `/Users/yeehowong/.gemini/antigravity/scratch/townplace-handoff/src/lib/room-lifecycle.ts`
- `/Users/yeehowong/.gemini/antigravity/scratch/townplace-handoff/src/lib/store.ts`
- `/Users/yeehowong/.gemini/antigravity/scratch/townplace-handoff/src/lib/types.ts`
- `/Users/yeehowong/.gemini/antigravity/scratch/townplace-handoff/src/app/page.tsx`
- `/Users/yeehowong/.gemini/antigravity/scratch/townplace-handoff/src/app/upload/page.tsx`
- `/Users/yeehowong/.gemini/antigravity/scratch/townplace-handoff/src/app/reviews/page.tsx`

For deeper project context, also read:

- `/Users/yeehowong/.gemini/antigravity/scratch/townplace-handoff/CLAUDE.md`

## Architecture Summary

### Core stack
- Next.js App Router
- TypeScript
- Tailwind CSS
- JSON file store (`.demo-store.json`)
- Vitest test suite

### Main flow
```text
WhatsApp message / uploaded file
-> parse / ingest pipeline
-> message classification + room matching
-> optional handoff / review / status updates
-> dashboard, reviews, notifications, suggestions
```

### Important business ideas
- Only **clear ready-for-cleaning language** can create a handoff
- Negative or future handoff language must stay conservative
- Ambiguous messages should go to review, not directly change state
- `2A` is a physical room; `EX 2A` is an archived lifecycle version of the same room

## Working Rules

### 1. Keep shared backend rules safe
If you touch:

- `src/lib/ingest.ts`
- `src/lib/message-parsing.ts`
- `src/lib/parser.ts`
- `src/lib/review-queue.ts`
- `src/lib/store.ts`

be careful. These files control the core behavior of the system.

### 2. Do not bypass handoff safety
High-risk actions must still respect the hard guard rails.

Examples that must **not** become immediate handoff:

- `未可清`
- `仲未可清`
- `暫時唔可清`
- `not ready for cleaning`
- `明天可清`

### 3. Store writes must stay disciplined
This project uses a JSON store. Avoid ad-hoc read-modify-write flows. Follow the existing write helpers and current store pattern.

### 4. Keep UI and backend behavior aligned
If you change business meaning in parsing or lifecycle logic, update the related UI labels and flows too.

### 5. Keep changes easy to review
Claude Code will review your code after completion.  
Write changes in a way that is:

- small
- clear
- testable
- easy to explain

## Testing Expectations

Before finishing meaningful work, run:

```bash
npm run test
npm run lint
npm run build
```

If you change parsing, upload, review, room lifecycle, or handoff logic, also check the related tests in:

- `/Users/yeehowong/.gemini/antigravity/scratch/townplace-handoff/tests`

## Things Not To Confuse

- This repository already has a real multi-page operational app
- Do not confuse it with smaller prototype repos elsewhere
- Do not assume `Gemini` comparison UI is the same as the main production path
- Do not treat `.next*` folders or `.demo-store.json` as source code

## Finish Checklist For Agents

When you finish, report:

1. what files changed
2. what exact behavior changed
3. what checks were run
4. any remaining limitation or edge case
