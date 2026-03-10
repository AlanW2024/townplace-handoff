'use client';

import { useState, useEffect, useCallback } from 'react';
import { Calendar, MapPin, Clock, AlertTriangle } from 'lucide-react';
import { Booking, DEPT_INFO } from '@/lib/types';
import { cn } from '@/lib/utils';
import { useToast } from '@/components/Toast';

const TYPE_LABELS: Record<string, string> = {
    viewing: '🏠 睇樓', shooting: '📷 拍攝',
    event: '🎉 活動', tenant_booking: '👤 租戶預約',
};
const TYPE_COLORS: Record<string, string> = {
    viewing: 'bg-blue-50 border-blue-200', shooting: 'bg-pink-50 border-pink-200',
    event: 'bg-purple-50 border-purple-200', tenant_booking: 'bg-amber-50 border-amber-200',
};

function fmtTime(d: string) { return new Date(d).toLocaleTimeString('zh-HK', { hour: '2-digit', minute: '2-digit', hour12: false }); }

export default function BookingsPage() {
    const [bookings, setBookings] = useState<Booking[]>([]);
    const [loading, setLoading] = useState(true);
    const { showToast } = useToast();

    const fetch_ = useCallback(async () => {
        try {
            const res = await fetch('/api/bookings');
            if (!res.ok) throw new Error('載入失敗');
            setBookings(await res.json());
        }
        catch (e: any) { showToast(e.message || '載入預約失敗', 'error'); }
        finally { setLoading(false); }
    }, [showToast]);
    useEffect(() => { fetch_(); }, [fetch_]);

    useEffect(() => {
        const interval = setInterval(fetch_, 5000);
        return () => clearInterval(interval);
    }, [fetch_]);

    const grouped = bookings.reduce<Record<string, Booking[]>>((a, b) => {
        const k = new Date(b.scheduled_at).toLocaleDateString('zh-HK', { year: 'numeric', month: 'long', day: 'numeric' });
        (a[k] = a[k] || []).push(b); return a;
    }, {});

    if (loading) return <div className="flex items-center justify-center h-[60vh]"><div className="w-10 h-10 border-3 border-blue-200 border-t-blue-600 rounded-full animate-spin" /></div>;

    return (
        <div className="space-y-6 max-w-4xl">
            <div>
                <h1 className="page-title">預約日曆</h1>
                <p className="text-sm text-slate-500 mt-1">睇樓、拍攝、設施預約和活動排期</p>
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                {[
                    { l: '即將到來', v: bookings.length, c: 'text-blue-700', bg: 'bg-blue-50' },
                    { l: '睇樓', v: bookings.filter(b => b.booking_type === 'viewing').length, c: 'text-indigo-700', bg: 'bg-indigo-50' },
                    { l: '設施預約', v: bookings.filter(b => b.facility).length, c: 'text-purple-700', bg: 'bg-purple-50' },
                ].map(s => (
                    <div key={s.l} className={cn('glass-card p-4', s.bg)}>
                        <p className="text-xs text-slate-500">{s.l}</p>
                        <p className={cn('text-2xl font-bold mt-1', s.c)}>{s.v}</p>
                    </div>
                ))}
            </div>
            {Object.entries(grouped).map(([date, items]) => (
                <div key={date} className="space-y-3">
                    <h2 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                        <Calendar size={14} className="text-blue-500" />{date}
                    </h2>
                    <div className="space-y-2">
                        {items.map(b => {
                            const di = DEPT_INFO[b.dept];
                            return (
                                <div key={b.id} className={cn('glass-card p-4 border-l-4', TYPE_COLORS[b.booking_type] || 'bg-white')}
                                    style={{ borderLeftColor: di?.color || '#94A3B8' }}>
                                    <div className="flex items-center gap-2 flex-wrap mb-1.5">
                                        <span className="text-sm font-semibold text-slate-800">{TYPE_LABELS[b.booking_type] || b.booking_type}</span>
                                        {b.room_id && <span className="px-2 py-0.5 bg-white rounded-md text-xs font-bold text-slate-700 shadow-sm border">{b.room_id}</span>}
                                        {b.facility && <span className="flex items-center gap-1 text-xs text-slate-600"><MapPin size={11} />{b.facility}</span>}
                                    </div>
                                    <div className="flex items-center gap-3 text-xs text-slate-500">
                                        <span className="flex items-center gap-1"><Clock size={11} />{fmtTime(b.scheduled_at)} ({b.duration_minutes}分鐘)</span>
                                        <span>預約人：{b.booked_by}</span>
                                        {di && <span className="dept-badge" style={{ backgroundColor: di.lightColor, color: di.color }}>{di.name}</span>}
                                    </div>
                                    {b.notes && <p className="text-xs text-slate-500 mt-1.5">{b.notes}</p>}
                                </div>
                            );
                        })}
                    </div>
                </div>
            ))}
            {bookings.length === 0 && (
                <div className="glass-card p-8 text-center">
                    <Calendar size={32} className="text-slate-300 mx-auto mb-3" />
                    <p className="text-sm text-slate-400">暫無預約</p>
                </div>
            )}
        </div>
    );
}
