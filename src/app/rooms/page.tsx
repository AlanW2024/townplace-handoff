'use client';

import { useState, useEffect, useCallback } from 'react';
import { AlertTriangle, Wrench, Sparkles, Key, Filter } from 'lucide-react';
import { Room, STATUS_LABELS } from '@/lib/types';
import { cn } from '@/lib/utils';

const FLOORS = Array.from({ length: 30 }, (_, i) => 32 - i);
const UNITS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'J', 'K', 'L', 'M'];

type FilterMode = 'all' | 'attention' | 'eng' | 'clean' | 'vacant';

function getEngColor(status: string) {
    switch (status) {
        case 'completed': return 'bg-emerald-400';
        case 'in_progress': return 'bg-amber-400';
        case 'pending': return 'bg-red-400';
        default: return 'bg-slate-200';
    }
}

function getCleanColor(status: string) {
    switch (status) {
        case 'completed': return 'bg-emerald-400';
        case 'in_progress': return 'bg-amber-400';
        case 'pending': return 'bg-purple-400';
        default: return 'bg-slate-200';
    }
}

function RoomCell({ room, onClick }: { room: Room | undefined; onClick: (r: Room) => void }) {
    if (!room) return <div className="w-full aspect-square" />;

    return (
        <button
            onClick={() => onClick(room)}
            className={cn(
                'w-full aspect-square rounded-lg text-[10px] font-bold relative transition-all duration-200',
                'flex flex-col items-center justify-center gap-0.5',
                'hover:scale-110 hover:z-10 hover:shadow-lg',
                room.needs_attention
                    ? 'bg-amber-50 border-2 border-amber-300 text-amber-800'
                    : room.lease_status === 'occupied'
                        ? 'bg-blue-50 border border-blue-200 text-blue-700'
                        : room.lease_status === 'vacant'
                            ? 'bg-white border border-slate-200 text-slate-600'
                            : room.lease_status === 'newlet'
                                ? 'bg-pink-50 border border-pink-200 text-pink-700'
                                : 'bg-red-50 border border-red-200 text-red-700'
            )}
        >
            <span className="font-bold text-xs">{room.id}</span>
            <div className="flex gap-0.5">
                {room.eng_status !== 'n_a' && <div className={cn('w-1.5 h-1.5 rounded-full', getEngColor(room.eng_status))} />}
                {room.clean_status !== 'n_a' && <div className={cn('w-1.5 h-1.5 rounded-full', getCleanColor(room.clean_status))} />}
            </div>
            {room.needs_attention && (
                <div className="absolute -top-1 -right-1 w-3 h-3 bg-amber-400 rounded-full animate-pulse-gentle" />
            )}
        </button>
    );
}

function RoomDetail({ room, onClose }: { room: Room; onClose: () => void }) {
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
            <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" />
            <div className="glass-card p-6 max-w-sm w-full relative z-10 animate-fade-in" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-xl font-bold text-slate-800">{room.id}</h3>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-lg">&times;</button>
                </div>

                <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-2 text-sm">
                        <div className="p-2.5 rounded-lg bg-slate-50">
                            <p className="text-[10px] text-slate-400 uppercase">房型</p>
                            <p className="font-semibold text-slate-700">{room.room_type}</p>
                        </div>
                        <div className="p-2.5 rounded-lg bg-slate-50">
                            <p className="text-[10px] text-slate-400 uppercase">樓層</p>
                            <p className="font-semibold text-slate-700">{room.floor}F</p>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-50">
                            <span className="text-xs text-slate-500 flex items-center gap-1.5"><Wrench size={12} /> 工程</span>
                            <span className={cn('status-badge text-[10px]',
                                room.eng_status === 'completed' ? 'bg-emerald-100 text-emerald-700' :
                                    room.eng_status === 'in_progress' ? 'bg-amber-100 text-amber-700' :
                                        room.eng_status === 'pending' ? 'bg-red-100 text-red-700' :
                                            'bg-slate-100 text-slate-500'
                            )}>{STATUS_LABELS[room.eng_status]}</span>
                        </div>
                        <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-50">
                            <span className="text-xs text-slate-500 flex items-center gap-1.5"><Sparkles size={12} /> 清潔</span>
                            <span className={cn('status-badge text-[10px]',
                                room.clean_status === 'completed' ? 'bg-emerald-100 text-emerald-700' :
                                    room.clean_status === 'in_progress' ? 'bg-amber-100 text-amber-700' :
                                        room.clean_status === 'pending' ? 'bg-purple-100 text-purple-700' :
                                            'bg-slate-100 text-slate-500'
                            )}>{STATUS_LABELS[room.clean_status]}</span>
                        </div>
                        <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-50">
                            <span className="text-xs text-slate-500 flex items-center gap-1.5"><Key size={12} /> 租務</span>
                            <span className={cn('status-badge text-[10px]',
                                room.lease_status === 'occupied' ? 'bg-blue-100 text-blue-700' :
                                    room.lease_status === 'vacant' ? 'bg-slate-100 text-slate-600' :
                                        room.lease_status === 'newlet' ? 'bg-pink-100 text-pink-700' :
                                            'bg-red-100 text-red-700'
                            )}>{STATUS_LABELS[room.lease_status]}</span>
                        </div>
                    </div>

                    {room.needs_attention && room.attention_reason && (
                        <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                            <AlertTriangle size={14} className="text-amber-500 shrink-0" />
                            <span className="text-xs text-amber-700 font-medium">{room.attention_reason}</span>
                        </div>
                    )}

                    {room.last_updated_by && (
                        <p className="text-[10px] text-slate-400 text-right">
                            最後更新：{room.last_updated_by}
                        </p>
                    )}
                </div>
            </div>
        </div>
    );
}

