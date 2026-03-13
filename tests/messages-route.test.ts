import { describe, expect, it } from 'vitest';
import { isoNow, withTempWorkspace } from './helpers';

describe('Messages Route', () => {
  it('GET supports paged dashboard response with counts and has_more', async () => {
    await withTempWorkspace(async () => {
      const storeMod = await import('../src/lib/store');
      const { GET } = await import('../src/app/api/messages/route');

      await storeMod.withStoreWrite(store => {
        const now = isoNow();
        store.messages.push(
          {
            id: 'msg-direct-1',
            property_id: 'tp-soho',
            raw_text: '客人 direct message',
            sender_name: 'Guest',
            sender_dept: 'conc',
            wa_group: 'Guest',
            chat_name: 'Guest',
            chat_type: 'direct',
            sent_at: now,
            parsed_room: [],
            parsed_action: null,
            parsed_type: null,
            confidence: 0.12,
            parsed_explanation: 'test',
            parsed_by: 'rules',
            parsed_model: 'rule-engine',
            ai_classification: 'irrelevant',
            ai_classification_reason: 'test',
            created_at: now,
          },
          {
            id: 'msg-direct-2',
            property_id: 'tp-soho',
            raw_text: '另一條 direct message',
            sender_name: 'Guest',
            sender_dept: 'conc',
            wa_group: 'Guest',
            chat_name: 'Guest',
            chat_type: 'direct',
            sent_at: isoNow(1),
            parsed_room: ['10F'],
            parsed_action: null,
            parsed_type: null,
            confidence: 0.12,
            parsed_explanation: 'test',
            parsed_by: 'rules',
            parsed_model: 'rule-engine',
            ai_classification: 'context',
            ai_classification_reason: 'test',
            created_at: isoNow(1),
          },
          {
            id: 'msg-direct-3',
            property_id: 'tp-soho',
            raw_text: '第三條 direct message',
            sender_name: 'Guest',
            sender_dept: 'conc',
            wa_group: 'Guest',
            chat_name: 'Guest',
            chat_type: 'direct',
            sent_at: isoNow(2),
            parsed_room: ['19C'],
            parsed_action: null,
            parsed_type: null,
            confidence: 0.12,
            parsed_explanation: 'test',
            parsed_by: 'rules',
            parsed_model: 'rule-engine',
            ai_classification: 'context',
            ai_classification_reason: 'test',
            created_at: isoNow(2),
          }
        );
      });

      const response = await GET(new Request('http://localhost/api/messages?filter=direct&limit=2&offset=0'));
      expect(response.status).toBe(200);

      const data = await response.json() as {
        messages: Array<{ id: string; chat_type: string }>;
        counts: { direct: number; all: number };
        pagination: { total_filtered: number; returned: number; has_more: boolean };
      };

      expect(data.messages).toHaveLength(2);
      expect(data.messages.every(message => message.chat_type === 'direct')).toBe(true);
      expect(data.counts.direct).toBeGreaterThanOrEqual(3);
      expect(data.counts.all).toBeGreaterThanOrEqual(data.counts.direct);
      expect(data.pagination.total_filtered).toBeGreaterThanOrEqual(3);
      expect(data.pagination.returned).toBe(2);
      expect(data.pagination.has_more).toBe(true);
    });
  });

  it('GET review filter marks paged messages with needs_review', async () => {
    await withTempWorkspace(async () => {
      const storeMod = await import('../src/lib/store');
      const { GET } = await import('../src/app/api/messages/route');
      const now = isoNow();

      await storeMod.withStoreWrite(store => {
        store.messages.push({
          id: 'msg-review-only',
          property_id: 'tp-soho',
          raw_text: '2A finish',
          sender_name: 'Vic Lee',
          sender_dept: 'eng',
          wa_group: 'SOHO 前線🏡🧹🦫🐿️',
          chat_name: 'SOHO 前線🏡🧹🦫🐿️',
          chat_type: 'group',
          sent_at: now,
          parsed_room: ['2A'],
          parsed_action: null,
          parsed_type: null,
          confidence: 0.3,
          parsed_explanation: 'test',
          parsed_by: 'rules',
          parsed_model: 'rule-engine',
          ai_classification: 'review',
          ai_classification_reason: 'test',
          created_at: now,
        });
        store.parse_reviews.push({
          id: 'rev-review-only',
          property_id: 'tp-soho',
          message_id: 'msg-review-only',
          raw_text: '2A finish',
          sender_name: 'Vic Lee',
          sender_dept: 'eng',
          confidence: 0.3,
          suggested_rooms: ['2A'],
          suggested_action: null,
          suggested_type: null,
          suggested_from_dept: 'eng',
          suggested_to_dept: null,
          reviewed_rooms: ['2A'],
          reviewed_action: null,
          reviewed_type: null,
          reviewed_from_dept: 'eng',
          reviewed_to_dept: null,
          review_status: 'pending',
          reviewed_by: null,
          reviewed_at: null,
          created_at: now,
          updated_at: now,
          version: 1,
        });
      });

      const response = await GET(new Request('http://localhost/api/messages?filter=review&limit=10&offset=0'));
      const data = await response.json() as {
        messages: Array<{ id: string; needs_review?: boolean }>;
        pagination: { total_filtered: number };
      };

      expect(data.pagination.total_filtered).toBeGreaterThanOrEqual(1);
      expect(data.messages.some(message => message.id === 'msg-review-only' && message.needs_review === true)).toBe(true);
    });
  });
});
