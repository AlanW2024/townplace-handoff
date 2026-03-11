'use client';

import { useState, useEffect, useCallback } from 'react';
import { 
    ClipboardList, 
    Download, 
    Copy,
    RefreshCw,
    FileText,
    CheckCircle2
} from 'lucide-react';

export default function GeminiDailyReport() {
    const [report, setReport] = useState<string>('');
    const [stats, setStats] = useState<{ total: number; categories: number }>({ total: 0, categories: 0 });
    const [loading, setLoading] = useState(true);
    const [generating, setGenerating] = useState(false);
    const [copied, setCopied] = useState(false);

    const generateReport = useCallback(async () => {
        setGenerating(true);
        try {
            const res = await fetch('/api/daily-report');
            if (res.ok) {
                const data = await res.json();
                setReport(data.report);
                
                // Count basic stats from text
                const totalItems = (data.report.match(/^  - /gm) || []).length;
                const totalCategories = (data.report.match(/^\[(.*)\]/gm) || []).length;
                
                setStats({ total: totalItems, categories: totalCategories });
            } else {
                setReport('無法生成報告，可能尚未實作 API。');
            }
        } catch (error) {
            console.error(error);
            setReport('網路錯誤，無法連接至伺服器。');
        } finally {
            setLoading(false);
            setGenerating(false);
        }
    }, []);

    useEffect(() => {
        generateReport();
    }, [generateReport]);

    const handleCopy = () => {
        if (!report) return;
        navigator.clipboard.writeText(report);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    if (loading) return <div className="text-white p-10 flex items-center gap-2"><RefreshCw className="animate-spin"/> 產生報告中...</div>;

    return (
        <div className="space-y-8 animate-fade-in pb-10 max-w-5xl mx-auto">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-extrabold text-white flex items-center gap-3 tracking-tight">
                        <ClipboardList className="text-orange-500" size={28} />
                        自動化每日報告
                    </h1>
                    <p className="text-zinc-400 mt-2 text-sm">彙整全日所有待處理事項、文件進度及交接狀態</p>
                </div>

                <div className="flex items-center gap-2">
                    <button 
                        onClick={generateReport}
                        disabled={generating}
                        className="px-4 py-2 bg-[#14171d] hover:bg-white/5 border border-white/10 rounded-xl text-zinc-300 text-sm font-bold transition-colors flex items-center gap-2 disabled:opacity-50"
                    >
                        <RefreshCw size={16} className={generating ? 'animate-spin' : ''} /> 
                        重新產生
                    </button>
                    <button 
                        onClick={handleCopy}
                        disabled={!report}
                        className="px-4 py-2 bg-orange-600 hover:bg-orange-500 rounded-xl text-white text-sm font-bold transition-all shadow-lg shadow-orange-500/20 flex items-center gap-2 disabled:opacity-50"
                    >
                        {copied ? <CheckCircle2 size={16} /> : <Copy size={16} />}
                        {copied ? '已複製' : '一鍵複製內容'}
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-6 items-start">
                
                {/* Stats Panel */}
                <div className="bg-[#14171d] border border-white/5 rounded-2xl p-6 lg:sticky lg:top-6 shadow-2xl">
                    <div className="flex items-center gap-3 mb-6 pb-4 border-b border-white/5">
                        <div className="p-3 bg-orange-500/10 rounded-xl">
                            <FileText size={24} className="text-orange-500" />
                        </div>
                        <div>
                            <h2 className="text-sm font-bold text-white uppercase tracking-widest">報告摘要</h2>
                            <p className="text-xs text-zinc-500">{new Date().toLocaleDateString('zh-HK')} 結算</p>
                        </div>
                    </div>

                    <div className="space-y-4">
                        <div className="p-4 bg-[#0a0c10] rounded-xl border border-white/5">
                            <span className="text-[10px] uppercase font-mono tracking-widest text-zinc-500">追蹤大項</span>
                            <div className="text-3xl font-black text-white mt-1 drop-shadow-md">
                                {stats.categories}
                            </div>
                        </div>
                        <div className="p-4 bg-[#0a0c10] rounded-xl border border-white/5">
                            <span className="text-[10px] uppercase font-mono tracking-widest text-zinc-500">具體跟進事項數</span>
                            <div className="text-3xl font-black text-white mt-1 drop-shadow-md">
                                {stats.total}
                            </div>
                        </div>
                    </div>

                    <div className="mt-6 pt-6 border-t border-white/5 space-y-3">
                        <p className="text-[10px] uppercase font-bold text-zinc-500 tracking-widest mb-2">一鍵輸出</p>
                        <button className="w-full py-2.5 bg-white/5 hover:bg-white/10 rounded-lg text-xs font-bold text-white border border-white/5 transition-colors flex items-center justify-center gap-2">
                            <Download size={14} /> 匯出為 PDF (即將推出)
                        </button>
                        <button className="w-full py-2.5 bg-white/5 hover:bg-white/10 rounded-lg text-xs font-bold text-white border border-white/5 transition-colors flex items-center justify-center gap-2">
                            <Download size={14} /> 匯出為 CSV (即將推出)
                        </button>
                    </div>
                </div>

                {/* Report Content */}
                <div className="bg-[#14171d] border border-white/5 rounded-2xl overflow-hidden shadow-2xl flex flex-col min-h-[600px]">
                    <div className="bg-black/40 px-6 py-3 border-b border-white/5 flex items-center gap-3">
                        <div className="flex gap-1.5">
                            <div className="w-3 h-3 rounded-full bg-rose-500/50" />
                            <div className="w-3 h-3 rounded-full bg-amber-500/50" />
                            <div className="w-3 h-3 rounded-full bg-emerald-500/50" />
                        </div>
                        <span className="text-xs font-mono text-zinc-500 font-semibold tracking-widest">
                            daily_report_{new Date().toISOString().split('T')[0]}.txt
                        </span>
                    </div>
                    
                    <div className="p-6 md:p-10 flex-1 relative bg-gradient-to-br from-[#14171d] to-[#0a0c10]">
                        <pre className="whitespace-pre-wrap font-mono text-sm leading-[1.8] text-zinc-300 z-10 relative">
                            {report || '報告生成中或無內容...'}
                        </pre>

                        {/* Decorative Logo / Watermark */}
                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none opacity-[0.02]">
                            <ClipboardList size={400} />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
