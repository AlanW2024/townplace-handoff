'use client';

import { useState, useEffect, useCallback } from 'react';
import { 
    BellRing, 
    AlertOctagon, 
    ShieldAlert, 
    Info, 
    Trash2,
    Calendar,
    ArrowRight
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Notification, DEPT_INFO } from '../types';

const LEVEL_CONFIG = {
    critical: { icon: AlertOctagon, color: 'text-rose-500', bg: 'bg-rose-500/10 border-rose-500/20 shadow-[0_0_15px_rgba(244,63,94,0.15)]' },
    warning: { icon: ShieldAlert, color: 'text-amber-500', bg: 'bg-amber-500/10 border-amber-500/20' },
    info: { icon: Info, color: 'text-blue-500', bg: 'bg-blue-500/10 border-blue-500/20' }
};

export default function GeminiNotifications() {
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<'all' | 'critical' | 'warning' | 'info'>('all');

    const fetchNotifications = useCallback(async () => {
        try {
            const res = await fetch('/api/notifications');
            if (res.ok) {
                setNotifications(await res.json());
            } else {
                setNotifications([
                    {
                        id: 'notif-1', type: 'handoff_timeout', level: 'critical',
                        title: '交接逾時', body: '10F 清潔部未接收工程部交接已超過 2 小時。',
                        related_rooms: ['10F'], related_dept: 'clean', created_at: new Date(Date.now() - 7200000).toISOString()
                    },
                    {
                        id: 'notif-2', type: 'booking_conflict', level: 'warning',
                        title: '預約衝突警告', body: '22A 明日有 Viewing 預約，但目前正處於工程維修中。',
                        related_rooms: ['22A'], related_dept: 'lease', created_at: new Date(Date.now() - 3600000).toISOString()
                    },
                    {
                        id: 'notif-3', type: 'doc_overdue', level: 'info',
                        title: '文件過期提醒', body: '3M 租約文件已於客戶方停滯 5 天。',
                        related_rooms: ['3M'], related_dept: 'lease', created_at: new Date(Date.now() - 86400000).toISOString()
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
        fetchNotifications();
    }, [fetchNotifications]);

    const handleDismiss = (id: string) => {
        // Mock dismiss API
        setNotifications(prev => prev.filter(n => n.id !== id));
    };

    const handleDismissAll = () => {
        if(confirm('確定清除所有通知？')) setNotifications([]);
    };

    const filtered = notifications.filter(n => filter === 'all' || n.level === filter);

    if (loading) return <div className="text-white p-10">載入中...</div>;

    return (
        <div className="space-y-8 animate-fade-in pb-10 max-w-4xl mx-auto">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-extrabold text-white flex items-center gap-3 tracking-tight">
                        <BellRing className="text-cyan-500" size={28} />
                        系統通知中心
                    </h1>
                    <p className="text-zinc-400 mt-2 text-sm">重要事件警報與提醒</p>
                </div>

                <div className="flex bg-[#14171d] p-1 rounded-xl border border-white/5">
                    {['all', 'critical', 'warning', 'info'].map(f => (
                        <button
                            key={f}
                            onClick={() => setFilter(f as any)}
                            className={cn(
                                "px-4 py-1.5 text-xs font-semibold text-zinc-400 rounded-lg transition-colors capitalize",
                                filter === f && "bg-cyan-600/20 text-cyan-400"
                            )}
                        >
                            {f}
                        </button>
                    ))}
                </div>
            </div>

            {notifications.length > 0 && (
                <div className="flex justify-end">
                    <button 
                        onClick={handleDismissAll}
                        className="text-xs text-zinc-500 hover:text-white flex items-center gap-1 transition-colors"
                    >
                        <Trash2 size={12}/> 全部標示為已讀
                    </button>
                </div>
            )}

            <div className="space-y-4">
                {filtered.length === 0 ? (
                    <div className="text-center py-20 bg-[#14171d] rounded-2xl border border-white/5 shadow-inner flex flex-col items-center gap-4 text-zinc-500">
                        <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center">
                            <BellRing size={24} className="opacity-50" />
                        </div>
                        <p>目前沒有任何系統通知</p>
                    </div>
                ) : (
                    filtered.map(notif => {
                        const config = LEVEL_CONFIG[notif.level];
                        const Icon = config.icon;

                        return (
                            <div key={notif.id} className={cn(
                                "p-5 rounded-2xl border flex flex-col sm:flex-row gap-5 relative overflow-hidden group transition-all hover:bg-white/[0.04]",
                                config.bg
                            )}>
                                {/* Status Indicator Line */}
                                <div className={cn("absolute left-0 top-0 bottom-0 w-1", "bg-current", config.color.replace('text-', 'bg-'))} style={{ opacity: 0.5 }} />

                                <div className="hidden sm:block mt-1">
                                    <Icon size={24} className={config.color} />
                                </div>

                                <div className="flex-1">
                                    <div className="flex items-center justify-between mb-1.5">
                                        <div className="flex items-center gap-3">
                                            <h3 className="text-base font-bold text-white">{notif.title}</h3>
                                            <span className="text-[10px] font-mono tracking-widest uppercase bg-black/40 text-zinc-400 px-2 py-0.5 rounded border border-white/5">
                                                {notif.type}
                                            </span>
                                        </div>
                                        <span className="text-xs text-zinc-500 flex items-center gap-1 font-mono">
                                            <Calendar size={12}/> 
                                            {new Date(notif.created_at).toLocaleString('zh-HK')}
                                        </span>
                                    </div>
                                    
                                    <p className="text-sm text-zinc-300 leading-relaxed mb-4">{notif.body}</p>

                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                            {notif.related_dept && (
                                                <div className="text-xs font-bold font-mono tracking-widest px-2 py-1 rounded border border-white/5 shadow-inner" style={{ backgroundColor: `${DEPT_INFO[notif.related_dept]?.color}20`, color: DEPT_INFO[notif.related_dept]?.color }}>
                                                    {DEPT_INFO[notif.related_dept]?.name || notif.related_dept}
                                                </div>
                                            )}
                                            {notif.related_rooms.length > 0 && (
                                                <div className="flex gap-1.5">
                                                    {notif.related_rooms.map(r => (
                                                        <span key={r} className="text-[10px] font-bold font-mono bg-white/10 text-white px-2 py-1 rounded">
                                                            {r}
                                                        </span>
                                                    ))}
                                                </div>
                                            )}
                                        </div>

                                        <button 
                                            onClick={() => handleDismiss(notif.id)}
                                            className="text-xs text-zinc-500 hover:text-white flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
                                        >
                                            標示為已讀 <ArrowRight size={12}/>
                                        </button>
                                    </div>
                                </div>
                            </div>
                        );
                    })
                )}
            </div>
        </div>
    );
}
