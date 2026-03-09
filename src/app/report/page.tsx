'use client';

import { useState, useEffect } from 'react';
import { ClipboardList, Copy, Check, Edit3, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function ReportPage() {
    const [report, setReport] = useState('');
    const [isEditing, setIsEditing] = useState(false);
    const [editText, setEditText] = useState('');
    const [copied, setCopied] = useState(false);
    const [loading, setLoading] = useState(true);
    const [itemCount, setItemCount] = useState(0);

    const fetchReport = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/daily-report');
            const data = await res.json();
            setReport(data.report);
            setEditText(data.report);
            setItemCount(data.items);
        } catch (e) { console.error(e); }
        finally { setLoading(false); }
    };

    useEffect(() => { fetchReport(); }, []);

    const handleCopy = async () => {
        const textToCopy = isEditing ? editText : report;
        try {
            await navigator.clipboard.writeText(textToCopy);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            // Fallback
            const textarea = document.createElement('textarea');
            textarea.value = textToCopy;
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-[60vh]">
                <div className="w-10 h-10 border-3 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
            </div>
        );
    }

    return (
        <div className="space-y-6 max-w-3xl">
            {/* Header */}
            <div>
                <h1 className="page-title">每日報告</h1>
                <p className="text-sm text-slate-500 mt-1">自動產生「是日跟進」報告，一鍵複製到 WhatsApp</p>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 gap-3">
                <div className="glass-card p-4 bg-blue-50">
                    <p className="text-xs text-slate-500">報告項目</p>
                    <p className="text-2xl font-bold text-blue-700 mt-1">{itemCount}</p>
                </div>
                <div className="glass-card p-4 bg-emerald-50">
                    <p className="text-xs text-slate-500">資料來源</p>
                    <p className="text-2xl font-bold text-emerald-700 mt-1">即時解析</p>
                </div>
            </div>

            {/* Report card */}
            <div className="glass-card overflow-hidden">
                {/* Toolbar */}
                <div className="flex items-center justify-between px-5 py-3 bg-slate-50 border-b border-slate-200">
                    <div className="flex items-center gap-2">
                        <ClipboardList size={16} className="text-blue-500" />
                        <span className="text-sm font-semibold text-slate-700">是日跟進</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={fetchReport}
                            className="btn-ghost flex items-center gap-1"
                        >
                            <RefreshCw size={14} />
                            重新產生
                        </button>
                        <button
                            onClick={() => { setIsEditing(!isEditing); setEditText(report); }}
                            className={cn('btn-ghost flex items-center gap-1', isEditing && 'bg-blue-50 text-blue-600')}
                        >
                            <Edit3 size={14} />
                            {isEditing ? '取消編輯' : '編輯'}
                        </button>
                        <button
                            onClick={handleCopy}
                            className="btn-primary flex items-center gap-1"
                        >
                            {copied ? <Check size={14} /> : <Copy size={14} />}
                            {copied ? '已複製！' : '複製到剪貼板'}
                        </button>
                    </div>
                </div>

                {/* Report content */}
                <div className="p-5">
                    {isEditing ? (
                        <textarea
                            value={editText}
                            onChange={e => setEditText(e.target.value)}
                            className="w-full min-h-[300px] p-4 rounded-xl border border-slate-200 bg-white text-sm font-mono leading-relaxed
                focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 resize-y"
                        />
                    ) : (
                        <div className="bg-white rounded-xl border border-slate-200 p-5">
                            <pre className="text-sm text-slate-700 whitespace-pre-wrap font-sans leading-relaxed">{report}</pre>
                        </div>
                    )}
                </div>

                {/* Help text */}
                <div className="px-5 pb-4">
                    <p className="text-xs text-slate-400">
                        💡 提示：報告根據今日所有已解析的 WhatsApp 訊息自動產生。你可以在複製前編輯內容。
                    </p>
                </div>
            </div>
        </div>
    );
}
