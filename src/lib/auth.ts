import { User } from './types';

export interface AuthProvider {
    getCurrentUser(req: Request): Promise<User | null>;
    login(credentials: { password: string }): Promise<User | null>;
}

export class DemoAuthProvider implements AuthProvider {
    private readonly validPassword = 'townplace2024';

    async getCurrentUser(req: Request): Promise<User | null> {
        const cookieHeader = req.headers.get('cookie') || '';
        const hasAuth = cookieHeader.includes('tp-auth=authenticated');
        if (!hasAuth) return null;

        return {
            id: 'user-admin',
            name: 'Admin',
            email: 'admin@townplace.hk',
            role: 'admin',
            dept: null,
            property_ids: ['tp-soho'],
            is_active: true,
            created_at: new Date().toISOString(),
        };
    }

    async login(credentials: { password: string }): Promise<User | null> {
        if (credentials.password !== this.validPassword) return null;
        return {
            id: 'user-admin',
            name: 'Admin',
            email: 'admin@townplace.hk',
            role: 'admin',
            dept: null,
            property_ids: ['tp-soho'],
            is_active: true,
            created_at: new Date().toISOString(),
        };
    }
}

let activeProvider: AuthProvider = new DemoAuthProvider();

export function setAuthProvider(provider: AuthProvider): void {
    activeProvider = provider;
}

export function getAuthProvider(): AuthProvider {
    return activeProvider;
}
