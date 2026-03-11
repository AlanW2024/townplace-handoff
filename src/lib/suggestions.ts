// ===========================
// TOWNPLACE SOHO — AI Suggestion Engine
// ===========================

import { generateNotifications, NotificationType } from './notifications';
import { getStore } from './store';
import { Room, Handoff, Document, Booking, DeptCode, DEPT_INFO } from './types';
import { NotificationThresholds } from './policy/types';

export type SuggestionPriority = 'urgent' | 'warning' | 'info';

export type SuggestionCategory =
    | 'cleaning_backlog'
    | 'engineering_bottleneck'
    | 'handoff_delay'
    | 'document_overdue'
    | 'booking_conflict'
    | 'checkout_followup'
    | 'workload_imbalance'
    | 'daily_priority';

export interface Suggestion {
    id: string;
    priority: SuggestionPriority;
    category: SuggestionCategory;
    title: string;
    description: string;
    affected_rooms: string[];
    recommended_action: string;
    created_at: string;
}

const CATEGORY_LABELS: Record<SuggestionCategory, string> = {
    cleaning_backlog: '清潔積壓',
    engineering_bottleneck: '工程瓶頸',
    handoff_delay: '交接延誤',
    document_overdue: '文件超期',
    booking_conflict: '預約衝突',
    checkout_followup: '退房跟進',
    workload_imbalance: '工作分配',
    daily_priority: '今日優先',
};

const OVERLAPPING_NOTIFICATION_BY_CATEGORY: Partial<Record<SuggestionCategory, NotificationType>> = {
    cleaning_backlog: 'cleaning_waiting',
    handoff_delay: 'handoff_timeout',
    document_overdue: 'doc_overdue',
    booking_conflict: 'booking_conflict',
    checkout_followup: 'checkout_pending',
};

// Rule 1: Cleaning backlog — eng=completed + clean=pending
function analyzeCleaningBacklog(rooms: Room[]): Suggestion[] {
    const affected = rooms.filter(r => r.eng_status === 'completed' && r.clean_status === 'pending');
    if (affected.length === 0) return [];

    return [{
        id: 'sug-clean-backlog',
        priority: 'urgent',
        category: 'cleaning_backlog',
        title: `${affected.length} 間單位工程完成待清潔`,
        description: `以下單位工程已完成但清潔尚未開始，影響出租進度。積壓越久，空置成本越高。`,
        affected_rooms: affected.map(r => r.id),
        recommended_action: '立即通知清潔部安排人手，按樓層集中處理以提高效率。',
        created_at: new Date().toISOString(),
    }];
}

// Rule 2: Engineering bottleneck — eng=pending or eng=in_progress
function analyzeEngineeringBottleneck(rooms: Room[]): Suggestion[] {
    const suggestions: Suggestion[] = [];

    const pending = rooms.filter(r => r.eng_status === 'pending');
    if (pending.length > 0) {
        suggestions.push({
            id: 'sug-eng-pending',
            priority: 'urgent',
            category: 'engineering_bottleneck',
            title: `${pending.length} 間單位等待工程處理`,
            description: `這些單位已報修但工程部尚未開始處理，可能影響租客滿意度。`,
            affected_rooms: pending.map(r => r.id),
            recommended_action: '聯繫工程部確認排期，優先處理有租客投訴的單位。',
            created_at: new Date().toISOString(),
        });
    }

    const inProgress = rooms.filter(r => r.eng_status === 'in_progress');
    if (inProgress.length > 0) {
        suggestions.push({
            id: 'sug-eng-progress',
            priority: 'warning',
            category: 'engineering_bottleneck',
            title: `${inProgress.length} 間單位工程進行中`,
            description: `工程正在進行，請追蹤完工時間以便安排後續清潔。`,
            affected_rooms: inProgress.map(r => r.id),
            recommended_action: '向工程部確認預計完工時間，提前通知清潔部準備。',
            created_at: new Date().toISOString(),
        });
    }

    return suggestions;
}

// Rule 3: Handoff delays — pending handoffs
function analyzeHandoffDelays(handoffs: Handoff[]): Suggestion[] {
    const pendingHandoffs = handoffs.filter(h => h.status === 'pending');
    if (pendingHandoffs.length === 0) return [];

    const now = Date.now();
    const twoHours = 2 * 60 * 60 * 1000;

    const urgent = pendingHandoffs.filter(h => now - new Date(h.created_at).getTime() > twoHours);
    const warning = pendingHandoffs.filter(h => now - new Date(h.created_at).getTime() <= twoHours);

    const suggestions: Suggestion[] = [];

    if (urgent.length > 0) {
        suggestions.push({
            id: 'sug-handoff-urgent',
            priority: 'urgent',
            category: 'handoff_delay',
            title: `${urgent.length} 個交接超過 2 小時未確認`,
            description: `這些交接已等待超過 2 小時，可能導致工作流程中斷。`,
            affected_rooms: Array.from(new Set(urgent.map(h => h.room_id))),
            recommended_action: '立即聯繫相關部門確認交接，了解延遲原因。',
            created_at: new Date().toISOString(),
        });
    }

    if (warning.length > 0) {
        suggestions.push({
            id: 'sug-handoff-warning',
            priority: 'warning',
            category: 'handoff_delay',
            title: `${warning.length} 個交接待確認`,
            description: `這些交接正在等待接收部門確認。`,
            affected_rooms: Array.from(new Set(warning.map(h => h.room_id))),
            recommended_action: '留意交接進度，若 2 小時內未確認則需跟進。',
            created_at: new Date().toISOString(),
        });
    }

    return suggestions;
}

