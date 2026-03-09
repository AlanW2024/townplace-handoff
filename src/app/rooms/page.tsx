'use client';

import { useState, useEffect, useCallback } from 'react';
import { LayoutGrid, Search, Filter, AlertTriangle, ChevronDown, X, Clock } from 'lucide-react';
import { Room, Message, DEPT_INFO, STATUS_LABELS } from '@/lib/types';
import { cn, formatTime, roomNeedsAttention } from '@/lib/utils';

function StatusBadge({ status, type }: { status: string; type: 'eng' | 'clean' | 'lease' }) {
    const label = STATUS_LABELS[status] || status;
    const colorMap: Record<string, string> = {
        completed: 'bg-status-done-light text-emerald-700',
        in_progress: 'bg-status-progress-light text-amber-700',
        pending: 'bg-status-pending-light text-purple-700',
        n_a: 'bg-slate-100 text-slate-400',
        occupied: 'bg-blue-50 text-blue-700',
        vacant: 'bg-slate-100 text-slate-500',
        newlet: 'bg-pink-50 text-pink-700',
        checkout: 'bg-red-50 text-red-700',
    };

    return (
        <span className={cn('status-badge text-[10px]', colorMap[status] || 'bg-slate-100 text-slate-500')}>
            {type === 'eng' ? '🔧' : type === 'clean' ? '🧹' : '🏠'} {label}
        </span>
    );
}

function RoomCard({ room, onClick, isSelected }: { room: Room; onClick: () => void; isSelected: boolean }) {
    const needsAttention = roomNeedsAttention(room);

    return (
        <button
            onClick={onClick}
            className={cn(
                'glass-card-hover p-3 text-left w-full relative transition-all',
                isSelected && 'ring-2 ring-blue-500 shadow-md',
                needsAttention && 'border-l-4 border-l-amber-400'
            )}
        >
            {needsAttention && (
                <div className="absolute top-2 right-2">
                    <AlertTriangle size={14} className="text-amber-500" />
                </div>
            )}
            <div className="text-lg font-bold text-slate-800 mb-2">{room.id}</div>
            <div className="space-y-1">
                {room.eng_status !== 'n_a' && <StatusBadge status={room.eng_status} type="eng" />}
                {room.clean_status !== 'n_a' && <StatusBadge status={room.clean_status} type="clean" />}
                <StatusBadge status={room.lease_status} type="lease" />
            </div>
            <div className="mt-2 text-[10px] text-slate-400">{room.attention_reason || room.room_type}</div>
        </button>
    );
}

