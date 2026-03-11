import { describe, expect, it } from 'vitest';
import { withTempWorkspace } from './helpers';

describe.sequential('Store Module', () => {
    it('getStore returns normalized data with all required fields', async () => {
        await withTempWorkspace(async () => {
            const storeMod = await import('../src/lib/store');
            const store = storeMod.getStore();

            expect(store).toHaveProperty('properties');
            expect(store).toHaveProperty('users');
            expect(store).toHaveProperty('rooms');
            expect(store).toHaveProperty('messages');
            expect(store).toHaveProperty('handoffs');
            expect(store).toHaveProperty('documents');
            expect(store).toHaveProperty('bookings');
            expect(store).toHaveProperty('followups');
            expect(store).toHaveProperty('parse_reviews');
            expect(store).toHaveProperty('audit_logs');

            expect(Array.isArray(store.rooms)).toBe(true);
            expect(Array.isArray(store.messages)).toBe(true);
        });
    });

    it('seed data has rooms, messages, handoffs, documents, bookings', async () => {
        await withTempWorkspace(async () => {
            const storeMod = await import('../src/lib/store');
            const store = storeMod.getStore();

            expect(store.rooms.length).toBeGreaterThan(0);
            expect(store.messages.length).toBeGreaterThan(0);
            expect(store.handoffs.length).toBeGreaterThan(0);
            expect(store.documents.length).toBeGreaterThan(0);
            expect(store.bookings.length).toBeGreaterThan(0);
        });
    });

    it('normalizeStore fills missing fields (version, property_id, etc.)', async () => {
        await withTempWorkspace(async () => {
            const storeMod = await import('../src/lib/store');
            const store = storeMod.getStore();

            // All rooms should have property_id and version
            for (const room of store.rooms) {
                expect(room.property_id).toBe('tp-soho');
                expect(typeof room.version).toBe('number');
                expect(room.version).toBeGreaterThanOrEqual(1);
                expect(typeof room.needs_attention).toBe('boolean');
            }

            // All messages should have property_id and parsed_by
            for (const msg of store.messages) {
                expect(msg.property_id).toBe('tp-soho');
                expect(typeof msg.parsed_by).toBe('string');
                expect(typeof msg.parsed_explanation).toBe('string');
            }
        });
    });

    it('withStoreWrite persists changes', async () => {
        await withTempWorkspace(async () => {
            const storeMod = await import('../src/lib/store');

            const originalCount = storeMod.getStore().messages.length;

            await storeMod.withStoreWrite((store: any) => {
                store.messages.push({
                    id: 'msg-test-persist',
                    property_id: 'tp-soho',
                    raw_text: '測試持久化',
                    sender_name: 'Tester',
                    sender_dept: 'eng',
                    wa_group: 'Test',
                    chat_name: 'Test',
                    chat_type: 'group',
                    sent_at: new Date().toISOString(),
                    parsed_room: [],
                    parsed_action: null,
                    parsed_type: null,
                    confidence: 0,
                    parsed_explanation: 'test',
                    parsed_by: 'rules',
                    parsed_model: 'rule-engine',
                    created_at: new Date().toISOString(),
                });
            });

            const updatedStore = storeMod.getStore();
            expect(updatedStore.messages.length).toBe(originalCount + 1);
            expect(updatedStore.messages.find((m: any) => m.id === 'msg-test-persist')).toBeDefined();
        });
    });

    it('resetStore returns to seed state', async () => {
        await withTempWorkspace(async () => {
            const storeMod = await import('../src/lib/store');

            // Make a change
            await storeMod.withStoreWrite((store: any) => {
                store.messages.push({
                    id: 'msg-to-be-reset',
                    property_id: 'tp-soho',
                    raw_text: '即將被重置',
                    sender_name: 'Tester',
                    sender_dept: 'eng',
                    wa_group: 'Test',
                    chat_name: 'Test',
                    chat_type: 'group',
                    sent_at: new Date().toISOString(),
                    parsed_room: [],
                    parsed_action: null,
                    parsed_type: null,
                    confidence: 0,
                    parsed_explanation: 'test',
                    parsed_by: 'rules',
                    parsed_model: 'rule-engine',
                    created_at: new Date().toISOString(),
                });
            });

            // Verify it was added
            const modified = storeMod.getStore();
            expect(modified.messages.find((m: any) => m.id === 'msg-to-be-reset')).toBeDefined();

            // Reset
            storeMod.resetStore();

            // Verify it's gone
            const reset = storeMod.getStore();
            expect(reset.messages.find((m: any) => m.id === 'msg-to-be-reset')).toBeUndefined();
        });
    });

    it('multiple sequential writes maintain data', async () => {
        await withTempWorkspace(async () => {
            const storeMod = await import('../src/lib/store');

            await storeMod.withStoreWrite((store: any) => {
                store.followups.push({
                    id: 'fu-write-1',
                    property_id: 'tp-soho',
                    title: '第一次寫入',
                    description: '',
                    source_type: 'manual',
                    source_id: '',
                    priority: 'info',
                    assigned_dept: 'eng',
                    assigned_to: null,
                    related_rooms: [],
                    status: 'open',
                    due_at: null,
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                    version: 1,
                });
            });

            await storeMod.withStoreWrite((store: any) => {
                store.followups.push({
                    id: 'fu-write-2',
                    property_id: 'tp-soho',
                    title: '第二次寫入',
                    description: '',
                    source_type: 'manual',
                    source_id: '',
                    priority: 'info',
                    assigned_dept: 'clean',
                    assigned_to: null,
                    related_rooms: [],
                    status: 'open',
                    due_at: null,
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                    version: 1,
                });
            });

            const store = storeMod.getStore();
            expect(store.followups.find((f: any) => f.id === 'fu-write-1')).toBeDefined();
            expect(store.followups.find((f: any) => f.id === 'fu-write-2')).toBeDefined();
        });
    });

    it('room count matches expected (25 floors x 17 units + floor 31 x 12 units = 437)', async () => {
        await withTempWorkspace(async () => {
            const storeMod = await import('../src/lib/store');
            const store = storeMod.getStore();
            expect(store.rooms.length).toBe(437);
        });
    });

    it('seed messages are parsed with correct actions', async () => {
        await withTempWorkspace(async () => {
            const storeMod = await import('../src/lib/store');
            const store = storeMod.getStore();

            // '10F 已完成，可清潔' → should parse action containing '可清潔'
            const msg10F = store.messages.find((m: any) => m.raw_text.includes('10F 已完成'));
            expect(msg10F).toBeDefined();
            expect(msg10F!.parsed_room).toContain('10F');
            expect(msg10F!.parsed_action).toBeTruthy();

            // '18A執修' → should parse as '執修中'
            const msg18A = store.messages.find((m: any) => m.raw_text === '18A執修');
            expect(msg18A).toBeDefined();
            expect(msg18A!.parsed_room).toContain('18A');
            expect(msg18A!.parsed_action).toContain('執修');
        });
    });
});
