'use client';

import { useState, useEffect, useCallback } from 'react';
import { FileText, Clock, AlertTriangle, ChevronRight, User, Undo2 } from 'lucide-react';
import { AuditLog, Document, DocStatus, STATUS_LABELS } from '@/lib/types';
import { cn, formatDateTime } from '@/lib/utils';
import { useToast } from '@/components/Toast';
import AuditTrail from '@/components/AuditTrail';
import { usePolling } from '@/hooks/usePolling';

type DocumentRecord = Document & {
    audit_logs: AuditLog[];
    last_log: AuditLog | null;
};

const DOC_PIPELINE: DocStatus[] = ['not_started', 'preparing', 'pending_sign', 'with_tenant', 'with_company', 'completed'];
const DOC_PIPELINE_LABELS = ['未開始', '準備中', '待簽署', '租客持有', '公司持有', '已完成'];
const DOC_TYPE_COLORS: Record<string, string> = {
    DRF: 'bg-blue-100 text-blue-700',
    TA: 'bg-purple-100 text-purple-700',
    Surrender: 'bg-red-100 text-red-700',
    Inventory: 'bg-amber-100 text-amber-700',
    Newlet: 'bg-pink-100 text-pink-700',
};
const OPERATOR_STORAGE_KEY = 'tpsoho-operator-name';

function DocStatusPipeline({ currentStatus }: { currentStatus: DocStatus }) {
    const currentIdx = DOC_PIPELINE.indexOf(currentStatus);

    return (
        <div className="flex items-center gap-0.5 mt-3">
            {DOC_PIPELINE.map((status, idx) => (
                <div key={status} className="flex items-center flex-1">
                    <div className="flex flex-col items-center flex-1">
                        <div className={cn(
                            'w-full h-2 rounded-full transition-all',
                            idx <= currentIdx
                                ? idx === currentIdx
                                    ? 'bg-blue-500'
                                    : 'bg-emerald-400'
                                : 'bg-slate-200'
                        )} />
                        <span className={cn(
                            'text-[9px] mt-1 whitespace-nowrap',
                            idx === currentIdx ? 'text-blue-600 font-semibold' : 'text-slate-400'
                        )}>
                            {DOC_PIPELINE_LABELS[idx]}
                        </span>
                    </div>
                </div>
            ))}
        </div>
    );
}

