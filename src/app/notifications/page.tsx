'use client';

import { useState, useEffect, useCallback } from 'react';
import {
    Bell, RefreshCw, AlertTriangle, AlertCircle, Info, Home, Clock, ChevronDown, ChevronUp, ArrowRight
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
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const { showToast } = useToast();

    const fetchNotifications = useCallback(async () => {
        try {
            const res = await fetch('/api/notifications');
            if (!res.ok) throw new Error('載入失敗');
            setNotifications(await res.json());
        } catch (e: any) {
            showToast(e.message || '載入通知失敗', 'error');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [showToast]);

    useEffect(() => { fetchNotifications(); }, [fetchNotifications]);

    useEffect(() => {
        const interval = setInterval(fetchNotifications, 5000);
        return () => clearInterval(interval);
    }, [fetchNotifications]);

    const handleRefresh = () => {
        setRefreshing(true);
        fetchNotifications();
    };

    const filtered = filter === 'all' ? notifications : notifications.filter(n => n.level === filter);

    const criticalCount = notifications.filter(n => n.level === 'critical').length;
    const warningCount = notifications.filter(n => n.level === 'warning').length;
    const infoCount = notifications.filter(n => n.level === 'info').length;

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
                <div className="grid gap-3">
                    {filtered.map(notification => {
                        const levelCfg = LEVEL_CONFIG[notification.level];
                        const LevelIcon = levelCfg.icon;
                        const deptInfo = notification.related_dept ? DEPT_INFO[notification.related_dept] : null;
                        const target = getNotificationTarget(notification);
                        const isExpanded = expandedId === notification.id;
                        const visibleRooms = isExpanded
                            ? notification.related_rooms
                            : notification.related_rooms.slice(0, 5);
                        const hiddenRoomCount = Math.max(notification.related_rooms.length - visibleRooms.length, 0);

                        return (
                            <div
                                key={notification.id}
                                className={cn(
                                    'glass-card p-4 border-l-4',
                                    levelCfg.border
                                )}
                            >
                                <div className="flex items-start gap-3">
                                    <LevelIcon size={16} className={cn('shrink-0 mt-0.5', levelCfg.color)} />
                                    <div className="flex-1 min-w-0">
                                        {/* Tags + Title */}
                                        <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                                            <span className={cn('status-badge', levelCfg.bg, levelCfg.color)}>
                                                {levelCfg.label}
                                            </span>
                                            <span className={cn('status-badge', TYPE_COLORS[notification.type])}>
                                                {TYPE_LABELS[notification.type]}
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

                                        <h3 className="text-sm font-semibold text-slate-800 mb-0.5">{notification.title}</h3>
                                        <p className="text-xs text-slate-500 leading-relaxed">{notification.body}</p>

                                        {/* Rooms + Time */}
                                        <div className="flex items-center gap-3 mt-2 flex-wrap">
                                            {notification.related_rooms.length > 0 && (
                                                <span className="flex items-center gap-1 flex-wrap">
                                                    <Home size={11} className="text-slate-400 shrink-0" />
                                                    {visibleRooms.map(room => (
                                                        <Link
                                                            key={room}
                                                            href={`/rooms?highlight=${room}`}
                                                            className="text-[11px] px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded font-mono hover:bg-blue-100 hover:text-blue-700 transition-colors"
                                                        >
                                                            {room}
                                                        </Link>
                                                    ))}
                                                    {hiddenRoomCount > 0 && (
                                                        <button
                                                            type="button"
                                                            onClick={() => setExpandedId(isExpanded ? null : notification.id)}
                                                            className="text-[11px] px-1.5 py-0.5 bg-white text-blue-600 rounded border border-blue-100 hover:bg-blue-50 transition-colors flex items-center gap-1"
                                                        >
                                                            {isExpanded ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
                                                            {isExpanded ? '收起' : `再顯示 ${hiddenRoomCount} 間`}
                                                        </button>
                                                    )}
                                                </span>
                                            )}
                                            <span className="flex items-center gap-1 text-[11px] text-slate-400">
                                                <Clock size={10} />
                                                {formatDateTime(notification.created_at)}
                                            </span>
                                        </div>

                                        <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between gap-3 flex-wrap">
                                            <p className="text-[11px] text-slate-400">
                                                由通知直接跳去相關頁面處理
                                            </p>
                                            <Link
                                                href={target.href}
                                                className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-700 hover:text-blue-800 transition-colors"
                                            >
                                                {target.label}
                                                <ArrowRight size={12} />
                                            </Link>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
