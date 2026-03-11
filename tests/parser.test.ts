import { describe, expect, it } from 'vitest';
import { parseWhatsAppMessage, getDeptFromSender } from '../src/lib/parser';

describe('parseWhatsAppMessage', () => {
  // =========================================
  // 1. 工程→清潔 handoff
  // =========================================
  describe('工程→清潔 handoff', () => {
    it('10F 已完成，可清潔 — eng sender Vic Lee', () => {
      const result = parseWhatsAppMessage('10F 已完成，可清潔', 'Vic Lee');
      expect(result.action).toBe('工程完成 → 可清潔');
      expect(result.type).toBe('handoff');
      expect(result.rooms).toEqual(['10F']);
      expect(result.from_dept).toBe('eng');
      expect(result.to_dept).toBe('clean');
    });

    it('23D 已完成，可清潔(安裝止回閥) — handoff with scope detail', () => {
      const result = parseWhatsAppMessage('23D 已完成，可清潔(安裝止回閥)', undefined, 'eng');
      expect(result.action).toBe('工程完成 → 可清潔');
      expect(result.type).toBe('handoff');
      expect(result.rooms).toEqual(['23D']);
    });

    it('28G,28F 完成，可清 — multi-room handoff from 𝕋𝕒𝕟𝕃', () => {
      const result = parseWhatsAppMessage('28G,28F 完成，可清', '𝕋𝕒𝕟𝕃');
      expect(result.rooms).toEqual(['28G', '28F']);
      expect(result.type).toBe('handoff');
      expect(result.action).toBe('工程完成 → 可清潔');
    });

    it('19C完成可清 — compact handoff format', () => {
      const result = parseWhatsAppMessage('19C完成可清', undefined, 'eng');
      expect(result.type).toBe('handoff');
      expect(result.rooms).toEqual(['19C']);
      expect(result.action).toBe('工程完成 → 可清潔');
    });
  });

  // =========================================
  // 2. 工程進度 — no handoff
  // =========================================
  describe('工程進度 — no handoff', () => {
    it('23D 已完成油漆 — partial eng completion, not a handoff', () => {
      const result = parseWhatsAppMessage('23D 已完成油漆', undefined, 'eng');
      expect(result.action).not.toBe('工程完成 → 可清潔');
      expect(result.type).toBe('update');
      expect(result.rooms).toEqual(['23D']);
    });

    it('10F 已完成，明天繼續 — completion + continuation words yield 工程進度更新 at 0.68', () => {
      const result = parseWhatsAppMessage('10F 已完成，明天繼續', undefined, 'eng');
      expect(result.action).toBe('工程進度更新');
      expect(result.confidence).toBe(0.68);
    });

    it('15A 已安裝止回閥 — partial eng completion at 0.86', () => {
      const result = parseWhatsAppMessage('15A 已安裝止回閥', undefined, 'eng');
      expect(result.action).toBe('部分工程完成');
      expect(result.confidence).toBe(0.86);
    });

    it('9J睡房已吱膠(床尾，窗台邊位及燈糟轉角) — 吱膠工程 from conc sender', () => {
      const result = parseWhatsAppMessage('9J睡房已吱膠(床尾，窗台邊位及燈糟轉角)', undefined, 'conc');
      expect(result.action).toBe('吱膠工程');
      expect(result.type).toBe('update');
      expect(result.rooms).toEqual(['9J']);
    });

    it('盡做 — eng sender, no room, no action → low confidence', () => {
      const result = parseWhatsAppMessage('盡做', undefined, 'eng');
      expect(result.action).toBeNull();
      expect(result.confidence).toBeLessThanOrEqual(0.1);
    });
  });

  // =========================================
  // 3. 清潔
  // =========================================
  describe('清潔', () => {
    it('3M Deep clean完成 — 深層清潔完成', () => {
      const result = parseWhatsAppMessage('3M Deep clean完成', undefined, 'clean');
      expect(result.action).toBe('深層清潔完成');
      expect(result.rooms).toEqual(['3M']);
    });

    it('10F 清潔完成 — 清潔完成', () => {
      const result = parseWhatsAppMessage('10F 清潔完成', undefined, 'clean');
      expect(result.action).toBe('清潔完成');
      expect(result.rooms).toEqual(['10F']);
    });

    it('清潔安排，FYI — 清潔安排通知 from mgmt', () => {
      const result = parseWhatsAppMessage('清潔安排，FYI', undefined, 'mgmt');
      expect(result.action).toBe('清潔安排通知');
    });
  });

  // =========================================
  // 4. 報修/維修
  // =========================================
  describe('報修/維修', () => {
    it('25B 浴室門手柄脫落 — 報修 from conc to eng', () => {
      const result = parseWhatsAppMessage('25B 浴室門手柄脫落', undefined, 'conc');
      expect(result.action).toBe('報修 — 需要維修');
      expect(result.to_dept).toBe('eng');
      expect(result.rooms).toEqual(['25B']);
    });

    it('18A執修 — 執修中 from conc', () => {
      const result = parseWhatsAppMessage('18A執修', undefined, 'conc');
      expect(result.action).toBe('執修中');
      expect(result.type).toBe('update');
      expect(result.rooms).toEqual(['18A']);
    });

    it('22C 漏水 — 報修 — 需要維修', () => {
      const result = parseWhatsAppMessage('22C 漏水');
      expect(result.action).toBe('報修 — 需要維修');
      expect(result.rooms).toEqual(['22C']);
    });
  });

  // =========================================
  // 5. 退房/入住
  // =========================================
  describe('退房/入住', () => {
    it('17J已Check out — 退房 trigger', () => {
      const result = parseWhatsAppMessage('17J已Check out');
      expect(result.action).toBe('退房');
      expect(result.type).toBe('trigger');
      expect(result.rooms).toEqual(['17J']);
    });

    it('3M 1/10有in — 入住 trigger', () => {
      const result = parseWhatsAppMessage('3M 1/10有in');
      expect(result.action).toBe('入住');
      expect(result.type).toBe('trigger');
      expect(result.rooms).toEqual(['3M']);
    });
  });

  // =========================================
  // 6. 查詢
  // =========================================
  describe('查詢', () => {
    it('22C個工程要做幾耐 — 查詢進度 at 0.95', () => {
      const result = parseWhatsAppMessage('22C個工程要做幾耐', undefined, 'conc');
      expect(result.action).toBe('查詢進度');
      expect(result.confidence).toBe(0.95);
    });

    it('29E，維修大約搞幾耐? — 查詢進度 at 0.95', () => {
      const result = parseWhatsAppMessage('29E，維修大約搞幾耐?', undefined, 'conc');
      expect(result.action).toBe('查詢進度');
      expect(result.confidence).toBe(0.95);
    });
  });

  // =========================================
  // 7. 確認
  // =========================================
  describe('確認', () => {
    it('知了 → 已確認', () => {
      const result = parseWhatsAppMessage('知了');
      expect(result.action).toBe('已確認');
    });

    it('收到 → 已確認', () => {
      const result = parseWhatsAppMessage('收到');
      expect(result.action).toBe('已確認');
    });

    it('noted → 已確認', () => {
      const result = parseWhatsAppMessage('noted');
      expect(result.action).toBe('已確認');
    });
  });

  // =========================================
  // 8. Fallback
  // =========================================
  describe('Fallback', () => {
    it('empty text — no room, no action → confidence ≤ 0.1', () => {
      const result = parseWhatsAppMessage('');
      expect(result.confidence).toBeLessThanOrEqual(0.1);
      expect(result.action).toBeNull();
    });

    it('10F alone — room but no action → confidence 0.3', () => {
      const result = parseWhatsAppMessage('10F');
      expect(result.confidence).toBe(0.3);
      expect(result.action).toBeNull();
    });
  });
});

// =========================================
// 9. getDeptFromSender
// =========================================
describe('getDeptFromSender', () => {
  it('exact match: vic lee → eng', () => {
    expect(getDeptFromSender('vic lee')).toBe('eng');
  });

  it('unicode name: 𝕋𝕒𝕟𝕃 → eng', () => {
    expect(getDeptFromSender('𝕋𝕒𝕟𝕃')).toBe('eng');
  });

  it('case insensitive: VIC LEE → eng', () => {
    expect(getDeptFromSender('VIC LEE')).toBe('eng');
  });

  it('contains match: Michael Townplace → conc', () => {
    expect(getDeptFromSender('Michael Townplace')).toBe('conc');
  });

  it('karen disambiguation: karen townplace → mgmt', () => {
    expect(getDeptFromSender('karen townplace')).toBe('mgmt');
  });

  it('karen disambiguation: karen man → lease', () => {
    expect(getDeptFromSender('karen man')).toBe('lease');
  });

  it('karen disambiguation: karen lung → comm', () => {
    expect(getDeptFromSender('karen lung')).toBe('comm');
  });

  it('unknown sender → null', () => {
    expect(getDeptFromSender('unknown person')).toBeNull();
  });
});
