import { describe, expect, it } from 'vitest';
import { extractRoomRefs, extractRooms, analyzeHandoffSignal, enforceHandoffSafety } from '../src/lib/message-parsing';
import { ParseResult } from '../src/lib/types';

// =========================================
// 1. extractRooms
// =========================================
describe('extractRooms', () => {
  it('single room — 10F 已完成 → ["10F"]', () => {
    expect(extractRooms('10F 已完成')).toEqual(['10F']);
  });

  it('multiple rooms — 28G,28F,31J,15A 完成 → 4 rooms', () => {
    expect(extractRooms('28G,28F,31J,15A 完成')).toEqual(['28G', '28F', '31J', '15A']);
  });

  it('lowercase converted to uppercase — 3m deep clean → ["3M"]', () => {
    expect(extractRooms('3m deep clean')).toEqual(['3M']);
  });

  it('floor > 32 filtered out — 33A 完成 → []', () => {
    expect(extractRooms('33A 完成')).toEqual([]);
  });

  it('unit letter > M filtered out — 10N 完成 → []', () => {
    expect(extractRooms('10N 完成')).toEqual([]);
  });

  it('deduplicated — 10F 和 10F 重複 → ["10F"]', () => {
    expect(extractRooms('10F 和 10F 重複')).toEqual(['10F']);
  });

  it('no matches — no rooms here → []', () => {
    expect(extractRooms('no rooms here')).toEqual([]);
  });

  it('archived room reference — EX 2A check out → room refs preserve archived scope', () => {
    const refs = extractRoomRefs('EX 2A 已 check out');
    expect(refs).toEqual([
      expect.objectContaining({
        physical_room_id: '2A',
        display_code: 'EX 2A',
        scope: 'archived',
      }),
    ]);
    expect(extractRooms('EX 2A 已 check out')).toEqual(['2A']);
  });
});

// =========================================
// 2. analyzeHandoffSignal — positive
// =========================================
describe('analyzeHandoffSignal — positive', () => {
  it('可清潔 → positive handoff, allows immediate', () => {
    const result = analyzeHandoffSignal('可清潔');
    expect(result.hasExplicitPositiveHandoff).toBe(true);
    expect(result.allowsImmediateHandoff).toBe(true);
  });

  it('可清 → positive handoff, allows immediate', () => {
    const result = analyzeHandoffSignal('可清');
    expect(result.hasExplicitPositiveHandoff).toBe(true);
    expect(result.allowsImmediateHandoff).toBe(true);
  });

  it('ready for cleaning → positive handoff, allows immediate', () => {
    const result = analyzeHandoffSignal('ready for cleaning');
    expect(result.hasExplicitPositiveHandoff).toBe(true);
    expect(result.allowsImmediateHandoff).toBe(true);
  });

  it('不影響可清潔 → positive handoff, allows immediate', () => {
    const result = analyzeHandoffSignal('不影響可清潔');
    expect(result.hasExplicitPositiveHandoff).toBe(true);
    expect(result.allowsImmediateHandoff).toBe(true);
  });
});

// =========================================
// 3. analyzeHandoffSignal — negative
// =========================================
describe('analyzeHandoffSignal — negative', () => {
  it('未可清潔 → negative context, blocks immediate handoff', () => {
    const result = analyzeHandoffSignal('未可清潔');
    expect(result.hasNegativeContext).toBe(true);
    expect(result.allowsImmediateHandoff).toBe(false);
  });

  it('仲未可清 → negative context, blocks immediate handoff', () => {
    const result = analyzeHandoffSignal('仲未可清');
    expect(result.hasNegativeContext).toBe(true);
    expect(result.allowsImmediateHandoff).toBe(false);
  });

  it('暫時唔可清潔 → negative context, blocks immediate handoff', () => {
    const result = analyzeHandoffSignal('暫時唔可清潔');
    expect(result.hasNegativeContext).toBe(true);
    expect(result.allowsImmediateHandoff).toBe(false);
  });

  it('not ready for cleaning → negative context, blocks immediate handoff', () => {
    const result = analyzeHandoffSignal('not ready for cleaning');
    expect(result.hasNegativeContext).toBe(true);
    expect(result.allowsImmediateHandoff).toBe(false);
  });

  it('唔可清 → negative context, blocks immediate handoff', () => {
    const result = analyzeHandoffSignal('唔可清');
    expect(result.hasNegativeContext).toBe(true);
    expect(result.allowsImmediateHandoff).toBe(false);
  });
});

