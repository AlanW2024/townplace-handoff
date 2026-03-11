'use client';

import { useState, useEffect, useCallback } from 'react';
import { Home, Search, AlertCircle, HardHat, Sparkles, Key } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Room } from '../types';
import { GEMINI_EXPERIMENTAL_NOTE } from '../experimental';

export default function GeminiRoomsBoard() {
    const [rooms, setRooms] = useState<Room[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<'all' | 'needs_attention' | 'engineering' | 'cleaning'>('all');
    const [labMessage, setLabMessage] = useState('房態切換只會在這個 compare 頁面內模擬。');

    const fetchRooms = useCallback(async () => {
        try {
            const res = await fetch('/api/rooms');
            if (res.ok) setRooms(await res.json());
            setLoading(false);
        } catch (error) {
            console.error('Failed to fetch rooms', error);
        }
    }, []);

    useEffect(() => {
        fetchRooms();
    }, [fetchRooms]);

    const updateRoomStatus = (roomId: string, field: keyof Room, value: string) => {
        setRooms(prev => prev.map(room => {
            if (room.id !== roomId) return room;

            const nextRoom = {
                ...room,
                [field]: value,
                last_updated_by: 'Gemini Design Lab',
            } as Room;
            const needsAttention =
                nextRoom.eng_status === 'pending' ||
                nextRoom.eng_status === 'in_progress' ||
                nextRoom.clean_status === 'pending' ||
                nextRoom.clean_status === 'in_progress' ||
                nextRoom.lease_status === 'checkout';

            return {
                ...nextRoom,
                needs_attention: needsAttention,
                attention_reason: needsAttention ? 'Gemini 設計實驗場本地模擬狀態' : null,
            };
        }));
        setLabMessage(`已在本頁模擬更新 ${roomId} 的 ${String(field)}。正式 store 未被改動。`);
    };

    const getStatusStyle = (type: 'eng' | 'clean' | 'lease', status: string) => {
        if (status === 'n_a') return 'text-zinc-600 bg-white/5 border-white/5';
        if (status === 'completed') return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20';
        if (status === 'in_progress') return 'text-amber-400 bg-amber-500/10 border-amber-500/20';
        if (status === 'pending') return 'text-rose-400 bg-rose-500/10 border-rose-500/20 border-dashed animate-pulse';
        
        // Lease statuses
        if (status === 'occupied') return 'text-blue-400 bg-blue-500/10 border-blue-500/20';
        if (status === 'vacant') return 'text-zinc-300 bg-white/10 border-white/20';
        if (status === 'newlet') return 'text-purple-400 bg-purple-500/10 border-purple-500/20';
        if (status === 'checkout') return 'text-orange-400 bg-orange-500/10 border-orange-500/20';
        
        return 'text-zinc-500 bg-white/5 border-white/5';
    };

    const StatusSelect = ({ room, type, field, options }: { room: Room, type: 'eng' | 'clean' | 'lease', field: keyof Room, options: {value: string, label: string}[] }) => (
        <select 
            value={room[field] as string}
            onChange={(e) => updateRoomStatus(room.id, field, e.target.value)}
            className={cn(
                "appearance-none text-xs font-semibold px-2 py-1 rounded border outline-none cursor-pointer text-center",
                getStatusStyle(type, room[field] as string)
            )}
        >
            {options.map(o => <option key={o.value} value={o.value} className="bg-zinc-800 text-white">{o.label}</option>)}
        </select>
    );

    const filteredRooms = rooms.filter(r => {
        if (filter === 'needs_attention') return r.needs_attention;
        if (filter === 'engineering') return r.eng_status === 'pending' || r.eng_status === 'in_progress';
        if (filter === 'cleaning') return r.clean_status === 'pending' || r.clean_status === 'in_progress';
        return true;
    });

    if (loading) return <div className="text-white">載入中...</div>;

    return (
        <div className="space-y-6 animate-fade-in pb-10">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-extrabold text-white flex items-center gap-3">
                        <Home className="text-indigo-500" size={28} />
                        房間看板
                    </h1>
                    <p className="text-zinc-400 mt-2 text-sm">全棟 200+ 單位實時狀態</p>
                    <p className="mt-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-zinc-400">
                        {GEMINI_EXPERIMENTAL_NOTE}
                    </p>
                </div>
                
                <div className="flex bg-[#14171d] p-1 rounded-xl border border-white/5">
                    {[
                        { id: 'all', label: '全部房間' },
                        { id: 'needs_attention', label: '需關注' },
                        { id: 'engineering', label: '工程處理中' },
                        { id: 'cleaning', label: '待清潔' }
                    ].map(f => (
                        <button
                            key={f.id}
                            onClick={() => setFilter(f.id as any)}
                            className={cn(
                                "px-4 py-1.5 text-xs font-semibold text-zinc-400 rounded-lg transition-colors",
                                filter === f.id && "bg-indigo-600/20 text-indigo-400"
                            )}
                        >
                            {f.label}
                        </button>
                    ))}
                </div>
            </div>

            <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2 text-xs text-zinc-500">
                {labMessage}
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                {filteredRooms.map(room => (
                    <div 
                        key={room.id} 
                        className={cn(
                            "bg-[#14171d] border rounded-2xl p-4 flex flex-col gap-4 relative overflow-hidden transition-all hover:bg-white/[0.03]",
                            room.needs_attention ? "border-rose-500/50 shadow-[0_0_15px_rgba(244,63,94,0.15)]" : "border-white/5"
                        )}
                    >
                        {room.needs_attention && (
                            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-rose-500 to-orange-500" />
                        )}

                        <div className="flex items-start justify-between">
                            <div>
                                <h3 className="text-xl font-black text-white">{room.id}</h3>
                                <p className="text-[10px] text-zinc-500 font-mono mt-0.5">{room.room_type}</p>
                            </div>
                            {room.needs_attention && (
                                <AlertCircle size={16} className="text-rose-500 animate-pulse" />
                            )}
                        </div>

                        <div className="space-y-2.5">
                            <div className="flex items-center justify-between">
                                <span className="text-xs text-zinc-500 flex items-center gap-1.5"><HardHat size={12}/> 工程</span>
                                <StatusSelect room={room} type="eng" field="eng_status" options={[
                                    { value: 'n_a', label: 'N/A' },
                                    { value: 'pending', label: '待處理' },
                                    { value: 'in_progress', label: '進行中' },
                                    { value: 'completed', label: '完成' }
                                ]} />
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="text-xs text-zinc-500 flex items-center gap-1.5"><Sparkles size={12}/> 清潔</span>
                                <StatusSelect room={room} type="clean" field="clean_status" options={[
                                    { value: 'n_a', label: 'N/A' },
                                    { value: 'pending', label: '待清潔' },
                                    { value: 'in_progress', label: '清潔中' },
                                    { value: 'completed', label: '完成' }
                                ]} />
                            </div>
                            <div className="flex items-center justify-between pt-2 border-t border-white/5">
                                <span className="text-xs text-zinc-500 flex items-center gap-1.5"><Key size={12}/> 狀態</span>
                                <StatusSelect room={room} type="lease" field="lease_status" options={[
                                    { value: 'vacant', label: '吉房' },
                                    { value: 'occupied', label: '有客' },
                                    { value: 'newlet', label: '新租' },
                                    { value: 'checkout', label: '退租' }
                                ]} />
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