function RoomTimeline({ roomId, onClose }: { roomId: string; onClose: () => void }) {
    const [messages, setMessages] = useState<Message[]>([]);

    useEffect(() => {
        fetch('/api/messages')
            .then(r => r.json())
            .then((msgs: Message[]) => {
                setMessages(msgs.filter(m => m.parsed_room.includes(roomId)));
            });
    }, [roomId]);

    return (
        <div className="glass-card p-5 animate-slide-in">
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                    <Clock size={16} className="text-blue-500" />
                    <h3 className="font-semibold text-slate-800">房間 {roomId} 時間線</h3>
                </div>
                <button onClick={onClose} className="btn-ghost p-1">
                    <X size={16} />
                </button>
            </div>
            {messages.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-6">暫無相關訊息</p>
            ) : (
                <div className="space-y-3">
                    {messages.map(msg => (
                        <div key={msg.id} className="flex gap-3 text-sm">
                            <div className="w-1.5 rounded-full shrink-0" style={{ backgroundColor: DEPT_INFO[msg.sender_dept]?.color || '#94A3B8' }} />
                            <div>
                                <div className="flex items-center gap-2 mb-0.5">
                                    <span className="font-medium text-slate-700">{msg.sender_name}</span>
                                    <span className="text-xs text-slate-400">{formatTime(msg.sent_at)}</span>
                                </div>
                                <p className="text-slate-600 text-xs">{msg.raw_text}</p>
                                {msg.parsed_action && (
                                    <p className="text-xs text-blue-600 mt-0.5">→ {msg.parsed_action}</p>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

export default function RoomsPage() {
    const [rooms, setRooms] = useState<Room[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedRoom, setSelectedRoom] = useState<string | null>(null);
    const [floorFilter, setFloorFilter] = useState<number | null>(null);
    const [statusFilter, setStatusFilter] = useState<string>('all');
    const [searchQuery, setSearchQuery] = useState('');

    const fetchRooms = useCallback(async () => {
        try {
            const res = await fetch('/api/rooms');
            const data = await res.json();
            setRooms(data);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchRooms(); }, [fetchRooms]);

    // Filter rooms
    let filtered = rooms;
    if (floorFilter) filtered = filtered.filter(r => r.floor === floorFilter);
    if (statusFilter === 'needs_attention') {
        filtered = filtered.filter(roomNeedsAttention);
    } else if (statusFilter === 'has_work') {
        filtered = filtered.filter(r => r.eng_status !== 'n_a' || r.clean_status !== 'n_a');
    } else if (statusFilter === 'vacant') {
        filtered = filtered.filter(r => r.lease_status === 'vacant');
    }
    if (searchQuery) {
        filtered = filtered.filter(r => r.id.toLowerCase().includes(searchQuery.toLowerCase()));
    }

    // Sort: rooms with status come first
    filtered = filtered.sort((a, b) => {
        const aNeedsAttention = roomNeedsAttention(a) ? 3 : 0;
        const bNeedsAttention = roomNeedsAttention(b) ? 3 : 0;
        const aScore = (a.eng_status !== 'n_a' ? 2 : 0) + (a.clean_status !== 'n_a' ? 1 : 0);
        const bScore = (b.eng_status !== 'n_a' ? 2 : 0) + (b.clean_status !== 'n_a' ? 1 : 0);
        if (bNeedsAttention !== aNeedsAttention) return bNeedsAttention - aNeedsAttention;
        if (bScore !== aScore) return bScore - aScore;
        return a.id.localeCompare(b.id, undefined, { numeric: true });
    });

    // Stats
    const stats = {
        total: rooms.length,
        needsAttention: rooms.filter(roomNeedsAttention).length,
        vacant: rooms.filter(r => r.lease_status === 'vacant').length,
        hasWork: rooms.filter(r => r.eng_status !== 'n_a' || r.clean_status !== 'n_a').length,
    };

    const floors = Array.from(new Set(rooms.map(r => r.floor))).sort((a, b) => a - b);

    if (loading) {
        return (
            <div className="flex items-center justify-center h-[60vh]">
                <div className="w-10 h-10 border-3 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div>
                <h1 className="page-title">房間看板</h1>
                <p className="text-sm text-slate-500 mt-1">總覽全部房間工程、清潔和租務狀態</p>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {[
                    { label: '總房間數', value: stats.total, color: 'text-slate-700', bg: 'bg-white' },
                    { label: '需要關注', value: stats.needsAttention, color: 'text-amber-700', bg: 'bg-amber-50' },
                    { label: '空置中', value: stats.vacant, color: 'text-purple-700', bg: 'bg-purple-50' },
                    { label: '工程/清潔中', value: stats.hasWork, color: 'text-blue-700', bg: 'bg-blue-50' },
                ].map(stat => (
                    <div key={stat.label} className={cn('glass-card p-4', stat.bg)}>
                        <p className="text-xs text-slate-500">{stat.label}</p>
                        <p className={cn('text-2xl font-bold mt-1', stat.color)}>{stat.value}</p>
                    </div>
                ))}
            </div>

            {/* Filters */}
            <div className="flex flex-wrap items-center gap-3">
                <div className="relative">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        placeholder="搜尋房號..."
                        className="input-field pl-9 w-36"
                    />
                </div>

                <select
                    value={floorFilter || ''}
                    onChange={e => setFloorFilter(e.target.value ? parseInt(e.target.value) : null)}
                    className="input-field w-auto"
                >
                    <option value="">全部樓層</option>
                    {floors.map(f => (
                        <option key={f} value={f}>{f} 樓</option>
                    ))}
                </select>

                <select
                    value={statusFilter}
                    onChange={e => setStatusFilter(e.target.value)}
                    className="input-field w-auto"
                >
                    <option value="all">全部狀態</option>
                    <option value="needs_attention">⚠️ 需要關注</option>
                    <option value="has_work">🔧 工程/清潔中</option>
                    <option value="vacant">🏠 空置</option>
                </select>

                <span className="text-xs text-slate-400 ml-auto">顯示 {filtered.length} / {rooms.length} 間</span>
            </div>

            {/* Room Grid + Timeline */}
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                <div className={cn('space-y-1', selectedRoom ? 'xl:col-span-2' : 'xl:col-span-3')}>
                    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2">
                        {filtered.map(room => (
                            <RoomCard
                                key={room.id}
                                room={room}
                                onClick={() => setSelectedRoom(selectedRoom === room.id ? null : room.id)}
                                isSelected={selectedRoom === room.id}
                            />
                        ))}
                    </div>
                    {filtered.length === 0 && (
                        <div className="glass-card p-8 text-center">
                            <LayoutGrid size={32} className="text-slate-300 mx-auto mb-3" />
                            <p className="text-sm text-slate-400">沒有符合條件的房間</p>
                        </div>
                    )}
                </div>

                {selectedRoom && (
                    <div>
                        <RoomTimeline roomId={selectedRoom} onClose={() => setSelectedRoom(null)} />
                    </div>
                )}
            </div>
        </div>
    );
}
