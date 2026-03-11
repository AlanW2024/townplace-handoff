'use client';

import { useState, useRef } from 'react';
import { Upload, FileText, CheckCircle, AlertCircle, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface UploadResult {
    total_lines: number;
    parsed_messages: number;
    handoffs_created: number;
    chat_name: string;
    chat_type: 'group' | 'direct';
}

export default function UploadPage() {
    const [dragOver, setDragOver] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [result, setResult] = useState<UploadResult | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [chatName, setChatName] = useState('');
    const [chatType, setChatType] = useState<'group' | 'direct'>('group');
    const fileRef = useRef<HTMLInputElement>(null);

    const handleUpload = async (file: File) => {
        setUploading(true);
        setError(null);
        setResult(null);
        try {
            const formData = new FormData();
            formData.append('file', file);
            if (chatName.trim()) formData.append('chat_name', chatName.trim());
            formData.append('chat_type', chatType);
            const res = await fetch('/api/upload', { method: 'POST', body: formData });
            if (!res.ok) throw new Error('上傳失敗');
            const data = await res.json();
            setResult(data);
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
                <p className="text-sm text-slate-500 mt-1">上傳 WhatsApp 對話匯出的 .txt 檔案，系統會自動解析所有訊息</p>
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
                        <p className="text-sm text-blue-600 font-medium">解析中...</p>
                    </div>
                ) : (
                    <div className="flex flex-col items-center gap-3">
                        <div className="w-16 h-16 rounded-2xl bg-blue-100 flex items-center justify-center">
                            <Upload size={28} className="text-blue-500" />
                        </div>
                        <p className="text-sm font-semibold text-slate-700">拖放 WhatsApp 匯出檔到此處</p>
                        <p className="text-xs text-slate-400">支援 `.txt` 和 `.zip`，media 會自動略過</p>
                    </div>
                )}
            </div>

            {/* Result */}
            {result && (
                <div className="glass-card p-5 border-l-4 border-l-emerald-400 animate-slide-in">
                    <div className="flex items-center gap-2 mb-4">
                        <CheckCircle size={18} className="text-emerald-500" />
                        <span className="text-sm font-semibold text-emerald-700">上傳成功！</span>
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
                            <p className="text-2xl font-bold text-amber-700">{result.handoffs_created}</p>
                            <p className="text-xs text-slate-500 mt-1">交接信號</p>
                        </div>
                    </div>
                    <p className="text-xs text-slate-500 mt-4 flex items-center gap-1">
                        <ArrowRight size={12} /> 前往「訊息中心」查看解析結果
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
