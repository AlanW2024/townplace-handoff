'use client';

import { useState, useEffect, useCallback } from 'react';
import {
    ListChecks, RefreshCw, AlertTriangle, AlertCircle, Info,
    Home, Play, CheckCircle2, XCircle, Clock, Lightbulb, User
} from 'lucide-react';
import Link from 'next/link';
import { cn, formatDateTime } from '@/lib/utils';
import { useToast } from '@/components/Toast';
import { DeptCode, DEPT_INFO, FollowupStatus } from '@/lib/types';

interface Followup {
    id: string;
    title: string;
    description: string;
    source_type: string;
    source_id: string;
    priority: 'urgent' | 'warning' | 'info';
    assigned_dept: DeptCode;
    assigned_to: string | null;
    related_rooms: string[];
    status: FollowupStatus;
    due_at: string | null;
    created_at: string;
    updated_at: string;
}

const PRIORITY_CONFIG: Record<string, { label: string; color: string; bg: string; border: string; icon: typeof AlertTriangle }> = {
    urgent: { label: '緊急', color: 'text-red-700', bg: 'bg-red-100', border: 'border-l-red-500', icon: AlertTriangle },
    warning: { label: '注意', color: 'text-amber-700', bg: 'bg-amber-100', border: 'border-l-amber-500', icon: AlertCircle },
    info: { label: '參考', color: 'text-blue-700', bg: 'bg-blue-100', border: 'border-l-blue-500', icon: Info },
};

const STATUS_CONFIG: Record<FollowupStatus, { label: string; color: string; bg: string }> = {
    open: { label: '待處理', color: 'text-blue-700', bg: 'bg-blue-100' },
    in_progress: { label: '進行中', color: 'text-amber-700', bg: 'bg-amber-100' },
    done: { label: '已完成', color: 'text-emerald-700', bg: 'bg-emerald-100' },
    dismissed: { label: '已略過', color: 'text-slate-500', bg: 'bg-slate-100' },
};

type StatusFilter = 'all' | FollowupStatus;
type PriorityFilter = 'all' | 'urgent' | 'warning' | 'info';

