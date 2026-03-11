import { DeptCode, Permission, PermissionAction, User } from './types';

function allow(action: PermissionAction): Permission {
    return { action, allowed: true };
}

function deny(action: PermissionAction, reason: string): Permission {
    return { action, allowed: false, reason };
}

function isOwnDept(user: User, targetDept: DeptCode | null): boolean {
    return user.dept !== null && user.dept === targetDept;
}

export function canChangeRoomStatus(user: User, roomDept: DeptCode | null): Permission {
    const action: PermissionAction = 'room:change_status';
    if (user.role === 'admin') return allow(action);
    if (user.role === 'manager' && isOwnDept(user, roomDept)) return allow(action);
    if (user.role === 'operator' && isOwnDept(user, roomDept)) return allow(action);
    return deny(action, '只有管理員或相關部門人員可更改房間狀態');
}

export function canApproveHandoff(user: User, handoffDept: DeptCode | null): Permission {
    const action: PermissionAction = 'handoff:approve';
    if (user.role === 'admin') return allow(action);
    if (user.role === 'manager') return allow(action);
    if (user.role === 'operator' && isOwnDept(user, handoffDept)) return allow(action);
    return deny(action, '只有管理員、經理或相關部門人員可批准交接');
}

export function canEditDocument(user: User, docDept: DeptCode | null): Permission {
    const action: PermissionAction = 'document:edit';
    if (user.role === 'admin') return allow(action);
    if (user.role === 'manager') return allow(action);
    if (user.role === 'operator' && isOwnDept(user, docDept)) return allow(action);
    return deny(action, '只有管理員、經理或相關部門人員可編輯文件');
}

export function canAdvanceDocument(user: User): Permission {
    const action: PermissionAction = 'document:advance';
    if (user.role === 'admin') return allow(action);
    if (user.role === 'manager') return allow(action);
    return deny(action, '只有管理員或經理可推進文件狀態');
}

export function canCloseFollowup(user: User, followupDept: DeptCode | null): Permission {
    const action: PermissionAction = 'followup:close';
    if (user.role === 'admin') return allow(action);
    if (user.role === 'manager') return allow(action);
    if (user.role === 'operator' && isOwnDept(user, followupDept)) return allow(action);
    return deny(action, '只有管理員、經理或相關部門人員可關閉跟進事項');
}

export function canApproveReview(user: User): Permission {
    const action: PermissionAction = 'review:approve';
    if (user.role === 'admin') return allow(action);
    if (user.role === 'manager') return allow(action);
    return deny(action, '只有管理員或經理可覆核訊息');
}

export function assertPermission(permission: Permission): void {
    if (!permission.allowed) {
        throw new Error(permission.reason || '權限不足');
    }
}
