'use client';

import { useState, useEffect, useCallback } from 'react';
import { usePolling } from '@/hooks/usePolling';
import { Lightbulb, RefreshCw, AlertTriangle, AlertCircle, Info, Home, ClipboardPlus, Check, ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { useToast } from '@/components/Toast';
import { DeptCode } from '@/lib/types';

type SuggestionPriority = 'urgent' | 'warning' | 'info';
type SuggestionCategory =
    | 'cleaning_backlog'
    | 'engineering_bottleneck'
    | 'handoff_delay'
    | 'document_overdue'
    | 'booking_conflict'
    | 'checkout_followup'
    | 'workload_imbalance'
    | 'daily_priority';

interface Suggestion {
    id: string;
    priority: SuggestionPriority;
    category: SuggestionCategory;
    title: string;
    description: string;
    affected_rooms: string[];
    recommended_action: string;
    created_at: string;
}

interface Followup {
    id: string;
    source_type: string;
    source_id: string;
}

interface BatchRunSummary {
    id: string;
    status: 'queued' | 'running' | 'completed' | 'failed';
    actionable_count: number;
    context_count: number;
    irrelevant_count: number;
    review_count: number;
    summary_digest: string | null;
    created_at: string;
    upload_batch: {
        id: string;
        chat_name: string;
        source_file_name: string;
        total_messages: number;
    } | null;
    event_count: number;
}

interface BatchRunDetail extends BatchRunSummary {
    events: Array<{
        id: string;
        event_type: string;
        title: string;
        description: string;
        room_display_codes: string[];
        evidence_message_ids: string[];
        confidence: number;
    }>;
}

const PRIORITY_CONFIG: Record<SuggestionPriority, { label: string; color: string; bg: string; border: string; icon: typeof AlertTriangle }> = {
    urgent: { label: '緊急', color: 'text-red-700', bg: 'bg-red-100', border: 'border-l-red-500', icon: AlertTriangle },
    warning: { label: '注意', color: 'text-amber-700', bg: 'bg-amber-100', border: 'border-l-amber-500', icon: AlertCircle },
    info: { label: '參考', color: 'text-blue-700', bg: 'bg-blue-100', border: 'border-l-blue-500', icon: Info },
};

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

const CATEGORY_COLORS: Record<SuggestionCategory, string> = {
    cleaning_backlog: 'bg-emerald-100 text-emerald-700',
    engineering_bottleneck: 'bg-amber-100 text-amber-700',
    handoff_delay: 'bg-orange-100 text-orange-700',
    document_overdue: 'bg-red-100 text-red-700',
    booking_conflict: 'bg-purple-100 text-purple-700',
    checkout_followup: 'bg-pink-100 text-pink-700',
    workload_imbalance: 'bg-slate-100 text-slate-700',
    daily_priority: 'bg-blue-100 text-blue-700',
};

const CATEGORY_DEPT: Record<SuggestionCategory, DeptCode> = {
    cleaning_backlog: 'clean',
    engineering_bottleneck: 'eng',
    handoff_delay: 'conc',
    document_overdue: 'lease',
    booking_conflict: 'lease',
    checkout_followup: 'conc',
    workload_imbalance: 'mgmt',
    daily_priority: 'mgmt',
};

type FilterType = 'all' | SuggestionPriority;

export default function AIPage() {
    const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
    const [followups, setFollowups] = useState<Followup[]>([]);
    const [batchRuns, setBatchRuns] = useState<BatchRunSummary[]>([]);
    const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
    const [selectedRun, setSelectedRun] = useState<BatchRunDetail | null>(null);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<FilterType>('all');
    const [refreshing, setRefreshing] = useState(false);
    const [creating, setCreating] = useState<string | null>(null);
    const { showToast } = useToast();

    const fetchData = useCallback(async () => {
        try {
            const [sugRes, fuRes, batchRes] = await Promise.all([
                fetch('/api/suggestions'),
                fetch('/api/followups'),
                fetch('/api/ai-batches'),
            ]);
            if (!sugRes.ok) throw new Error('載入建議失敗');
            if (!fuRes.ok) throw new Error('載入跟進事項失敗');
            if (!batchRes.ok) throw new Error('載入 AI 批次分析失敗');
            setSuggestions(await sugRes.json());
            setFollowups(await fuRes.json());
            const runs = await batchRes.json();
            setBatchRuns(runs);
            const runId = selectedRunId || runs[0]?.id || null;
            if (!selectedRunId && runId) {
                setSelectedRunId(runId);
            }
            if (runId) {
                const detailRes = await fetch(`/api/ai-batches/${runId}`);
                if (detailRes.ok) {
                    setSelectedRun(await detailRes.json());
                }
            }
        } catch (e: unknown) {
            showToast(e instanceof Error ? e.message : '操作失敗', 'error');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [selectedRunId, showToast]);

    useEffect(() => { fetchData(); }, [fetchData]);

    usePolling(fetchData, 5000);

    useEffect(() => {
        if (!selectedRunId) {
            setSelectedRun(null);
            return;
        }
        void fetchData();
    }, [fetchData, selectedRunId]);

    const handleRefresh = () => {
        setRefreshing(true);
        fetchData();
    };

    const hasFollowup = (suggestionId: string) =>
        followups.some(f => f.source_type === 'suggestion' && f.source_id === suggestionId);

    const handleCreateFollowup = async (suggestion: Suggestion) => {
        if (hasFollowup(suggestion.id)) return;
        setCreating(suggestion.id);
        try {
            const res = await fetch('/api/followups', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title: suggestion.title,
                    description: `${suggestion.description}\n\n建議行動：${suggestion.recommended_action}`,
                    source_type: 'suggestion',
                    source_id: suggestion.id,
                    priority: suggestion.priority,
                    assigned_dept: CATEGORY_DEPT[suggestion.category],
                    related_rooms: suggestion.affected_rooms,
                }),
            });
            if (res.status === 409) {
                showToast('此建議已建立跟進事項', 'info');
                fetchData();
                return;
            }
            if (!res.ok) throw new Error('建立失敗');
            showToast('已建立跟進事項', 'success');
            fetchData();
        } catch (e: unknown) {
            showToast(e instanceof Error ? e.message : '操作失敗', 'error');
        } finally {
            setCreating(null);
        }
    };

    const filtered = filter === 'all' ? suggestions : suggestions.filter(s => s.priority === filter);

    const urgentCount = suggestions.filter(s => s.priority === 'urgent').length;
    const warningCount = suggestions.filter(s => s.priority === 'warning').length;
    const infoCount = suggestions.filter(s => s.priority === 'info').length;
    const affectedRooms = new Set(suggestions.flatMap(s => s.affected_rooms));
    const latestRun = batchRuns[0] ?? null;

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
            <div className="flex items-start justify-between">
                <div>
                    <h1 className="page-title">AI 管理建議</h1>
                    <p className="text-sm text-slate-500 mt-1">上半部顯示全檔對話 AI 分析，下半部保留管理建議與跟進入口</p>
                </div>
                <button
                    onClick={handleRefresh}
                    disabled={refreshing}
                    className="btn-primary text-sm flex items-center gap-2"
                >
                    <RefreshCw size={14} className={cn(refreshing && 'animate-spin')} />
                    刷新
                </button>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {[
                    { label: '最近批次', value: batchRuns.length, color: 'text-slate-700', bg: 'bg-white' },
                    { label: '可操作事件', value: latestRun?.actionable_count ?? 0, color: 'text-emerald-700', bg: 'bg-emerald-50' },
                    { label: '無關聊天', value: latestRun?.irrelevant_count ?? 0, color: 'text-slate-700', bg: 'bg-slate-50' },
                    { label: '需覆核', value: latestRun?.review_count ?? 0, color: 'text-amber-700', bg: 'bg-amber-50' },
                ].map(stat => (
                    <div key={stat.label} className={cn('glass-card p-4', stat.bg)}>
                        <p className="text-xs text-slate-500">{stat.label}</p>
                        <p className={cn('text-2xl font-bold mt-1', stat.color)}>{stat.value}</p>
                    </div>
                ))}
            </div>

            <div className="scan-shell">
                <div className="scan-grid">
                    {batchRuns.length === 0 ? (
                        <div className="glass-card p-5">
                            <p className="text-sm text-slate-500">暫時未有全檔 AI 分析記錄。</p>
                        </div>
                    ) : batchRuns.map(run => (
                        <button
                            key={run.id}
                            onClick={() => setSelectedRunId(run.id)}
                            className={cn(
                                'scan-tile text-left',
                                selectedRunId === run.id && 'ring-2 ring-blue-500 ring-offset-2'
                            )}
                        >
                            <div className="flex items-center justify-between gap-2">
                                <span className="text-sm font-semibold text-slate-800">{run.upload_batch?.chat_name || '未命名 upload'}</span>
                                <span className={cn(
                                    'status-badge',
                                    run.status === 'completed'
                                        ? 'bg-emerald-100 text-emerald-700'
                                        : run.status === 'failed'
                                            ? 'bg-red-100 text-red-700'
                                            : 'bg-blue-100 text-blue-700'
                                )}>
                                    {run.status}
                                </span>
                            </div>
                            <p className="mt-2 text-xs text-slate-500">{run.upload_batch?.source_file_name || '未記錄檔名'}</p>
                            <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-500">
                                <span>有用 {run.actionable_count}</span>
                                <span>覆核 {run.review_count}</span>
                                <span>無關 {run.irrelevant_count}</span>
                                <span>事件 {run.event_count}</span>
                            </div>
                        </button>
                    ))}
                </div>

                <div className="scan-detail">
                    {selectedRun ? (
                        <div className="space-y-4">
                            <div>
                                <h2 className="section-title">全檔對話摘要</h2>
                                <p className="text-xs text-slate-400 mt-1">
                                    {selectedRun.upload_batch?.chat_name || '未命名 upload'} · {selectedRun.upload_batch?.total_messages || 0} 則訊息
                                </p>
                            </div>
                            <div className="glass-card p-4">
                                <p className="text-sm leading-relaxed text-slate-700 whitespace-pre-wrap">
                                    {selectedRun.summary_digest || 'AI 尚未輸出摘要。'}
                                </p>
                            </div>
                            <div className="space-y-3">
                                <h3 className="text-sm font-semibold text-slate-700">事件候選</h3>
                                {selectedRun.events.length === 0 ? (
                                    <div className="glass-card p-4 text-sm text-slate-500">此批次暫時未有事件候選。</div>
                                ) : selectedRun.events.map(event => (
                                    <div key={event.id} className="glass-card p-4">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className="status-badge bg-slate-100 text-slate-600">{event.event_type}</span>
                                            {event.room_display_codes.map(code => (
                                                <span key={code} className="status-badge bg-blue-100 text-blue-700">{code}</span>
                                            ))}
                                            <span className="text-[11px] text-slate-400">信心 {Math.round(event.confidence * 100)}%</span>
                                        </div>
                                        <p className="mt-2 text-sm font-medium text-slate-800">{event.title}</p>
                                        <p className="mt-1 text-xs text-slate-500 leading-relaxed">{event.description}</p>
                                        <p className="mt-2 text-[11px] text-slate-400">
                                            Evidence: {event.evidence_message_ids.join(', ')}
                                        </p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ) : (
                        <div className="glass-card p-5 text-sm text-slate-500">選擇左邊一個 upload 分析結果。</div>
                    )}
                </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {[
                    { label: '緊急', value: urgentCount, color: 'text-red-700', bg: 'bg-red-50' },
                    { label: '注意', value: warningCount, color: 'text-amber-700', bg: 'bg-amber-50' },
                    { label: '參考', value: infoCount, color: 'text-blue-700', bg: 'bg-blue-50' },
                    { label: '受影響單位', value: affectedRooms.size, color: 'text-slate-700', bg: 'bg-white' },
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
                    { key: 'all' as FilterType, label: '全部', count: suggestions.length },
                    { key: 'urgent' as FilterType, label: '緊急', count: urgentCount },
                    { key: 'warning' as FilterType, label: '注意', count: warningCount },
                    { key: 'info' as FilterType, label: '參考', count: infoCount },
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

            {/* Suggestion Cards */}
            {filtered.length === 0 ? (
                <div className="glass-card p-12 text-center">
                    <Lightbulb size={40} className="text-slate-300 mx-auto mb-4" />
                    <p className="text-slate-500 font-medium">目前沒有管理建議</p>
                    <p className="text-sm text-slate-400 mt-1">一切運作正常</p>
                </div>
            ) : (
                <div className="grid gap-4">
                    {filtered.map(suggestion => {
                        const priorityCfg = PRIORITY_CONFIG[suggestion.priority];
                        const PriorityIcon = priorityCfg.icon;
                        const alreadyCreated = hasFollowup(suggestion.id);
                        const isCreating = creating === suggestion.id;

                        return (
                            <div
                                key={suggestion.id}
                                className={cn(
                                    'glass-card p-5 border-l-4',
                                    priorityCfg.border
                                )}
                            >
                                <div className="flex items-start gap-3">
                                    <PriorityIcon size={18} className={cn('shrink-0 mt-0.5', priorityCfg.color)} />
                                    <div className="flex-1 min-w-0">
                                        {/* Tags */}
                                        <div className="flex items-center gap-2 mb-2 flex-wrap">
                                            <span className={cn('status-badge', priorityCfg.bg, priorityCfg.color)}>
                                                {priorityCfg.label}
                                            </span>
                                            <span className={cn('status-badge', CATEGORY_COLORS[suggestion.category])}>
                                                {CATEGORY_LABELS[suggestion.category]}
                                            </span>
                                        </div>

                                        {/* Title & Description */}
                                        <h3 className="text-sm font-semibold text-slate-800 mb-1">{suggestion.title}</h3>
                                        <p className="text-xs text-slate-500 leading-relaxed">{suggestion.description}</p>

                                        {/* Affected Rooms */}
                                        {suggestion.affected_rooms.length > 0 && (
                                            <div className="flex items-center gap-1.5 mt-3 flex-wrap">
                                                <Home size={12} className="text-slate-400 shrink-0" />
                                                {suggestion.affected_rooms.map(room => (
                                                    <span
                                                        key={room}
                                                        className="text-[11px] px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded font-mono"
                                                    >
                                                        {room}
                                                    </span>
                                                ))}
                                            </div>
                                        )}

                                        {/* Recommended Action */}
                                        <div className="mt-3 p-3 bg-slate-50 rounded-lg">
                                            <p className="text-xs text-slate-500 mb-1 font-medium">建議行動</p>
                                            <p className="text-xs text-slate-700 leading-relaxed">{suggestion.recommended_action}</p>
                                        </div>

                                        {/* Create Followup Button */}
                                        <div className="mt-3 flex items-center gap-3">
                                            {alreadyCreated ? (
                                                <Link
                                                    href="/followups"
                                                    className="inline-flex items-center gap-1.5 text-xs text-emerald-600 font-medium hover:text-emerald-700 transition-colors"
                                                >
                                                    <Check size={14} />
                                                    已加入跟進事項
                                                    <ArrowRight size={12} />
                                                </Link>
                                            ) : (
                                                <button
                                                    onClick={() => handleCreateFollowup(suggestion)}
                                                    disabled={isCreating}
                                                    className="btn-primary text-xs flex items-center gap-1.5 disabled:opacity-50"
                                                >
                                                    {isCreating ? (
                                                        <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                                    ) : (
                                                        <ClipboardPlus size={14} />
                                                    )}
                                                    建立跟進事項
                                                </button>
                                            )}
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
