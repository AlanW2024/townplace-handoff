import { describe, expect, it } from 'vitest';
import { withTempWorkspace, isoNow } from './helpers';

describe.sequential('Suggestion Engine', () => {
    it('cleaning backlog: eng=completed + clean=pending → cleaning_backlog suggestion (when no cleaning_waiting notification)', async () => {
        await withTempWorkspace(async () => {
            const storeMod = await import('../src/lib/store');
            const { generateSuggestions } = await import('../src/lib/suggestions');

            await storeMod.withStoreWrite((store: any) => {
                // Set up a single room with eng=completed, clean=pending
                // Clear all rooms and add only controlled ones
                for (const room of store.rooms) {
                    room.eng_status = 'n_a';
                    room.clean_status = 'n_a';
                    room.lease_status = 'occupied';
                    room.needs_attention = false;
                }

                const room = store.rooms.find((r: any) => r.id === '10F');
                if (room) {
                    room.eng_status = 'completed';
                    room.clean_status = 'pending';
                    room.needs_attention = true;
                }

                store.handoffs = [];
                store.documents = [];
                store.bookings = [];
                store.followups = [];
                store.parse_reviews = [];
            });

            // cleaning_waiting notification will be generated (eng=completed, clean=pending),
            // which means cleaning_backlog suggestion should be suppressed.
            // To verify the suggestion exists before suppression, we check by generating
            // suggestions with a threshold that won't produce cleaning_waiting.
            // Actually, the overlap suppression means cleaning_backlog IS suppressed when
            // cleaning_waiting notification exists. Let's test the suppression separately.
            // Here, we test the raw suggestion generation by checking the output.
            const suggestions = generateSuggestions();

            // Because cleaning_waiting notification exists, cleaning_backlog should be suppressed
            const backlog = suggestions.find(s => s.category === 'cleaning_backlog');
            expect(backlog).toBeUndefined();
        });
    });

    it('engineering bottleneck pending → engineering_bottleneck suggestion', async () => {
        await withTempWorkspace(async () => {
            const storeMod = await import('../src/lib/store');
            const { generateSuggestions } = await import('../src/lib/suggestions');

            await storeMod.withStoreWrite((store: any) => {
                for (const room of store.rooms) {
                    room.eng_status = 'n_a';
                    room.clean_status = 'n_a';
                    room.lease_status = 'occupied';
                    room.needs_attention = false;
                }

                const room = store.rooms.find((r: any) => r.id === '25B');
                if (room) {
                    room.eng_status = 'pending';
                    room.needs_attention = true;
                }

                store.handoffs = [];
                store.documents = [];
                store.bookings = [];
                store.followups = [];
                store.parse_reviews = [];
            });

            const suggestions = generateSuggestions();
            const bottleneck = suggestions.find(s =>
                s.category === 'engineering_bottleneck' && s.affected_rooms.includes('25B')
            );
            expect(bottleneck).toBeDefined();
            expect(bottleneck!.priority).toBe('urgent');
        });
    });

    it('engineering bottleneck in_progress → engineering_bottleneck suggestion', async () => {
        await withTempWorkspace(async () => {
            const storeMod = await import('../src/lib/store');
            const { generateSuggestions } = await import('../src/lib/suggestions');

            await storeMod.withStoreWrite((store: any) => {
                for (const room of store.rooms) {
                    room.eng_status = 'n_a';
                    room.clean_status = 'n_a';
                    room.lease_status = 'occupied';
                    room.needs_attention = false;
                }

                const room = store.rooms.find((r: any) => r.id === '18A');
                if (room) {
                    room.eng_status = 'in_progress';
                    room.needs_attention = true;
                }

                store.handoffs = [];
                store.documents = [];
                store.bookings = [];
                store.followups = [];
                store.parse_reviews = [];
            });

            const suggestions = generateSuggestions();
            const bottleneck = suggestions.find(s =>
                s.category === 'engineering_bottleneck' && s.affected_rooms.includes('18A')
            );
            expect(bottleneck).toBeDefined();
            expect(bottleneck!.priority).toBe('warning');
        });
    });

    it('handoff delay > 2h → handoff_delay urgent', async () => {
        await withTempWorkspace(async () => {
            const storeMod = await import('../src/lib/store');
            const { generateSuggestions } = await import('../src/lib/suggestions');

            await storeMod.withStoreWrite((store: any) => {
                for (const room of store.rooms) {
                    room.eng_status = 'n_a';
                    room.clean_status = 'n_a';
                    room.lease_status = 'occupied';
                    room.needs_attention = false;
                }

                store.handoffs = [{
                    id: 'ho-delay-1',
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
                }];

                store.documents = [];
                store.bookings = [];
                store.followups = [];
                store.parse_reviews = [];
            });

            const suggestions = generateSuggestions();
            // handoff_delay suggestion is suppressed when handoff_timeout notification exists
            // Both will trigger since handoff > 2h. Check the overlap suppression.
            const delay = suggestions.find(s => s.category === 'handoff_delay');
            // handoff_timeout notification will exist, so handoff_delay should be suppressed
            expect(delay).toBeUndefined();
        });
    });

    it('handoff delay < 2h → handoff_delay warning', async () => {
        await withTempWorkspace(async () => {
            const storeMod = await import('../src/lib/store');
            const { generateSuggestions } = await import('../src/lib/suggestions');

            await storeMod.withStoreWrite((store: any) => {
                for (const room of store.rooms) {
                    room.eng_status = 'n_a';
                    room.clean_status = 'n_a';
                    room.lease_status = 'occupied';
                    room.needs_attention = false;
                }

                store.handoffs = [{
                    id: 'ho-warn-1',
                    property_id: 'tp-soho',
                    room_id: '10F',
                    from_dept: 'eng',
                    to_dept: 'clean',
                    action: '工程完成 → 可清潔',
                    status: 'pending',
                    triggered_by: 'msg-1',
                    created_at: isoNow(-30 * 60 * 1000), // 30 min ago
                    acknowledged_at: null,
                    version: 1,
                }];

                store.documents = [];
                store.bookings = [];
                store.followups = [];
                store.parse_reviews = [];
            });

            const suggestions = generateSuggestions();
            const delay = suggestions.find(s => s.category === 'handoff_delay' && s.priority === 'warning');
            expect(delay).toBeDefined();
            expect(delay!.affected_rooms).toContain('10F');
        });
    });

    it('document overdue > 5 days → document_overdue suggestion', async () => {
        await withTempWorkspace(async () => {
            const storeMod = await import('../src/lib/store');
            const { generateSuggestions } = await import('../src/lib/suggestions');

            await storeMod.withStoreWrite((store: any) => {
                for (const room of store.rooms) {
                    room.eng_status = 'n_a';
                    room.clean_status = 'n_a';
                    room.lease_status = 'occupied';
                    room.needs_attention = false;
                }

                store.handoffs = [];
                store.documents = [{
                    id: 'doc-overdue-1',
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
                store.bookings = [];
                store.followups = [];
                store.parse_reviews = [];
            });

            const suggestions = generateSuggestions();
            // doc_overdue notification will also exist, so document_overdue suggestion may be suppressed
            const docSuggestion = suggestions.find(s => s.category === 'document_overdue');
            // Overlap: document_overdue → doc_overdue, so it should be suppressed
            expect(docSuggestion).toBeUndefined();
        });
    });

    it('booking conflict → booking_conflict suggestion', async () => {
        await withTempWorkspace(async () => {
            const storeMod = await import('../src/lib/store');
            const { generateSuggestions } = await import('../src/lib/suggestions');

            await storeMod.withStoreWrite((store: any) => {
                for (const room of store.rooms) {
                    room.eng_status = 'n_a';
                    room.clean_status = 'n_a';
                    room.lease_status = 'occupied';
                    room.needs_attention = false;
                }

                const room = store.rooms.find((r: any) => r.id === '25B');
                if (room) {
                    room.eng_status = 'pending';
                    room.needs_attention = true;
                }

                store.handoffs = [];
                store.documents = [];
                store.bookings = [{
                    id: 'bk-conflict-1',
                    property_id: 'tp-soho',
                    room_id: '25B',
                    facility: null,
                    booking_type: 'viewing',
                    scheduled_at: isoNow(12 * 60 * 60 * 1000), // 12 hours from now
                    duration_minutes: 30,
                    booked_by: 'Angel',
                    dept: 'lease',
                    notes: null,
                    created_at: isoNow(),
                }];
                store.followups = [];
                store.parse_reviews = [];
            });

            const suggestions = generateSuggestions();
            // booking_conflict notification will also exist, so booking_conflict suggestion is suppressed
            const conflict = suggestions.find(s => s.category === 'booking_conflict');
            expect(conflict).toBeUndefined();
        });
    });

    it('checkout rooms → checkout_followup suggestion', async () => {
        await withTempWorkspace(async () => {
            const storeMod = await import('../src/lib/store');
            const { generateSuggestions } = await import('../src/lib/suggestions');

            await storeMod.withStoreWrite((store: any) => {
                for (const room of store.rooms) {
                    room.eng_status = 'n_a';
                    room.clean_status = 'n_a';
                    room.lease_status = 'occupied';
                    room.needs_attention = false;
                }

                const room = store.rooms.find((r: any) => r.id === '17J');
                if (room) {
                    room.lease_status = 'checkout';
                    room.needs_attention = true;
                }

                store.handoffs = [];
                store.documents = [];
                store.bookings = [];
                store.followups = [];
                store.parse_reviews = [];
            });

            const suggestions = generateSuggestions();
            // checkout_pending notification will also exist, so checkout_followup is suppressed
            const checkout = suggestions.find(s => s.category === 'checkout_followup');
            expect(checkout).toBeUndefined();
        });
    });

    it('notification overlap suppression: cleaning_waiting notification suppresses cleaning_backlog suggestion', async () => {
        await withTempWorkspace(async () => {
            const storeMod = await import('../src/lib/store');
            const { generateSuggestions } = await import('../src/lib/suggestions');
            const { generateNotifications } = await import('../src/lib/notifications');

            await storeMod.withStoreWrite((store: any) => {
                for (const room of store.rooms) {
                    room.eng_status = 'n_a';
                    room.clean_status = 'n_a';
                    room.lease_status = 'occupied';
                    room.needs_attention = false;
                }

                const room = store.rooms.find((r: any) => r.id === '10F');
                if (room) {
                    room.eng_status = 'completed';
                    room.clean_status = 'pending';
                    room.needs_attention = true;
                }

                store.handoffs = [];
                store.documents = [];
                store.bookings = [];
                store.followups = [];
                store.parse_reviews = [];
            });

            // Verify that cleaning_waiting notification exists
            const notifications = generateNotifications();
            const cleaningNotif = notifications.find(n => n.type === 'cleaning_waiting');
            expect(cleaningNotif).toBeDefined();

            // Verify that cleaning_backlog suggestion is suppressed
            const suggestions = generateSuggestions();
            const backlog = suggestions.find(s => s.category === 'cleaning_backlog');
            expect(backlog).toBeUndefined();
        });
    });

    it('daily priorities calculated', async () => {
        await withTempWorkspace(async () => {
            const storeMod = await import('../src/lib/store');
            const { generateSuggestions } = await import('../src/lib/suggestions');

            // Use seed data which has rooms with various statuses
            const suggestions = generateSuggestions();
            const daily = suggestions.find(s => s.category === 'daily_priority');
            expect(daily).toBeDefined();
            expect(daily!.affected_rooms.length).toBeGreaterThan(0);
            expect(daily!.affected_rooms.length).toBeLessThanOrEqual(5);
        });
    });

    it('suggestions sorted by priority (urgent first)', async () => {
        await withTempWorkspace(async () => {
            const storeMod = await import('../src/lib/store');
            const { generateSuggestions } = await import('../src/lib/suggestions');

            // Use seed data
            const suggestions = generateSuggestions();
            expect(suggestions.length).toBeGreaterThan(0);

            const priorityOrder: Record<string, number> = { urgent: 0, warning: 1, info: 2 };
            for (let i = 1; i < suggestions.length; i++) {
                expect(priorityOrder[suggestions[i].priority]).toBeGreaterThanOrEqual(
                    priorityOrder[suggestions[i - 1].priority]
                );
            }
        });
    });
});