// Rule 4: Overdue documents — days_outstanding > 3 and not completed
function analyzeDocumentOverdue(documents: Document[]): Suggestion[] {
    const suggestions: Suggestion[] = [];

    const critical = documents.filter(d => d.days_outstanding > 5 && d.status !== 'completed');
    const overdue = documents.filter(d => d.days_outstanding > 3 && d.days_outstanding <= 5 && d.status !== 'completed');

    if (critical.length > 0) {
        suggestions.push({
            id: 'sug-doc-critical',
            priority: 'urgent',
            category: 'document_overdue',
            title: `${critical.length} 份文件嚴重超期（>5 天）`,
            description: `這些文件已超過 5 天未完成，可能影響法律合規或租客入住。涉及：${critical.map(d => `${d.room_id} ${d.doc_type}`).join('、')}。`,
            affected_rooms: critical.map(d => d.room_id),
            recommended_action: '優先處理這些文件，必要時聯繫租客或法務部門加快進度。',
            created_at: new Date().toISOString(),
        });
    }

    if (overdue.length > 0) {
        suggestions.push({
            id: 'sug-doc-overdue',
            priority: 'warning',
            category: 'document_overdue',
            title: `${overdue.length} 份文件已超過 3 天`,
            description: `這些文件處理時間偏長，建議盡快跟進。涉及：${overdue.map(d => `${d.room_id} ${d.doc_type}`).join('、')}。`,
            affected_rooms: overdue.map(d => d.room_id),
            recommended_action: '聯繫目前持有人，確認進度並協助加速。',
            created_at: new Date().toISOString(),
        });
    }

    return suggestions;
}

// Rule 5: Booking conflicts — rooms with bookings but eng/clean not completed
function analyzeBookingConflicts(rooms: Room[], bookings: Booking[]): Suggestion[] {
    const roomBookings = bookings.filter(b => b.room_id !== null);
    const conflicts: { booking: Booking; room: Room }[] = [];

    for (const booking of roomBookings) {
        const room = rooms.find(r => r.id === booking.room_id);
        if (!room) continue;

        const engNotReady = room.eng_status === 'pending' || room.eng_status === 'in_progress';
        const cleanNotReady = room.clean_status === 'pending' || room.clean_status === 'in_progress';

        if (engNotReady || cleanNotReady) {
            conflicts.push({ booking, room });
        }
    }

    if (conflicts.length === 0) return [];

    return [{
        id: 'sug-booking-conflict',
        priority: 'urgent',
        category: 'booking_conflict',
        title: `${conflicts.length} 個預約的單位未準備就緒`,
        description: `以下單位有預約但工程或清潔尚未完成：${conflicts.map(c => `${c.room.id}（${c.booking.booking_type === 'viewing' ? '睇樓' : c.booking.booking_type === 'shooting' ? '拍攝' : '活動'}）`).join('、')}。`,
        affected_rooms: Array.from(new Set(conflicts.map(c => c.room.id))),
        recommended_action: '立即協調工程和清潔部門，確保預約前完成準備工作，或考慮改期。',
        created_at: new Date().toISOString(),
    }];
}

// Rule 6: Checkout follow-up — lease=checkout
function analyzeCheckoutFollowup(rooms: Room[]): Suggestion[] {
    const checkouts = rooms.filter(r => r.lease_status === 'checkout');
    if (checkouts.length === 0) return [];

    return [{
        id: 'sug-checkout',
        priority: 'warning',
        category: 'checkout_followup',
        title: `${checkouts.length} 間退房單位待跟進`,
        description: `這些單位處於退房狀態，需要安排檢查、維修和清潔流程。`,
        affected_rooms: checkouts.map(r => r.id),
        recommended_action: '安排退房檢查，確認是否需要維修，並準備 Surrender 文件。',
        created_at: new Date().toISOString(),
    }];
}