export default function DocumentsPage() {
    const [documents, setDocuments] = useState<DocumentRecord[]>([]);
    const [loading, setLoading] = useState(true);
    const [operatorName, setOperatorName] = useState('');
    const [actionReasons, setActionReasons] = useState<Record<string, string>>({});
    const [updatingId, setUpdatingId] = useState<string | null>(null);
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

    const fetchDocs = useCallback(async () => {
        try {
            const res = await fetch('/api/documents');
            if (!res.ok) throw new Error('載入失敗');
            setDocuments(await res.json());
        } catch (e: unknown) {
            showToast(e instanceof Error ? e.message : '載入文件失敗', 'error');
        } finally {
            setLoading(false);
        }
    }, [showToast]);

    useEffect(() => { fetchDocs(); }, [fetchDocs]);

    usePolling(fetchDocs, 5000);

    const updateDocStatus = async (id: string, newStatus: DocStatus) => {
        const actor = operatorName.trim();
        const reason = (actionReasons[id] || '').trim();

        if (!actor) {
            showToast('請先填寫操作人', 'error');
            return;
        }

        if (!reason) {
            showToast('請先填寫推進 / 退回原因', 'error');
            return;
        }

        setUpdatingId(id);
        try {
            const res = await fetch('/api/documents', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id, status: newStatus, actor, reason }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || '更新失敗');
            showToast('文件狀態已更新並記錄', 'success');
            setActionReasons(prev => ({ ...prev, [id]: '' }));
            fetchDocs();
        } catch (e: unknown) {
            showToast(e instanceof Error ? e.message : '更新文件失敗', 'error');
        } finally {
            setUpdatingId(null);
        }
    };

    const outstanding = documents.filter(d => d.status !== 'completed');
    const completed = documents.filter(d => d.status === 'completed');
    const overdue = documents.filter(d => d.days_outstanding > 3 && d.status !== 'completed');

    const renderDocumentCard = (doc: DocumentRecord, dimmed = false) => {
        const currentIdx = DOC_PIPELINE.indexOf(doc.status);
        const nextStatus = currentIdx < DOC_PIPELINE.length - 1 ? DOC_PIPELINE[currentIdx + 1] : null;
        const previousStatus = currentIdx > 0 ? DOC_PIPELINE[currentIdx - 1] : null;
        const reason = actionReasons[doc.id] || '';
        const canSubmit = operatorName.trim().length > 0 && reason.trim().length > 0;
        const isUpdating = updatingId === doc.id;

        return (
            <div
                key={doc.id}
                className={cn(
                    'glass-card p-5 space-y-4',
                    doc.days_outstanding > 3 && doc.status !== 'completed' && 'border-l-4 border-l-red-400',
                    dimmed && 'opacity-70'
                )}
            >
                <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2 flex-wrap">
                            <span className="text-lg font-bold text-slate-800">{doc.room_id}</span>
                            <span className={cn('status-badge', DOC_TYPE_COLORS[doc.doc_type] || 'bg-slate-100 text-slate-600')}>
                                {doc.doc_type}
                            </span>
                            <span className="status-badge bg-blue-100 text-blue-700">
                                {STATUS_LABELS[doc.status]}
                            </span>
                            {doc.days_outstanding > 0 && (
                                <span className={cn(
                                    'text-xs flex items-center gap-1',
                                    doc.days_outstanding > 3 && doc.status !== 'completed' ? 'text-red-600 font-semibold' : 'text-slate-500'
                                )}>
                                    <Clock size={12} />
                                    {doc.days_outstanding} 天
                                </span>
                            )}
                        </div>

                        {doc.current_holder && (
                            <div className="flex items-center gap-1.5 text-xs text-slate-500 mb-1">
                                <User size={12} />
                                目前持有人：<span className="font-medium text-slate-700">{doc.current_holder}</span>
                            </div>
                        )}

                        {doc.notes && (
                            <p className="text-xs text-slate-500">{doc.notes}</p>
                        )}

                        <DocStatusPipeline currentStatus={doc.status} />
                    </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white/70 p-4 space-y-3">
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                        <div>
                            <p className="text-sm font-semibold text-slate-700">操作原因</p>
                            <p className="text-xs text-slate-400 mt-0.5">推進、退回都必須說明原因，系統會記錄誰做了這個操作。</p>
                        </div>
                        {doc.last_log && (
                            <p className="text-xs text-slate-400">
                                最近：{doc.last_log.actor} · {formatDateTime(doc.last_log.created_at)}
                            </p>
                        )}
                    </div>

                    <textarea
                        value={reason}
                        onChange={event => setActionReasons(prev => ({ ...prev, [doc.id]: event.target.value }))}
                        placeholder="例如：租客已簽署，可交公司蓋章；或：誤按完成，退回待簽署"
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100 min-h-[88px] resize-y"
                    />

                    <div className="flex items-center gap-2 flex-wrap">
                        {previousStatus && (
                            <button
                                onClick={() => updateDocStatus(doc.id, previousStatus)}
                                disabled={!canSubmit || isUpdating}
                                className="px-3 py-2 rounded-xl text-xs font-medium bg-slate-100 text-slate-700 hover:bg-slate-200 transition flex items-center gap-1.5 disabled:opacity-50"
                            >
                                <Undo2 size={13} />
                                退回上一步
                            </button>
                        )}
                        {nextStatus && (
                            <button
                                onClick={() => updateDocStatus(doc.id, nextStatus)}
                                disabled={!canSubmit || isUpdating}
                                className="btn-primary text-xs flex items-center gap-1.5 disabled:opacity-50"
                            >
                                推進到下一步 <ChevronRight size={14} />
                            </button>
                        )}
                    </div>

                    {!canSubmit && (
                        <p className="text-xs text-amber-600">請先填寫操作人及原因，先可以推進或退回。</p>
                    )}
                </div>

                <AuditTrail logs={doc.audit_logs} statusLabelFn={(s) => STATUS_LABELS[s] || s} />
            </div>
        );
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-[60vh]">
                <div className="w-10 h-10 border-3 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div>
                <h1 className="page-title">文件追蹤</h1>
                <p className="text-sm text-slate-500 mt-1">追蹤 DRF、TA、Surrender 和 Inventory 文件狀態，並完整記錄每次推進與退回。</p>
            </div>

            <div className="glass-card p-4 bg-blue-50/70 border border-blue-100">
                <label className="text-sm font-semibold text-slate-700 block mb-2">操作人</label>
                <input
                    value={operatorName}
                    onChange={event => setOperatorName(event.target.value)}
                    placeholder="例如：Michael / Karen / Duty Phone"
                    className="w-full lg:max-w-sm rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                />
                <p className="text-xs text-slate-400 mt-2">之後每次推進、退回都會記錄這個操作人。</p>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {[
                    { label: '待處理文件', value: outstanding.length, color: 'text-blue-700', bg: 'bg-blue-50' },
                    { label: '已逾期 (>3日)', value: overdue.length, color: 'text-red-700', bg: 'bg-red-50' },
                    { label: '已完成', value: completed.length, color: 'text-emerald-700', bg: 'bg-emerald-50' },
                    { label: '總計', value: documents.length, color: 'text-slate-700', bg: 'bg-white' },
                ].map(stat => (
                    <div key={stat.label} className={cn('glass-card p-4', stat.bg)}>
                        <p className="text-xs text-slate-500">{stat.label}</p>
                        <p className={cn('text-2xl font-bold mt-1', stat.color)}>{stat.value}</p>
                    </div>
                ))}
            </div>

            {overdue.length > 0 && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-xl flex items-center gap-3">
                    <AlertTriangle size={18} className="text-red-500 shrink-0" />
                    <div>
                        <p className="text-sm font-semibold text-red-700">{overdue.length} 份文件已逾期超過 3 天</p>
                        <p className="text-xs text-red-500 mt-0.5">
                            {overdue.map(d => `${d.room_id} ${d.doc_type}`).join(', ')}
                        </p>
                    </div>
                </div>
            )}

            <div className="space-y-4">
                <h2 className="section-title">待處理文件</h2>
                {outstanding.length === 0 ? (
                    <div className="glass-card p-8 text-center">
                        <FileText size={32} className="text-slate-300 mx-auto mb-3" />
                        <p className="text-sm text-slate-400">所有文件已完成 🎉</p>
                    </div>
                ) : (
                    <div className="grid gap-3">
                        {outstanding.map(doc => renderDocumentCard(doc))}
                    </div>
                )}
            </div>

            {completed.length > 0 && (
                <div className="space-y-4">
                    <h2 className="section-title">已完成</h2>
                    <div className="grid gap-3">
                        {completed.map(doc => renderDocumentCard(doc, true))}
                    </div>
                </div>
            )}
        </div>
    );
}
