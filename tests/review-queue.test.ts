import { describe, expect, it } from 'vitest';
import { classifyMessageForOperationalQueue } from '../src/lib/review-queue';

describe('review queue heuristics', () => {
  it('短而模糊的完成句子會入 review', () => {
    const decision = classifyMessageForOperationalQueue({
      raw_text: '2A finish',
      parsed_room: ['2A'],
      parsed_action: null,
      parsed_type: null,
      confidence: 0.3,
      sender_dept: 'eng',
    });

    expect(decision.classification).toBe('review');
  });

  it('多房 summary 應留作 context，不應塞入 review', () => {
    const decision = classifyMessageForOperationalQueue({
      raw_text: '是日跟進 20 Jul 25\n。5C 10L 22F已out機\n。19A已淋花及倒水',
      parsed_room: ['5C', '10L', '22F', '19A'],
      parsed_action: '工程進度更新',
      parsed_type: 'update',
      confidence: 0.68,
      sender_dept: 'conc',
    });

    expect(decision.classification).toBe('context');
  });

  it('查詢 / booking 類訊息應留作 context', () => {
    const decision = classifyMessageForOperationalQueue({
      raw_text: '9K淨係book左Kitchen，無book BBQ, 收返佢錢?',
      parsed_room: ['9K'],
      parsed_action: null,
      parsed_type: null,
      confidence: 0.2,
      sender_dept: 'conc',
    });

    expect(decision.classification).toBe('context');
  });

  it('只提房號的短訊應留作 context', () => {
    const decision = classifyMessageForOperationalQueue({
      raw_text: '10L',
      parsed_room: ['10L'],
      parsed_action: null,
      parsed_type: null,
      confidence: 0.2,
      sender_dept: 'conc',
    });

    expect(decision.classification).toBe('context');
  });

  it('房間碎片背景不應再塞入 review', () => {
    const decision = classifyMessageForOperationalQueue({
      raw_text: '30C電視搞唔掂，開一秒就自己熄機',
      parsed_room: ['30C'],
      parsed_action: null,
      parsed_type: null,
      confidence: 0.41,
      sender_dept: 'conc',
    });

    expect(decision.classification).toBe('context');
  });

  it('未來 handoff 語句仍保持 review', () => {
    const decision = classifyMessageForOperationalQueue({
      raw_text: '10F 明天可清',
      parsed_room: ['10F'],
      parsed_action: '工程完成 → 可清潔',
      parsed_type: 'handoff',
      confidence: 0.55,
      sender_dept: 'eng',
    });

    expect(decision.classification).toBe('review');
  });
});

describe('classifyMessageForOperationalQueue — acknowledgment 減誤判', () => {
  it('marks short no-room greetings as irrelevant', () => {
    const result = classifyMessageForOperationalQueue({ raw_text: '早晨' });
    expect(result.classification).toBe('irrelevant');
  });

  it('marks casual chat as irrelevant', () => {
    const result = classifyMessageForOperationalQueue({ raw_text: '食咗飯未' });
    expect(result.classification).toBe('irrelevant');
  });

  it('marks room + acknowledgment as context, not review', () => {
    const result = classifyMessageForOperationalQueue({
      raw_text: '10F ok',
      parsed_room_refs: [{ physical_room_id: '10F', display_code: '10F', scope: 'active', raw_match: '10F' }],
    });
    expect(result.classification).toBe('context');
  });

  it('marks room + received as context, not review', () => {
    const result = classifyMessageForOperationalQueue({
      raw_text: '收到，23D',
      parsed_room_refs: [{ physical_room_id: '23D', display_code: '23D', scope: 'active', raw_match: '23D' }],
    });
    expect(result.classification).toBe('context');
  });

  it('marks room + thanks as context, not review', () => {
    const result = classifyMessageForOperationalQueue({
      raw_text: '23D 多謝師傅',
      parsed_room_refs: [{ physical_room_id: '23D', display_code: '23D', scope: 'active', raw_match: '23D' }],
    });
    expect(result.classification).toBe('context');
  });

  it('marks room + question as context, not review', () => {
    const result = classifyMessageForOperationalQueue({
      raw_text: '10F 幾時搞好？',
      parsed_room_refs: [{ physical_room_id: '10F', display_code: '10F', scope: 'active', raw_match: '10F' }],
    });
    expect(result.classification).toBe('context');
  });

  it('marks room + ambiguous completion as review', () => {
    const result = classifyMessageForOperationalQueue({
      raw_text: '19C 完成',
      parsed_room_refs: [{ physical_room_id: '19C', display_code: '19C', scope: 'active', raw_match: '19C' }],
    });
    expect(result.classification).toBe('review');
  });

  it('marks room + parsed action as actionable', () => {
    const result = classifyMessageForOperationalQueue({
      raw_text: '10F 已完成，可清潔',
      parsed_room_refs: [{ physical_room_id: '10F', display_code: '10F', scope: 'active', raw_match: '10F' }],
      parsed_action: '工程完成 → 可清潔',
      parsed_type: 'handoff',
      confidence: 0.9,
    });
    expect(result.classification).toBe('actionable');
  });
});