// Rule 7: Workload imbalance — department pending count > 2x average
function analyzeWorkloadImbalance(rooms: Room[], handoffs: Handoff[]): Suggestion[] {
    const deptPending: Record<string, number> = {};

    // Count pending handoffs per department
    const pendingHandoffs = handoffs.filter(h => h.status === 'pending');
    for (const h of pendingHandoffs) {
        deptPending[h.to_dept] = (deptPending[h.to_dept] || 0) + 1;
    }

    // Count pending work from room statuses
    for (const room of rooms) {
        if (room.eng_status === 'pending' || room.eng_status === 'in_progress') {
            deptPending['eng'] = (deptPending['eng'] || 0) + 1;
        }
        if (room.clean_status === 'pending' || room.clean_status === 'in_progress') {
            deptPending['clean'] = (deptPending['clean'] || 0) + 1;
        }
    }

    const depts = Object.keys(deptPending);
    if (depts.length < 2) return [];

    const values = Object.values(deptPending);
    const avg = values.reduce((a, b) => a + b, 0) / values.length;

    const overloaded = depts.filter(d => deptPending[d] > avg * 2);
    if (overloaded.length === 0) return [];

    return [{
        id: 'sug-workload',
        priority: 'info',
        category: 'workload_imbalance',
        title: '部門工作量分配不均',
        description: `以下部門待處理工作量超過平均值 2 倍：${overloaded.map(d => `${DEPT_INFO[d as DeptCode]?.name || d}（${deptPending[d]} 項）`).join('、')}。`,
        affected_rooms: [],
        recommended_action: '考慮調配人手或重新分配工作優先順序，平衡各部門負擔。',
        created_at: new Date().toISOString(),
    }];
}

// Rule 8: Daily priorities — top 5 rooms by combined score
function analyzeDailyPriorities(rooms: Room[], handoffs: Handoff[], documents: Document[], bookings: Booking[]): Suggestion[] {
    const roomScores: { id: string; score: number; reasons: string[] }[] = [];

    for (const room of rooms) {
        let score = 0;
        const reasons: string[] = [];

        if (room.needs_attention) { score += 3; reasons.push('需要關注'); }
        if (room.eng_status === 'pending') { score += 2; reasons.push('待工程'); }
        if (room.clean_status === 'pending') { score += 2; reasons.push('待清潔'); }
        if (room.lease_status === 'checkout') { score += 2; reasons.push('退房'); }
        if (room.eng_status === 'completed' && room.clean_status === 'pending') { score += 3; reasons.push('工程完成待清潔'); }

        const roomHandoffs = handoffs.filter(h => h.room_id === room.id && h.status === 'pending');
        if (roomHandoffs.length > 0) { score += roomHandoffs.length * 2; reasons.push(`${roomHandoffs.length} 個待處理交接`); }

        const roomDocs = documents.filter(d => d.room_id === room.id && d.status !== 'completed');
        for (const doc of roomDocs) {
            if (doc.days_outstanding > 3) { score += 3; reasons.push(`${doc.doc_type} 超期`); }
            else { score += 1; }
        }

        const roomBookings = bookings.filter(b => b.room_id === room.id);
        if (roomBookings.length > 0) { score += 2; reasons.push('有預約'); }

        if (score > 0) {
            roomScores.push({ id: room.id, score, reasons });
        }
    }

    roomScores.sort((a, b) => b.score - a.score);
    const top5 = roomScores.slice(0, 5);

    if (top5.length === 0) return [];

    return [{
        id: 'sug-daily-priority',
        priority: 'info',
        category: 'daily_priority',
        title: '今日重點關注單位',
        description: top5.map(r => `${r.id}：${r.reasons.join('、')}`).join('；'),
        affected_rooms: top5.map(r => r.id),
        recommended_action: '按優先順序處理以上單位，確保最緊急的問題先解決。',
        created_at: new Date().toISOString(),
    }];
}

export function generateSuggestions(thresholds?: NotificationThresholds): Suggestion[] {
    const store = getStore();
    const { rooms, handoffs, documents, bookings } = store;
    const activeNotificationTypes = new Set(generateNotifications(thresholds).map(notification => notification.type));

    const suggestions: Suggestion[] = [
        ...analyzeCleaningBacklog(rooms),
        ...analyzeEngineeringBottleneck(rooms),
        ...analyzeHandoffDelays(handoffs),
        ...analyzeDocumentOverdue(documents),
        ...analyzeBookingConflicts(rooms, bookings),
        ...analyzeCheckoutFollowup(rooms),
        ...analyzeWorkloadImbalance(rooms, handoffs),
        ...analyzeDailyPriorities(rooms, handoffs, documents, bookings),
    ].filter(suggestion => {
        const overlappingType = OVERLAPPING_NOTIFICATION_BY_CATEGORY[suggestion.category];
        return !overlappingType || !activeNotificationTypes.has(overlappingType);
    });

    // Sort: urgent first, then warning, then info
    const priorityOrder: Record<SuggestionPriority, number> = { urgent: 0, warning: 1, info: 2 };
    suggestions.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

    return suggestions;
}

export { CATEGORY_LABELS };
