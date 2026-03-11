import { describe, expect, it } from 'vitest';
import { withTempWorkspace, makeRoom, isoNow } from './helpers';

describe.sequential('Notification Engine', () => {
    it('handoff timeout: pending handoff older than 2 hours → handoff_timeout notification', async () => {
        await withTempWorkspace(async () => {
            const storeMod = await import('../src/lib/store');
            const { generateNotifications } = await import('../src/lib/notifications');

            await storeMod.withStoreWrite((store: any) => {
                store.handoffs.push({
                    id: 'ho-timeout-1',
                    property_id: 'tp-soho',
                    room_id: '10F',
                    from_dept: 'eng',
                    to_dept: 'clean',
                    action: '工程完成 → 可清潔',
                    status: 'pending',
                    triggered_by: 'msg-1',
                    created_at: isoNow(-3 * 60 * 60 * 1000), // 3 hours ago
                    acknowledged_at: null,
                    version: 1,
                });
            });

            const notifications = generateNotifications();
            const timeout = notifications.find(n => n.type === 'handoff_timeout');
            expect(timeout).toBeDefined();
            expect(timeout!.level).toBe('critical');
            expect(timeout!.related_rooms).toContain('10F');
        });
    });

    it('handoff NOT timed out: pending handoff less than 2 hours → no handoff_timeout', async () => {
        await withTempWorkspace(async () => {
            const storeMod = await import('../src/lib/store');
            const { generateNotifications } = await import('../src/lib/notifications');

            await storeMod.withStoreWrite((store: any) => {
                // Clear existing handoffs to isolate this test
                store.handoffs = [{
                    id: 'ho-recent-1',
                    property_id: 'tp-soho',
                    room_id: '10F',
                    from_dept: 'eng',
                    to_dept: 'clean',
                    action: '工程完成 → 可清潔',
                    status: 'pending',
                    triggered_by: 'msg-1',
                    created_at: isoNow(-30 * 60 * 1000), // 30 minutes ago
                    acknowledged_at: null,
                    version: 1,
                }];
            });

            const notifications = generateNotifications();
            const timeout = notifications.find(n => n.type === 'handoff_timeout');
            expect(timeout).toBeUndefined();
        });
    });

    it('document overdue critical: days_outstanding > 5 → doc_overdue at critical level', async () => {
        await withTempWorkspace(async () => {
            const storeMod = await import('../src/lib/store');
            const { generateNotifications } = await import('../src/lib/notifications');

            await storeMod.withStoreWrite((store: any) => {
                store.documents = [{
                    id: 'doc-crit-1',
                    property_id: 'tp-soho',
                    room_id: '10F',
                    doc_type: 'Newlet',
                    status: 'preparing',
                    current_holder: 'Leasing',
                    days_outstanding: 7,
                    notes: null,
                    updated_at: isoNow(),
                    version: 1,
                }];
            });

            const notifications = generateNotifications();
            const overdue = notifications.find(n => n.type === 'doc_overdue' && n.level === 'critical');
            expect(overdue).toBeDefined();
            expect(overdue!.related_rooms).toContain('10F');
        });
    });

    it('document overdue warning: days_outstanding > 3 && <= 5 → doc_overdue at warning level', async () => {
        await withTempWorkspace(async () => {
            const storeMod = await import('../src/lib/store');
            const { generateNotifications } = await import('../src/lib/notifications');

            await storeMod.withStoreWrite((store: any) => {
                store.documents = [{
                    id: 'doc-warn-1',
                    property_id: 'tp-soho',
                    room_id: '23D',
                    doc_type: 'TA',
                    status: 'with_tenant',
                    current_holder: '租客',
                    days_outstanding: 4,
                    notes: null,
                    updated_at: isoNow(),
                    version: 1,
                }];
            });

            const notifications = generateNotifications();
            const overdue = notifications.find(n => n.type === 'doc_overdue' && n.level === 'warning');
            expect(overdue).toBeDefined();
            expect(overdue!.related_rooms).toContain('23D');
        });
    });

    it('booking conflict: room with eng_status=pending and upcoming booking → booking_conflict', async () => {
        await withTempWorkspace(async () => {
            const storeMod = await import('../src/lib/store');
            const { generateNotifications } = await import('../src/lib/notifications');

            const roomId = '25B';

            await storeMod.withStoreWrite((store: any) => {
                // Ensure the room has eng_status=pending
                const room = store.rooms.find((r: any) => r.id === roomId);
                if (room) {
                    room.eng_status = 'pending';
                }

                // Add a booking scheduled within 48 hours
                store.bookings = [{
                    id: 'bk-conflict-1',
                    property_id: 'tp-soho',
                    room_id: roomId,
                    facility: null,
                    booking_type: 'viewing',
                    scheduled_at: isoNow(12 * 60 * 60 * 1000), // 12 hours from now
                    duration_minutes: 30,
                    booked_by: 'Angel',
                    dept: 'lease',
                    notes: null,
                    created_at: isoNow(),
                }];
            });

            const notifications = generateNotifications();
            const conflict = notifications.find(n => n.type === 'booking_conflict');
            expect(conflict).toBeDefined();
            expect(conflict!.level).toBe('critical');
            expect(conflict!.related_rooms).toContain(roomId);
        });
    });

    it('far-future booking: booking > 48h away → no booking_conflict', async () => {
        await withTempWorkspace(async () => {
            const storeMod = await import('../src/lib/store');
            const { generateNotifications } = await import('../src/lib/notifications');

            await storeMod.withStoreWrite((store: any) => {
                const room = store.rooms.find((r: any) => r.id === '25B');
                if (room) {
                    room.eng_status = 'pending';
                }

                store.bookings = [{
                    id: 'bk-future-1',
                    property_id: 'tp-soho',
                    room_id: '25B',
                    facility: null,
                    booking_type: 'viewing',
                    scheduled_at: isoNow(72 * 60 * 60 * 1000), // 72 hours from now
                    duration_minutes: 30,
                    booked_by: 'Angel',
                    dept: 'lease',
                    notes: null,
                    created_at: isoNow(),
                }];
            });

            const notifications = generateNotifications();
            const conflict = notifications.find(n => n.type === 'booking_conflict');
            expect(conflict).toBeUndefined();
        });
    });

    it('pending reviews → review_pending notification', async () => {
        await withTempWorkspace(async () => {
            const storeMod = await import('../src/lib/store');
            const { generateNotifications } = await import('../src/lib/notifications');

            await storeMod.withStoreWrite((store: any) => {
                store.parse_reviews = [{
                    id: 'rev-1',
                    property_id: 'tp-soho',
                    message_id: 'msg-1',
                    raw_text: '盡做',
                    sender_name: 'Tester',
                    sender_dept: 'eng',
                    confidence: 0.4,
                    suggested_rooms: ['10F'],
                    suggested_action: null,
                    suggested_type: null,
                    suggested_from_dept: null,
                    suggested_to_dept: null,
                    reviewed_rooms: [],
                    reviewed_action: null,
                    reviewed_type: null,
                    reviewed_from_dept: null,
                    reviewed_to_dept: null,
                    review_status: 'pending',
                    reviewed_by: null,
                    reviewed_at: null,
                    created_at: isoNow(),
                    updated_at: isoNow(),
                    version: 1,
                }];
            });

            const notifications = generateNotifications();
            const review = notifications.find(n => n.type === 'review_pending');
            expect(review).toBeDefined();
            expect(review!.level).toBe('warning');
        });
    });

    it('urgent followups → followup_urgent notification', async () => {
        await withTempWorkspace(async () => {
            const storeMod = await import('../src/lib/store');
            const { generateNotifications } = await import('../src/lib/notifications');

            await storeMod.withStoreWrite((store: any) => {
                store.followups = [{
                    id: 'fu-urgent-1',
                    property_id: 'tp-soho',
                    title: '緊急跟進測試',
                    description: '測試緊急跟進',
                    source_type: 'manual',
                    source_id: '',
                    priority: 'urgent',
                    assigned_dept: 'eng',
                    assigned_to: null,
                    related_rooms: ['10F'],
                    status: 'open',
                    due_at: null,
                    created_at: isoNow(),
                    updated_at: isoNow(),
                    version: 1,
                }];
            });

            const notifications = generateNotifications();
            const urgent = notifications.find(n => n.type === 'followup_urgent');
            expect(urgent).toBeDefined();
            expect(urgent!.level).toBe('critical');
            expect(urgent!.related_rooms).toContain('10F');
        });
    });

    it('followup due within 24h → followup_due notification', async () => {
        await withTempWorkspace(async () => {
            const storeMod = await import('../src/lib/store');
            const { generateNotifications } = await import('../src/lib/notifications');

            await storeMod.withStoreWrite((store: any) => {
                store.followups = [{
                    id: 'fu-due-1',
                    property_id: 'tp-soho',
                    title: '即將到期跟進',
                    description: '測試即將到期',
                    source_type: 'manual',
                    source_id: '',
                    priority: 'info',
                    assigned_dept: 'clean',
                    assigned_to: null,
                    related_rooms: ['23D'],
                    status: 'open',
                    due_at: isoNow(6 * 60 * 60 * 1000), // due in 6 hours
                    created_at: isoNow(),
                    updated_at: isoNow(),
                    version: 1,
                }];
            });

            const notifications = generateNotifications();
            const due = notifications.find(n => n.type === 'followup_due');
            expect(due).toBeDefined();
            expect(due!.level).toBe('warning');
        });
    });

    it('checkout rooms → checkout_pending notification', async () => {
        await withTempWorkspace(async () => {
            const storeMod = await import('../src/lib/store');
            const { generateNotifications } = await import('../src/lib/notifications');

            // Seed store already has checkout rooms (17J, 8J), just verify the notification
            const notifications = generateNotifications();
            const checkout = notifications.find(n => n.type === 'checkout_pending');
            expect(checkout).toBeDefined();
            expect(checkout!.level).toBe('warning');
            expect(checkout!.related_rooms.length).toBeGreaterThan(0);
        });
    });

    it('cleaning waiting: eng=completed + clean=pending → cleaning_waiting', async () => {
        await withTempWorkspace(async () => {
            const storeMod = await import('../src/lib/store');
            const { generateNotifications } = await import('../src/lib/notifications');

            // Seed data already has rooms like 10F with eng_status=completed, clean_status=pending
            const notifications = generateNotifications();
            const cleaning = notifications.find(n => n.type === 'cleaning_waiting');
            expect(cleaning).toBeDefined();
            expect(cleaning!.level).toBe('warning');
            expect(cleaning!.related_rooms.length).toBeGreaterThan(0);
        });
    });

    it('custom thresholds: shorter handoff timeout triggers notification', async () => {
        await withTempWorkspace(async () => {
            const storeMod = await import('../src/lib/store');
            const { generateNotifications } = await import('../src/lib/notifications');

            await storeMod.withStoreWrite((store: any) => {
                store.handoffs.push({
                    id: 'ho-custom-1',
                    property_id: 'tp-soho',
                    room_id: '10F',
                    from_dept: 'eng',
                    to_dept: 'clean',
                    action: '工程完成 → 可清潔',
                    status: 'pending',
                    triggered_by: 'msg-1',
                    created_at: isoNow(-10 * 60 * 1000), // 10 minutes ago
                    acknowledged_at: null,
                    version: 1,
                });
            });

            // With a very short timeout (5 minutes), the 10-minute-old handoff should timeout
            const notifications = generateNotifications({
                handoffTimeoutMs: 5 * 60 * 1000, // 5 minutes
                docOverdueCriticalDays: 5,
                docOverdueWarningDays: 3,
                bookingConflictLookaheadMs: 48 * 60 * 60 * 1000,
                bookingConflictGraceMs: 12 * 60 * 60 * 1000,
                followupDueLookaheadMs: 24 * 60 * 60 * 1000,
            });
            const timeout = notifications.find(n => n.type === 'handoff_timeout');
            expect(timeout).toBeDefined();
        });
    });

    it('notifications sorted by level (critical first)', async () => {
        await withTempWorkspace(async () => {
            const storeMod = await import('../src/lib/store');
            const { generateNotifications } = await import('../src/lib/notifications');

            await storeMod.withStoreWrite((store: any) => {
                // Add a timed-out handoff (critical)
                store.handoffs.push({
                    id: 'ho-sort-1',
                    property_id: 'tp-soho',
                    room_id: '10F',
                    from_dept: 'eng',
                    to_dept: 'clean',
                    action: '工程完成 → 可清潔',
                    status: 'pending',
                    triggered_by: 'msg-1',
                    created_at: isoNow(-3 * 60 * 60 * 1000), // 3 hours ago → critical
                    acknowledged_at: null,
                    version: 1,
                });

                // Add a pending review (warning)
                store.parse_reviews = [{
                    id: 'rev-sort-1',
                    property_id: 'tp-soho',
                    message_id: 'msg-2',
                    raw_text: 'test',
                    sender_name: 'Tester',
                    sender_dept: 'eng',
                    confidence: 0.4,
                    suggested_rooms: [],
                    suggested_action: null,
                    suggested_type: null,
                    suggested_from_dept: null,
                    suggested_to_dept: null,
                    reviewed_rooms: [],
                    reviewed_action: null,
                    reviewed_type: null,
                    reviewed_from_dept: null,
                    reviewed_to_dept: null,
                    review_status: 'pending',
                    reviewed_by: null,
                    reviewed_at: null,
                    created_at: isoNow(),
                    updated_at: isoNow(),
                    version: 1,
                }];
            });

            const notifications = generateNotifications();
            expect(notifications.length).toBeGreaterThanOrEqual(2);

            // All critical notifications should come before warning/info
            let seenNonCritical = false;
            for (const n of notifications) {
                if (n.level !== 'critical') seenNonCritical = true;
                if (seenNonCritical && n.level === 'critical') {
                    throw new Error('Critical notification found after non-critical');
                }
            }
        });
    });
});
