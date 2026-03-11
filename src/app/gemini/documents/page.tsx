'use client';

import { useState, useEffect, useCallback } from 'react';
import { 
    FileSignature, 
    ArrowRight, 
    ArrowLeft, 
    FileText, 
    Clock, 
    User, 
    CheckCircle2, 
    AlertOctagon,
    AlertCircle
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Document, AuditLog } from '../types';
import { GEMINI_EXPERIMENTAL_NOTE, createGeminiId } from '../experimental';

const STATUS_FLOW = [
    'not_started', 
    'preparing', 
    'pending_sign', 
    'with_tenant', 
    'with_company', 
    'completed'
];

const STATUS_LABELS: Record<string, string> = {
    not_started: '未開始',
    preparing: '準備中',
    pending_sign: '待簽署',
    with_tenant: '客方處理',
    with_company: '司方處理',
    completed: '已完成'
};

export default function GeminiDocuments() {
    const [documents, setDocuments] = useState<Document[]>([]);
    const [loading, setLoading] = useState(true);

    const [selectedDoc, setSelectedDoc] = useState<Document | null>(null);
    const [actionReason, setActionReason] = useState('');
    const [labMessage, setLabMessage] = useState('這裡的流程推進只做視覺模擬，不會更新正式文件資料。');

    const fetchDocs = useCallback(async () => {
        try {
            const res = await fetch('/api/documents');
            if (res.ok) {
                setDocuments(await res.json());
            }
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchDocs();
    }, [fetchDocs]);

    const handleUpdateStatus = (id: string, newStatus: string) => {
        if (!actionReason.trim()) {
            setLabMessage('請先輸入操作原因，這樣畫面上的 audit log 才知道你在模擬什麼。');
            return;
        }

        let updatedDoc: Document | null = null;
        let updatedSummary = '';
        setDocuments(prev => prev.map(doc => {
            if (doc.id !== id) return doc;

            const nextLog: AuditLog = {
                id: createGeminiId('gemini-audit'),
                entity_type: 'document',
                action: STATUS_FLOW.indexOf(newStatus) > STATUS_FLOW.indexOf(doc.status) ? 'status_advanced' : 'status_reverted',
                actor: 'Gemini Design Lab',
                reason: actionReason,
                from_status: doc.status,
                to_status: newStatus,
                created_at: new Date().toISOString(),
            };

            updatedDoc = {
                ...doc,
                status: newStatus as Document['status'],
                audit_logs: [nextLog, ...(doc.audit_logs || [])],
                last_log: nextLog,
            };
            updatedSummary = `${doc.doc_type} (${doc.room_id})`;
            return updatedDoc;
        }));
        if (updatedDoc) {
            setSelectedDoc(updatedDoc);
            setLabMessage(`已在本頁模擬推進 ${updatedSummary}。正式資料未被改動。`);
        }
        setActionReason('');
    };

    if (loading) return <div className="text-white p-10">載入中...</div>;

    return (
        <div className="space-y-8 animate-fade-in pb-10">
            {/* Header */}
            <div>
                <h1 className="text-3xl font-extrabold text-white flex items-center gap-3 tracking-tight">
                    <FileSignature className="text-blue-500" size={28} />
                    文件追蹤器
                </h1>
                <p className="text-zinc-400 mt-2 text-sm">租務交接文件生命週期管理</p>
                <p className="mt-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-zinc-400">
                    {GEMINI_EXPERIMENTAL_NOTE}
                </p>
            </div>

            {/* Document List */}
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                <div className="xl:col-span-2 space-y-4">
                    {documents.map(doc => {
                        const isSelected = selectedDoc?.id === doc.id;
                        const isOverdue = doc.days_outstanding > 3 && doc.status !== 'completed';
                        
                        return (
                            <div 
                                key={doc.id}
                                className={cn(
                                    "p-5 rounded-2xl border transition-all cursor-pointer overflow-hidden relative",
                                    isSelected ? "bg-white/[0.05] border-blue-500/50" : "bg-[#14171d] border-white/5 hover:bg-white/[0.02]",
                                    isOverdue && !isSelected ? "border-rose-500/30 shadow-[0_0_20px_rgba(244,63,94,0.05)]" : ""
                                )}
                                onClick={() => setSelectedDoc(doc)}
                            >
                                <div className="flex items-center justify-between mb-4 relative z-10">
                                    <div className="flex items-center gap-3">
                                        <div className={cn(
                                            "w-10 h-10 rounded-xl flex items-center justify-center",
                                            doc.status === 'completed' ? "bg-emerald-500/20 text-emerald-500" :
                                            isOverdue ? "bg-rose-500/20 text-rose-500" : "bg-blue-500/20 text-blue-500"
                                        )}>
                                            <FileText size={20} />
                                        </div>
                                        <div>
                                            <h3 className="text-lg font-bold text-white flex items-center gap-2">
                                                {doc.doc_type} 
                                                <span className="text-xs bg-white/10 text-zinc-300 px-2 py-0.5 rounded-full font-mono">
                                                    {doc.room_id}
                                                </span>
                                            </h3>
                                            <p className="text-xs text-zinc-500 mt-1">ID: {doc.id}</p>
                                        </div>
                                    </div>
                                    
                                    <div className="flex flex-col items-end gap-1">
                                        <span className={cn(
                                            "text-xs font-bold px-3 py-1 rounded-full",
                                            doc.status === 'completed' ? "bg-emerald-500/20 text-emerald-400" : "bg-zinc-800 text-zinc-300"
                                        )}>
                                            {STATUS_LABELS[doc.status]}
                                        </span>
                                        {isOverdue && (
                                            <span className="text-[10px] text-rose-400 flex items-center gap-1 font-semibold animate-pulse">
                                                <AlertOctagon size={12}/> 超時 {doc.days_outstanding} 天
                                            </span>
                                        )}
                                    </div>
                                </div>

                                {/* Pipeline Visual */}
                                <div className="relative mt-6 pt-4 border-t border-white/5 z-10">
                                    <div className="flex items-center justify-between relative">
                                        {/* Connecting Line */}
                                        <div className="absolute top-1/2 left-0 w-full h-0.5 bg-zinc-800 -translate-y-1/2 z-0" />
                                        
                                        {STATUS_FLOW.map((step, idx) => {
                                            const currentIndex = STATUS_FLOW.indexOf(doc.status);
                                            const isActive = idx === currentIndex;
                                            const isPast = idx <= currentIndex;
                                            
                                            // Progress line fill
                                            if (idx < STATUS_FLOW.length - 1 && isPast && idx < currentIndex) {
                                                return (
                                                    <div key={`line-${step}`} className="absolute top-1/2 h-0.5 bg-blue-500 -translate-y-1/2 z-0 transition-all duration-500" 
                                                        style={{ 
                                                            left: `${(idx / (STATUS_FLOW.length - 1)) * 100}%`, 
                                                            width: `${(1 / (STATUS_FLOW.length - 1)) * 100}%` 
                                                        }} 
                                                    />
                                                );
                                            }
                                            return null;
                                        })}

                                        {/* Status Nodes */}
                                        {STATUS_FLOW.map((step, idx) => {
                                            const currentIndex = STATUS_FLOW.indexOf(doc.status);
                                            const isActive = idx === currentIndex;
                                            const isPast = idx <= currentIndex;

                                            return (
                                                <div key={step} className="relative z-10 flex flex-col items-center gap-2">
                                                    <div className={cn(
                                                        "w-4 h-4 rounded-full border-2 transition-all duration-300 flex items-center justify-center",
                                                        isActive ? "bg-blue-500 border-blue-500 scale-125 shadow-[0_0_10px_rgba(59,130,246,0.6)]" : 
                                                        isPast ? "bg-blue-500 border-blue-500" : "bg-zinc-900 border-zinc-700"
                                                    )}>
                                                        {isPast && !isActive && <CheckCircle2 size={10} className="text-black" />}
                                                    </div>
                                                    <span className={cn(
                                                        "text-[10px] font-medium absolute top-6 whitespace-nowrap",
                                                        isActive ? "text-blue-400 font-bold" : isPast ? "text-zinc-400" : "text-zinc-600"
                                                    )}>
                                                        {STATUS_LABELS[step]}
                                                    </span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                                <div className="h-6" /> {/* Spacer for labels */}
                            </div>
                        );
                    })}
                </div>

                {/* Right Panel: Actions & Audit Logs */}
                <div className="xl:col-span-1">
                    <div className="bg-[#14171d] border border-white/5 rounded-2xl p-6 sticky top-6 shadow-2xl">
                        {!selectedDoc ? (
                            <div className="text-center py-20 text-zinc-600 flex flex-col items-center gap-3">
                                <FileText size={40} className="opacity-20" />
                                <p className="text-sm">點擊左側文件檢視詳情與操作</p>
                            </div>
                        ) : (
                            <div className="space-y-6 animate-fade-in">
                                <div>
                                    <h2 className="text-lg font-bold text-white flex items-center gap-2">
                                        {selectedDoc.doc_type} 
                                        <span className="text-sm text-zinc-500 font-normal">({selectedDoc.room_id})</span>
                                    </h2>
                                    <p className="text-sm text-zinc-400 mt-1">{selectedDoc.notes || '無備註'}</p>
                                </div>

                                {/* Actions */}
                                {selectedDoc.status !== 'completed' && (
                                    <div className="p-4 bg-white/5 rounded-xl border border-white/10 space-y-4">
                                        <h3 className="text-xs font-semibold text-zinc-300 uppercase tracking-widest">推進流程</h3>
                                        <p className="text-[11px] text-zinc-500">{labMessage}</p>
                                        
                                        <div>
                                            <input 
                                                type="text" 
                                                placeholder="請輸入操作原因 (必填)"
                                                value={actionReason}
                                                onChange={(e) => setActionReason(e.target.value)}
                                                className="w-full bg-[#0a0c10] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500 transition-colors"
                                            />
                                        </div>

                                        <div className="flex gap-2">
                                            {STATUS_FLOW.indexOf(selectedDoc.status) > 0 && (
                                                <button 
                                                    onClick={() => handleUpdateStatus(selectedDoc.id, STATUS_FLOW[STATUS_FLOW.indexOf(selectedDoc.status) - 1])}
                                                    className="flex-1 py-2 bg-zinc-800 text-zinc-300 rounded-lg text-xs font-bold hover:bg-zinc-700 transition-colors flex justify-center items-center gap-1"
                                                >
                                                    <ArrowLeft size={14} /> 退回
                                                </button>
                                            )}
                                            {STATUS_FLOW.indexOf(selectedDoc.status) < STATUS_FLOW.length - 1 && (
                                                <button 
                                                    onClick={() => handleUpdateStatus(selectedDoc.id, STATUS_FLOW[STATUS_FLOW.indexOf(selectedDoc.status) + 1])}
                                                    className="flex-[2] py-2 bg-blue-600 text-white rounded-lg text-xs font-bold hover:bg-blue-500 transition-colors shadow-lg shadow-blue-500/25 flex justify-center items-center gap-1"
                                                >
                                                    推進至 {STATUS_LABELS[STATUS_FLOW[STATUS_FLOW.indexOf(selectedDoc.status) + 1]]} <ArrowRight size={14} />
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {/* Audit Logs */}
                                <div className="space-y-3 pt-4 border-t border-white/5">
                                    <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-widest flex items-center gap-2">
                                        <Clock size={12} /> 操作紀錄
                                    </h3>
                                    <div className="space-y-3 max-h-[300px] overflow-y-auto custom-scrollbar pr-2">
                                        {!selectedDoc.audit_logs || selectedDoc.audit_logs.length === 0 ? (
                                            <p className="text-xs text-zinc-600">尚無紀錄</p>
                                        ) : (
                                            selectedDoc.audit_logs.map(log => (
                                                <div key={log.id} className="text-xs flex gap-3 p-3 bg-white/[0.02] rounded-lg border border-white/5">
                                                    <div className="mt-0.5"><User size={14} className="text-zinc-500" /></div>
                                                    <div>
                                                        <div className="flex items-center gap-2 mb-1">
                                                            <span className="font-bold text-zinc-300">{log.actor}</span>
                                                            <span className="text-[10px] text-zinc-600 font-mono">
                                                                {new Date(log.created_at).toLocaleTimeString('zh-HK')}
                                                            </span>
                                                        </div>
                                                        <p className="text-zinc-400 mb-1">
                                                            狀態更變: <span className="text-blue-400">{STATUS_LABELS[log.from_status || 'not_started']}</span> → <span className="text-emerald-400">{STATUS_LABELS[log.to_status || 'not_started']}</span>
                                                        </p>
                                                        <p className="text-zinc-500 italic">&quot;{log.reason}&quot;</p>
                                                    </div>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
