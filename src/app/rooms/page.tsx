'use client';

import { Suspense, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { usePolling } from '@/hooks/usePolling';
import { AlertTriangle, Wrench, Sparkles, Key, Filter } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Room, STATUS_LABELS } from '@/lib/types';
import { cn } from '@/lib/utils';

const FLOORS = Array.from({ length: 30 }, (_, i) => 32 - i);
const UNITS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'J', 'K', 'L', 'M'];

type FilterMode = 'all' | 'attention' | 'eng' | 'clean' | 'vacant';
type RoomScopeFilter = 'active' | 'archived';
type RoomBoardItem = Room & {
    display_code?: string;
    room_scope?: RoomScopeFilter;
    room_cycle_id?: string | null;
    lifecycle_status?: 'active' | 'archived';
    check_out_at?: string | null;
    archived_cycles_count?: number;
};

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

function RoomCell({
    room,
    onClick,
    isHighlighted,
}: {
    room: RoomBoardItem | undefined;
    onClick: (r: RoomBoardItem) => void;
    isHighlighted: boolean;
}) {
    if (!room) return <div className="w-full aspect-square" />;

    return (
        <button
            onClick={() => onClick(room)}
            className={cn(
                'w-full aspect-square rounded-lg text-[10px] font-bold relative transition-all duration-200',
                'flex flex-col items-center justify-center gap-0.5',
                'hover:scale-110 hover:z-10 hover:shadow-lg',
                isHighlighted && 'ring-2 ring-blue-500 ring-offset-1 scale-105 shadow-md',
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
            <span className="font-bold text-xs">{room.display_code || room.id}</span>
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

function RoomDetail({ room, onClose }: { room: RoomBoardItem; onClose: () => void }) {
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
            <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" />
            <div className="glass-card p-6 max-w-sm w-full relative z-10 animate-fade-in" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-4">
                    <div>
                        <h3 className="text-xl font-bold text-slate-800">{room.display_code || room.id}</h3>
                        {room.room_scope === 'archived' && (
                            <p className="text-xs text-slate-400 mt-1">歷史週期 · 物理房 {room.id}</p>
                        )}
                    </div>
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
                    {room.room_scope === 'archived' && room.check_out_at && (
                        <p className="text-[10px] text-slate-400 text-right">
                            退場時間：{new Date(room.check_out_at).toLocaleString('zh-HK')}
                        </p>
                    )}
                </div>
            </div>
        </div>
    );
}

function RoomsPageContent() {
    const searchParams = useSearchParams();
    const [rooms, setRooms] = useState<RoomBoardItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<FilterMode>('all');
    const [scope, setScope] = useState<RoomScopeFilter>('active');
    const [selectedRoom, setSelectedRoom] = useState<RoomBoardItem | null>(null);
    const [error, setError] = useState<string | null>(null);
    const autoOpenedHighlightRef = useRef<string | null>(null);

    const highlightedRooms = useMemo(() => {
        const fromList = (searchParams.get('rooms') || '')
            .split(',')
            .map(item => item.trim())
            .filter(Boolean);
        const highlight = searchParams.get('highlight');
        return Array.from(new Set(highlight ? [...fromList, highlight] : fromList));
    }, [searchParams]);

    const highlightSet = useMemo(() => new Set(highlightedRooms), [highlightedRooms]);
    const highlightedPrimaryRoom = searchParams.get('highlight') || highlightedRooms[0] || null;

    useEffect(() => {
        const nextScope = searchParams.get('scope');
        if (nextScope === 'active' || nextScope === 'archived') {
            setScope(nextScope);
        }
    }, [searchParams]);

    const fetchRooms = useCallback(async () => {
        try {
            const res = await fetch(`/api/rooms?scope=${scope}`);
            if (!res.ok) throw new Error('載入失敗');
            setRooms(await res.json());
            setError(null);
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : '載入失敗');
        } finally {
            setLoading(false);
        }
    }, [scope]);

    useEffect(() => { fetchRooms(); }, [fetchRooms]);

    usePolling(fetchRooms, 5000);

    useEffect(() => {
        if (!highlightedPrimaryRoom) return;
        if (autoOpenedHighlightRef.current === highlightedPrimaryRoom) return;

        const room = rooms.find(item => item.id === highlightedPrimaryRoom);
        if (!room) return;

        setSelectedRoom(room);
        autoOpenedHighlightRef.current = highlightedPrimaryRoom;
    }, [highlightedPrimaryRoom, rooms]);

    const roomMap = useMemo(() => new Map(rooms.map(r => [r.id, r])), [rooms]);

    const filteredRoomIds = useMemo(() => new Set(
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
    ), [rooms, filter]);

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
                    <p className="text-sm text-slate-500 mt-1">{scope === 'active' ? 'Current' : 'Archived'} 視圖 · 共 {rooms.length} 個項目</p>
                </div>
                <div className="flex items-center gap-2">
                    {([
                        { key: 'active' as RoomScopeFilter, label: 'Current' },
                        { key: 'archived' as RoomScopeFilter, label: 'Archived' },
                    ]).map(item => (
                        <button
                            key={item.key}
                            onClick={() => setScope(item.key)}
                            className={cn(
                                'px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
                                scope === item.key
                                    ? 'bg-blue-100 text-blue-700 shadow-sm'
                                    : 'bg-white text-slate-500 hover:bg-slate-50 border border-slate-200'
                            )}
                        >
                            {item.label}
                        </button>
                    ))}
                </div>
            </div>

            {error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2">
                    <AlertTriangle size={16} className="text-red-500" />
                    <span className="text-sm text-red-700">{error}</span>
                </div>
            )}

            {highlightedRooms.length > 0 && (
                <div className="glass-card p-3 bg-blue-50/70 border border-blue-100 flex items-center justify-between gap-3 flex-wrap">
                    <div>
                        <p className="text-sm font-medium text-blue-800">已從通知定位相關房間</p>
                        <p className="text-xs text-blue-600 mt-1">
                            高亮 {highlightedRooms.length} 間單位：{highlightedRooms.join('、')}
                        </p>
                    </div>
                    <Link
                        href="/rooms"
                        className="text-xs font-medium text-blue-700 hover:text-blue-800 transition-colors"
                    >
                        清除定位
                    </Link>
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

            {scope === 'active' ? (
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
                                                    <RoomCell
                                                        room={room}
                                                        onClick={setSelectedRoom}
                                                        isHighlighted={highlightSet.has(id)}
                                                    />
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
            ) : (
                <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-3">
                    {rooms.map(room => (
                        <button
                            key={room.room_cycle_id || room.display_code || room.id}
                            onClick={() => setSelectedRoom(room)}
                            className="glass-card p-4 text-left hover:shadow-lg transition-shadow"
                        >
                            <div className="flex items-center justify-between gap-3">
                                <div>
                                    <p className="text-sm font-semibold text-slate-800">{room.display_code || room.id}</p>
                                    <p className="text-xs text-slate-400 mt-1">物理房 {room.id}</p>
                                </div>
                                <span className="status-badge bg-slate-100 text-slate-600">Archived</span>
                            </div>
                            <div className="mt-3 text-xs text-slate-500 space-y-1">
                                <p>退場：{room.check_out_at ? new Date(room.check_out_at).toLocaleDateString('zh-HK') : '未記錄'}</p>
                                <p>租客：{room.tenant_name || '未記錄'}</p>
                                <p>狀態：{STATUS_LABELS[room.lease_status] || room.lease_status}</p>
                            </div>
                        </button>
                    ))}
                </div>
            )}

            {selectedRoom && (
                <RoomDetail room={selectedRoom} onClose={() => setSelectedRoom(null)} />
            )}
        </div>
    );
}

export default function RoomsPage() {
    return (
        <Suspense fallback={
            <div className="flex items-center justify-center h-[60vh]">
                <div className="flex flex-col items-center gap-3">
                    <div className="w-10 h-10 border-3 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
                    <span className="text-sm text-slate-400">載入中...</span>
                </div>
            </div>
        }>
            <RoomsPageContent />
        </Suspense>
    );
}
