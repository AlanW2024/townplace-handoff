'use client';

import { useState, useEffect, useCallback } from 'react';
import { usePolling } from '@/hooks/usePolling';
import {
    Bell, RefreshCw, AlertTriangle, AlertCircle, Info, Home, Clock, ArrowRight
} from 'lucide-react';
import Link from 'next/link';
import { cn, formatDateTime } from '@/lib/utils';
import { useToast } from '@/components/Toast';
import { DeptCode, DEPT_INFO } from '@/lib/types';

type NotificationType =
    | 'handoff_timeout'
    | 'doc_overdue'
    | 'booking_conflict'
    | 'review_pending'
    | 'followup_urgent'
    | 'followup_due'
    | 'checkout_pending'
    | 'cleaning_waiting';

type NotificationLevel = 'critical' | 'warning' | 'info';

interface Notification {
    id: string;
    type: NotificationType;
    level: NotificationLevel;
    title: string;
    body: string;
    related_rooms: string[];
    related_dept: DeptCode | null;
    created_at: string;
}

const LEVEL_CONFIG: Record<NotificationLevel, { label: string; color: string; bg: string; border: string; icon: typeof AlertTriangle }> = {
    critical: { label: '嚴重', color: 'text-red-700', bg: 'bg-red-100', border: 'border-l-red-500', icon: AlertTriangle },
    warning: { label: '注意', color: 'text-amber-700', bg: 'bg-amber-100', border: 'border-l-amber-500', icon: AlertCircle },
    info: { label: '資訊', color: 'text-blue-700', bg: 'bg-blue-100', border: 'border-l-blue-500', icon: Info },
};

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

const TYPE_COLORS: Record<NotificationType, string> = {
    handoff_timeout: 'bg-orange-100 text-orange-700',
    doc_overdue: 'bg-red-100 text-red-700',
    booking_conflict: 'bg-purple-100 text-purple-700',
    review_pending: 'bg-violet-100 text-violet-700',
    followup_urgent: 'bg-rose-100 text-rose-700',
    followup_due: 'bg-amber-100 text-amber-700',
    checkout_pending: 'bg-pink-100 text-pink-700',
    cleaning_waiting: 'bg-emerald-100 text-emerald-700',
};

type FilterType = 'all' | NotificationLevel;

function buildRoomsHref(rooms: string[]): string {
    const params = new URLSearchParams();
    if (rooms.length > 0) {
        params.set('highlight', rooms[0]);
        params.set('rooms', rooms.join(','));
    }
    return `/rooms?${params.toString()}`;
}

function buildFollowupsHref(notification: Notification): string {
    const params = new URLSearchParams();
    params.set('active', 'true');
    if (notification.type === 'followup_urgent') params.set('priority', 'urgent');
    if (notification.related_rooms.length > 0) params.set('rooms', notification.related_rooms.join(','));
    return `/followups?${params.toString()}`;
}

function getNotificationTarget(notification: Notification): { href: string; label: string } {
    switch (notification.type) {
        case 'doc_overdue':
            return { href: '/documents', label: '查看文件' };
        case 'review_pending':
            return { href: '/reviews?status=pending', label: '查看待覆核' };
        case 'followup_urgent':
        case 'followup_due':
            return { href: buildFollowupsHref(notification), label: '查看跟進事項' };
        case 'handoff_timeout':
            return { href: buildRoomsHref(notification.related_rooms), label: '查看交接相關房間' };
        case 'booking_conflict':
            return { href: buildRoomsHref(notification.related_rooms), label: '查看衝突房間' };
        case 'checkout_pending':
            return { href: buildRoomsHref(notification.related_rooms), label: '查看退房房間' };
        case 'cleaning_waiting':
            return { href: buildRoomsHref(notification.related_rooms), label: '查看待清潔房間' };
        default:
            return { href: '/notifications', label: '查看詳情' };
    }
}

