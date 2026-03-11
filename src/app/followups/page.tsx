'use client';

import { Suspense, useState, useEffect, useCallback } from 'react';
import {
    ListChecks, RefreshCw, AlertTriangle, AlertCircle, Info,
    Home, Play, CheckCircle2, XCircle, Clock, Lightbulb, User, Undo2, History
} from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { cn, formatDateTime } from '@/lib/utils';
import { useToast } from '@/components/Toast';
import AuditTrailComponent from '@/components/AuditTrail';
import { usePolling } from '@/hooks/usePolling';
import {
    AuditLog,
    DeptCode,
    DEPT_INFO,
    Followup,
    FollowupStatus,
} from '@/lib/types';

type FollowupRecord = Followup & {
    audit_logs: AuditLog[];
    last_log: AuditLog | null;
};

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

const OPERATOR_STORAGE_KEY = 'tpsoho-operator-name';

function sortFollowups(items: FollowupRecord[]): FollowupRecord[] {
    const priorityOrder: Record<string, number> = { urgent: 0, warning: 1, info: 2 };
    const statusOrder: Record<string, number> = { open: 0, in_progress: 1, done: 2, dismissed: 3 };

    return [...items].sort((a, b) => {
        const statusDiff = statusOrder[a.status] - statusOrder[b.status];
        if (statusDiff !== 0) return statusDiff;
        const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
        if (priorityDiff !== 0) return priorityDiff;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
}

function FollowupsPageContent() {
    const searchParams = useSearchParams();
    const [followups, setFollowups] = useState<FollowupRecord[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
    const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>('all');
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [updating, setUpdating] = useState<string | null>(null);
    const [operatorName, setOperatorName] = useState('');
    const [actionReasons, setActionReasons] = useState<Record<string, string>>({});
    const { showToast } = useToast();

    useEffect(() => {
        const saved = window.localStorage.getItem(OPERATOR_STORAGE_KEY);
        if (saved) setOperatorName(saved);
    }, []);

    useEffect(() => {
        if (operatorName.trim()) {
            window.localStorage.setItem(OPERATOR_STORAGE_KEY, operatorName.trim());
        }
    }, [operatorName]);

    const fetchFollowups = useCallback(async () => {
        try {
            const res = await fetch('/api/followups');
            if (!res.ok) throw new Error('載入失敗');
            setFollowups(await res.json());
        } catch (e: unknown) {
            showToast(e instanceof Error ? e.message : '載入跟進事項失敗', 'error');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [showToast]);

    useEffect(() => { fetchFollowups(); }, [fetchFollowups]);

    usePolling(fetchFollowups, 5000);

    useEffect(() => {
        const nextStatus = searchParams.get('status');
        const nextPriority = searchParams.get('priority');

        if (nextStatus === 'open' || nextStatus === 'in_progress' || nextStatus === 'done' || nextStatus === 'dismissed') {
            setStatusFilter(nextStatus);
        } else {
            setStatusFilter('all');
        }

        if (nextPriority === 'urgent' || nextPriority === 'warning' || nextPriority === 'info') {
            setPriorityFilter(nextPriority);
        } else {
            setPriorityFilter('all');
        }
    }, [searchParams]);

    const handleRefresh = () => {
        setRefreshing(true);
        fetchFollowups();
    };

    const updateStatus = async (id: string, newStatus: FollowupStatus) => {
        const actor = operatorName.trim();
        const reason = (actionReasons[id] || '').trim();

        if (!actor) {
            showToast('請先填寫操作人', 'error');
            return;
        }

        if (!reason) {
            showToast('請先填寫操作原因', 'error');
            return;
        }

        setUpdating(id);
        try {
            const res = await fetch('/api/followups', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id, status: newStatus, actor, reason }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || '更新失敗');
            showToast(`已更新為「${STATUS_CONFIG[newStatus].label}」並記錄`, 'success');
            setActionReasons(prev => ({ ...prev, [id]: '' }));
            fetchFollowups();
        } catch (e: unknown) {
            showToast(e instanceof Error ? e.message : '更新失敗', 'error');
        } finally {
            setUpdating(null);
        }
    };

    const focusRooms = (searchParams.get('rooms') || '')
        .split(',')
        .map(item => item.trim())
        .filter(Boolean);
    const activeOnly = searchParams.get('active') === 'true';

    let filtered = followups;
    if (statusFilter !== 'all') filtered = filtered.filter(f => f.status === statusFilter);
    if (priorityFilter !== 'all') filtered = filtered.filter(f => f.priority === priorityFilter);
    if (activeOnly) filtered = filtered.filter(f => f.status === 'open' || f.status === 'in_progress');
    if (focusRooms.length > 0) filtered = filtered.filter(f => f.related_rooms.some(room => focusRooms.includes(room)));
    filtered = sortFollowups(filtered);
    const selectedFollowup = filtered.find(followup => followup.id === selectedId) || filtered[0] || null;

    const urgentCount = followups.filter(f => f.priority === 'urgent' && f.status !== 'done' && f.status !== 'dismissed').length;
    const openCount = followups.filter(f => f.status === 'open').length;
    const inProgressCount = followups.filter(f => f.status === 'in_progress').length;
    const doneCount = followups.filter(f => f.status === 'done').length;
    const dismissedCount = followups.filter(f => f.status === 'dismissed').length;

    useEffect(() => {
        if (filtered.length === 0) {
            setSelectedId(null);
            return;
        }

        if (!filtered.some(followup => followup.id === selectedId)) {
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
            <div className="flex items-start justify-between gap-4">
                <div>
                    <h1 className="page-title">跟進事項</h1>
                    <p className="text-sm text-slate-500 mt-1">集中管理由 AI 建議或手動建立的跟進任務，所有狀態變更都會留底。</p>
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

            <div className="glass-card p-4 bg-blue-50/70 border border-blue-100">
                <label className="text-sm font-semibold text-slate-700 block mb-2">操作人</label>
                <input
                    value={operatorName}
                    onChange={event => setOperatorName(event.target.value)}
                    placeholder="例如：Michael / Karen / Duty Phone"
                    className="w-full lg:max-w-sm rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                />
                <p className="text-xs text-slate-400 mt-2">開始處理、完成、略過、退回都會記錄這個操作人。</p>
            </div>

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

            <div className="space-y-2">
                {(focusRooms.length > 0 || activeOnly) && (
                    <div className="glass-card p-3 bg-blue-50/70 border border-blue-100 flex items-center justify-between gap-3 flex-wrap">
                        <div>
                            <p className="text-sm font-medium text-blue-800">已套用通知上下文</p>
                            <p className="text-xs text-blue-600 mt-1">
                                {focusRooms.length > 0
                                    ? `相關房間：${focusRooms.join('、')}`
                                    : '只顯示仍需處理的跟進事項'}
                                {focusRooms.length > 0 && activeOnly ? ' · ' : ''}
                                {activeOnly ? '已隱藏完成/略過項目' : ''}
                            </p>
                        </div>
                        <Link
                            href="/followups"
                            className="text-xs font-medium text-blue-700 hover:text-blue-800 transition-colors"
                        >
                            清除篩選
                        </Link>
                    </div>
                )}

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

            {filtered.length === 0 ? (
                <div className="glass-card p-12 text-center">
                    <ListChecks size={36} className="text-slate-300 mx-auto mb-3" />
                    <p className="text-slate-500 font-medium">目前沒有待跟進事項</p>
                    <p className="text-sm text-slate-400 mt-1">系統運作正常</p>
                </div>
            ) : (
                <div className="scan-shell">
                    <div className="scan-grid">
                        {filtered.map(followup => {
                            const priorityCfg = PRIORITY_CONFIG[followup.priority];
                            const statusCfg = STATUS_CONFIG[followup.status];
                            const deptInfo = DEPT_INFO[followup.assigned_dept as DeptCode];
                            const isActive = selectedFollowup?.id === followup.id;

                            return (
                                <button
                                    key={followup.id}
                                    type="button"
                                    onClick={() => setSelectedId(followup.id)}
                                    className={cn(
                                        'scan-tile border-l-4',
                                        priorityCfg.border,
                                        isActive && 'scan-tile-active',
                                        (followup.status === 'done' || followup.status === 'dismissed') && 'opacity-75'
                                    )}
                                >
                                    <div className="space-y-3">
                                        <div className="flex items-start justify-between gap-2">
                                            <div className="flex gap-1.5 flex-wrap">
                                                <span className={cn('scan-chip', statusCfg.bg, statusCfg.color)}>
                                                    {statusCfg.label}
                                                </span>
                                                <span className={cn('scan-chip', priorityCfg.bg, priorityCfg.color)}>
                                                    {priorityCfg.label}
                                                </span>
                                            </div>
                                            <span className="scan-kicker">任務</span>
                                        </div>

                                        <div>
                                            <p className="scan-title scan-clamp-3">{followup.title}</p>
                                            <p className="scan-body scan-clamp-4 mt-2 whitespace-pre-line">{followup.description}</p>
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
                                            {followup.related_rooms.length > 0 && (
                                                <span className="scan-chip bg-slate-100 text-slate-600">
                                                    {followup.related_rooms.length} 間房
                                                </span>
                                            )}
                                        </div>
                                        <div className="scan-meta">
                                            {followup.due_at && (
                                                <span className="inline-flex items-center gap-1">
                                                    <Clock size={11} />
                                                    截止 {formatDateTime(followup.due_at)}
                                                </span>
                                            )}
                                            {!followup.due_at && (
                                                <span className="inline-flex items-center gap-1">
                                                    <Clock size={11} />
                                                    {formatDateTime(followup.created_at)}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </button>
                            );
                        })}
                    </div>

                    {selectedFollowup && (() => {
                        const followup = selectedFollowup;
                        const priorityCfg = PRIORITY_CONFIG[followup.priority];
                        const statusCfg = STATUS_CONFIG[followup.status];
                        const deptInfo = DEPT_INFO[followup.assigned_dept as DeptCode];
                        const isUpdating = updating === followup.id;
                        const reason = actionReasons[followup.id] || '';
                        const canSubmit = operatorName.trim().length > 0 && reason.trim().length > 0;

                        return (
                            <div className="scan-detail">
                                <div className="flex items-start justify-between gap-3">
                                    <div>
                                        <p className="scan-kicker">任務詳情</p>
                                        <h2 className="text-xl font-bold text-slate-800 mt-2">{followup.title}</h2>
                                    </div>
                                    <div className="flex gap-2 flex-wrap justify-end">
                                        <span className={cn('status-badge', statusCfg.bg, statusCfg.color)}>
                                            {statusCfg.label}
                                        </span>
                                        <span className={cn('status-badge', priorityCfg.bg, priorityCfg.color)}>
                                            {priorityCfg.label}
                                        </span>
                                    </div>
                                </div>

                                <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                                    <p className="text-sm leading-relaxed text-slate-700 whitespace-pre-line">{followup.description}</p>
                                </div>

                                <div className="mt-5 flex items-center gap-3 flex-wrap text-xs text-slate-500">
                                    {deptInfo && (
                                        <span
                                            className="status-badge"
                                            style={{ backgroundColor: deptInfo.lightColor, color: deptInfo.color }}
                                        >
                                            {deptInfo.name}
                                        </span>
                                    )}
                                    {followup.assigned_to && (
                                        <span className="inline-flex items-center gap-1">
                                            <User size={12} className="text-slate-400" />
                                            {followup.assigned_to}
                                        </span>
                                    )}
                                    {followup.source_type === 'suggestion' && (
                                        <span className="inline-flex items-center gap-1 text-violet-600">
                                            <Lightbulb size={12} className="text-violet-400" />
                                            AI 建議
                                        </span>
                                    )}
                                    <span className="inline-flex items-center gap-1 text-slate-400">
                                        <Clock size={11} />
                                        建立於 {formatDateTime(followup.created_at)}
                                    </span>
                                </div>

                                <div className="mt-5">
                                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-[0.18em]">相關房間</p>
                                    <div className="mt-2 flex items-center gap-1.5 flex-wrap">
                                        {followup.related_rooms.length > 0 ? followup.related_rooms.map(room => (
                                            <Link
                                                key={room}
                                                href={`/rooms?highlight=${room}`}
                                                className={cn(
                                                    'text-[11px] px-2 py-1 rounded-md font-mono transition-colors',
                                                    focusRooms.includes(room)
                                                        ? 'bg-blue-100 text-blue-700'
                                                        : 'bg-slate-100 text-slate-600 hover:bg-blue-100 hover:text-blue-700'
                                                )}
                                            >
                                                {room}
                                            </Link>
                                        )) : (
                                            <span className="text-sm text-slate-400">沒有指定房間</span>
                                        )}
                                    </div>
                                </div>

                                <div className="mt-5 rounded-2xl border border-slate-200 bg-white/70 p-4 space-y-3">
                                    <div className="flex items-center justify-between gap-3 flex-wrap">
                                        <div>
                                            <p className="text-sm font-semibold text-slate-700">操作原因</p>
                                            <p className="text-xs text-slate-400 mt-0.5">任何狀態變更都必須留下原因，方便日後追查及還原。</p>
                                        </div>
                                        {followup.last_log && (
                                            <p className="text-xs text-slate-400">
                                                最近：{followup.last_log.actor} · {formatDateTime(followup.last_log.created_at)}
                                            </p>
                                        )}
                                    </div>

                                    <textarea
                                        value={reason}
                                        onChange={event => setActionReasons(prev => ({ ...prev, [followup.id]: event.target.value }))}
                                        placeholder="例如：已聯絡工程部開始跟進；或：誤按完成，退回進行中"
                                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100 min-h-[88px] resize-y"
                                    />

                                    <div className="flex items-center gap-2 pt-1 border-t border-slate-100 flex-wrap">
                                        {followup.status === 'open' && (
                                            <>
                                                <button
                                                    onClick={() => updateStatus(followup.id, 'in_progress')}
                                                    disabled={isUpdating || !canSubmit}
                                                    className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all bg-amber-50 text-amber-700 hover:bg-amber-100 flex items-center gap-1.5 disabled:opacity-50"
                                                >
                                                    <Play size={13} />
                                                    開始處理
                                                </button>
                                                <button
                                                    onClick={() => updateStatus(followup.id, 'done')}
                                                    disabled={isUpdating || !canSubmit}
                                                    className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all bg-emerald-50 text-emerald-700 hover:bg-emerald-100 flex items-center gap-1.5 disabled:opacity-50"
                                                >
                                                    <CheckCircle2 size={13} />
                                                    直接完成
                                                </button>
                                                <button
                                                    onClick={() => updateStatus(followup.id, 'dismissed')}
                                                    disabled={isUpdating || !canSubmit}
                                                    className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all bg-slate-50 text-slate-500 hover:bg-slate-100 flex items-center gap-1.5 disabled:opacity-50"
                                                >
                                                    <XCircle size={13} />
                                                    略過
                                                </button>
                                            </>
                                        )}

                                        {followup.status === 'in_progress' && (
                                            <>
                                                <button
                                                    onClick={() => updateStatus(followup.id, 'open')}
                                                    disabled={isUpdating || !canSubmit}
                                                    className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all bg-slate-100 text-slate-700 hover:bg-slate-200 flex items-center gap-1.5 disabled:opacity-50"
                                                >
                                                    <Undo2 size={13} />
                                                    退回待處理
                                                </button>
                                                <button
                                                    onClick={() => updateStatus(followup.id, 'done')}
                                                    disabled={isUpdating || !canSubmit}
                                                    className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all bg-emerald-50 text-emerald-700 hover:bg-emerald-100 flex items-center gap-1.5 disabled:opacity-50"
                                                >
                                                    <CheckCircle2 size={13} />
                                                    標記完成
                                                </button>
                                                <button
                                                    onClick={() => updateStatus(followup.id, 'dismissed')}
                                                    disabled={isUpdating || !canSubmit}
                                                    className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all bg-slate-50 text-slate-500 hover:bg-slate-100 flex items-center gap-1.5 disabled:opacity-50"
                                                >
                                                    <XCircle size={13} />
                                                    略過
                                                </button>
                                            </>
                                        )}

                                        {followup.status === 'done' && (
                                            <button
                                                onClick={() => updateStatus(followup.id, 'in_progress')}
                                                disabled={isUpdating || !canSubmit}
                                                className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all bg-slate-100 text-slate-700 hover:bg-slate-200 flex items-center gap-1.5 disabled:opacity-50"
                                            >
                                                <Undo2 size={13} />
                                                退回進行中
                                            </button>
                                        )}

                                        {followup.status === 'dismissed' && (
                                            <button
                                                onClick={() => updateStatus(followup.id, 'open')}
                                                disabled={isUpdating || !canSubmit}
                                                className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all bg-slate-100 text-slate-700 hover:bg-slate-200 flex items-center gap-1.5 disabled:opacity-50"
                                            >
                                                <Undo2 size={13} />
                                                重新開啟
                                            </button>
                                        )}
                                    </div>

                                    {!canSubmit && (
                                        <p className="text-xs text-amber-600">請先填寫操作人及原因，先可以變更狀態。</p>
                                    )}
                                </div>

                                <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3 mt-5 space-y-2">
                                    <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-500">
                                        <History size={13} />
                                        操作記錄
                                    </div>
                                    <AuditTrailComponent
                                        logs={followup.audit_logs}
                                        statusLabelFn={(s) => STATUS_CONFIG[s as FollowupStatus]?.label || s}
                                        showContainer={false}
                                    />
                                </div>
                            </div>
                        );
                    })()}
                </div>
            )}
        </div>
    );
}

export default function FollowupsPage() {
    return (
        <Suspense fallback={
            <div className="flex items-center justify-center h-[60vh]">
                <div className="w-10 h-10 border-3 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
            </div>
        }>
            <FollowupsPageContent />
        </Suspense>
    );
}
