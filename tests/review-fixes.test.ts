import { describe, expect, it } from 'vitest';
import { withTempWorkspace, jsonRequest, isoNow, makeRoom } from './helpers';

describe.sequential('Claude Review Fixes', () => {
    it('serializes concurrent store writes so both updates persist', async () => {
        await withTempWorkspace(async () => {
            const storeMod = await import('../src/lib/store');

            await Promise.all([
                storeMod.withStoreWrite(async store => {
                    await new Promise(resolve => setTimeout(resolve, 40));
                    store.followups.push({
                        id: 'fu-1',
                        property_id: 'tp-soho',
                        title: 'first',
                        description: 'first',
                        source_type: 'manual',
                        source_id: 'manual-1',
                        priority: 'info',
                        assigned_dept: 'mgmt',
                        assigned_to: null,
                        related_rooms: [],
                        status: 'open',
                        due_at: null,
                        created_at: isoNow(),
                        updated_at: isoNow(),
                        version: 1,
                    });
                }),
                storeMod.withStoreWrite(store => {
                    store.followups.push({
                        id: 'fu-2',
                        property_id: 'tp-soho',
                        title: 'second',
                        description: 'second',
                        source_type: 'manual',
                        source_id: 'manual-2',
                        priority: 'info',
                        assigned_dept: 'mgmt',
                        assigned_to: null,
                        related_rooms: [],
                        status: 'open',
                        due_at: null,
                        created_at: isoNow(),
                        updated_at: isoNow(),
                        version: 1,
                    });
                }),
            ]);

            const store = storeMod.getStore();
            const ids = store.followups.map(followup => followup.id);

            expect(ids).toContain('fu-1');
            expect(ids).toContain('fu-2');
        });
    });

    it('records document field_updated audits with exact field changes', async () => {
        await withTempWorkspace(async () => {
            const { PUT } = await import('../src/app/api/documents/route');

            const response = await PUT(jsonRequest('http://localhost/api/documents', 'PUT', {
                id: 'doc-001',
                actor: 'Tester',
                reason: '更新持有人與備註',
                current_holder: 'Leasing',
                notes: '已聯絡租客',
            }));

            expect(response.status).toBe(200);

            const data = await response.json() as {
                last_log: { action: string; changes: Array<{ field: string; from: string | null; to: string | null }> };
            };

            expect(data.last_log.action).toBe('field_updated');
            expect(data.last_log.changes).toEqual(
                expect.arrayContaining([
                    { field: 'current_holder', from: 'Concierge', to: 'Leasing' },
                    { field: 'notes', from: '退房文件處理中', to: '已聯絡租客' },
                ])
            );
        });
    });

    it('blocks repeated review approval and conflicting pending reviews', async () => {
        await withTempWorkspace(async () => {
            const storeMod = await import('../src/lib/store');
            const { PUT } = await import('../src/app/api/reviews/route');

            await storeMod.withStoreWrite(store => {
                const now = isoNow();
                store.messages.push({
                    id: 'msg-review-1',
                    property_id: 'tp-soho',
                    raw_text: '10F 已完成，可清潔',
                    sender_name: 'Vic Lee',
                    sender_dept: 'eng',
                    wa_group: 'SOHO 前線🏡🧹🦫🐿️',
                    chat_name: 'SOHO 前線🏡🧹🦫🐿️',
                    chat_type: 'group',
                    sent_at: now,
                    parsed_room: ['10F'],
                    parsed_action: '工程完成 → 可清潔',
                    parsed_type: 'handoff',
                    confidence: 0.95,
                    parsed_explanation: 'pending review',
                    parsed_by: 'rules',
                    parsed_model: 'rule-engine',
                    created_at: now,
                });
                store.parse_reviews.push({
                    id: 'rev-a',
                    property_id: 'tp-soho',
                    message_id: 'msg-review-1',
                    raw_text: '10F 已完成，可清潔',
                    sender_name: 'Vic Lee',
                    sender_dept: 'eng',
                    confidence: 0.95,
                    suggested_rooms: ['10F'],
                    suggested_action: '工程完成 → 可清潔',
                    suggested_type: 'handoff',
                    suggested_from_dept: 'eng',
                    suggested_to_dept: 'clean',
                    reviewed_rooms: ['10F'],
                    reviewed_action: '工程完成 → 可清潔',
                    reviewed_type: 'handoff',
                    reviewed_from_dept: 'eng',
                    reviewed_to_dept: 'clean',
                    review_status: 'pending',
                    reviewed_by: null,
                    reviewed_at: null,
                    created_at: now,
                    updated_at: now,
                    version: 1,
                });
            });

            const approved = await PUT(jsonRequest('http://localhost/api/reviews', 'PUT', {
                id: 'rev-a',
                review_status: 'approved',
                reviewed_by: 'Tester',
            }));
            expect(approved.status).toBe(200);

            const duplicate = await PUT(jsonRequest('http://localhost/api/reviews', 'PUT', {
                id: 'rev-a',
                review_status: 'approved',
                reviewed_by: 'Tester',
            }));
            expect(duplicate.status).toBe(409);

            await storeMod.withStoreWrite(store => {
                const now = isoNow();
                store.messages.push({
                    id: 'msg-review-2',
                    property_id: 'tp-soho',
                    raw_text: '10F 已完成，可清潔',
                    sender_name: 'Vic Lee',
                    sender_dept: 'eng',
                    wa_group: 'SOHO 前線🏡🧹🦫🐿️',
                    chat_name: 'SOHO 前線🏡🧹🦫🐿️',
                    chat_type: 'group',
                    sent_at: now,
                    parsed_room: ['10F'],
                    parsed_action: '工程完成 → 可清潔',
                    parsed_type: 'handoff',
                    confidence: 0.95,
                    parsed_explanation: 'pending review',
                    parsed_by: 'rules',
                    parsed_model: 'rule-engine',
                    created_at: now,
                });
                store.parse_reviews.push({
                    id: 'rev-b',
                    property_id: 'tp-soho',
                    message_id: 'msg-review-2',
                    raw_text: '10F 已完成，可清潔',
                    sender_name: 'Vic Lee',
                    sender_dept: 'eng',
                    confidence: 0.95,
                    suggested_rooms: ['10F'],
                    suggested_action: '工程完成 → 可清潔',
                    suggested_type: 'handoff',
                    suggested_from_dept: 'eng',
                    suggested_to_dept: 'clean',
                    reviewed_rooms: ['10F'],
                    reviewed_action: '工程完成 → 可清潔',
                    reviewed_type: 'handoff',
                    reviewed_from_dept: 'eng',
                    reviewed_to_dept: 'clean',
                    review_status: 'pending',
                    reviewed_by: null,
                    reviewed_at: null,
                    created_at: now,
                    updated_at: now,
                    version: 1,
                });
                store.parse_reviews.push({
                    id: 'rev-c',
                    property_id: 'tp-soho',
                    message_id: 'msg-review-2',
                    raw_text: '10F 已完成，可清潔',
                    sender_name: 'Vic Lee',
                    sender_dept: 'eng',
                    confidence: 0.95,
                    suggested_rooms: ['10F'],
                    suggested_action: '工程完成 → 可清潔',
                    suggested_type: 'handoff',
                    suggested_from_dept: 'eng',
                    suggested_to_dept: 'clean',
                    reviewed_rooms: ['10F'],
                    reviewed_action: '工程完成 → 可清潔',
                    reviewed_type: 'handoff',
                    reviewed_from_dept: 'eng',
                    reviewed_to_dept: 'clean',
                    review_status: 'pending',
                    reviewed_by: null,
                    reviewed_at: null,
                    created_at: now,
                    updated_at: now,
                    version: 1,
                });
            });

            const conflict = await PUT(jsonRequest('http://localhost/api/reviews', 'PUT', {
                id: 'rev-b',
                review_status: 'approved',
                reviewed_by: 'Tester',
            }));
            expect(conflict.status).toBe(409);
        });
    });

    it('deduplicates notifications, ignores far-future booking conflicts, and suppresses overlapping suggestions', async () => {
        await withTempWorkspace(async () => {
            const storeMod = await import('../src/lib/store');
            const { generateNotifications } = await import('../src/lib/notifications');
            const { generateSuggestions } = await import('../src/lib/suggestions');

            await storeMod.withStoreWrite(store => {
                store.rooms = [
                    makeRoom('10F', {
                        eng_status: 'completed',
                        clean_status: 'pending',
                        needs_attention: true,
                        attention_reason: '待清潔接手',
                    }),
                    makeRoom('20A', {
                        eng_status: 'pending',
                        clean_status: 'pending',
                        needs_attention: true,
                        attention_reason: '工程及清潔未完成',
                    }),
                ];
                store.documents = [{
                    id: 'doc-notif-1',
                    property_id: 'tp-soho',
                    room_id: '10F',
                    doc_type: 'Inventory',
                    status: 'preparing',
                    current_holder: 'Concierge',
                    days_outstanding: 6,
                    notes: null,
                    updated_at: isoNow(),
                    version: 1,
                }];
                store.followups = [{
                    id: 'fu-urgent-due',
                    property_id: 'tp-soho',
                    title: 'urgent',
                    description: 'urgent',
                    source_type: 'manual',
                    source_id: 'manual-urgent',
                    priority: 'urgent',
                    assigned_dept: 'eng',
                    assigned_to: null,
                    related_rooms: ['10F'],
                    status: 'open',
                    due_at: isoNow(60 * 60 * 1000),
                    created_at: isoNow(),
                    updated_at: isoNow(),
                    version: 1,
                }];
                store.bookings = [{
                    id: 'bk-future',
                    property_id: 'tp-soho',
                    room_id: '20A',
                    facility: null,
                    booking_type: 'viewing',
                    scheduled_at: isoNow(7 * 24 * 60 * 60 * 1000),
                    duration_minutes: 30,
                    booked_by: 'Angel',
                    dept: 'lease',
                    notes: null,
                    created_at: isoNow(),
                }];
                store.handoffs = [];
                store.parse_reviews = [];
                store.messages = [];
                store.audit_logs = [];
            });

            const notifications = generateNotifications();
            const suggestions = generateSuggestions();

            expect(notifications.some(notification => notification.type === 'booking_conflict')).toBe(false);

            const followupNotifications = notifications.filter(
                notification => notification.type === 'followup_urgent' || notification.type === 'followup_due'
            );
            expect(followupNotifications).toHaveLength(1);
            expect(followupNotifications[0].type).toBe('followup_urgent');

            const documentNotification = notifications.find(notification => notification.type === 'doc_overdue');
            expect(documentNotification?.related_dept).toBe('conc');

            expect(suggestions.some(suggestion => suggestion.category === 'cleaning_backlog')).toBe(false);
            expect(suggestions.some(suggestion => suggestion.category === 'document_overdue')).toBe(false);
            expect(suggestions.some(suggestion => suggestion.category === 'checkout_followup')).toBe(false);
        });
    });

    it('parses Android English export, strips BOM, and skips system/media lines during upload', async () => {
        await withTempWorkspace(async () => {
            const { POST } = await import('../src/app/api/upload/route');
            const text = [
                '\uFEFF03/11/26, 9:15 AM - Vic Lee: 10F 已完成，可清潔',
                '03/11/26, 9:16 AM - Messages and calls are end-to-end encrypted.',
                '03/11/26, 9:17 AM - Vic Lee: <Media omitted>',
                '03/11/26, 9:18 AM - Vic Lee: 23D 已完成油漆',
            ].join('\n');

            const formData = new FormData();
            formData.append('file', new File([text], 'WhatsApp Chat - Test.txt', { type: 'text/plain' }));

            const response = await POST(new Request('http://localhost/api/upload', {
                method: 'POST',
                body: formData,
            }));

            expect(response.status).toBe(200);

            const data = await response.json() as {
                parsed_messages: number;
                handoffs_created: number;
                messages: Array<{ raw_text: string; parsed_action: string | null }>;
            };

            expect(data.parsed_messages).toBe(2);
            expect(data.handoffs_created).toBe(1);
            expect(data.messages.map(message => message.raw_text)).toEqual([
                '10F 已完成，可清潔',
                '23D 已完成油漆',
            ]);
            expect(data.messages[1].parsed_action).not.toBe('工程完成 → 可清潔');
        });
    });
});