export default function NotificationsPage() {
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [filter, setFilter] = useState<FilterType>('all');
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const { showToast } = useToast();

    const fetchNotifications = useCallback(async () => {
        try {
            const res = await fetch('/api/notifications');
            if (!res.ok) throw new Error('載入失敗');
            setNotifications(await res.json());
        } catch (e: unknown) {
            showToast(e instanceof Error ? e.message : '操作失敗', 'error');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [showToast]);

    useEffect(() => { fetchNotifications(); }, [fetchNotifications]);

    usePolling(fetchNotifications, 5000);

    const handleRefresh = () => {
        setRefreshing(true);
        fetchNotifications();
    };

    const filtered = filter === 'all' ? notifications : notifications.filter(n => n.level === filter);
    const selectedNotification = filtered.find(notification => notification.id === selectedId) || filtered[0] || null;

    const criticalCount = notifications.filter(n => n.level === 'critical').length;
    const warningCount = notifications.filter(n => n.level === 'warning').length;
    const infoCount = notifications.filter(n => n.level === 'info').length;

    useEffect(() => {
        if (filtered.length === 0) {
            setSelectedId(null);
            return;
        }

        if (!filtered.some(notification => notification.id === selectedId)) {
            setSelectedId(filtered[0].id);
        }
    }, [filtered, selectedId]);

    if (loading) {
        return (
            <div className="flex items-center justify-center h-[60vh]">
                <div className="w-10 h-10 border-3 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-start justify-between gap-4">
                <div>
                    <h1 className="page-title">通知中心</h1>
                    <p className="text-sm text-slate-500 mt-1">即時營運提醒，涵蓋交接超時、文件超期、預約衝突等</p>
                </div>
                <button
                    onClick={handleRefresh}
                    disabled={refreshing}
                    className="btn-primary text-sm flex items-center gap-2 shrink-0"
                >
                    <RefreshCw size={14} className={cn(refreshing && 'animate-spin')} />
                    重新整理
                </button>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {[
                    { label: '嚴重', value: criticalCount, color: 'text-red-700', bg: 'bg-red-50' },
                    { label: '注意', value: warningCount, color: 'text-amber-700', bg: 'bg-amber-50' },
                    { label: '資訊', value: infoCount, color: 'text-blue-700', bg: 'bg-blue-50' },
                    { label: '總通知數', value: notifications.length, color: 'text-slate-700', bg: 'bg-white' },
                ].map(stat => (
                    <div key={stat.label} className={cn('glass-card p-4', stat.bg)}>
                        <p className="text-xs text-slate-500">{stat.label}</p>
                        <p className={cn('text-2xl font-bold mt-1', stat.color)}>{stat.value}</p>
                    </div>
                ))}
            </div>

            {/* Filter */}
            <div className="flex gap-2 flex-wrap">
                {([
                    { key: 'all' as FilterType, label: '全部', count: notifications.length },
                    { key: 'critical' as FilterType, label: '嚴重', count: criticalCount },
                    { key: 'warning' as FilterType, label: '注意', count: warningCount },
                    { key: 'info' as FilterType, label: '資訊', count: infoCount },
                ]).map(f => (
                    <button
                        key={f.key}
                        onClick={() => setFilter(f.key)}
                        className={cn(
                            'px-3 py-1.5 rounded-lg text-sm font-medium transition-all',
                            filter === f.key
                                ? 'bg-blue-600 text-white shadow-sm'
                                : 'bg-white text-slate-600 hover:bg-slate-50 border border-slate-200'
                        )}
                    >
                        {f.label} ({f.count})
                    </button>
                ))}
            </div>

            {/* Notification Cards */}
            {filtered.length === 0 ? (
                <div className="glass-card p-12 text-center">
                    <Bell size={36} className="text-slate-300 mx-auto mb-3" />
                    <p className="text-slate-500 font-medium">目前沒有通知</p>
                    <p className="text-sm text-slate-400 mt-1">系統運作正常，沒有需要關注的事項</p>
                </div>
            ) : (
                <div className="scan-shell">
                    <div className="scan-grid">
                        {filtered.map(notification => {
                            const levelCfg = LEVEL_CONFIG[notification.level];
                            const deptInfo = notification.related_dept ? DEPT_INFO[notification.related_dept] : null;
                            const isActive = selectedNotification?.id === notification.id;

                            return (
                                <button
                                    key={notification.id}
                                    type="button"
                                    onClick={() => setSelectedId(notification.id)}
                                    className={cn(
                                        'scan-tile border-l-4',
                                        levelCfg.border,
                                        isActive && 'scan-tile-active'
                                    )}
                                >
                                    <div className="space-y-3">
                                        <div className="flex items-start justify-between gap-2">
                                            <div className="flex gap-1.5 flex-wrap">
                                                <span className={cn('scan-chip', levelCfg.bg, levelCfg.color)}>
                                                    {levelCfg.label}
                                                </span>
                                                <span className={cn('scan-chip', TYPE_COLORS[notification.type])}>
                                                    {TYPE_LABELS[notification.type]}
                                                </span>
                                            </div>
                                            <span className="scan-kicker">通知</span>
                                        </div>

                                        <div>
                                            <p className="scan-title scan-clamp-3">{notification.title}</p>
                                            <p className="scan-body scan-clamp-4 mt-2">{notification.body}</p>
                                        </div>
                                    </div>

                                    <div className="space-y-3">
                                        <div className="scan-meta">
                                            {deptInfo && (
                                                <span
                                                    className="scan-chip"
                                                    style={{ backgroundColor: deptInfo.lightColor, color: deptInfo.color }}
                                                >
                                                    {deptInfo.name}
                                                </span>
                                            )}
                                            {notification.related_rooms.length > 0 && (
                                                <span className="scan-chip bg-slate-100 text-slate-600">
                                                    {notification.related_rooms.length} 間房
                                                </span>
                                            )}
                                        </div>
                                        <div className="scan-meta">
                                            <span className="inline-flex items-center gap-1">
                                                <Clock size={11} />
                                                {formatDateTime(notification.created_at)}
                                            </span>
                                        </div>
                                    </div>
                                </button>
                            );
                        })}
                    </div>

                    {selectedNotification && (() => {
                        const levelCfg = LEVEL_CONFIG[selectedNotification.level];
                        const deptInfo = selectedNotification.related_dept ? DEPT_INFO[selectedNotification.related_dept] : null;
                        const target = getNotificationTarget(selectedNotification);

                        return (
                            <div className="scan-detail">
                                <div className="flex items-start justify-between gap-3">
                                    <div>
                                        <p className="scan-kicker">通知詳情</p>
                                        <h2 className="text-xl font-bold text-slate-800 mt-2">{selectedNotification.title}</h2>
                                    </div>
                                    <span className={cn('status-badge', levelCfg.bg, levelCfg.color)}>
                                        {levelCfg.label}
                                    </span>
                                </div>

                                <div className="flex gap-2 flex-wrap mt-4">
                                    <span className={cn('status-badge', TYPE_COLORS[selectedNotification.type])}>
                                        {TYPE_LABELS[selectedNotification.type]}
                                    </span>
                                    {deptInfo && (
                                        <span
                                            className="status-badge"
                                            style={{ backgroundColor: deptInfo.lightColor, color: deptInfo.color }}
                                        >
                                            {deptInfo.name}
                                        </span>
                                    )}
                                </div>

                                <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                                    <p className="text-sm leading-relaxed text-slate-700 whitespace-pre-line">
                                        {selectedNotification.body}
                                    </p>
                                </div>

                                <div className="mt-5 space-y-3">
                                    <div className="scan-meta">
                                        <span className="inline-flex items-center gap-1">
                                            <Clock size={12} />
                                            {formatDateTime(selectedNotification.created_at)}
                                        </span>
                                    </div>

                                    <div>
                                        <p className="text-xs font-semibold text-slate-400 uppercase tracking-[0.18em]">相關房間</p>
                                        <div className="mt-2 flex gap-1.5 flex-wrap">
                                            {selectedNotification.related_rooms.length > 0 ? selectedNotification.related_rooms.map(room => (
                                                <Link
                                                    key={room}
                                                    href={`/rooms?highlight=${room}`}
                                                    className="text-[11px] px-2 py-1 bg-slate-100 text-slate-600 rounded-md font-mono hover:bg-blue-100 hover:text-blue-700 transition-colors"
                                                >
                                                    {room}
                                                </Link>
                                            )) : (
                                                <span className="text-sm text-slate-400">沒有指定房間</span>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between gap-3 flex-wrap">
                                    <p className="text-xs text-slate-400">由右邊細看內容，再直接跳去相關頁面處理。</p>
                                    <Link
                                        href={target.href}
                                        className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-700 hover:text-blue-800 transition-colors"
                                    >
                                        {target.label}
                                        <ArrowRight size={14} />
                                    </Link>
                                </div>
                            </div>
                        );
                    })()}
                </div>
            )}
        </div>
    );
}