// =========================================
// 4. analyzeHandoffSignal — future
// =========================================
describe('analyzeHandoffSignal — future', () => {
  it('明天可清 → future context, blocks immediate handoff', () => {
    const result = analyzeHandoffSignal('明天可清');
    expect(result.hasFutureContext).toBe(true);
    expect(result.allowsImmediateHandoff).toBe(false);
  });

  it('稍後可清潔 → future context, blocks immediate handoff', () => {
    const result = analyzeHandoffSignal('稍後可清潔');
    expect(result.hasFutureContext).toBe(true);
    expect(result.allowsImmediateHandoff).toBe(false);
  });

  it('遲啲ready for cleaning → future context, blocks immediate handoff', () => {
    const result = analyzeHandoffSignal('遲啲ready for cleaning');
    expect(result.hasFutureContext).toBe(true);
    expect(result.allowsImmediateHandoff).toBe(false);
  });

  it('聽日先可清 → future context, blocks immediate handoff', () => {
    const result = analyzeHandoffSignal('聽日先可清');
    expect(result.hasFutureContext).toBe(true);
    expect(result.allowsImmediateHandoff).toBe(false);
  });

  it('可清潔 tomorrow → future context, blocks immediate handoff', () => {
    const result = analyzeHandoffSignal('可清潔 tomorrow');
    expect(result.hasFutureContext).toBe(true);
    expect(result.allowsImmediateHandoff).toBe(false);
  });
});

// =========================================
// 5. enforceHandoffSafety
// =========================================
describe('enforceHandoffSafety', () => {
  const makeResult = (overrides: Partial<ParseResult> = {}): ParseResult => ({
    rooms: ['10F'],
    action: '工程完成 → 可清潔',
    type: 'handoff',
    from_dept: 'eng',
    to_dept: 'clean',
    confidence: 0.95,
    explanation: 'Test explanation',
    ...overrides,
  });

  it('handoff + immediate allowed → returns result unchanged', () => {
    const result = makeResult();
    const safe = enforceHandoffSafety('10F 已完成，可清潔', result);
    expect(safe.type).toBe('handoff');
    expect(safe.action).toBe('工程完成 → 可清潔');
    expect(safe.confidence).toBe(0.95);
  });

  it('handoff + negative context → confidence capped at 0.82, type becomes update', () => {
    const result = makeResult();
    const safe = enforceHandoffSafety('10F 未可清潔', result);
    expect(safe.confidence).toBeLessThanOrEqual(0.82);
    expect(safe.action).toBe('工程進度更新');
    expect(safe.type).toBe('update');
  });

  it('handoff + future context → confidence capped at 0.55', () => {
    const result = makeResult();
    const safe = enforceHandoffSafety('10F 明天可清潔', result);
    expect(safe.confidence).toBeLessThanOrEqual(0.55);
    expect(safe.type).toBe('update');
  });

  it('non-handoff type → returns result unchanged (pass-through)', () => {
    const result = makeResult({ type: 'update', action: '工程進度更新' });
    const safe = enforceHandoffSafety('10F 未可清潔', result);
    expect(safe).toBe(result);
  });

  it('handoff + negative + fallback provided → uses fallback action/type', () => {
    const result = makeResult();
    const fallback: ParseResult = {
      rooms: ['10F'],
      action: '部分工程完成',
      type: 'update',
      from_dept: 'eng',
      to_dept: null,
      confidence: 0.86,
    };
    const safe = enforceHandoffSafety('10F 未可清潔', result, fallback);
    expect(safe.action).toBe('部分工程完成');
    expect(safe.type).toBe('update');
    expect(safe.confidence).toBeLessThanOrEqual(0.82);
  });

  it('action "工程完成 → 可清潔" with non-handoff type → still treated as handoff candidate', () => {
    const result = makeResult({ type: 'update', action: '工程完成 → 可清潔' });
    const safe = enforceHandoffSafety('10F 未可清潔', result);
    // Should NOT pass through — it should be caught by isImmediateHandoffCandidate
    expect(safe.action).toBe('工程進度更新');
    expect(safe.type).toBe('update');
    expect(safe.confidence).toBeLessThanOrEqual(0.82);
  });
});
