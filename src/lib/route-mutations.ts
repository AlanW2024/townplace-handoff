import { NextResponse } from 'next/server';
import { getAuthProvider } from './auth';
import { Permission, User } from './types';

export class PermissionDeniedError extends Error {}
export class VersionConflictError extends Error {}

export async function requireAuthenticatedUser(
    request: Request
): Promise<{ user: User } | { error: NextResponse }> {
    const user = await getAuthProvider().getCurrentUser(request);
    if (!user) {
        return { error: NextResponse.json({ error: '未登入或登入已過期' }, { status: 401 }) };
    }

    return { user };
}

export function resolveReason(reason: string | undefined): string {
    return typeof reason === 'string' ? reason.trim() : '';
}

export function assertAllowed(permission: Permission): void {
    if (!permission.allowed) {
        throw new PermissionDeniedError(permission.reason || '權限不足');
    }
}

export function assertExpectedVersion(
    expectedVersion: number | undefined,
    currentVersion: number | undefined,
    entityLabel: string
): void {
    if (expectedVersion !== undefined && expectedVersion !== currentVersion) {
        throw new VersionConflictError(`版本衝突：此${entityLabel}已被其他人修改，請重新載入`);
    }
}

export function getRouteErrorStatus(error: unknown, notFoundMessage?: string): number {
    if (error instanceof PermissionDeniedError) return 403;
    if (error instanceof VersionConflictError) return 409;
    if (error instanceof Error && error.message === notFoundMessage) return 404;
    return 400;
}
