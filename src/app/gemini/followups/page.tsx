'use client';

import { useState, useEffect, useCallback } from 'react';
import { 
    ListTodo, 
    CheckCircle2, 
    Clock, 
    Play, 
    XOctagon, 
    AlertTriangle,
    Zap
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Followup, DEPT_INFO } from '../types';
import { GEMINI_EXPERIMENTAL_NOTE } from '../experimental';

export default function GeminiFollowups() {
    const [followups, setFollowups] = useState<Followup[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<'all' | 'open' | 'in_progress' | 'done'>('all');
    const [labMessage, setLabMessage] = useState('跟進事項狀態只會在本頁變化，主線資料不會被修改。');

    const fetchFollowups = useCallback(async () => {
        try {
            const res = await fetch('/api/followups');
            if (res.ok) {
                setFollowups(await res.json());
            } else {
                setFollowups([
                    {
                        id: 'fol-1', title: '10F 冷氣維修跟進', description: '住客再次反應冷氣不冷，需派員檢查', priority: 'warning', assigned_dept: 'eng', status: 'open', due_at: new Date(Date.now() + 86400000).toISOString(), related_rooms: ['10F'], audit_logs: []
                    },
                    {
                        id: 'fol-2', title: '清潔積壓警告', description: '目前有大量房間處於「待清潔」狀態超過2小時。', priority: 'urgent', assigned_dept: 'clean', status: 'in_progress', due_at: new Date(Date.now() + 3600000).toISOString(), related_rooms: ['28G', '31J'], audit_logs: []
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
        fetchFollowups();
    }, [fetchFollowups]);

    const handleUpdateStatus = (id: string, status: Followup['status']) => {
        setFollowups(prev => prev.map(followup =>
            followup.id === id ? { ...followup, status } : followup
        ));
        setLabMessage(`已在 Gemini compare frontend 本地模擬更新任務狀態為 ${status}。`);
    };

    const PRIORITY_ICONS = {
        urgent: <Zap size={16} className="text-rose-400" />,
        warning: <AlertTriangle size={16} className="text-amber-400" />,
        info: <div className="w-2 h-2 rounded-full bg-blue-400" />
    };

    const STATUS_MAP = {
        open: { label: '待處理', color: 'text-zinc-300 bg-white/5', icon: <Clock size={14} /> },
        in_progress: { label: '進行中', color: 'text-blue-400 bg-blue-500/10', icon: <Play size={14} /> },
        done: { label: '已完成', color: 'text-emerald-400 bg-emerald-500/10', icon: <CheckCircle2 size={14} /> },
        dismissed: { label: '已撤銷', color: 'text-rose-800 bg-rose-500/10', icon: <XOctagon size={14} /> }
    };

    const filtered = followups.filter(f => filter === 'all' || f.status === filter);

    if (loading) return <div className="text-white p-10">載入中...</div>;

    return (
        <div className="space-y-8 animate-fade-in pb-10">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-extrabold text-white flex items-center gap-3 tracking-tight">
                        <ListTodo className="text-emerald-500" size={28} />
                        任務跟進中心
                    </h1>
                    <p className="text-zinc-400 mt-2 text-sm">跨部門協作任務清單</p>
                    <p className="mt-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-zinc-400">
                        {GEMINI_EXPERIMENTAL_NOTE}
                    </p>
                </div>

                <div className="flex bg-[#14171d] p-1 rounded-xl border border-white/5">
                    {['all', 'open', 'in_progress', 'done'].map(f => (
                        <button
                            key={f}
                            onClick={() => setFilter(f as any)}
                            className={cn(
                                "px-4 py-1.5 text-xs font-semibold text-zinc-400 rounded-lg transition-colors capitalize",
                                filter === f && "bg-emerald-600/20 text-emerald-400"
                            )}
                        >
                            {f === 'all' ? '全部' : STATUS_MAP[f as keyof typeof STATUS_MAP].label}
                        </button>
                    ))}
                </div>
            </div>

            <div className="bg-[#14171d] rounded-2xl border border-white/5 shadow-2xl overflow-hidden">
                <div className="border-b border-white/5 bg-white/[0.02] px-5 py-2 text-xs text-zinc-500">
                    {labMessage}
                </div>
                <div className="p-5 border-b border-white/5 flex items-center gap-4 text-xs font-semibold text-zinc-500 uppercase tracking-widest bg-white/[0.01]">
                    <div className="w-10 text-center">級別</div>
                    <div className="w-32">指定部門</div>
                    <div className="flex-1">主旨與說明</div>
                    <div className="w-40">相關房間 / 到期時間</div>
                    <div className="w-32">目前狀態</div>
                    <div className="w-40 text-center">操作</div>
                </div>

                <div className="divide-y divide-white/5">
                    {filtered.length === 0 ? (
                        <div className="text-zinc-600 text-center p-10">沒有找到符合條件的跟進事項。</div>
                    ) : filtered.map(item => (
                        <div key={item.id} className="p-5 flex items-center gap-4 hover:bg-white/[0.02] transition-colors group">
                            
                            {/* Priority */}
                            <div className="w-10 flex justify-center items-center">
                                {PRIORITY_ICONS[item.priority]}
                            </div>

                            {/* Department */}
                            <div className="w-32">
                                <span 
                                    className="px-2 py-1 rounded shadow-inner text-xs font-bold font-mono tracking-widest border border-white/5" 
                                    style={{ backgroundColor: `${DEPT_INFO[item.assigned_dept]?.color}20`, color: DEPT_INFO[item.assigned_dept]?.color }}
                                >
                                    {DEPT_INFO[item.assigned_dept]?.name || item.assigned_dept}
                                </span>
                            </div>

                            {/* Title & Desc */}
                            <div className="flex-1 pr-4">
                                <h3 className="text-sm font-bold text-white mb-1 group-hover:text-indigo-300 transition-colors">
                                    {item.title}
                                </h3>
                                <p className="text-xs text-zinc-400 line-clamp-1 group-hover:line-clamp-none transition-all">
                                    {item.description}
                                </p>
                            </div>

                            {/* Room & Due */}
                            <div className="w-40 flex flex-col gap-1.5">
                                {item.related_rooms.length > 0 ? (
                                    <div className="flex gap-1 flex-wrap">
                                        {item.related_rooms.map(room => (
                                            <span key={room} className="text-[10px] font-mono font-bold bg-white/10 text-zinc-300 px-1.5 py-0.5 rounded">
                                                {room}
                                            </span>
                                        ))}
                                    </div>
                                ) : <span className="text-xs text-zinc-600">-</span>}
                                {item.due_at && (
                                    <span className={cn(
                                        "text-[10px] font-medium flex items-center gap-1",
                                        new Date(item.due_at) < new Date() ? "text-rose-400" : "text-zinc-500"
                                    )}>
                                        <Clock size={10} /> {new Date(item.due_at).toLocaleDateString('zh-HK')}
                                    </span>
                                )}
                            </div>

                            {/* Status */}
                            <div className="w-32">
                                <span className={cn(
                                    "flex items-center gap-1.5 w-max px-2.5 py-1 rounded border border-white/5 text-xs font-bold",
                                    STATUS_MAP[item.status as keyof typeof STATUS_MAP].color
                                )}>
                                    {STATUS_MAP[item.status as keyof typeof STATUS_MAP].icon}
                                    {STATUS_MAP[item.status as keyof typeof STATUS_MAP].label}
                                </span>
                            </div>

                            {/* Actions */}
                            <div className="w-40 flex items-center justify-center gap-2">
                                {item.status === 'open' && (
                                    <button 
                                        onClick={() => handleUpdateStatus(item.id, 'in_progress')}
                                        className="p-1.5 bg-blue-500/20 text-blue-400 hover:bg-blue-500 border border-blue-500/20 hover:text-white rounded-lg transition-colors group-hover:scale-105"
                                        title="標示為進行中"
                                    >
                                        <Play size={16} />
                                    </button>
                                )}
                                {(item.status === 'open' || item.status === 'in_progress') && (
                                    <button 
                                        onClick={() => handleUpdateStatus(item.id, 'done')}
                                        className="p-1.5 bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500 border border-emerald-500/20 hover:text-white rounded-lg transition-colors group-hover:scale-105"
                                        title="標示為已完成"
                                    >
                                        <CheckCircle2 size={16} />
                                    </button>
                                )}
                                {item.status !== 'done' && item.status !== 'dismissed' && (
                                    <button 
                                        onClick={() => handleUpdateStatus(item.id, 'dismissed')}
                                        className="p-1.5 bg-rose-500/10 text-rose-500 hover:bg-rose-500 border border-rose-500/20 hover:text-white rounded-lg transition-colors group-hover:scale-105"
                                        title="撤銷任務"
                                    >
                                        <XOctagon size={16} />
                                    </button>
                                )}
                            </div>

                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
