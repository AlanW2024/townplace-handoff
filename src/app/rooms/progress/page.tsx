'use client';

import { useState, useCallback, useMemo } from 'react';
import { usePolling } from '@/hooks/usePolling';
import { Filter, CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import {
    RoomProgressEntry,
    ProgressCategory,
    ProgressStatus,
    PROGRESS_CATEGORY_LABELS,
    PROGRESS_STATUS_LABELS,
} from '@/lib/types';
import { cn } from '@/lib/utils';

type CategoryFilter = ProgressCategory | 'all';
type StatusFilter = ProgressStatus | 'all';

function getStatusColor(status: ProgressStatus) {
    switch (status) {
        case 'completed': return 'bg-emerald-100 text-emerald-700';
        case 'in_progress': return 'bg-amber-100 text-amber-700';
        case 'pending': return 'bg-red-100 text-red-700';
        case 'follow_up': return 'bg-purple-100 text-purple-700';
    }
}

function getCategoryColor(category: ProgressCategory) {
    switch (category) {
        case 'check_in': return 'bg-blue-100 text-blue-700';
        case 'check_out': return 'bg-indigo-100 text-indigo-700';
        case 'final': return 'bg-cyan-100 text-cyan-700';
        case 'ac': return 'bg-sky-100 text-sky-700';
        case 'plumbing': return 'bg-teal-100 text-teal-700';
        case 'paint': return 'bg-orange-100 text-orange-700';
        case 'mold': return 'bg-lime-100 text-lime-700';
        case 'cleaning': return 'bg-emerald-100 text-emerald-700';
        case 'appliance': return 'bg-violet-100 text-violet-700';
        case 'door_lock': return 'bg-rose-100 text-rose-700';
        case 'pest_control': return 'bg-yellow-100 text-yellow-700';
        case 'maintenance': return 'bg-amber-100 text-amber-700';
        case 'other': return 'bg-slate-100 text-slate-600';
    }
}

function formatDate(dateStr: string): string {
    const [y, m, d] = dateStr.split('-');
    return `${d}/${m}/${y}`;
}

function getToday(): string {
    return new Date().toISOString().slice(0, 10);
}

function shiftDate(dateStr: string, days: number): string {
    const d = new Date(dateStr + 'T00:00:00');
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
}

export default function ProgressPage() {
    const [entries, setEntries] = useState<RoomProgressEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all');
    const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
    const [dateFrom, setDateFrom] = useState<string>('');
    const [dateTo, setDateTo] = useState<string>('');
    const [roomSearch, setRoomSearch] = useState('');

    const fetchEntries = useCallback(async () => {
        try {
            const params = new URLSearchParams();
            if (roomSearch.trim()) params.set('room', roomSearch.trim().toUpperCase());
            if (categoryFilter !== 'all') params.set('category', categoryFilter);
            if (dateFrom) params.set('from', dateFrom);
            if (dateTo) params.set('to', dateTo);

            const res = await fetch(`/api/rooms/progress?${params}`);
            if (!res.ok) throw new Error('載入失敗');
            const data = await res.json();
            setEntries(data.entries);
            setError(null);
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : '載入失敗');
        } finally {
            setLoading(false);
        }
    }, [roomSearch, categoryFilter, dateFrom, dateTo]);

    usePolling(fetchEntries, 10000);

    // Client-side status filter (API doesn't support it)
    const filtered = useMemo(() => {
        if (statusFilter === 'all') return entries;
        return entries.filter(e => e.status === statusFilter);
    }, [entries, statusFilter]);

    // Group by date
    const grouped = useMemo(() => {
        const map = new Map<string, RoomProgressEntry[]>();
        for (const entry of filtered) {
            const list = map.get(entry.summary_date) || [];
            list.push(entry);
            map.set(entry.summary_date, list);
        }
        return Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0]));
    }, [filtered]);

    // Stats
    const stats = useMemo(() => {
        const total = filtered.length;
        const completed = filtered.filter(e => e.status === 'completed').length;
        const inProgress = filtered.filter(e => e.status === 'in_progress').length;
        const pending = filtered.filter(e => e.status === 'pending').length;
        const followUp = filtered.filter(e => e.status === 'follow_up').length;
        const uniqueRooms = new Set(filtered.map(e => e.room_id)).size;
        const uniqueDates = new Set(filtered.map(e => e.summary_date)).size;
        return { total, completed, inProgress, pending, followUp, uniqueRooms, uniqueDates };
    }, [filtered]);

    const handleQuickDate = (label: string) => {
        const today = getToday();
        switch (label) {
            case 'today':
                setDateFrom(today);
                setDateTo(today);
                break;
            case 'week':
                setDateFrom(shiftDate(today, -7));
                setDateTo(today);
                break;
            case 'month':
                setDateFrom(shiftDate(today, -30));
                setDateTo(today);
                break;
            case 'all':
                setDateFrom('');
                setDateTo('');
                break;
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-[60vh]">
                <div className="flex flex-col items-center gap-3">
                    <div className="w-10 h-10 border-3 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
                    <span className="text-sm text-slate-400">載入中...</span>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div>
                <h1 className="page-title">每日進度追蹤</h1>
                <p className="text-sm text-slate-500 mt-1">
                    從「是日跟進」訊息自動提取 · 共 {stats.total} 條記錄 · {stats.uniqueRooms} 間房 · {stats.uniqueDates} 天
                </p>
            </div>

            {error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
                    {error}
                </div>
            )}

            {/* Stats cards */}
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
                {[
                    { label: '已完成', value: stats.completed, color: 'text-emerald-700', bg: 'bg-emerald-50' },
                    { label: '進行中', value: stats.inProgress, color: 'text-amber-700', bg: 'bg-amber-50' },
                    { label: '待處理', value: stats.pending, color: 'text-red-700', bg: 'bg-red-50' },
                    { label: '需跟進', value: stats.followUp, color: 'text-purple-700', bg: 'bg-purple-50' },
                    { label: '涉及房間', value: stats.uniqueRooms, color: 'text-blue-700', bg: 'bg-blue-50' },
                ].map(stat => (
                    <div key={stat.label} className={cn('glass-card p-4', stat.bg)}>
                        <p className="text-xs text-slate-500">{stat.label}</p>
                        <p className={cn('text-2xl font-bold', stat.color)}>{stat.value}</p>
                    </div>
                ))}
            </div>

            {/* Filters */}
            <div className="glass-card p-4 space-y-3">
                {/* Date quick filters */}
                <div className="flex items-center gap-2 flex-wrap">
                    <CalendarDays size={14} className="text-slate-400" />
                    <span className="text-xs text-slate-500">日期：</span>
                    {[
                        { key: 'today', label: '今天' },
                        { key: 'week', label: '近 7 天' },
                        { key: 'month', label: '近 30 天' },
                        { key: 'all', label: '全部' },
                    ].map(q => (
                        <button
                            key={q.key}
                            onClick={() => handleQuickDate(q.key)}
                            className={cn(
                                'px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
                                (!dateFrom && !dateTo && q.key === 'all') || (dateFrom && q.key !== 'all')
                                    ? 'bg-white text-slate-500 hover:bg-slate-50 border border-slate-200'
                                    : 'bg-white text-slate-500 hover:bg-slate-50 border border-slate-200'
                            )}
                        >
                            {q.label}
                        </button>
                    ))}
                    <div className="flex items-center gap-1 ml-2">
                        <input
                            type="date"
                            value={dateFrom}
                            onChange={e => setDateFrom(e.target.value)}
                            className="text-xs border border-slate-200 rounded-lg px-2 py-1.5"
                        />
                        <span className="text-xs text-slate-400">至</span>
                        <input
                            type="date"
                            value={dateTo}
                            onChange={e => setDateTo(e.target.value)}
                            className="text-xs border border-slate-200 rounded-lg px-2 py-1.5"
                        />
                    </div>
                </div>

                {/* Room search + category + status filters */}
                <div className="flex items-center gap-2 flex-wrap">
                    <Filter size={14} className="text-slate-400" />
                    <input
                        type="text"
                        placeholder="搜尋房間 (如 10F)"
                        value={roomSearch}
                        onChange={e => setRoomSearch(e.target.value)}
                        className="text-xs border border-slate-200 rounded-lg px-3 py-1.5 w-32"
                    />
                    <select
                        value={categoryFilter}
                        onChange={e => setCategoryFilter(e.target.value as CategoryFilter)}
                        className="text-xs border border-slate-200 rounded-lg px-2 py-1.5"
                    >
                        <option value="all">全部類別</option>
                        {(Object.entries(PROGRESS_CATEGORY_LABELS) as [ProgressCategory, string][]).map(([k, v]) => (
                            <option key={k} value={k}>{v}</option>
                        ))}
                    </select>
                    <select
                        value={statusFilter}
                        onChange={e => setStatusFilter(e.target.value as StatusFilter)}
                        className="text-xs border border-slate-200 rounded-lg px-2 py-1.5"
                    >
                        <option value="all">全部狀態</option>
                        {(Object.entries(PROGRESS_STATUS_LABELS) as [ProgressStatus, string][]).map(([k, v]) => (
                            <option key={k} value={k}>{v}</option>
                        ))}
                    </select>
                </div>
            </div>

            {/* Results grouped by date */}
            {grouped.length === 0 ? (
                <div className="glass-card p-8 text-center">
                    <p className="text-slate-400 text-sm">暫無進度記錄</p>
                    <p className="text-slate-300 text-xs mt-2">上傳 WhatsApp 對話檔即可自動提取「是日跟進」內容</p>
                </div>
            ) : (
                <div className="space-y-4">
                    {grouped.map(([date, items]) => (
                        <div key={date} className="glass-card overflow-hidden">
                            <div className="px-4 py-3 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <CalendarDays size={14} className="text-slate-400" />
                                    <span className="text-sm font-semibold text-slate-700">{formatDate(date)}</span>
                                </div>
                                <span className="text-xs text-slate-400">{items.length} 條</span>
                            </div>
                            <div className="divide-y divide-slate-50">
                                {items.map(entry => (
                                    <div key={entry.id} className="px-4 py-3 flex items-center gap-3 hover:bg-slate-50/50 transition-colors">
                                        <span className="text-sm font-bold text-slate-700 w-12 shrink-0">{entry.room_id}</span>
                                        <span className={cn('status-badge text-[10px] shrink-0', getCategoryColor(entry.category))}>
                                            {PROGRESS_CATEGORY_LABELS[entry.category]}
                                        </span>
                                        <span className={cn('status-badge text-[10px] shrink-0', getStatusColor(entry.status))}>
                                            {PROGRESS_STATUS_LABELS[entry.status]}
                                        </span>
                                        <span className="text-xs text-slate-500 truncate flex-1">{entry.raw_line}</span>
                                        <span className="text-[10px] text-slate-300 shrink-0">{entry.sender_name}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
