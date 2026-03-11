// ===========================
// TOWNPLACE SOHO — Notification Center Engine
// Computed on-the-fly from store data (not persisted)
// ===========================

import { getStore } from './store';
import { DeptCode, DEPT_INFO, Document } from './types';

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

const BOOKING_CONFLICT_LOOKAHEAD_MS = 48 * 60 * 60 * 1000;
const BOOKING_CONFLICT_GRACE_MS = 12 * 60 * 60 * 1000;

function deptName(dept: DeptCode | null): string {
    if (!dept) return '相關部門';
    return DEPT_INFO[dept]?.name || dept;
}

function uniqueRooms(rooms: Array<string | null | undefined>): string[] {
    return Array.from(new Set(rooms.filter((room): room is string => Boolean(room)))).sort(roomSort);
}

function roomSort(a: string, b: string): number {
    const matchA = a.match(/^(\d+)([A-Z])$/);
    const matchB = b.match(/^(\d+)([A-Z])$/);
    if (!matchA || !matchB) return a.localeCompare(b);

    const floorDiff = Number(matchA[1]) - Number(matchB[1]);
    if (floorDiff !== 0) return floorDiff;
    return matchA[2].localeCompare(matchB[2]);
}

function formatRoomList(rooms: string[], limit = 5): string {
    if (rooms.length === 0) return '未指定單位';
    const preview = rooms.slice(0, limit).join('、');
    return rooms.length > limit ? `${preview} 等 ${rooms.length} 間單位` : preview;
}

function latestDate(values: string[], fallback = new Date().toISOString()): string {
    if (values.length === 0) return fallback;
    return values.reduce((latest, current) =>
        new Date(current).getTime() > new Date(latest).getTime() ? current : latest
    );
}

function inferDocumentDept(document: Document): DeptCode | null {
    const holder = (document.current_holder || '').toLowerCase();

    if (/leasing|租務|lease/.test(holder)) return 'lease';
    if (/concierge|禮賓|front\s*desk/.test(holder)) return 'conc';
    if (/management|mgmt|經理|管理/.test(holder)) return 'mgmt';

    switch (document.doc_type) {
        case 'Newlet':
        case 'TA':
            return 'lease';
        case 'Surrender':
        case 'Inventory':
        case 'DRF':
            return 'conc';
        default:
            return null;
    }
}

