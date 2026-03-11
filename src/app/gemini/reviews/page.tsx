'use client';

import { useState, useEffect, useCallback } from 'react';
import { 
    FileSearch, 
    Check, 
    X, 
    Edit3,
    AlertCircle,
    BrainCircuit,
    Save
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { ParseReview, DEPT_INFO } from '../types';
import { GEMINI_EXPERIMENTAL_NOTE } from '../experimental';

export default function GeminiReviews() {
    const [reviews, setReviews] = useState<ParseReview[]>([]);
    const [loading, setLoading] = useState(true);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [labMessage, setLabMessage] = useState('這裡的 approve / correct / dismiss 只會改目前畫面，不會寫入 review queue。');

    // Form state for corrections
    const [editRooms, setEditRooms] = useState('');
    const [editAction, setEditAction] = useState('');
    const [editType, setEditType] = useState('request');

    const fetchReviews = useCallback(async () => {
        try {
            const res = await fetch('/api/reviews');
            if (res.ok) {
                setReviews(await res.json());
            } else {
                setReviews([
                    {
                        id: 'rev-1',
                        raw_text: '幫我睇下果個12樓A同埋B室係咪搞掂左可以去洗',
                        sender_name: 'Vincent (Eng)',
                        sender_dept: 'eng',
                        confidence: 0.45,
                        suggested_rooms: ['12A', '12B'],
                        suggested_action: '工程完成，可清潔',
                        suggested_type: 'handoff',
                        review_status: 'pending'
                    },
                    {
                        id: 'rev-2',
                        raw_text: '唔知咩事冷氣有聲',
                        sender_name: 'Guest 23F',
                        sender_dept: 'conc',
                        confidence: 0.3,
                        suggested_rooms: [],
                        suggested_action: '檢查冷氣異音',
                        suggested_type: 'request',
                        review_status: 'pending'
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
        fetchReviews();
    }, [fetchReviews]);

    const handleAction = (id: string, actionType: 'approved' | 'dismissed') => {
        setReviews(prev => prev.filter(r => r.id !== id));
        setLabMessage(`已在本頁模擬把覆核項目標記為 ${actionType}。正式 review queue 未被改動。`);
    };

    const handleCorrect = (id: string) => {
        setReviews(prev => prev.filter(r => r.id !== id));
        setEditingId(null);
        setLabMessage('已在本頁模擬儲存修正。這只是設計互動，不會寫入正式資料。');
    };

    const startEdit = (rev: ParseReview) => {
        setEditingId(rev.id);
        setEditRooms(rev.suggested_rooms.join(', '));
        setEditAction(rev.suggested_action || '');
        setEditType(rev.suggested_type || 'handoff');
    };

    if (loading) return <div className="text-white p-10">載入中...</div>;

    const pendingReviews = reviews.filter(r => r.review_status === 'pending');

    return (
        <div className="space-y-8 animate-fade-in pb-10">
            <div>
                <h1 className="text-3xl font-extrabold text-white flex items-center gap-3 tracking-tight">
                    <FileSearch className="text-pink-500" size={28} />
                    人工覆核 AI 解析
                </h1>
                <p className="text-zinc-400 mt-2 text-sm">審核低信心度或模糊的訊息解析結果</p>
                <p className="mt-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-zinc-400">
                    {GEMINI_EXPERIMENTAL_NOTE}
                </p>
            </div>

            <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2 text-xs text-zinc-500">
                {labMessage}
            </div>

            {pendingReviews.length === 0 ? (
                <div className="bg-[#14171d] rounded-2xl border border-white/5 p-10 flex flex-col items-center justify-center text-zinc-500 gap-4 shadow-inner">
                    <Check size={48} className="text-emerald-500/20" />
                    <p>目前沒有需要覆核的項目，AI 解析準確度良好。</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 gap-6">
                    {pendingReviews.map(rev => {
                        const isEditing = editingId === rev.id;

                        return (
                            <div key={rev.id} className="bg-[#14171d] border border-white/5 rounded-2xl p-6 shadow-2xl relative overflow-hidden group">
                                {/* Low Confidence Indicator */}
                                {rev.confidence < 0.5 && !isEditing && (
                                    <div className="absolute top-0 right-0 w-32 h-32 bg-pink-500/10 rounded-full blur-3xl -translate-y-16 translate-x-16 pointer-events-none" />
                                )}

                                <div className="flex flex-col xl:flex-row gap-8 relative z-10 w-full">
                                    
                                    {/* Left: Raw Context */}
                                    <div className="xl:w-1/3 flex flex-col gap-4">
                                        <div>
                                            <span className="text-xs uppercase font-bold tracking-widest text-zinc-500 mb-2 block">
                                                原始訊息
                                            </span>
                                            <div className="bg-[#0a0c10] border border-white/5 rounded-xl p-4 min-h-[100px] flex items-center justify-center text-center">
                                                <p className="text-white font-medium leading-relaxed italic text-lg shadow-sm">
                                                    &quot;{rev.raw_text}&quot;
                                                </p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span className="text-[10px] uppercase bg-white/5 px-2 py-0.5 rounded text-zinc-400 border border-white/10">Sender</span>
                                            <span className="text-xs font-bold font-mono tracking-widest text-white">{rev.sender_name}</span>
                                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded ml-2" style={{ backgroundColor: `${DEPT_INFO[rev.sender_dept]?.color}20`, color: DEPT_INFO[rev.sender_dept]?.color }}>
                                                {DEPT_INFO[rev.sender_dept]?.name || rev.sender_dept}
                                            </span>
                                        </div>
                                    </div>

                                    {/* Divider */}
                                    <div className="hidden xl:block w-px bg-white/5 self-stretch" />

                                    {/* Right: AI Suggestion & Edit */}
                                    <div className="flex-1 flex flex-col justify-between">
                                        <div className="flex items-start justify-between mb-4">
                                            <span className="text-xs uppercase font-bold tracking-widest text-pink-400 flex items-center gap-2">
                                                <BrainCircuit size={14} /> AI 解析建議
                                            </span>
                                            <span className={cn(
                                                "text-xs font-bold font-mono px-2 py-1 rounded shadow-inner",
                                                rev.confidence < 0.5 ? "bg-rose-500/20 text-rose-400" : "bg-amber-500/20 text-amber-400"
                                            )}>
                                                信心度 {Math.round(rev.confidence * 100)}%
                                            </span>
                                        </div>

                                        {isEditing ? (
                                            <div className="space-y-4 animate-fade-in bg-[#0a0c10]/50 p-4 rounded-xl border border-white/10">
                                                <div className="grid grid-cols-2 gap-4">
                                                    <div className="space-y-1.5">
                                                        <label className="text-xs text-zinc-500">房號 (以逗號分隔)</label>
                                                        <input 
                                                            type="text" value={editRooms} onChange={e => setEditRooms(e.target.value)}
                                                            className="w-full bg-[#1a1e27] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-pink-500 focus:ring-1 focus:ring-pink-500"
                                                        />
                                                    </div>
                                                    <div className="space-y-1.5">
                                                        <label className="text-xs text-zinc-500">類型</label>
                                                        <select
                                                            value={editType} onChange={e => setEditType(e.target.value)}
                                                            className="w-full bg-[#1a1e27] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-pink-500 focus:ring-1 focus:ring-pink-500"
                                                        >
                                                            <option value="handoff">handoff (交接)</option>
                                                            <option value="request">request (請求)</option>
                                                            <option value="update">update (更新)</option>
                                                        </select>
                                                    </div>
                                                </div>
                                                <div className="space-y-1.5">
                                                    <label className="text-xs text-zinc-500">動作摘要</label>
                                                    <input 
                                                        type="text" value={editAction} onChange={e => setEditAction(e.target.value)}
                                                        className="w-full bg-[#1a1e27] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-pink-500 focus:ring-1 focus:ring-pink-500"
                                                    />
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
                                                <div className="bg-white/5 border border-white/5 rounded-xl p-3">
                                                    <p className="text-[10px] text-zinc-500 uppercase tracking-widest mb-1">對象房間</p>
                                                    <p className="font-mono text-sm font-bold text-white">
                                                        {rev.suggested_rooms.length > 0 ? rev.suggested_rooms.join(', ') : <span className="text-rose-400 flex items-center gap-1"><AlertCircle size={14}/> 無法辨識</span>}
                                                    </p>
                                                </div>
                                                <div className="bg-white/5 border border-white/5 rounded-xl p-3">
                                                    <p className="text-[10px] text-zinc-500 uppercase tracking-widest mb-1">交接類型</p>
                                                    <p className="font-mono text-sm font-bold text-white capitalize">{rev.suggested_type || 'Unknown'}</p>
                                                </div>
                                                <div className="bg-white/5 border border-white/5 rounded-xl p-3 md:col-span-1 col-span-2">
                                                    <p className="text-[10px] text-zinc-500 uppercase tracking-widest mb-1">動作 / 需求</p>
                                                    <p className="font-bold text-sm text-white truncate">{rev.suggested_action || 'Unknown'}</p>
                                                </div>
                                            </div>
                                        )}

                                        {/* Action Bar */}
                                        <div className="flex items-center gap-3 justify-end mt-4 pt-4 border-t border-white/5">
                                            {isEditing ? (
                                                <>
                                                    <button onClick={() => setEditingId(null)} className="px-4 py-2 text-xs font-bold text-zinc-400 hover:text-white transition-colors">
                                                        取消
                                                    </button>
                                                    <button onClick={() => handleCorrect(rev.id)} className="px-4 py-2 bg-pink-600 text-white rounded-lg text-xs font-bold hover:bg-pink-500 transition-colors shadow-lg shadow-pink-500/20 flex items-center gap-2">
                                                        <Save size={14}/> 儲存修正
                                                    </button>
                                                </>
                                            ) : (
                                                <>
                                                    <button 
                                                        onClick={() => handleAction(rev.id, 'dismissed')}
                                                        className="px-4 py-2 bg-transparent text-zinc-400 hover:text-white hover:bg-white/5 rounded-lg text-xs font-bold transition-colors flex items-center gap-2 border border-transparent shadow-none"
                                                    >
                                                        <X size={14}/> 忽略此條
                                                    </button>
                                                    <button 
                                                        onClick={() => startEdit(rev)}
                                                        className="px-4 py-2 bg-white/10 text-white hover:bg-white/20 border border-white/10 rounded-lg text-xs font-bold transition-colors shadow-lg flex items-center gap-2"
                                                    >
                                                        <Edit3 size={14}/> 修正內容
                                                    </button>
                                                    <button 
                                                        onClick={() => handleAction(rev.id, 'approved')}
                                                        className="px-6 py-2 bg-emerald-600 text-white hover:bg-emerald-500 border border-emerald-500 rounded-lg text-xs font-black transition-colors shadow-[0_0_20px_rgba(16,185,129,0.3)] hover:shadow-[0_0_30px_rgba(16,185,129,0.5)] flex items-center gap-2 ml-2"
                                                    >
                                                        <Check size={16}/> 批准 AI 判斷
                                                    </button>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
