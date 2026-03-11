'use client';

import { Suspense, useState, useEffect, useCallback } from 'react';
import {
    SearchCheck, RefreshCw, Check, X,
    Home, Clock, User
} from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { cn, formatDateTime } from '@/lib/utils';
import { useToast } from '@/components/Toast';
import { usePolling } from '@/hooks/usePolling';
import { DeptCode, DEPT_INFO, HandoffType, ReviewStatus } from '@/lib/types';

interface ParseReviewItem {
    id: string;
    message_id: string;
    raw_text: string;
    sender_name: string;
    sender_dept: DeptCode;
    confidence: number;
    suggested_rooms: string[];
    suggested_action: string | null;
    suggested_type: HandoffType | null;
    suggested_from_dept: DeptCode | null;
    suggested_to_dept: DeptCode | null;
    reviewed_rooms: string[];
    reviewed_action: string | null;
    reviewed_type: HandoffType | null;
    reviewed_from_dept: DeptCode | null;
    reviewed_to_dept: DeptCode | null;
    review_status: ReviewStatus;
    reviewed_by: string | null;
    reviewed_at: string | null;
    created_at: string;
    updated_at: string;
}

const STATUS_CONFIG: Record<ReviewStatus, { label: string; color: string; bg: string }> = {
    pending: { label: '待覆核', color: 'text-amber-700', bg: 'bg-amber-100' },
    approved: { label: '已批准', color: 'text-emerald-700', bg: 'bg-emerald-100' },
    corrected: { label: '已修正', color: 'text-blue-700', bg: 'bg-blue-100' },
    dismissed: { label: '已略過', color: 'text-slate-500', bg: 'bg-slate-100' },
};

const ACTION_OPTIONS = [
    '工程完成 → 可清潔',
    '工程完成',
    '部分工程完成',
    '工程進度更新',
    '深層清潔完成',
    '清潔完成',
    '執修中',
    '報修 — 需要維修',
    '退房',
    '入住',
    '吱膠工程',
    '清潔安排通知',
    '查詢進度',
    'Final 檢查',
];

const TYPE_OPTIONS: { value: HandoffType; label: string }[] = [
    { value: 'handoff', label: '交接' },
    { value: 'update', label: '狀態更新' },
    { value: 'request', label: '請求' },
    { value: 'query', label: '查詢' },
    { value: 'trigger', label: '觸發' },
    { value: 'escalation', label: '升級' },
];

const DEPT_OPTIONS: { value: DeptCode; label: string }[] = Object.entries(DEPT_INFO).map(
    ([code, info]) => ({ value: code as DeptCode, label: info.name })
);

type FilterType = 'all' | ReviewStatus;

const OPERATOR_STORAGE_KEY = 'tpsoho-operator-name';

