'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Upload, FileText, CheckCircle, AlertCircle, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { usePolling } from '@/hooks/usePolling';

const LAST_UPLOAD_STORAGE_KEY = 'townplace:last-upload-result';

interface UploadResult {
    upload_batch_id: string;
    ai_batch_run_id: string;
    total_lines: number;
    parsed_messages: number;
    stored_messages: number;
    handoffs_created: number;
    chat_name: string;
    chat_type: 'group' | 'direct';
}

interface UploadBatchStatus {
    id: string;
    status: 'uploaded' | 'analyzing' | 'completed' | 'failed';
    message_count: number;
    review_count: number;
    actionable_count: number;
    context_count: number;
    irrelevant_count: number;
    summary_digest: string | null;
    ai_batch_run: {
        id: string;
        status: 'queued' | 'running' | 'completed' | 'failed';
        total_chunks: number;
        completed_chunks: number;
    } | null;
}

export default function UploadPage() {
    const router = useRouter();
    const [dragOver, setDragOver] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [result, setResult] = useState<UploadResult | null>(null);
    const [batchStatus, setBatchStatus] = useState<UploadBatchStatus | null>(null);
    const [restoredStatus, setRestoredStatus] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [chatName, setChatName] = useState('');
    const [chatType, setChatType] = useState<'group' | 'direct'>('group');
    const fileRef = useRef<HTMLInputElement>(null);

    const fetchBatchStatusById = useCallback(async (uploadBatchId: string) => {
        const res = await fetch(`/api/uploads/${uploadBatchId}`);
        if (!res.ok) return;
        const data = await res.json() as UploadBatchStatus;
        setBatchStatus(data);
        return data;
    }, []);

    const fetchBatchStatus = useCallback(async () => {
        if (!result?.upload_batch_id) return;
        await fetchBatchStatusById(result.upload_batch_id);
    }, [fetchBatchStatusById, result?.upload_batch_id]);

    usePolling(fetchBatchStatus, result?.upload_batch_id ? 3000 : 0);

    useEffect(() => {
        const savedRaw = window.localStorage.getItem(LAST_UPLOAD_STORAGE_KEY);
        if (!savedRaw) return;

        try {
            const saved = JSON.parse(savedRaw) as UploadResult;
            if (!saved?.upload_batch_id) {
                window.localStorage.removeItem(LAST_UPLOAD_STORAGE_KEY);
                return;
            }

            setResult(saved);
            setRestoredStatus(true);
            void fetchBatchStatusById(saved.upload_batch_id).then(status => {
                if (!status) {
                    window.localStorage.removeItem(LAST_UPLOAD_STORAGE_KEY);
                    setResult(null);
                    setBatchStatus(null);
                    setRestoredStatus(false);
                }
            });
        } catch {
            window.localStorage.removeItem(LAST_UPLOAD_STORAGE_KEY);
        }
    }, [fetchBatchStatusById]);

    const clearTrackedUpload = useCallback(() => {
        window.localStorage.removeItem(LAST_UPLOAD_STORAGE_KEY);
        setResult(null);
        setBatchStatus(null);
        setRestoredStatus(false);
    }, []);

    const handleUpload = async (file: File) => {
        setUploading(true);
        setError(null);
        setResult(null);
        setBatchStatus(null);
        setRestoredStatus(false);
        try {
            const formData = new FormData();
            formData.append('file', file);
            if (chatName.trim()) formData.append('chat_name', chatName.trim());
            formData.append('chat_type', chatType);
            const res = await fetch('/api/upload', { method: 'POST', body: formData });
            if (!res.ok) throw new Error('上傳失敗');
            const data = await res.json() as UploadResult;
            setResult(data);
            window.localStorage.setItem(LAST_UPLOAD_STORAGE_KEY, JSON.stringify(data));
            await fetchBatchStatusById(data.upload_batch_id);
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : '操作失敗');
        } finally {
            setUploading(false);
        }
    };

    const onDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setDragOver(false);
        const file = e.dataTransfer.files[0];
        if (file) handleUpload(file);
    };

    const onFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) handleUpload(file);
    };

    return (
        <div className="space-y-6 max-w-2xl">
            <div>
                <h1 className="page-title">上傳 WhatsApp 訊息</h1>
                <p className="text-sm text-slate-500 mt-1">上傳 WhatsApp 對話匯出的 .txt 或 .zip，系統會先保存全部原始訊息，再自動做全檔 AI 營運分析</p>
            </div>

            {/* Upload instructions */}
            <div className="glass-card p-5">
                <h2 className="text-sm font-semibold text-slate-700 mb-3">📋 匯出步驟</h2>
                <ol className="space-y-2 text-sm text-slate-600">
                    <li className="flex items-start gap-2"><span className="w-5 h-5 rounded-full bg-blue-100 text-blue-700 text-xs flex items-center justify-center shrink-0 mt-0.5 font-bold">1</span>打開 WhatsApp 群組對話</li>
                    <li className="flex items-start gap-2"><span className="w-5 h-5 rounded-full bg-blue-100 text-blue-700 text-xs flex items-center justify-center shrink-0 mt-0.5 font-bold">2</span>點擊右上角 ⋮ → 更多 → 匯出對話</li>
                    <li className="flex items-start gap-2"><span className="w-5 h-5 rounded-full bg-blue-100 text-blue-700 text-xs flex items-center justify-center shrink-0 mt-0.5 font-bold">3</span>選擇「不包含媒體」</li>
                    <li className="flex items-start gap-2"><span className="w-5 h-5 rounded-full bg-blue-100 text-blue-700 text-xs flex items-center justify-center shrink-0 mt-0.5 font-bold">4</span>可直接上傳 WhatsApp 匯出的 `.txt` 或 `.zip`</li>
                </ol>
            </div>

            <div className="glass-card p-5 space-y-4">
                <div>
                    <h2 className="text-sm font-semibold text-slate-700">對話來源設定</h2>
                    <p className="text-xs text-slate-500 mt-1">C 版 prototype 會將每次匯入視為一個 chat source，可覆寫群組/直聊名稱。</p>
                </div>
                <div className="grid md:grid-cols-[160px_1fr] gap-3">
                    <div>
                        <label className="text-xs text-slate-500 block mb-1.5">對話類型</label>
                        <select
                            value={chatType}
                            onChange={e => setChatType(e.target.value as 'group' | 'direct')}
                            className="input-field w-full"
                        >
                            <option value="group">群組</option>
                            <option value="direct">直聊</option>
                        </select>
                    </div>
                    <div>
                        <label className="text-xs text-slate-500 block mb-1.5">對話名稱（可留空自動用檔名）</label>
                        <input
                            type="text"
                            value={chatName}
                            onChange={e => setChatName(e.target.value)}
                            placeholder="例如：SOHO 前線 / Angel / TPSH🤝Ascent"
                            className="input-field w-full"
                        />
                    </div>
                </div>
            </div>

            {/* Drop zone */}
            <div
                onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={onDrop}
                onClick={() => fileRef.current?.click()}
                className={cn(
                    'glass-card p-12 text-center cursor-pointer transition-all duration-200 border-2 border-dashed',
                    dragOver ? 'border-blue-400 bg-blue-50/50 scale-[1.01]' : 'border-slate-200 hover:border-blue-300 hover:bg-blue-50/30',
                    uploading && 'pointer-events-none opacity-50'
                )}
            >
                <input ref={fileRef} type="file" accept=".txt,.text,.zip" onChange={onFileSelect} className="hidden" />
                {uploading ? (
                    <div className="flex flex-col items-center gap-3">
                        <div className="w-10 h-10 border-3 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
                        <p className="text-sm text-blue-600 font-medium">快速解析中...</p>
                    </div>
                ) : (
                    <div className="flex flex-col items-center gap-3">
                        <div className="w-16 h-16 rounded-2xl bg-blue-100 flex items-center justify-center">
                            <Upload size={28} className="text-blue-500" />
                        </div>
                        <p className="text-sm font-semibold text-slate-700">拖放 WhatsApp 匯出檔到此處</p>
                    <p className="text-xs text-slate-400">支援 `.txt` 和 `.zip`，上傳先成功，AI 之後自動背景分析整份對話</p>
                </div>
            )}
            </div>

            {/* Result */}
            {result && (
                <div className="glass-card p-5 border-l-4 border-l-emerald-400 animate-slide-in">
                    <div className="flex items-center gap-2 mb-4">
                        <CheckCircle size={18} className="text-emerald-500" />
                        <span className="text-sm font-semibold text-emerald-700">上傳成功！</span>
                        {restoredStatus && (
                            <span className="status-badge bg-sky-100 text-sky-700">已恢復上次進度</span>
                        )}
                    </div>
                    <div className="mb-4 flex items-center gap-2 flex-wrap">
                        <span className="status-badge bg-slate-100 text-slate-700">
                            {result.chat_type === 'group' ? '群組' : '直聊'}
                        </span>
                        <span className="status-badge bg-blue-100 text-blue-700">{result.chat_name}</span>
                    </div>
                    <div className="grid grid-cols-3 gap-4">
                        <div className="text-center p-3 bg-slate-50 rounded-xl">
                            <p className="text-2xl font-bold text-slate-700">{result.total_lines}</p>
                            <p className="text-xs text-slate-500 mt-1">總行數</p>
                        </div>
                        <div className="text-center p-3 bg-blue-50 rounded-xl">
                            <p className="text-2xl font-bold text-blue-700">{result.parsed_messages}</p>
                            <p className="text-xs text-slate-500 mt-1">已解析訊息</p>
                        </div>
                        <div className="text-center p-3 bg-amber-50 rounded-xl">
                            <p className="text-2xl font-bold text-amber-700">{batchStatus?.message_count ?? result.stored_messages}</p>
                            <p className="text-xs text-slate-500 mt-1">已入庫訊息</p>
                        </div>
                    </div>
                    <div className="mt-4 p-3 bg-slate-50 rounded-xl space-y-2">
                        <p className="text-xs text-slate-500">AI 分析狀態</p>
                        <div className="flex items-center gap-2 flex-wrap">
                            <span className={cn(
                                'status-badge',
                                batchStatus?.ai_batch_run?.status === 'completed'
                                    ? 'bg-emerald-100 text-emerald-700'
                                    : batchStatus?.ai_batch_run?.status === 'failed'
                                        ? 'bg-red-100 text-red-700'
                                        : 'bg-blue-100 text-blue-700'
                            )}>
                                {batchStatus?.ai_batch_run?.status === 'completed'
                                    ? '分析完成'
                                    : batchStatus?.ai_batch_run?.status === 'failed'
                                        ? '分析失敗'
                                        : '背景分析中'}
                            </span>
                            {batchStatus?.ai_batch_run && (
                                <span className="text-xs text-slate-500">
                                    chunk {batchStatus.ai_batch_run.completed_chunks}/{batchStatus.ai_batch_run.total_chunks || '?'}
                                </span>
                            )}
                        </div>
                        {batchStatus?.status === 'completed' && (
                            <div className="mt-2 p-4 bg-slate-50 rounded-lg">
                                <h3 className="font-medium mb-2">分類結果</h3>
                                <div className="grid grid-cols-4 gap-2 text-sm">
                                    <div className="text-center p-2 bg-emerald-100 rounded">
                                        <div className="font-bold text-emerald-800">{batchStatus.actionable_count}</div>
                                        <div className="text-emerald-600">可操作</div>
                                    </div>
                                    <div className="text-center p-2 bg-blue-100 rounded">
                                        <div className="font-bold text-blue-800">{batchStatus.context_count}</div>
                                        <div className="text-blue-600">背景</div>
                                    </div>
                                    <div className="text-center p-2 bg-slate-100 rounded">
                                        <div className="font-bold text-slate-800">{batchStatus.irrelevant_count}</div>
                                        <div className="text-slate-600">無關</div>
                                    </div>
                                    <div className="text-center p-2 bg-amber-100 rounded">
                                        <div className="font-bold text-amber-800">{batchStatus.review_count}</div>
                                        <div className="text-amber-600">待覆核</div>
                                    </div>
                                </div>
                                {batchStatus.summary_digest && (
                                    <p className="mt-2 text-sm text-slate-600">{batchStatus.summary_digest}</p>
                                )}
                            </div>
                        )}
                        {batchStatus && batchStatus.status !== 'completed' && (
                            <div className="grid grid-cols-4 gap-2">
                                <div className="p-2 bg-white rounded-lg text-center">
                                    <p className="text-lg font-bold text-emerald-600">{batchStatus.actionable_count}</p>
                                    <p className="text-[11px] text-slate-500">可操作</p>
                                </div>
                                <div className="p-2 bg-white rounded-lg text-center">
                                    <p className="text-lg font-bold text-sky-600">{batchStatus.context_count}</p>
                                    <p className="text-[11px] text-slate-500">背景</p>
                                </div>
                                <div className="p-2 bg-white rounded-lg text-center">
                                    <p className="text-lg font-bold text-slate-600">{batchStatus.irrelevant_count}</p>
                                    <p className="text-[11px] text-slate-500">無關</p>
                                </div>
                                <div className="p-2 bg-white rounded-lg text-center">
                                    <p className="text-lg font-bold text-amber-600">{batchStatus.review_count}</p>
                                    <p className="text-[11px] text-slate-500">待覆核</p>
                                </div>
                            </div>
                        )}
                        {batchStatus && batchStatus.status !== 'completed' && batchStatus.summary_digest && (
                            <p className="text-xs leading-relaxed text-slate-600 whitespace-pre-wrap">{batchStatus.summary_digest}</p>
                        )}
                    </div>
                    <div className="mt-4 flex items-center gap-2 flex-wrap">
                        <button
                            type="button"
                            onClick={() => router.push('/')}
                            className="btn-primary text-sm flex items-center gap-2"
                        >
                            <ArrowRight size={14} />
                            進入訊息中心
                        </button>
                        <button
                            type="button"
                            onClick={() => router.push(`/ai?run=${result.ai_batch_run_id}`)}
                            className="px-4 py-2 rounded-xl text-sm font-semibold bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 transition-colors"
                        >
                            查看 AI 分析
                        </button>
                        <button
                            type="button"
                            onClick={clearTrackedUpload}
                            className="px-4 py-2 rounded-xl text-sm font-semibold bg-white border border-slate-200 text-slate-500 hover:bg-slate-50 transition-colors"
                        >
                            清除這次狀態
                        </button>
                    </div>
                    <p className="text-xs text-slate-500 mt-3 flex items-center gap-1">
                        <ArrowRight size={12} /> 第一個按鈕會帶你去看全部原始訊息，第二個按鈕會直接打開這次 upload 的 AI 批次摘要。
                    </p>
                </div>
            )}

            {/* Error */}
            {error && (
                <div className="glass-card p-4 border-l-4 border-l-red-400 animate-slide-in">
                    <div className="flex items-center gap-2">
                        <AlertCircle size={16} className="text-red-500" />
                        <span className="text-sm text-red-700">{error}</span>
                    </div>
                </div>
            )}
        </div>
    );
}