export default function RoomsPage() {
    const [rooms, setRooms] = useState<Room[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<FilterMode>('all');
    const [selectedRoom, setSelectedRoom] = useState<Room | null>(null);
    const [error, setError] = useState<string | null>(null);

    const fetchRooms = useCallback(async () => {
        try {
            const res = await fetch('/api/rooms');
            if (!res.ok) throw new Error('載入失敗');
            setRooms(await res.json());
            setError(null);
        } catch (e: any) {
            setError(e.message || '載入失敗');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchRooms(); }, [fetchRooms]);

    useEffect(() => {
        const interval = setInterval(fetchRooms, 5000);
        return () => clearInterval(interval);
    }, [fetchRooms]);

    const roomMap = new Map(rooms.map(r => [r.id, r]));

    const filteredRoomIds = new Set(
        rooms
            .filter(r => {
                switch (filter) {
                    case 'attention': return r.needs_attention;
                    case 'eng': return r.eng_status !== 'n_a';
                    case 'clean': return r.clean_status !== 'n_a';
                    case 'vacant': return r.lease_status === 'vacant' || r.lease_status === 'checkout';
                    default: return true;
                }
            })
            .map(r => r.id)
    );

    const attentionCount = rooms.filter(r => r.needs_attention).length;
    const vacantCount = rooms.filter(r => r.lease_status === 'vacant' || r.lease_status === 'checkout').length;
    const engActiveCount = rooms.filter(r => r.eng_status !== 'n_a').length;
    const cleanActiveCount = rooms.filter(r => r.clean_status !== 'n_a').length;

    if (loading) {
        return (
            <div className="flex items-center justify-center h-[60vh]">
                <div className="flex flex-col items-center gap-3">
                    <div className="w-10 h-10 border-3 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
                    <span className="text-sm text-slate-400">載入中...</span>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between flex-wrap gap-4">
                <div>
                    <h1 className="page-title">房間看板</h1>
                    <p className="text-sm text-slate-500 mt-1">全棟 {rooms.length} 個單位即時狀態總覽</p>
                </div>
            </div>

            {error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2">
                    <AlertTriangle size={16} className="text-red-500" />
                    <span className="text-sm text-red-700">{error}</span>
                </div>
            )}

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {[
                    { label: '需要跟進', value: attentionCount, color: 'text-amber-700', bg: 'bg-amber-50', icon: AlertTriangle },
                    { label: '空置/退房', value: vacantCount, color: 'text-slate-700', bg: 'bg-white', icon: Key },
                    { label: '工程進行中', value: engActiveCount, color: 'text-amber-700', bg: 'bg-amber-50', icon: Wrench },
                    { label: '清潔進行中', value: cleanActiveCount, color: 'text-emerald-700', bg: 'bg-emerald-50', icon: Sparkles },
                ].map(stat => (
                    <div key={stat.label} className={cn('glass-card p-4', stat.bg)}>
                        <div className="flex items-center gap-1.5 mb-1">
                            <stat.icon size={12} className="text-slate-400" />
                            <p className="text-xs text-slate-500">{stat.label}</p>
                        </div>
                        <p className={cn('text-2xl font-bold', stat.color)}>{stat.value}</p>
                    </div>
                ))}
            </div>

            <div className="flex items-center gap-2 flex-wrap">
                <Filter size={14} className="text-slate-400" />
                {([
                    { key: 'all', label: '全部' },
                    { key: 'attention', label: '需跟進' },
                    { key: 'eng', label: '有工程' },
                    { key: 'clean', label: '有清潔' },
                    { key: 'vacant', label: '空置/退房' },
                ] as { key: FilterMode; label: string }[]).map(f => (
                    <button
                        key={f.key}
                        onClick={() => setFilter(f.key)}
                        className={cn(
                            'px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
                            filter === f.key
                                ? 'bg-blue-100 text-blue-700 shadow-sm'
                                : 'bg-white text-slate-500 hover:bg-slate-50 border border-slate-200'
                        )}
                    >
                        {f.label}
                    </button>
                ))}
            </div>

            <div className="flex items-center gap-4 flex-wrap text-[10px] text-slate-500">
                <span className="font-semibold">圖例：</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-400" /> 完成</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-400" /> 進行中</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-400" /> 待處理</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-purple-400" /> 待清潔</span>
                <span className="flex items-center gap-1"><span className="w-3 h-3 bg-amber-50 border border-amber-300 rounded" /> 需跟進</span>
            </div>

            <div className="glass-card p-4 overflow-x-auto">
                <table className="w-full border-collapse">
                    <thead>
                        <tr>
                            <th className="text-[10px] text-slate-400 font-medium p-1 text-left w-10">樓層</th>
                            {UNITS.map(u => (
                                <th key={u} className="text-[10px] text-slate-400 font-medium p-1 text-center">{u}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {FLOORS.map(floor => (
                            <tr key={floor}>
                                <td className="text-[10px] text-slate-500 font-semibold p-1 text-left">{floor}F</td>
                                {UNITS.map(unit => {
                                    const id = `${floor}${unit}`;
                                    const room = roomMap.get(id);
                                    const visible = filter === 'all' || filteredRoomIds.has(id);
                                    return (
                                        <td key={unit} className="p-0.5">
                                            {visible ? (
                                                <RoomCell room={room} onClick={setSelectedRoom} />
                                            ) : (
                                                <div className="w-full aspect-square rounded-lg bg-slate-50 opacity-20" />
                                            )}
                                        </td>
                                    );
                                })}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {selectedRoom && (
                <RoomDetail room={selectedRoom} onClose={() => setSelectedRoom(null)} />
            )}
        </div>
    );
}
