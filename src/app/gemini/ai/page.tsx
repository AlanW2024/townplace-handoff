'use client';

import { useState, useEffect, useCallback } from 'react';
import { 
    BrainCircuit, 
    Zap, 
    AlertTriangle, 
    Info, 
    PlusCircle,
    ArrowRight
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Suggestion } from '../types';
import { GEMINI_EXPERIMENTAL_NOTE } from '../experimental';

const PRIORITY_STYLES = {
    urgent: 'text-rose-400 bg-rose-500/10 border-rose-500/20 shadow-[0_0_15px_rgba(244,63,94,0.15)]',
    warning: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
    info: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
};

export default function GeminiAIPage() {
    const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<'all' | 'urgent' | 'warning' | 'info'>('all');
    const [labMessage, setLabMessage] = useState('建立 follow-up 只會在本頁模擬完成，不會新增正式跟進事項。');

    const fetchSuggestions = useCallback(async () => {
        try {
            // Note: the backend API might not exist yet, so we mock if 404
            const res = await fetch('/api/suggestions');
            if (res.ok) {
                setSuggestions(await res.json());
            } else {
                // Mock data since /api/suggestions might not be implemented in the original backend
                setSuggestions([
                    {
                        id: 'sug-001', priority: 'urgent', category: 'cleaning_backlog',
                        title: '清潔積壓警告', description: '目前有大量房間處於「待清潔」狀態超過2小時。',
                        affected_rooms: ['10F', '28G', '28F', '31J', '15A', '19C'], recommended_action: '重新分配清潔人員或通知客戶延遲入住。'
                    },
                    {
                        id: 'sug-002', priority: 'warning', category: 'document_overdue',
                        title: '新租文件未完成', description: '有新租約（3M）停留在客方超過5天。',
                        affected_rooms: ['3M'], recommended_action: '主動聯絡租客催收簽名文件。'
                    },
                    {
                        id: 'sug-003', priority: 'info', category: 'engineering_bottleneck',
                        title: '零星執修集中', description: '下午有 3 宗新報修集中於中高層。',
                        affected_rooms: ['18A', '25B', '22C'], recommended_action: '建議安排同一名工程師（例如 Vic）負責處理。'
                    }
                ]);
            }
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchSuggestions();
    }, [fetchSuggestions]);

    const handleCreateFollowup = (sug: Suggestion) => {
        setSuggestions(prev => prev.filter(p => p.id !== sug.id));
        setLabMessage(`已在設計實驗場本地模擬「${sug.title}」轉為 follow-up。`);
    };

    const filteredSuggestions = suggestions.filter(s => filter === 'all' || s.priority === filter);

    if (loading) return <div className="text-white p-10">載入中...</div>;

    return (
        <div className="space-y-8 animate-fade-in pb-10">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-extrabold text-white flex items-center gap-3 tracking-tight">
                        <BrainCircuit className="text-purple-500" size={28} />
                        AI 洞察與管理建議
                    </h1>
                    <p className="text-zinc-400 mt-2 text-sm">基於目前所有排程、狀態與訊息產生的智慧預警</p>
                    <p className="mt-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-zinc-400">
                        {GEMINI_EXPERIMENTAL_NOTE}
                    </p>
                </div>

                <div className="flex bg-[#14171d] p-1 rounded-xl border border-white/5">
                    {['all', 'urgent', 'warning', 'info'].map(f => (
                        <button
                            key={f}
                            onClick={() => setFilter(f as any)}
                            className={cn(
                                "px-4 py-1.5 text-xs font-semibold text-zinc-400 rounded-lg transition-colors capitalize",
                                filter === f && "bg-purple-600/20 text-purple-400"
                            )}
                        >
                            {f}
                        </button>
                    ))}
                </div>
            </div>

            <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2 text-xs text-zinc-500">
                {labMessage}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredSuggestions.length === 0 && <div className="text-zinc-500 p-10">無相關建議</div>}
                
                {filteredSuggestions.map(sug => {
                    const Icon = sug.priority === 'urgent' ? AlertTriangle : sug.priority === 'warning' ? Zap : Info;

                    return (
                        <div key={sug.id} className={cn(
                            "bg-[#14171d] border rounded-2xl p-6 flex flex-col justify-between transition-all hover:scale-[1.02]",
                            PRIORITY_STYLES[sug.priority]
                        )}>
                            <div>
                                <div className="flex items-start justify-between mb-4">
                                    <div className="flex items-center gap-2">
                                        <Icon size={18} />
                                        <span className="text-xs font-bold uppercase tracking-widest bg-white/10 px-2 py-0.5 rounded-md">
                                            {sug.priority}
                                        </span>
                                    </div>
                                    <span className="text-[10px] bg-black/40 px-2 py-1 rounded font-mono text-zinc-400">
                                        {sug.category}
                                    </span>
                                </div>
                                <h3 className="text-lg font-bold text-white mb-2">{sug.title}</h3>
                                <p className="text-sm opacity-80 leading-relaxed mb-4">{sug.description}</p>
                                
                                {sug.affected_rooms.length > 0 && (
                                    <div className="flex flex-wrap gap-2 mb-6">
                                        {sug.affected_rooms.map(room => (
                                            <span key={room} className="text-xs font-mono px-2 py-1 bg-white/10 rounded-md border border-white/5">
                                                {room}
                                            </span>
                                        ))}
                                    </div>
                                )}
                            </div>

                            <div className="pt-4 border-t border-white/10">
                                <p className="text-[11px] font-semibold opacity-70 mb-3 uppercase tracking-widest">系統推薦行動</p>
                                <p className="text-sm font-medium mb-4 flex items-center gap-2">
                                    <ArrowRight size={14} className="opacity-70"/> {sug.recommended_action}
                                </p>
                                <button 
                                    onClick={() => handleCreateFollowup(sug)}
                                    className="w-full flex justify-center items-center gap-2 py-2.5 bg-white/10 hover:bg-white/20 rounded-xl font-bold text-sm transition-colors active:scale-95"
                                >
                                    <PlusCircle size={16} /> 一鍵建立跟進事項
                                </button>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