function sortFollowups(items: Followup[]): Followup[] {
    const priorityOrder: Record<string, number> = { urgent: 0, warning: 1, info: 2 };
    const statusOrder: Record<string, number> = { open: 0, in_progress: 1, done: 2, dismissed: 3 };

    return [...items].sort((a, b) => {
        // Active before completed/dismissed
        const statusDiff = statusOrder[a.status] - statusOrder[b.status];
        if (statusDiff !== 0) return statusDiff;
        // Urgent first
        const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
        if (priorityDiff !== 0) return priorityDiff;
        // Newest first
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
}

export default function FollowupsPage() {
    const [followups, setFollowups] = useState<Followup[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
    const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>('all');
    const [updating, setUpdating] = useState<string | null>(null);
    const { showToast } = useToast();

    const fetchFollowups = useCallback(async () => {
        try {
            const res = await fetch('/api/followups');
            if (!res.ok) throw new Error('載入失敗');
            setFollowups(await res.json());
        } catch (e: any) {
            showToast(e.message || '載入跟進事項失敗', 'error');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [showToast]);

    useEffect(() => { fetchFollowups(); }, [fetchFollowups]);

    useEffect(() => {
        const interval = setInterval(fetchFollowups, 5000);
        return () => clearInterval(interval);
    }, [fetchFollowups]);

    const handleRefresh = () => {
        setRefreshing(true);
        fetchFollowups();
    };

    const updateStatus = async (id: string, newStatus: FollowupStatus) => {
        setUpdating(id);
        try {
            const res = await fetch('/api/followups', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id, status: newStatus }),
            });
            if (!res.ok) throw new Error('更新失敗');
            showToast(`已更新為「${STATUS_CONFIG[newStatus].label}」`, 'success');
            fetchFollowups();
        } catch (e: any) {
            showToast(e.message || '更新失敗', 'error');
        } finally {
            setUpdating(null);
        }
    };

    // Apply filters then sort
    let filtered = followups;
    if (statusFilter !== 'all') filtered = filtered.filter(f => f.status === statusFilter);
    if (priorityFilter !== 'all') filtered = filtered.filter(f => f.priority === priorityFilter);
    filtered = sortFollowups(filtered);

    const urgentCount = followups.filter(f => f.priority === 'urgent' && f.status !== 'done' && f.status !== 'dismissed').length;
    const openCount = followups.filter(f => f.status === 'open').length;
    const inProgressCount = followups.filter(f => f.status === 'in_progress').length;
    const doneCount = followups.filter(f => f.status === 'done').length;
    const dismissedCount = followups.filter(f => f.status === 'dismissed').length;

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
                    <h1 className="page-title">跟進事項</h1>
                    <p className="text-sm text-slate-500 mt-1">集中管理由 AI 建議或手動建立的跟進任務</p>
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

            {/* Summary Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {[
                    { label: '緊急待辦', value: urgentCount, color: 'text-red-700', bg: 'bg-red-50' },
                    { label: '進行中', value: inProgressCount, color: 'text-amber-700', bg: 'bg-amber-50' },
                    { label: '已完成', value: doneCount, color: 'text-emerald-700', bg: 'bg-emerald-50' },
                    { label: '總數', value: followups.length, color: 'text-slate-700', bg: 'bg-white' },
                ].map(stat => (
                    <div key={stat.label} className={cn('glass-card p-4', stat.bg)}>
                        <p className="text-xs text-slate-500">{stat.label}</p>
                        <p className={cn('text-2xl font-bold mt-1', stat.color)}>{stat.value}</p>
                    </div>
                ))}
            </div>

            {/* Filters */}
            <div className="space-y-2">
                <div className="flex gap-2 flex-wrap items-center">
                    {([
                        { key: 'all' as StatusFilter, label: '全部', count: followups.length },
                        { key: 'open' as StatusFilter, label: '待處理', count: openCount },
                        { key: 'in_progress' as StatusFilter, label: '進行中', count: inProgressCount },
                        { key: 'done' as StatusFilter, label: '已完成', count: doneCount },
                        { key: 'dismissed' as StatusFilter, label: '已略過', count: dismissedCount },
                    ]).map(f => (
                        <button
                            key={f.key}
                            onClick={() => setStatusFilter(f.key)}
                            className={cn(
                                'px-3 py-1.5 rounded-lg text-sm font-medium transition-all',
                                statusFilter === f.key
                                    ? 'bg-blue-600 text-white shadow-sm'
                                    : 'bg-white text-slate-600 hover:bg-slate-50 border border-slate-200'
                            )}
                        >
                            {f.label} ({f.count})
                        </button>
                    ))}
                </div>
                <div className="flex gap-2 flex-wrap items-center">
                    <span className="text-xs text-slate-400">優先級：</span>
                    {([
                        { key: 'all' as PriorityFilter, label: '全部' },
                        { key: 'urgent' as PriorityFilter, label: '緊急' },
                        { key: 'warning' as PriorityFilter, label: '注意' },
                        { key: 'info' as PriorityFilter, label: '參考' },
                    ]).map(f => (
                        <button
                            key={f.key}
                            onClick={() => setPriorityFilter(f.key)}
                            className={cn(
                                'px-3 py-1.5 rounded-lg text-sm font-medium transition-all',
                                priorityFilter === f.key
                                    ? 'bg-blue-600 text-white shadow-sm'
                                    : 'bg-white text-slate-600 hover:bg-slate-50 border border-slate-200'
                            )}
                        >
                            {f.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Cards */}
            {filtered.length === 0 ? (
                <div className="glass-card p-12 text-center">
                    <ListChecks size={36} className="text-slate-300 mx-auto mb-3" />
                    <p className="text-slate-500 font-medium">目前沒有待跟進事項</p>
                    <p className="text-sm text-slate-400 mt-1">系統運作正常</p>
                </div>
            ) : (
                <div className="grid gap-4">
                    {filtered.map(followup => {
                        const priorityCfg = PRIORITY_CONFIG[followup.priority];
                        const statusCfg = STATUS_CONFIG[followup.status];
                        const deptInfo = DEPT_INFO[followup.assigned_dept];
                        const isUpdating = updating === followup.id;
                        const isDone = followup.status === 'done' || followup.status === 'dismissed';

                        return (
                            <div
                                key={followup.id}
                                className={cn(
                                    'glass-card p-5 border-l-4 transition-opacity',
                                    priorityCfg.border,
                                    isDone && 'opacity-50'
                                )}
                            >
                                {/* Row 1: Title + badges */}
                                <div className="flex items-start justify-between gap-3 mb-2">
                                    <h3 className="text-sm font-semibold text-slate-800 leading-snug flex-1 min-w-0">
                                        {followup.title}
                                    </h3>
                                    <div className="flex items-center gap-1.5 shrink-0">
                                        <span className={cn('status-badge', statusCfg.bg, statusCfg.color)}>
                                            {statusCfg.label}
                                        </span>
                                        <span className={cn('status-badge', priorityCfg.bg, priorityCfg.color)}>
                                            {priorityCfg.label}
                                        </span>
                                    </div>
                                </div>

                                {/* Row 2: Description */}
                                <p className="text-[13px] text-slate-600 leading-relaxed whitespace-pre-line mb-3">
                                    {followup.description}
                                </p>

                                {/* Row 3: Metadata */}
                                <div className="flex items-center gap-3 flex-wrap text-xs text-slate-500 mb-3">
                                    {deptInfo && (
                                        <span
                                            className="status-badge"
                                            style={{ backgroundColor: deptInfo.lightColor, color: deptInfo.color }}
                                        >
                                            {deptInfo.name}
                                        </span>
                                    )}
                                    {followup.assigned_to && (
                                        <span className="flex items-center gap-1">
                                            <User size={12} className="text-slate-400" />
                                            {followup.assigned_to}
                                        </span>
                                    )}
                                    {followup.due_at && (
                                        <span className="flex items-center gap-1">
                                            <Clock size={12} className="text-slate-400" />
                                            截止 {formatDateTime(followup.due_at)}
                                        </span>
                                    )}
                                    {followup.source_type === 'suggestion' && (
                                        <span className="flex items-center gap-1">
                                            <Lightbulb size={12} className="text-violet-400" />
                                            <span className="text-violet-600">AI 建議</span>
                                        </span>
                                    )}
                                    <span className="flex items-center gap-1 text-slate-400">
                                        <Clock size={11} />
                                        {formatDateTime(followup.created_at)}
                                    </span>
                                </div>

                                {/* Rooms */}
                                {followup.related_rooms.length > 0 && (
                                    <div className="flex items-center gap-1.5 flex-wrap mb-3">
                                        <Home size={12} className="text-slate-400 shrink-0" />
                                        {followup.related_rooms.map(room => (
                                            <Link
                                                key={room}
                                                href={`/rooms?highlight=${room}`}
                                                className="text-[11px] px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded font-mono hover:bg-blue-100 hover:text-blue-700 transition-colors"
                                            >
                                                {room}
                                            </Link>
                                        ))}
                                    </div>
                                )}

                                {/* Actions */}
                                {!isDone && (
                                    <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
                                        {followup.status === 'open' && (
                                            <button
                                                onClick={() => updateStatus(followup.id, 'in_progress')}
                                                disabled={isUpdating}
                                                className={cn(
                                                    'px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
                                                    'bg-amber-50 text-amber-700 hover:bg-amber-100',
                                                    'flex items-center gap-1.5 disabled:opacity-50'
                                                )}
                                            >
                                                <Play size={13} />
                                                開始處理
                                            </button>
                                        )}
                                        <button
                                            onClick={() => updateStatus(followup.id, 'done')}
                                            disabled={isUpdating}
                                            className={cn(
                                                'px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
                                                'bg-emerald-50 text-emerald-700 hover:bg-emerald-100',
                                                'flex items-center gap-1.5 disabled:opacity-50'
                                            )}
                                        >
                                            <CheckCircle2 size={13} />
                                            標記完成
                                        </button>
                                        <button
                                            onClick={() => updateStatus(followup.id, 'dismissed')}
                                            disabled={isUpdating}
                                            className={cn(
                                                'px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
                                                'bg-slate-50 text-slate-500 hover:bg-slate-100',
                                                'flex items-center gap-1.5 disabled:opacity-50'
                                            )}
                                        >
                                            <XCircle size={13} />
                                            略過
                                        </button>
                                    </div>
                                )}

                                {/* Completed/Dismissed state indicator */}
                                {isDone && (
                                    <div className="pt-2 border-t border-slate-100">
                                        <span className={cn('text-xs font-medium flex items-center gap-1.5', statusCfg.color)}>
                                            {followup.status === 'done' ? <CheckCircle2 size={13} /> : <XCircle size={13} />}
                                            {statusCfg.label}
                                        </span>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
