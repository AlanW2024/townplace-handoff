// ===========================
// TOWNPLACE SOHO — Notification Center Engine
// Computed on-the-fly from store data (not persisted)
// ===========================

import { getStore } from './store';
import { DeptCode, DEPT_INFO } from './types';

export type NotificationType =
    | 'handoff_timeout'
    | 'doc_overdue'
    | 'booking_conflict'
    | 'review_pending'
    | 'followup_urgent'
    | 'followup_due'
    | 'checkout_pending'
    | 'cleaning_waiting';

export type NotificationLevel = 'critical' | 'warning' | 'info';

export interface Notification {
    id: string;
    type: NotificationType;
    level: NotificationLevel;
    title: string;
    body: string;
    related_rooms: string[];
    related_dept: DeptCode | null;
    created_at: string;
}

const TYPE_LABELS: Record<NotificationType, string> = {
    handoff_timeout: '交接超時',
    doc_overdue: '文件超期',
    booking_conflict: '預約衝突',
    review_pending: '待覆核',
    followup_urgent: '緊急跟進',
    followup_due: '即將到期',
    checkout_pending: '退房待處理',
    cleaning_waiting: '清潔等待中',
};

export { TYPE_LABELS };

export function generateNotifications(): Notification[] {
    const store = getStore();
    const now = Date.now();
    const notifications: Notification[] = [];
    let counter = 0;

    const makeId = () => `notif-${++counter}`;

    // Rule 1: Handoff timeout — pending handoffs > 2 hours
    const pendingHandoffs = store.handoffs.filter(h => h.status === 'pending');
    for (const ho of pendingHandoffs) {
        const age = now - new Date(ho.created_at).getTime();
        const hours = age / (1000 * 60 * 60);
        if (hours >= 2) {
            const fromDept = DEPT_INFO[ho.from_dept]?.name || ho.from_dept;
            const toDept = DEPT_INFO[ho.to_dept]?.name || ho.to_dept;
            notifications.push({
                id: makeId(),
                type: 'handoff_timeout',
                level: 'critical',
                title: `${ho.room_id} 交接超時`,
                body: `${fromDept} → ${toDept} 的交接已等待 ${Math.floor(hours)} 小時未確認。`,
                related_rooms: [ho.room_id],
                related_dept: ho.to_dept,
                created_at: ho.created_at,
            });
        }
    }

    // Rule 2: Document overdue — days_outstanding > 3
    for (const doc of store.documents) {
        if (doc.status === 'completed') continue;
        if (doc.days_outstanding > 5) {
            notifications.push({
                id: makeId(),
                type: 'doc_overdue',
                level: 'critical',
                title: `${doc.room_id} ${doc.doc_type} 嚴重超期`,
                body: `已超過 ${doc.days_outstanding} 天未完成。目前持有人：${doc.current_holder || '未指定'}。`,
                related_rooms: [doc.room_id],
                related_dept: 'lease',
                created_at: doc.updated_at,
            });
        } else if (doc.days_outstanding > 3) {
            notifications.push({
                id: makeId(),
                type: 'doc_overdue',
                level: 'warning',
                title: `${doc.room_id} ${doc.doc_type} 處理偏慢`,
                body: `已 ${doc.days_outstanding} 天。持有人：${doc.current_holder || '未指定'}。`,
                related_rooms: [doc.room_id],
                related_dept: 'lease',
                created_at: doc.updated_at,
            });
        }
    }

    // Rule 3: Booking conflict — room has booking but not ready
    for (const booking of store.bookings) {
        if (!booking.room_id) continue;
        const room = store.rooms.find(r => r.id === booking.room_id);
        if (!room) continue;

        const engNotReady = room.eng_status === 'pending' || room.eng_status === 'in_progress';
        const cleanNotReady = room.clean_status === 'pending' || room.clean_status === 'in_progress';

        if (engNotReady || cleanNotReady) {
            const reasons = [];
            if (engNotReady) reasons.push('工程未完成');
            if (cleanNotReady) reasons.push('清潔未完成');
            const typeLabel = booking.booking_type === 'viewing' ? '睇樓' :
                booking.booking_type === 'shooting' ? '拍攝' : '活動';

            notifications.push({
                id: makeId(),
                type: 'booking_conflict',
                level: 'critical',
                title: `${room.id} 有「${typeLabel}」預約但未就緒`,
                body: `${reasons.join('、')}。預約人：${booking.booked_by}。`,
                related_rooms: [room.id],
                related_dept: booking.dept,
                created_at: booking.created_at,
            });
        }
    }

    // Rule 4: Pending reviews — parse reviews awaiting human review
    const pendingReviews = store.parse_reviews.filter(r => r.review_status === 'pending');
    if (pendingReviews.length > 0) {
        notifications.push({
            id: makeId(),
            type: 'review_pending',
            level: 'warning',
            title: `${pendingReviews.length} 條訊息待人工覆核`,
            body: `有 ${pendingReviews.length} 條低信心度訊息需要人工檢查，相關操作已暫緩。`,
            related_rooms: Array.from(new Set(pendingReviews.flatMap(r => r.suggested_rooms))),
            related_dept: 'mgmt',
            created_at: pendingReviews[0].created_at,
        });
    }

    // Rule 5: Urgent followups — open or in_progress with urgent priority
    const urgentFollowups = store.followups.filter(
        f => f.priority === 'urgent' && (f.status === 'open' || f.status === 'in_progress')
    );
    for (const fu of urgentFollowups) {
        notifications.push({
            id: makeId(),
            type: 'followup_urgent',
            level: 'critical',
            title: `緊急跟進：${fu.title}`,
            body: fu.description.slice(0, 100) + (fu.description.length > 100 ? '...' : ''),
            related_rooms: fu.related_rooms,
            related_dept: fu.assigned_dept,
            created_at: fu.created_at,
        });
    }

    // Rule 5b: Followup due_at approaching — within 24 hours or overdue
    const activeFollowups = store.followups.filter(
        f => f.due_at && (f.status === 'open' || f.status === 'in_progress')
    );
    for (const fu of activeFollowups) {
        const dueTime = new Date(fu.due_at!).getTime();
        const diff = dueTime - now;
        const hours24 = 24 * 60 * 60 * 1000;

        if (diff <= hours24) {
            const isOverdue = diff < 0;
            const hoursLeft = Math.abs(Math.floor(diff / (1000 * 60 * 60)));
            notifications.push({
                id: makeId(),
                type: 'followup_due',
                level: isOverdue ? 'critical' : 'warning',
                title: isOverdue
                    ? `跟進事項已過期：${fu.title}`
                    : `跟進事項即將到期：${fu.title}`,
                body: isOverdue
                    ? `已過期 ${hoursLeft} 小時。部門：${DEPT_INFO[fu.assigned_dept]?.name || fu.assigned_dept}。`
                    : `將於 ${hoursLeft} 小時內到期。部門：${DEPT_INFO[fu.assigned_dept]?.name || fu.assigned_dept}。`,
                related_rooms: fu.related_rooms,
                related_dept: fu.assigned_dept,
                created_at: fu.created_at,
            });
        }
    }

    // Rule 6: Checkout pending — rooms in checkout status
    const checkoutRooms = store.rooms.filter(r => r.lease_status === 'checkout');
    for (const room of checkoutRooms) {
        notifications.push({
            id: makeId(),
            type: 'checkout_pending',
            level: 'warning',
            title: `${room.id} 退房待處理`,
            body: `此單位已退房，需安排檢查及後續跟進。`,
            related_rooms: [room.id],
            related_dept: 'conc',
            created_at: room.last_updated_at,
        });
    }

    // Rule 7: Cleaning waiting — eng=completed + clean=pending
    const waitingClean = store.rooms.filter(r => r.eng_status === 'completed' && r.clean_status === 'pending');
    for (const room of waitingClean) {
        notifications.push({
            id: makeId(),
            type: 'cleaning_waiting',
            level: 'warning',
            title: `${room.id} 等待清潔`,
            body: `工程已完成，清潔尚未開始。`,
            related_rooms: [room.id],
            related_dept: 'clean',
            created_at: room.last_updated_at,
        });
    }

    // Sort: critical first, then warning, then info
    const levelOrder: Record<NotificationLevel, number> = { critical: 0, warning: 1, info: 2 };
    notifications.sort((a, b) => levelOrder[a.level] - levelOrder[b.level]);

    return notifications;
}
