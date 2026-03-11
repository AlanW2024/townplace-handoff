'use client';

import { useState } from 'react';
import { 
    UploadCloud, 
    FileUp, 
    CheckCircle2, 
    XOctagon,
    Settings,
    Loader2
} from 'lucide-react';
import { DEPT_INFO, DeptCode } from '../types';
import { GEMINI_EXPERIMENTAL_NOTE } from '../experimental';

export default function GeminiUpload() {
    const [file, setFile] = useState<File | null>(null);
    const [chatName, setChatName] = useState('');
    const [chatType, setChatType] = useState('group');
    const [senderDept, setSenderDept] = useState<DeptCode>('eng');
    const [uploading, setUploading] = useState(false);
    const [result, setResult] = useState<{ parsed: number; skipped: number } | null>(null);
    const [error, setError] = useState('');

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setFile(e.target.files[0]);
            setResult(null);
            setError('');
        }
    };

    const handleUpload = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!file) return;

        setUploading(true);
        setError('');
        setResult(null);

        try {
            await new Promise(resolve => setTimeout(resolve, 600));
            const estimatedParsed = Math.max(3, Math.min(120, Math.round(file.size / 4096)));
            const estimatedSkipped = Math.max(0, Math.round(estimatedParsed * 0.12));
            setResult({
                parsed: estimatedParsed,
                skipped: estimatedSkipped,
            });
            setFile(null);
            
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : '模擬上傳失敗');
        } finally {
            setUploading(false);
        }
    };

    return (
        <div className="space-y-8 animate-fade-in pb-10 max-w-4xl mx-auto flex flex-col items-center pt-10">
            <div className="text-center mb-6">
                <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-2xl shadow-indigo-500/30 mx-auto mb-6">
                    <UploadCloud size={40} className="text-white drop-shadow-md" />
                </div>
                <h1 className="text-4xl font-extrabold text-white tracking-tight">
                    批量訊息匯入
                </h1>
                <p className="text-zinc-400 mt-3 text-sm">支援 WhatsApp 上傳導出的 .txt 記錄檔</p>
                <p className="mt-4 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-xs text-zinc-400">
                    {GEMINI_EXPERIMENTAL_NOTE}
                </p>
            </div>

            <div className="w-full bg-[#14171d] rounded-3xl border border-white/5 shadow-2xl overflow-hidden mt-10">
                <form onSubmit={handleUpload} className="p-8 md:p-12 space-y-8">
                    
                    {/* File Dropzone / Selector */}
                    <div className="space-y-3 relative group">
                        <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-2">
                            <FileUp size={14} /> 選擇檔案
                        </label>
                        <div className="relative border-2 border-dashed border-white/10 group-hover:border-indigo-500/50 rounded-2xl p-10 flex flex-col items-center justify-center text-center transition-all bg-white/[0.02]">
                            <input
                                type="file"
                                accept=".txt,.zip"
                                onChange={handleFileChange}
                                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                            />
                            {file ? (
                                <div className="space-y-2">
                                    <h4 className="text-lg font-bold text-indigo-400">{file.name}</h4>
                                    <p className="text-sm text-zinc-500 font-mono">{(file.size / 1024).toFixed(1)} KB</p>
                                </div>
                            ) : (
                                <div className="space-y-3 pointer-events-none">
                                    <div className="w-16 h-16 rounded-full bg-indigo-500/10 flex items-center justify-center mx-auto text-indigo-400">
                                        <FileUp size={24} />
                                    </div>
                                    <h4 className="text-lg font-bold text-white">點擊或拖曳檔案至此</h4>
                                    <p className="text-xs text-zinc-500 tracking-wide leading-relaxed">支援 WhatsApp 群組導出的 .txt 文字檔<br/>或包含多個檔案的 .zip 壓縮檔</p>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="pt-8 border-t border-white/5">
                        <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-2 mb-6">
                            <Settings size={14} /> 進階選項
                        </label>
                        
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <div className="space-y-2">
                                <label className="text-[11px] font-semibold text-zinc-400">對話來源名稱 (選填)</label>
                                <input
                                    type="text"
                                    value={chatName}
                                    onChange={(e) => setChatName(e.target.value)}
                                    placeholder="例如：交接大群組"
                                    className="w-full bg-[#0a0c10] border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors placeholder:text-zinc-600"
                                />
                            </div>
                            
                            <div className="space-y-2">
                                <label className="text-[11px] font-semibold text-zinc-400">對話類型</label>
                                <select
                                    value={chatType}
                                    onChange={(e) => setChatType(e.target.value)}
                                    className="w-full bg-[#0a0c10] border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors"
                                >
                                    <option value="group">群組對話 (Group)</option>
                                    <option value="direct">私人對話 (Direct)</option>
                                </select>
                            </div>

                            <div className="space-y-2">
                                <label className="text-[11px] font-semibold text-zinc-400">預設寄件部門</label>
                                <select
                                    value={senderDept}
                                    onChange={(e) => setSenderDept(e.target.value as DeptCode)}
                                    className="w-full bg-[#0a0c10] border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors"
                                >
                                    {Object.entries(DEPT_INFO).map(([code, info]) => (
                                        <option key={code} value={code}>{info.name}</option>
                                    ))}
                                </select>
                            </div>
                        </div>
                    </div>

                    {/* Result Messages */}
                    {error && (
                        <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-xl flex items-center gap-3 text-rose-400 text-sm font-bold">
                            <XOctagon size={18} /> {error}
                        </div>
                    )}
                    
                    {result && (
                        <div className="p-6 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-4 max-w-full overflow-hidden">
                            <div className="flex items-center gap-3 text-emerald-400 mb-2 md:mb-0">
                                <CheckCircle2 size={24} className="shrink-0" />
                                <div>
                                    <h3 className="font-bold text-base">上傳與解析完成</h3>
                                    <p className="text-emerald-500/70 text-xs">這是前端本地模擬結果，沒有把檔案寫入正式系統</p>
                                </div>
                            </div>
                            <div className="flex gap-4">
                                <div className="text-center p-3 bg-black/20 rounded-xl border border-emerald-500/10 shadow-inner">
                                    <div className="text-2xl font-black text-white">{result.parsed}</div>
                                    <div className="text-[10px] uppercase tracking-widest text-emerald-500/70">處理的訊息</div>
                                </div>
                                <div className="text-center p-3 bg-black/20 rounded-xl border border-zinc-500/10 shadow-inner">
                                    <div className="text-2xl font-black text-white">{result.skipped}</div>
                                    <div className="text-[10px] uppercase tracking-widest text-zinc-500">略過的非文本</div>
                                </div>
                            </div>
                        </div>
                    )}

                    <div className="pt-4 flex justify-end">
                        <button
                            type="submit"
                            disabled={!file || uploading}
                            className="w-full md:w-auto px-8 py-3.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:hover:bg-indigo-600 rounded-xl text-white font-bold transition-all shadow-[0_0_20px_rgba(79,70,229,0.3)] disabled:shadow-none flex items-center justify-center gap-2 active:scale-95"
                        >
                            {uploading ? (
                                <>
                                    <Loader2 size={18} className="animate-spin" />
                                    解析載入中...
                                </>
                            ) : (
                                <>
                                    <UploadCloud size={18} />
                                    確認上傳並解析
                                </>
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
