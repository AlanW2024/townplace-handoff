import { describe, expect, it } from 'vitest';
import { isoNow, jsonRequest, makeRoom, withTempWorkspace } from './helpers';

describe.sequential('Rooms Route', () => {
    it('PUT rejects unsupported fields', async () => {
        await withTempWorkspace(async () => {
            const storeMod = await import('../src/lib/store');
            const { PUT } = await import('../src/app/api/rooms/route');

            await storeMod.withStoreWrite((store: any) => {
                store.rooms = [makeRoom('10F', { eng_status: 'completed', clean_status: 'n_a', version: 1 })];
            });

            const res = await PUT(jsonRequest('http://localhost/api/rooms', 'PUT', {
                id: '10F',
                clean_status: 'pending',
                needs_attention: false,
                actor: 'Ops',
                reason: '測試非法欄位',
                expectedVersion: 1,
            }));

            expect(res.status).toBe(400);
            const data = await res.json();
            expect(data.error).toContain('不支援更新欄位');
        });
    });

    it('PUT rejects expectedVersion mismatch', async () => {
        await withTempWorkspace(async () => {
            const storeMod = await import('../src/lib/store');
            const { PUT } = await import('../src/app/api/rooms/route');

            await storeMod.withStoreWrite((store: any) => {
                store.rooms = [makeRoom('10F', { eng_status: 'completed', clean_status: 'n_a', version: 2 })];
            });

            const res = await PUT(jsonRequest('http://localhost/api/rooms', 'PUT', {
                id: '10F',
                clean_status: 'pending',
                actor: 'Ops',
                reason: '安排清潔',
                expectedVersion: 1,
            }));

            expect(res.status).toBe(409);
            const data = await res.json();
            expect(data.error).toContain('版本衝突');
        });
    });

    it('PUT updates room, recomputes attention state, and writes audit log', async () => {
        await withTempWorkspace(async () => {
            const storeMod = await import('../src/lib/store');
            const { PUT } = await import('../src/app/api/rooms/route');

            await storeMod.withStoreWrite((store: any) => {
                store.rooms = [makeRoom('10F', {
                    eng_status: 'completed',
                    clean_status: 'n_a',
                    lease_status: 'vacant',
                    last_updated_at: isoNow(),
                    version: 1,
                })];
            });

            const res = await PUT(jsonRequest('http://localhost/api/rooms', 'PUT', {
                id: '10F',
                clean_status: 'pending',
                actor: 'Ops',
                reason: '安排清潔接手',
                expectedVersion: 1,
            }));

            expect(res.status).toBe(200);
            const data = await res.json();
            expect(data.clean_status).toBe('pending');
            expect(data.needs_attention).toBe(true);
            expect(data.attention_reason).toBe('待清潔接手');
            expect(data.version).toBe(2);

            const store = storeMod.getStore();
            const latestAudit = store.audit_logs[store.audit_logs.length - 1];
            expect(latestAudit.entity_type).toBe('room');
            expect(latestAudit.entity_id).toBe('10F');
            expect(latestAudit.actor).toBe('Ops');
            expect(latestAudit.reason).toBe('安排清潔接手');
            expect(latestAudit.changes).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({ field: 'clean_status', from: 'n_a', to: 'pending' }),
                ])
            );
        });
    });
});
