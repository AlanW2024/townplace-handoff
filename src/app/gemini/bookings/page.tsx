'use client';

import { useState, useEffect, useCallback } from 'react';
import { 
    CalendarDays, 
    Clock, 
    Camera, 
    Users, 
    Eye,
    Coffee,
    ChevronLeft,
    ChevronRight,
    Search
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Booking, DEPT_INFO } from '../types';

const BOOKING_CONFIG = {
    viewing: { icon: Eye, color: 'text-indigo-400', bg: 'bg-indigo-500/10 border-indigo-500/20' },
    shooting: { icon: Camera, color: 'text-purple-400', bg: 'bg-purple-500/10 border-purple-500/20' },
    event: { icon: Users, color: 'text-rose-400', bg: 'bg-rose-500/10 border-rose-500/20' },
    tenant_booking: { icon: Coffee, color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20' }
};

export default function GeminiBookings() {
    const [bookings, setBookings] = useState<Booking[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<'all' | 'viewing' | 'shooting' | 'event' | 'tenant_booking'>('all');
    const [searchTerm, setSearchTerm] = useState('');

    const fetchBookings = useCallback(async () => {
        try {
            const res = await fetch('/api/bookings');
            if (res.ok) {
                setBookings(await res.json());
            } else {
                setBookings([
                    {
                        id: 'bk-1', room_id: '15F', facility: null, booking_type: 'viewing',
                        scheduled_at: new Date(Date.now() + 86400000).toISOString(), duration_minutes: 60,
                        booked_by: 'Alan (Leasing)', dept: 'lease', notes: 'VIP Client viewing'
                    },
                    {
                        id: 'bk-2', room_id: null, facility: 'Rooftop Garden', booking_type: 'event',
                        scheduled_at: new Date(Date.now() + 172800000).toISOString(), duration_minutes: 240,
                        booked_by: 'Community Team', dept: 'comm', notes: 'Summer BBQ Party'
                    },
                    {
                        id: 'bk-3', room_id: '22A', facility: null, booking_type: 'shooting',
                        scheduled_at: new Date(Date.now() + 3600000 * 5).toISOString(), duration_minutes: 120,
                        booked_by: 'Marketing', dept: 'mgmt', notes: 'New campaign photoshoot'
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
        fetchBookings();
    }, [fetchBookings]);

    const filtered = bookings.filter(b => {
        const matchesFilter = filter === 'all' || b.booking_type === filter;
        const matchesSearch = (b.room_id || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                              (b.facility || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                              b.notes?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                              b.booked_by.toLowerCase().includes(searchTerm.toLowerCase());
        return matchesFilter && matchesSearch;
    }).sort((a,b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime());

    if (loading) return <div className="text-white p-10">載入中...</div>;

    return (
        <div className="space-y-8 animate-fade-in pb-10">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-extrabold text-white flex items-center gap-3 tracking-tight">
                        <CalendarDays className="text-emerald-500" size={28} />
                        預約與排程日曆
                    </h1>
                    <p className="text-zinc-400 mt-2 text-sm">房間帶看、拍攝與公共設施借用管理</p>
                </div>

                <div className="flex bg-[#14171d] p-1 rounded-xl border border-white/5">
                    {['all', 'viewing', 'shooting', 'event', 'tenant_booking'].map(f => (
                        <button
                            key={f}
                            onClick={() => setFilter(f as any)}
                            className={cn(
                                "px-4 py-1.5 text-xs font-semibold text-zinc-400 rounded-lg transition-colors capitalize",
                                filter === f && "bg-emerald-600/20 text-emerald-400"
                            )}
                        >
                            {f.replace('_', ' ')}
                        </button>
                    ))}
                </div>
            </div>

            <div className="bg-[#14171d] rounded-2xl border border-white/5 shadow-2xl p-6">
                
                {/* Search & Controls */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 pb-6 border-b border-white/5">
                    <div className="flex items-center gap-4 bg-[#0a0c10] border border-white/10 rounded-xl px-4 py-2 w-full sm:max-w-xs focus-within:border-emerald-500/50 transition-colors">
                        <Search size={16} className="text-zinc-500" />
                        <input 
                            type="text" 
                            placeholder="搜尋房間、設施、備註..." 
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                            className="bg-transparent border-none text-white text-sm focus:outline-none w-full placeholder:text-zinc-600"
                        />
                    </div>

                    <div className="flex items-center gap-2 text-white">
                        <button className="p-2 hover:bg-white/10 rounded-lg transition-colors text-zinc-400 hover:text-white">
                            <ChevronLeft size={20} />
                        </button>
                        <span className="text-sm font-bold min-w-[120px] text-center tracking-widest">
                            2026年3月
                        </span>
                        <button className="p-2 hover:bg-white/10 rounded-lg transition-colors text-zinc-400 hover:text-white">
                            <ChevronRight size={20} />
                        </button>
                    </div>
                </div>

                {/* Agenda List View */}
                <div className="space-y-4">
                    {filtered.length === 0 ? (
                        <div className="text-center py-20 text-zinc-600 border border-white/5 rounded-xl border-dashed">
                            沒有找到符合條件的預約記錄
                        </div>
                    ) : (
                        filtered.map(booking => {
                            const config = BOOKING_CONFIG[booking.booking_type];
                            const Icon = config.icon;
                            const date = new Date(booking.scheduled_at);

                            return (
                                <div key={booking.id} className="flex flex-col md:flex-row gap-4 p-4 rounded-xl border border-white/5 bg-white/[0.02] hover:bg-white/[0.04] transition-colors group">
                                    
                                    {/* Date Column */}
                                    <div className="flex items-center md:flex-col md:justify-center md:items-center w-full md:w-32 bg-black/40 rounded-lg border border-white/5 p-3 shrink-0">
                                        <div className="text-rose-400 text-[10px] font-black tracking-widest uppercase md:mb-1">
                                            {date.toLocaleDateString('zh-HK', { weekday: 'short' })}
                                        </div>
                                        <div className="text-2xl font-black text-white ml-3 md:ml-0">
                                            {date.getDate()}
                                        </div>
                                        <div className="text-[10px] text-zinc-500 md:mt-1 ml-auto md:ml-0 tracking-widest">
                                            {date.toLocaleDateString('zh-HK', { month: 'short' })}
                                        </div>
                                    </div>

                                    {/* Details */}
                                    <div className="flex-1 flex flex-col justify-center">
                                        <div className="flex items-center gap-3 mb-2">
                                            <span className={cn("px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-widest flex items-center gap-1 border", config.bg, config.color)}>
                                                <Icon size={12}/> {booking.booking_type.replace('_', ' ')}
                                            </span>
                                            
                                            <div className="flex items-center gap-1.5 text-xs text-zinc-400 font-mono tracking-widest bg-[#0a0c10] px-2 py-1 rounded border border-white/5">
                                                <Clock size={12} className="text-emerald-500" />
                                                {date.toLocaleTimeString('zh-HK', { hour: '2-digit', minute:'2-digit' })} • {booking.duration_minutes}m
                                            </div>
                                        </div>
                                        
                                        <h3 className="text-lg font-bold text-white mb-1 flex items-center gap-2">
                                            {booking.room_id ? (
                                                <span className="bg-white/10 px-2 py-0.5 rounded font-mono border border-white/10 shadow-inner">{booking.room_id}</span>
                                            ) : (
                                                <span className="text-emerald-400">{booking.facility}</span>
                                            )}
                                        </h3>
                                        <p className="text-sm text-zinc-400 line-clamp-2">
                                            {booking.notes || '無備註事項'}
                                        </p>
                                    </div>

                                    {/* Action/Owner */}
                                    <div className="md:w-48 flex flex-row md:flex-col items-center md:items-end justify-between md:justify-center pl-4 border-l border-white/5">
                                        <div className="flex flex-col items-start md:items-end w-full">
                                            <span className="text-[10px] text-zinc-500 uppercase tracking-widest mb-1">Booked By</span>
                                            <span className="text-sm font-bold text-white text-right">{booking.booked_by}</span>
                                            <span 
                                                className="text-[10px] uppercase mt-1 px-1.5 py-0.5 rounded tracking-widest font-bold"
                                                style={{ backgroundColor: `${DEPT_INFO[booking.dept]?.color}20`, color: DEPT_INFO[booking.dept]?.color }}
                                            >
                                                {DEPT_INFO[booking.dept]?.name || booking.dept}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>
            </div>
        </div>
    );
}
