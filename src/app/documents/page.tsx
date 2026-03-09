'use client';

import { useState, useEffect, useCallback } from 'react';
import { FileText, Clock, AlertTriangle, ChevronRight, User } from 'lucide-react';
import { Document, STATUS_LABELS } from '@/lib/types';
import { cn, formatDateTime } from '@/lib/utils';

const DOC_PIPELINE = ['not_started', 'preparing', 'pending_sign', 'with_tenant', 'with_company', 'completed'];
const DOC_PIPELINE_LABELS = ['未開始', '準備中', '待簽署', '租客持有', '公司持有', '已完成'];
const DOC_TYPE_COLORS: Record<string, string> = {
    DRF: 'bg-blue-100 text-blue-700',
    TA: 'bg-purple-100 text-purple-700',
    Surrender: 'bg-red-100 text-red-700',
    Inventory: 'bg-amber-100 text-amber-700',
    Newlet: 'bg-pink-100 text-pink-700',
};

function DocStatusPipeline({ currentStatus }: { currentStatus: string }) {
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
    const [documents, setDocuments] = useState<Document[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchDocs = useCallback(async () => {
        try {
            const res = await fetch('/api/documents');
            setDocuments(await res.json());
        } catch (e) { console.error(e); }
        finally { setLoading(false); }
    }, []);

    useEffect(() => { fetchDocs(); }, [fetchDocs]);

    const updateDocStatus = async (id: string, newStatus: string) => {
        try {
            await fetch('/api/documents', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id, status: newStatus }),
            });
            fetchDocs();
        } catch (e) { console.error(e); }
    };

    const outstanding = documents.filter(d => d.status !== 'completed');
    const completed = documents.filter(d => d.status === 'completed');
    const overdue = documents.filter(d => d.days_outstanding > 3 && d.status !== 'completed');

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
                <p className="text-sm text-slate-500 mt-1">追蹤 DRF、TA、Surrender 和 Inventory 文件狀態</p>
            </div>

            {/* Stats */}
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

            {/* Overdue alert */}
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

            {/* Outstanding documents */}
            <div className="space-y-4">
                <h2 className="section-title">待處理文件</h2>
                {outstanding.length === 0 ? (
                    <div className="glass-card p-8 text-center">
                        <FileText size={32} className="text-slate-300 mx-auto mb-3" />
                        <p className="text-sm text-slate-400">所有文件已完成 🎉</p>
                    </div>
                ) : (
                    <div className="grid gap-3">
                        {outstanding.map(doc => {
                            const currentIdx = DOC_PIPELINE.indexOf(doc.status);
                            const nextStatus = currentIdx < DOC_PIPELINE.length - 1 ? DOC_PIPELINE[currentIdx + 1] : null;

                            return (
                                <div key={doc.id} className={cn(
                                    'glass-card p-5',
                                    doc.days_outstanding > 3 && 'border-l-4 border-l-red-400'
                                )}>
                                    <div className="flex items-start justify-between gap-4">
                                        <div className="flex-1">
                                            <div className="flex items-center gap-2 mb-2 flex-wrap">
                                                <span className="text-lg font-bold text-slate-800">{doc.room_id}</span>
                                                <span className={cn('status-badge', DOC_TYPE_COLORS[doc.doc_type] || 'bg-slate-100 text-slate-600')}>
                                                    {doc.doc_type}
                                                </span>
                                                {doc.days_outstanding > 0 && (
                                                    <span className={cn(
                                                        'text-xs flex items-center gap-1',
                                                        doc.days_outstanding > 3 ? 'text-red-600 font-semibold' : 'text-slate-500'
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
                                        {nextStatus && (
                                            <button
                                                onClick={() => updateDocStatus(doc.id, nextStatus)}
                                                className="btn-primary text-xs flex items-center gap-1 shrink-0"
                                            >
                                                推進 <ChevronRight size={14} />
                                            </button>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Completed */}
            {completed.length > 0 && (
                <div className="space-y-4">
                    <h2 className="section-title">已完成</h2>
                    <div className="grid gap-2">
                        {completed.map(doc => (
                            <div key={doc.id} className="glass-card p-3 opacity-60">
                                <div className="flex items-center gap-2">
                                    <span className="font-semibold text-sm text-slate-600">{doc.room_id}</span>
                                    <span className={cn('status-badge text-[10px]', DOC_TYPE_COLORS[doc.doc_type])}>{doc.doc_type}</span>
                                    <span className="status-badge bg-emerald-100 text-emerald-700 text-[10px]">✓ 已完成</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