export function generateNotifications(): Notification[] {
    const store = getStore();
    const now = Date.now();
    const notifications: Notification[] = [];
    let counter = 0;

    const makeId = () => `notif-${++counter}`;

    // Rule 1: Handoff timeout — aggregate by receiving department
    const pendingHandoffs = store.handoffs.filter(h => h.status === 'pending');
    const timedOutHandoffs = pendingHandoffs.filter(
        h => now - new Date(h.created_at).getTime() >= 2 * 60 * 60 * 1000
    );
    const handoffGroups = new Map<DeptCode, typeof timedOutHandoffs>();
    for (const handoff of timedOutHandoffs) {
        const group = handoffGroups.get(handoff.to_dept) || [];
        group.push(handoff);
        handoffGroups.set(handoff.to_dept, group);
    }
    for (const [dept, handoffs] of Array.from(handoffGroups.entries())) {
        const rooms = uniqueRooms(handoffs.map(h => h.room_id));
        const longestHours = Math.max(
            ...handoffs.map(h => Math.floor((now - new Date(h.created_at).getTime()) / (1000 * 60 * 60)))
        );
        notifications.push({
            id: makeId(),
            type: 'handoff_timeout',
            level: 'critical',
            title: `${handoffs.length} 個交接超時未確認`,
            body: `${deptName(dept)}有 ${handoffs.length} 個待確認交接，涉及 ${formatRoomList(rooms)}。最久已等待 ${longestHours} 小時。`,
            related_rooms: rooms,
            related_dept: dept,
            created_at: latestDate(handoffs.map(h => h.created_at)),
        });
    }

    // Rule 2: Document overdue — aggregate by severity
    const activeDocuments = store.documents.filter(doc => doc.status !== 'completed');
    const criticalDocs = activeDocuments.filter(doc => doc.days_outstanding > 5);
    const warningDocs = activeDocuments.filter(doc => doc.days_outstanding > 3 && doc.days_outstanding <= 5);
    const pushDocumentNotifications = (documents: Document[], level: NotificationLevel) => {
        const grouped = new Map<string, Document[]>();

        for (const document of documents) {
            const dept = inferDocumentDept(document);
            const key = dept || 'unknown';
            const group = grouped.get(key) || [];
            group.push(document);
            grouped.set(key, group);
        }

        for (const [key, docs] of Array.from(grouped.entries())) {
            const dept = key === 'unknown' ? null : key as DeptCode;
            const rooms = uniqueRooms(docs.map(doc => doc.room_id));
            const maxDays = Math.max(...docs.map(doc => doc.days_outstanding));
            notifications.push({
                id: makeId(),
                type: 'doc_overdue',
                level,
                title: level === 'critical'
                    ? `${docs.length} 份文件嚴重超期`
                    : `${docs.length} 份文件處理偏慢`,
                body: level === 'critical'
                    ? `涉及 ${formatRoomList(rooms)}，最長已超過 ${maxDays} 天。建議優先由${deptName(dept)}跟進。`
                    : `涉及 ${formatRoomList(rooms)}。文件已超過 3 天未完成，建議由${deptName(dept)}盡快確認持有人與進度。`,
                related_rooms: rooms,
                related_dept: dept,
                created_at: latestDate(docs.map(doc => doc.updated_at)),
            });
        }
    };

    if (criticalDocs.length > 0) {
        pushDocumentNotifications(criticalDocs, 'critical');
    }
    if (warningDocs.length > 0) {
        pushDocumentNotifications(warningDocs, 'warning');
    }

    // Rule 3: Booking conflict — aggregate all room readiness conflicts
    const bookingConflicts: Array<{
        room_id: string;
        dept: DeptCode;
        reasons: string[];
        created_at: string;
    }> = [];
    for (const booking of store.bookings) {
        if (!booking.room_id) continue;
        const scheduledAt = new Date(booking.scheduled_at).getTime();
        if (Number.isNaN(scheduledAt)) continue;
        if (scheduledAt - now > BOOKING_CONFLICT_LOOKAHEAD_MS) continue;
        if (now - scheduledAt > BOOKING_CONFLICT_GRACE_MS) continue;

        const room = store.rooms.find(r => r.id === booking.room_id);
        if (!room) continue;

        const engNotReady = room.eng_status === 'pending' || room.eng_status === 'in_progress';
        const cleanNotReady = room.clean_status === 'pending' || room.clean_status === 'in_progress';

        if (engNotReady || cleanNotReady) {
            const reasons = [];
            if (engNotReady) reasons.push('工程未完成');
            if (cleanNotReady) reasons.push('清潔未完成');
            bookingConflicts.push({
                room_id: room.id,
                dept: booking.dept,
                reasons,
                created_at: booking.created_at,
            });
        }
    }
    if (bookingConflicts.length > 0) {
        const rooms = uniqueRooms(bookingConflicts.map(conflict => conflict.room_id));
        const reasons = Array.from(new Set(bookingConflicts.flatMap(conflict => conflict.reasons)));
        notifications.push({
            id: makeId(),
            type: 'booking_conflict',
            level: 'critical',
            title: `${bookingConflicts.length} 個預約與房態衝突`,
            body: `涉及 ${formatRoomList(rooms)}。主要原因：${reasons.join('、')}。建議優先由租務協調。`,
            related_rooms: rooms,
            related_dept: 'lease',
            created_at: latestDate(bookingConflicts.map(conflict => conflict.created_at)),
        });
    }

    // Rule 4: Pending reviews — already grouped as a single control notification
    const pendingReviews = store.parse_reviews.filter(review => review.review_status === 'pending');
    if (pendingReviews.length > 0) {
        notifications.push({
            id: makeId(),
            type: 'review_pending',
            level: 'warning',
            title: `${pendingReviews.length} 條訊息待人工覆核`,
            body: `有 ${pendingReviews.length} 條低信心度訊息需要人工檢查，相關操作已暫緩。`,
            related_rooms: uniqueRooms(pendingReviews.flatMap(review => review.suggested_rooms)),
            related_dept: 'mgmt',
            created_at: latestDate(pendingReviews.map(review => review.created_at)),
        });
    }

    // Rule 5: Urgent followups — aggregate by assigned department
    const urgentFollowups = store.followups.filter(
        followup => followup.priority === 'urgent' && (followup.status === 'open' || followup.status === 'in_progress')
    );
    const urgentFollowupIds = new Set(urgentFollowups.map(followup => followup.id));
    const urgentFollowupGroups = new Map<DeptCode, typeof urgentFollowups>();
    for (const followup of urgentFollowups) {
        const group = urgentFollowupGroups.get(followup.assigned_dept) || [];
        group.push(followup);
        urgentFollowupGroups.set(followup.assigned_dept, group);
    }
    for (const [dept, followups] of Array.from(urgentFollowupGroups.entries())) {
        const rooms = uniqueRooms(followups.flatMap(followup => followup.related_rooms));
        notifications.push({
            id: makeId(),
            type: 'followup_urgent',
            level: 'critical',
            title: `${followups.length} 項緊急跟進未完成`,
            body: `${deptName(dept)}仍有 ${followups.length} 項緊急任務未完成，涉及 ${formatRoomList(rooms)}。`,
            related_rooms: rooms,
            related_dept: dept,
            created_at: latestDate(followups.map(followup => followup.created_at)),
        });
    }

    // Rule 5b: Followup due_at approaching — aggregate by state and department
    const activeFollowups = store.followups.filter(
        followup =>
            followup.due_at &&
            (followup.status === 'open' || followup.status === 'in_progress') &&
            !urgentFollowupIds.has(followup.id)
    );
    const dueGroups = new Map<string, typeof activeFollowups>();
    for (const followup of activeFollowups) {
        const dueTime = new Date(followup.due_at as string).getTime();
        const diff = dueTime - now;
        if (diff > 24 * 60 * 60 * 1000) continue;

        const state = diff < 0 ? 'overdue' : 'soon';
        const groupKey = `${state}:${followup.assigned_dept}`;
        const group = dueGroups.get(groupKey) || [];
        group.push(followup);
        dueGroups.set(groupKey, group);
    }
    for (const [groupKey, followups] of Array.from(dueGroups.entries())) {
        const [state, dept] = groupKey.split(':') as ['overdue' | 'soon', DeptCode];
        const rooms = uniqueRooms(followups.flatMap(followup => followup.related_rooms));
        const hourOffsets = followups.map(followup =>
            Math.abs(Math.floor((new Date(followup.due_at as string).getTime() - now) / (1000 * 60 * 60)))
        );
        const edgeHours = state === 'overdue' ? Math.max(...hourOffsets) : Math.min(...hourOffsets);
        notifications.push({
            id: makeId(),
            type: 'followup_due',
            level: state === 'overdue' ? 'critical' : 'warning',
            title: state === 'overdue'
                ? `${followups.length} 項跟進事項已過期`
                : `${followups.length} 項跟進事項 24 小時內到期`,
            body: state === 'overdue'
                ? `${deptName(dept)}有 ${followups.length} 項任務已過期，涉及 ${formatRoomList(rooms)}。最久已過期 ${edgeHours} 小時。`
                : `${deptName(dept)}有 ${followups.length} 項任務即將到期，涉及 ${formatRoomList(rooms)}。最早 ${edgeHours} 小時內到期。`,
            related_rooms: rooms,
            related_dept: dept,
            created_at: latestDate(followups.map(followup => followup.created_at)),
        });
    }

    // Rule 6: Checkout pending — aggregate all checkout units
    const checkoutRooms = store.rooms.filter(room => room.lease_status === 'checkout');
    if (checkoutRooms.length > 0) {
        const rooms = uniqueRooms(checkoutRooms.map(room => room.id));
        notifications.push({
            id: makeId(),
            type: 'checkout_pending',
            level: 'warning',
            title: `${checkoutRooms.length} 間退房單位待處理`,
            body: `涉及 ${formatRoomList(rooms)}。建議安排退房檢查、文件與後續維修清潔。`,
            related_rooms: rooms,
            related_dept: 'conc',
            created_at: latestDate(checkoutRooms.map(room => room.last_updated_at)),
        });
    }

    // Rule 7: Cleaning waiting — aggregate all rooms waiting for cleaning
    const waitingClean = store.rooms.filter(room => room.eng_status === 'completed' && room.clean_status === 'pending');
    if (waitingClean.length > 0) {
        const rooms = uniqueRooms(waitingClean.map(room => room.id));
        notifications.push({
            id: makeId(),
            type: 'cleaning_waiting',
            level: 'warning',
            title: `${waitingClean.length} 間單位等待清潔`,
            body: `工程已完成但清潔未開始，涉及 ${formatRoomList(rooms)}。建議清潔部集中排程。`,
            related_rooms: rooms,
            related_dept: 'clean',
            created_at: latestDate(waitingClean.map(room => room.last_updated_at)),
        });
    }

    // Sort: critical first, then latest items first within each level
    const levelOrder: Record<NotificationLevel, number> = { critical: 0, warning: 1, info: 2 };
    notifications.sort((a, b) => {
        if (levelOrder[a.level] !== levelOrder[b.level]) {
            return levelOrder[a.level] - levelOrder[b.level];
        }
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

    return notifications;
}