function ReviewsPageContent() {
    const searchParams = useSearchParams();
    const [reviews, setReviews] = useState<ParseReviewItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [filter, setFilter] = useState<FilterType>('all');
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [updating, setUpdating] = useState<string | null>(null);
    const [operatorName, setOperatorName] = useState('');
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

    // Editable fields for correction
    const [editRooms, setEditRooms] = useState('');
    const [editAction, setEditAction] = useState<string | null>(null);
    const [editType, setEditType] = useState<HandoffType | null>(null);
    const [editFromDept, setEditFromDept] = useState<DeptCode | null>(null);
    const [editToDept, setEditToDept] = useState<DeptCode | null>(null);

    const fetchReviews = useCallback(async () => {
        try {
            const res = await fetch('/api/reviews');
            if (!res.ok) throw new Error('載入失敗');
            setReviews(await res.json());
        } catch (e: unknown) {
            showToast(e instanceof Error ? e.message : '載入覆核項目失敗', 'error');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [showToast]);

    useEffect(() => { fetchReviews(); }, [fetchReviews]);

    usePolling(fetchReviews, 5000);

    useEffect(() => {
        const nextStatus = searchParams.get('status');
        if (nextStatus === 'pending' || nextStatus === 'approved' || nextStatus === 'corrected' || nextStatus === 'dismissed') {
            setFilter(nextStatus);
        } else {
            setFilter('all');
        }
    }, [searchParams]);

    const handleRefresh = () => {
        setRefreshing(true);
        fetchReviews();
    };

    const selectReview = (review: ParseReviewItem) => {
        setSelectedId(review.id);
        setEditRooms(review.reviewed_rooms.join(', '));
        setEditAction(review.reviewed_action);
        setEditType(review.reviewed_type);
        setEditFromDept(review.reviewed_from_dept);
        setEditToDept(review.reviewed_to_dept);
    };

    const handleAction = async (reviewId: string, action: 'approved' | 'corrected' | 'dismissed') => {
        setUpdating(reviewId);
        try {
            const payload: any = {
                id: reviewId,
                review_status: action,
                reviewed_by: operatorName || 'Admin',
            };

            if (action === 'corrected') {
                payload.reviewed_rooms = editRooms.split(/[,，\s]+/).filter(Boolean);
                payload.reviewed_action = editAction;
                payload.reviewed_type = editType;
                payload.reviewed_from_dept = editFromDept;
                payload.reviewed_to_dept = editToDept;
            }

            const res = await fetch('/api/reviews', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            if (!res.ok) throw new Error('操作失敗');

            const statusLabel = STATUS_CONFIG[action].label;
            showToast(`已更新為「${statusLabel}」`, 'success');
            fetchReviews();
        } catch (e: unknown) {
            showToast(e instanceof Error ? e.message : '操作失敗', 'error');
        } finally {
            setUpdating(null);
        }
    };

    const filtered = filter === 'all' ? reviews : reviews.filter(r => r.review_status === filter);
    const selectedReview = filtered.find(review => review.id === selectedId) || filtered[0] || null;

    const pendingCount = reviews.filter(r => r.review_status === 'pending').length;
    const approvedCount = reviews.filter(r => r.review_status === 'approved').length;
    const correctedCount = reviews.filter(r => r.review_status === 'corrected').length;
    const dismissedCount = reviews.filter(r => r.review_status === 'dismissed').length;

    useEffect(() => {
        if (filtered.length === 0) {
            setSelectedId(null);
            return;
        }

        const existing = filtered.find(review => review.id === selectedId);
        if (existing) {
            return;
        }

        selectReview(filtered[0]);
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
                    <h1 className="page-title">人工覆核</h1>
                    <p className="text-sm text-slate-500 mt-1">覆核低信心度的訊息解析結果，修正後套用至系統</p>
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

            {/* Operator Name */}
            <div className="glass-card p-4 bg-blue-50/70 border border-blue-100">
                <label className="text-sm font-semibold text-slate-700 block mb-2">操作人</label>
                <input
                    value={operatorName}
                    onChange={event => setOperatorName(event.target.value)}
                    placeholder="例如：Michael / Karen / Duty Phone"
                    className="w-full lg:max-w-sm rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                />
                <p className="text-xs text-slate-400 mt-2">批准、修正、略過都會記錄這個操作人。</p>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {[
                    { label: '待覆核', value: pendingCount, color: 'text-amber-700', bg: 'bg-amber-50' },
                    { label: '已批准', value: approvedCount, color: 'text-emerald-700', bg: 'bg-emerald-50' },
                    { label: '已修正', value: correctedCount, color: 'text-blue-700', bg: 'bg-blue-50' },
                    { label: '總數', value: reviews.length, color: 'text-slate-700', bg: 'bg-white' },
                ].map(stat => (
                    <div key={stat.label} className={cn('glass-card p-4', stat.bg)}>
                        <p className="text-xs text-slate-500">{stat.label}</p>
                        <p className={cn('text-2xl font-bold mt-1', stat.color)}>{stat.value}</p>
                    </div>
                ))}
            </div>

            {/* Filter */}
            <div className="space-y-2">
                {searchParams.get('status') && (
                    <div className="glass-card p-3 bg-blue-50/70 border border-blue-100 flex items-center justify-between gap-3 flex-wrap">
                        <div>
                            <p className="text-sm font-medium text-blue-800">已從通知進入人工覆核</p>
                            <p className="text-xs text-blue-600 mt-1">目前只顯示與通知相符的覆核狀態</p>
                        </div>
                        <Link
                            href="/reviews"
                            className="text-xs font-medium text-blue-700 hover:text-blue-800 transition-colors"
                        >
                            清除篩選
                        </Link>
                    </div>
                )}

                <div className="flex gap-2 flex-wrap">
                    {([
                        { key: 'all' as FilterType, label: '全部', count: reviews.length },
                        { key: 'pending' as FilterType, label: '待覆核', count: pendingCount },
                        { key: 'approved' as FilterType, label: '已批准', count: approvedCount },
                        { key: 'corrected' as FilterType, label: '已修正', count: correctedCount },
                        { key: 'dismissed' as FilterType, label: '已略過', count: dismissedCount },
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
            </div>

            {/* Cards */}
            {filtered.length === 0 ? (
                <div className="glass-card p-12 text-center">
                    <SearchCheck size={36} className="text-slate-300 mx-auto mb-3" />
                    <p className="text-slate-500 font-medium">目前沒有待覆核項目</p>
                    <p className="text-sm text-slate-400 mt-1">所有訊息解析結果正常</p>
                </div>
            ) : (
                <div className="scan-shell">
                    <div className="scan-grid">
                        {filtered.map(review => {
                            const statusCfg = STATUS_CONFIG[review.review_status];
                            const deptInfo = DEPT_INFO[review.sender_dept];
                            const isPending = review.review_status === 'pending';
                            const isActive = selectedReview?.id === review.id;
                            const confidenceColor = review.confidence >= 0.75
                                ? 'text-emerald-600'
                                : review.confidence >= 0.5
                                    ? 'text-amber-600'
                                    : 'text-red-600';

                            return (
                                <button
                                    key={review.id}
                                    type="button"
                                    onClick={() => selectReview(review)}
                                    className={cn(
                                        'scan-tile border-l-4 text-left',
                                        isPending ? 'border-l-amber-400' : 'border-l-slate-200',
                                        isActive && 'scan-tile-active',
                                        !isPending && 'opacity-60'
                                    )}
                                >
                                    <div className="space-y-3">
                                        <div className="flex items-start justify-between gap-2">
                                            <span className={cn('scan-chip', statusCfg.bg, statusCfg.color)}>
                                                {statusCfg.label}
                                            </span>
                                            <span className="scan-kicker">覆核</span>
                                        </div>

                                        <div>
                                            <p className="scan-title scan-clamp-4">「{review.raw_text}」</p>
                                            <div className="mt-2 flex gap-1.5 flex-wrap">
                                                {review.suggested_rooms.slice(0, 3).map(room => (
                                                    <span key={room} className="scan-chip bg-slate-100 text-slate-600 font-mono">
                                                        {room}
                                                    </span>
                                                ))}
                                                {review.suggested_rooms.length > 3 && (
                                                    <span className="scan-chip bg-slate-100 text-slate-600">
                                                        +{review.suggested_rooms.length - 3}
                                                    </span>
                                                )}
                                            </div>
                                            <p className="scan-body scan-clamp-3 mt-2">
                                                {review.suggested_action || '未能穩定解析，需要人工判斷'}
                                            </p>
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
                                            <span className={cn('font-mono font-semibold', confidenceColor)}>
                                                {(review.confidence * 100).toFixed(0)}%
                                            </span>
                                        </div>
                                        <div className="scan-meta">
                                            <span className="inline-flex items-center gap-1">
                                                <User size={11} />
                                                {review.sender_name}
                                            </span>
                                            <span className="inline-flex items-center gap-1">
                                                <Clock size={11} />
                                                {formatDateTime(review.created_at)}
                                            </span>
                                        </div>
                                    </div>
                                </button>
                            );
                        })}
                    </div>

                    {selectedReview && (() => {
                        const review = selectedReview;
                        const statusCfg = STATUS_CONFIG[review.review_status];
                        const deptInfo = DEPT_INFO[review.sender_dept];
                        const isUpdating = updating === review.id;
                        const isPending = review.review_status === 'pending';
                        const confidenceColor = review.confidence >= 0.75
                            ? 'text-emerald-600'
                            : review.confidence >= 0.5
                                ? 'text-amber-600'
                                : 'text-red-600';

                        return (
                            <div className="scan-detail">
                                <div className="flex items-start justify-between gap-3">
                                    <div>
                                        <p className="scan-kicker">覆核詳情</p>
                                        <h2 className="text-xl font-bold text-slate-800 mt-2">「{review.raw_text}」</h2>
                                    </div>
                                    <span className={cn('status-badge', statusCfg.bg, statusCfg.color)}>
                                        {statusCfg.label}
                                    </span>
                                </div>

                                <div className="mt-4 flex items-center gap-3 flex-wrap text-xs text-slate-500">
                                    {deptInfo && (
                                        <span
                                            className="status-badge"
                                            style={{ backgroundColor: deptInfo.lightColor, color: deptInfo.color }}
                                        >
                                            {deptInfo.name}
                                        </span>
                                    )}
                                    <span className="inline-flex items-center gap-1">
                                        <User size={12} className="text-slate-400" />
                                        {review.sender_name}
                                    </span>
                                    <span className={cn('font-mono font-semibold', confidenceColor)}>
                                        信心度 {(review.confidence * 100).toFixed(0)}%
                                    </span>
                                    <span className="inline-flex items-center gap-1 text-slate-400">
                                        <Clock size={11} />
                                        {formatDateTime(review.created_at)}
                                    </span>
                                </div>

                                <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                                    <p className="text-xs text-slate-400 mb-1.5 font-medium">系統解析結果</p>
                                    <div className="flex items-center gap-2 flex-wrap text-xs">
                                        {review.suggested_rooms.length > 0 && (
                                            <span className="flex items-center gap-1 flex-wrap">
                                                <Home size={11} className="text-slate-400" />
                                                {review.suggested_rooms.map(r => (
                                                    <span key={r} className="px-1.5 py-0.5 bg-white text-slate-600 rounded font-mono">
                                                        {r}
                                                    </span>
                                                ))}
                                            </span>
                                        )}
                                        {review.suggested_action && (
                                            <span className="px-1.5 py-0.5 bg-blue-50 text-blue-700 rounded">
                                                {review.suggested_action}
                                            </span>
                                        )}
                                        {review.suggested_type && (
                                            <span className="px-1.5 py-0.5 bg-violet-50 text-violet-700 rounded">
                                                {TYPE_OPTIONS.find(t => t.value === review.suggested_type)?.label || review.suggested_type}
                                            </span>
                                        )}
                                        {!review.suggested_action && review.suggested_rooms.length === 0 && (
                                            <span className="text-slate-400">（無法解析）</span>
                                        )}
                                    </div>
                                </div>

                                {isPending && (
                                    <div className="mt-5 space-y-4">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <button
                                                onClick={() => handleAction(review.id, 'approved')}
                                                disabled={isUpdating}
                                                className={cn(
                                                    'px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
                                                    'bg-emerald-50 text-emerald-700 hover:bg-emerald-100',
                                                    'flex items-center gap-1.5 disabled:opacity-50'
                                                )}
                                            >
                                                <Check size={13} />
                                                批准
                                            </button>
                                            <button
                                                onClick={() => handleAction(review.id, 'dismissed')}
                                                disabled={isUpdating}
                                                className={cn(
                                                    'px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
                                                    'bg-slate-50 text-slate-500 hover:bg-slate-100',
                                                    'flex items-center gap-1.5 disabled:opacity-50'
                                                )}
                                            >
                                                <X size={13} />
                                                略過
                                            </button>
                                            <span className="text-xs text-slate-400">如需改內容，先在下面修正再套用。</span>
                                        </div>

                                        <div className="p-4 bg-blue-50/50 rounded-lg border border-blue-100 space-y-3">
                                            <p className="text-xs font-semibold text-blue-800">修正解析結果</p>

                                            <div>
                                                <label className="text-[11px] text-slate-500 mb-1 block">房號（逗號分隔）</label>
                                                <input
                                                    type="text"
                                                    value={editRooms}
                                                    onChange={e => setEditRooms(e.target.value)}
                                                    className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-200 bg-white focus:border-blue-400 focus:ring-1 focus:ring-blue-400 outline-none font-mono"
                                                    placeholder="e.g. 10F, 23D"
                                                />
                                            </div>

                                            <div>
                                                <label className="text-[11px] text-slate-500 mb-1 block">動作</label>
                                                <select
                                                    value={editAction || ''}
                                                    onChange={e => setEditAction(e.target.value || null)}
                                                    className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-200 bg-white focus:border-blue-400 focus:ring-1 focus:ring-blue-400 outline-none"
                                                >
                                                    <option value="">（無）</option>
                                                    {ACTION_OPTIONS.map(a => (
                                                        <option key={a} value={a}>{a}</option>
                                                    ))}
                                                </select>
                                            </div>

                                            <div className="grid grid-cols-3 gap-2">
                                                <div>
                                                    <label className="text-[11px] text-slate-500 mb-1 block">類型</label>
                                                    <select
                                                        value={editType || ''}
                                                        onChange={e => setEditType((e.target.value || null) as HandoffType | null)}
                                                        className="w-full px-2 py-1.5 text-xs rounded-lg border border-slate-200 bg-white outline-none"
                                                    >
                                                        <option value="">（無）</option>
                                                        {TYPE_OPTIONS.map(t => (
                                                            <option key={t.value} value={t.value}>{t.label}</option>
                                                        ))}
                                                    </select>
                                                </div>
                                                <div>
                                                    <label className="text-[11px] text-slate-500 mb-1 block">來源部門</label>
                                                    <select
                                                        value={editFromDept || ''}
                                                        onChange={e => setEditFromDept((e.target.value || null) as DeptCode | null)}
                                                        className="w-full px-2 py-1.5 text-xs rounded-lg border border-slate-200 bg-white outline-none"
                                                    >
                                                        <option value="">（無）</option>
                                                        {DEPT_OPTIONS.map(d => (
                                                            <option key={d.value} value={d.value}>{d.label}</option>
                                                        ))}
                                                    </select>
                                                </div>
                                                <div>
                                                    <label className="text-[11px] text-slate-500 mb-1 block">目標部門</label>
                                                    <select
                                                        value={editToDept || ''}
                                                        onChange={e => setEditToDept((e.target.value || null) as DeptCode | null)}
                                                        className="w-full px-2 py-1.5 text-xs rounded-lg border border-slate-200 bg-white outline-none"
                                                    >
                                                        <option value="">（無）</option>
                                                        {DEPT_OPTIONS.map(d => (
                                                            <option key={d.value} value={d.value}>{d.label}</option>
                                                        ))}
                                                    </select>
                                                </div>
                                            </div>

                                            <button
                                                onClick={() => handleAction(review.id, 'corrected')}
                                                disabled={isUpdating}
                                                className="btn-primary text-xs flex items-center gap-1.5 disabled:opacity-50"
                                            >
                                                {isUpdating ? (
                                                    <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                                ) : (
                                                    <Check size={13} />
                                                )}
                                                確認修正並套用
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {!isPending && review.reviewed_by && (
                                    <div className="mt-5 pt-4 border-t border-slate-100">
                                        <span className="text-xs text-slate-400">
                                            由 {review.reviewed_by} 於 {review.reviewed_at ? formatDateTime(review.reviewed_at) : ''} {statusCfg.label}
                                        </span>
                                    </div>
                                )}
                            </div>
                        );
                    })()}
                </div>
            )}
        </div>
    );
}

export default function ReviewsPage() {
    return (
        <Suspense fallback={
            <div className="flex items-center justify-center h-[60vh]">
                <div className="w-10 h-10 border-3 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
            </div>
        }>
            <ReviewsPageContent />
        </Suspense>
    );
}
