import { describe, expect, it } from 'vitest';
import { isoNow, jsonRequest, makeRoom, withTempWorkspace } from './helpers';

function mockUser(overrides: Record<string, unknown> = {}) {
    return {
        id: 'user-1',
        name: 'Mock User',
        email: 'mock@townplace.hk',
        role: 'operator',
        dept: 'conc',
        property_ids: ['tp-soho'],
        is_active: true,
        created_at: isoNow(),
        ...overrides,
    };
}

describe.sequential('Route Permissions', () => {
    it('handoff PUT rejects operator outside receiving dept', async () => {
        await withTempWorkspace(async () => {
            const authMod = await import('../src/lib/auth');
            const storeMod = await import('../src/lib/store');
            const { PUT } = await import('../src/app/api/handoffs/route');

            authMod.setAuthProvider({
                async getCurrentUser() {
                    return mockUser({ dept: 'conc' }) as any;
                },
                async login() {
                    return mockUser({ dept: 'conc' }) as any;
                },
            });

            await storeMod.withStoreWrite((store: any) => {
                store.handoffs.push({
                    id: 'ho-sec-1',
                    property_id: 'tp-soho',
                    room_id: '10F',
                    from_dept: 'eng',
                    to_dept: 'clean',
                    action: '工程完成 → 可清潔',
                    status: 'pending',
                    triggered_by: 'msg-1',
                    created_at: isoNow(),
                    acknowledged_at: null,
                    version: 1,
                });
            });

            const res = await PUT(jsonRequest('http://localhost/api/handoffs', 'PUT', {
                id: 'ho-sec-1',
                status: 'acknowledged',
                actor: 'Concierge',
                reason: '測試',
            }));

            expect(res.status).toBe(403);
            const data = await res.json();
            expect(data.error).toContain('相關部門');
        });
    });

    it('rooms PUT rejects operator updating another dept status', async () => {
        await withTempWorkspace(async () => {
            const authMod = await import('../src/lib/auth');
            const storeMod = await import('../src/lib/store');
            const { PUT } = await import('../src/app/api/rooms/route');

            authMod.setAuthProvider({
                async getCurrentUser() {
                    return mockUser({ dept: 'clean' }) as any;
                },
                async login() {
                    return mockUser({ dept: 'clean' }) as any;
                },
            });

            await storeMod.withStoreWrite((store: any) => {
                store.rooms = [makeRoom('10F', { eng_status: 'pending', clean_status: 'n_a', version: 1 })];
            });

            const res = await PUT(jsonRequest('http://localhost/api/rooms', 'PUT', {
                id: '10F',
                eng_status: 'completed',
                actor: 'Cleaner',
                reason: '測試越權',
                expectedVersion: 1,
            }));

            expect(res.status).toBe(403);
            const data = await res.json();
            expect(data.error).toContain('相關部門');
        });
    });

    it('document PUT rejects viewer', async () => {
        await withTempWorkspace(async () => {
            const authMod = await import('../src/lib/auth');
            const { PUT } = await import('../src/app/api/documents/route');

            authMod.setAuthProvider({
                async getCurrentUser() {
                    return mockUser({ role: 'viewer', dept: null }) as any;
                },
                async login() {
                    return mockUser({ role: 'viewer', dept: null }) as any;
                },
            });

            const res = await PUT(jsonRequest('http://localhost/api/documents', 'PUT', {
                id: 'doc-001',
                status: 'preparing',
                actor: 'Viewer',
                reason: '測試',
                expectedVersion: 1,
            }));

            expect(res.status).toBe(403);
            const data = await res.json();
            expect(data.error).toContain('編輯文件');
        });
    });
});
