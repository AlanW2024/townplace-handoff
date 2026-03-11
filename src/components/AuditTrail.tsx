'use client';

import React from 'react';

interface AuditLogEntry {
    action: string;
    actor: string;
    reason: string;
    from_status?: string | null;
    to_status?: string | null;
    created_at: string;
    changes?: Array<{ field: string; from: string | null; to: string | null }>;
}

interface AuditTrailProps {
    logs: AuditLogEntry[];
    statusLabelFn?: (status: string) => string;
    showContainer?: boolean;
    maxItems?: number;
}

export default function AuditTrail({ logs, statusLabelFn, showContainer = true, maxItems = 3 }: AuditTrailProps) {
    if (!logs || logs.length === 0) return null;

    const recent = [...logs]
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, maxItems);

    const content = (
        <div className="space-y-2">
            {recent.map((log, idx) => (
                <div key={idx} className="text-xs text-slate-600">
                    <div className="flex items-center gap-1">
                        <span className="font-medium text-slate-700">{log.actor}</span>
                        <span>·</span>
                        <span>{new Date(log.created_at).toLocaleString('zh-HK')}</span>
                    </div>
                    {log.from_status && log.to_status && (
                        <div className="mt-0.5">
                            {statusLabelFn ? statusLabelFn(log.from_status) : log.from_status}
                            {' → '}
                            {statusLabelFn ? statusLabelFn(log.to_status) : log.to_status}
                        </div>
                    )}
                    {log.reason && <div className="mt-0.5 text-slate-500">{log.reason}</div>}
                    {log.changes && log.changes.length > 0 && (
                        <div className="mt-0.5 text-slate-500">
                            {log.changes.map((c, i) => (
                                <span key={i}>
                                    {c.field}: {c.from ?? '(空)'} → {c.to ?? '(空)'}
                                    {i < log.changes!.length - 1 ? '；' : ''}
                                </span>
                            ))}
                        </div>
                    )}
                </div>
            ))}
        </div>
    );

    if (!showContainer) return content;

    return (
        <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3">
            <div className="flex items-center gap-1.5 mb-2 text-xs font-medium text-slate-500">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                最近操作
            </div>
            {content}
        </div>
    );
}
