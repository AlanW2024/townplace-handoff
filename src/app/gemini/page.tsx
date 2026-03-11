'use client';

import { useState, useEffect, useCallback } from 'react';
import {
    Activity,
    MessageSquareMore,
    ArrowRightLeft,
    AlertTriangle,
    Clock,
    CheckCircle2
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Message, Handoff, Room, DEPT_INFO } from './types';
import { GEMINI_EXPERIMENTAL_NOTE, createGeminiId, extractGeminiRooms } from './experimental';

export default function GeminiDashboard() {
    const [messages, setMessages] = useState<Message[]>([]);
    const [handoffs, setHandoffs] = useState<Handoff[]>([]);
    const [rooms, setRooms] = useState<Room[]>([]);
    const [loading, setLoading] = useState(true);

    const [mockText, setMockText] = useState('12A 工程已完成，可清潔');
    const [labMessage, setLabMessage] = useState('所有按鈕只會更新目前畫面，不會寫入正式資料。');

    const fetchData = useCallback(async () => {
        try {
            const [msgRes, hoRes, rmRes] = await Promise.all([
                fetch('/api/messages'),
                fetch('/api/handoffs'),
                fetch('/api/rooms')
            ]);
            
            if (msgRes.ok) setMessages(await msgRes.json());
            if (hoRes.ok) setHandoffs(await hoRes.json());
            if (rmRes.ok) setRooms(await rmRes.json());
            
            setLoading(false);
        } catch (error) {
            console.error('Failed to fetch dashboard data:', error);
        }
    }, []);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const handleSendMock = () => {
        if (!mockText.trim()) return;

        const sentAt = new Date().toISOString();
        const rooms = extractGeminiRooms(mockText);
        const canHandoff = /(可清(?:潔)?|ready\s*for\s*clean)/i.test(mockText) && !/(未可清|唔可清|not\s+ready)/i.test(mockText);
        const nextMessage: Message = {
            id: createGeminiId('gemini-msg'),
            raw_text: mockText,
            sender_name: 'Gemini Design Lab',
            sender_dept: 'mgmt',
            chat_name: 'Gemini Compare Sandbox',
            chat_type: 'group',
            sent_at: sentAt,
            parsed_room: rooms,
            parsed_action: canHandoff ? '工程完成 → 可清潔' : '設計實驗場模擬訊息',
            parsed_type: canHandoff ? 'handoff' : 'update',
            confidence: canHandoff ? 0.92 : 0.58,
        };

        setMessages(prev => [nextMessage, ...prev]);
        if (canHandoff && rooms.length > 0) {
            setHandoffs(prev => [
                ...rooms.map(room => ({
                    id: createGeminiId(`gemini-ho-${room}`),
                    room_id: room,
                    from_dept: 'eng' as const,
                    to_dept: 'clean' as const,
                    action: '工程完成 → 可清潔',
                    status: 'pending' as const,
                    created_at: sentAt,
                })),
                ...prev,
            ]);
        }
        setLabMessage('已在 Gemini 設計實驗場本地模擬送出訊息。');
        setMockText('');
    };

    const handleAcknowledge = (id: string) => {
        setHandoffs(prev => prev.map(handoff =>
            handoff.id === id ? { ...handoff, status: 'acknowledged' } : handoff
        ));
        setLabMessage('交接狀態只在目前頁面模擬切換，正式資料未被改動。');
    };

    const pendingHandoffs = handoffs.filter(h => h.status === 'pending');
    const roomsNeedingAttention = rooms.filter(r => r.needs_attention || r.eng_status === 'pending' || r.clean_status === 'pending');

    if (loading) return <div className="animate-pulse flex space-x-4"><div className="flex-1 space-y-4 py-1"><div className="h-4 bg-white/10 rounded w-3/4"></div><div className="space-y-2"><div className="h-4 bg-white/10 rounded"></div></div></div></div>;

    return (
        <div className="space-y-8 pb-10 animate-fade-in">
            {/* Header */}
            <div>
                <h1 className="text-3xl font-extrabold text-white tracking-tight flex items-center gap-3">
                    <Activity className="text-indigo-500" size={28} />
                    系統總覽
                </h1>
                <p className="text-zinc-400 mt-2 text-sm tracking-wide">實時監控 TOWNPLACE SOHO 跨部門交接狀態</p>
                <p className="mt-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-zinc-400">
                    {GEMINI_EXPERIMENTAL_NOTE}
                </p>
            </div>

            {/* Quick Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                {[
                    { title: '今日擷取訊息', value: messages.length, icon: MessageSquareMore, color: 'text-blue-400', bg: 'bg-blue-400/10', border: 'border-blue-500/20' },
                    { title: '待處理交接', value: pendingHandoffs.length, icon: ArrowRightLeft, color: 'text-amber-400', bg: 'bg-amber-400/10', border: 'border-amber-500/20' },
                    { title: '需關注房間', value: roomsNeedingAttention.length, icon: AlertTriangle, color: 'text-rose-400', bg: 'bg-rose-400/10', border: 'border-rose-500/20' }
                ].map((stat, i) => (
                    <div key={i} className={cn("rounded-2xl border p-6 flex flex-col justify-between relative overflow-hidden group", stat.bg, stat.border)}>
                        <div className="flex justify-between items-start z-10">
                            <stat.icon size={24} className={stat.color} />
                            <span className="text-3xl font-black text-white">{stat.value}</span>
                        </div>
                        <p className={cn("text-xs font-medium uppercase tracking-widest mt-4 z-10", stat.color)}>{stat.title}</p>
                        
                        <div className="absolute -bottom-8 -right-8 w-32 h-32 bg-white/5 rounded-full blur-2xl group-hover:scale-150 transition-transform duration-700 pointer-events-none" />
                    </div>
                ))}
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                
                {/* Pending Handoffs Panel */}
                <div className="xl:col-span-1 border border-white/10 bg-[#14171d] rounded-2xl flex flex-col shadow-xl">
                    <div className="p-5 border-b border-white/5 flex items-center justify-between">
                        <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                            待接收交接信號
                        </h2>
                        <span className="text-xs bg-white/5 text-zinc-400 px-2 py-1 rounded-md">{pendingHandoffs.length} 宗</span>
                    </div>
                    <div className="p-5 flex-1 overflow-y-auto space-y-4 max-h-[500px] custom-scrollbar">
                        {pendingHandoffs.length === 0 ? (
                            <div className="text-center text-zinc-500 text-sm py-10">目前沒有待處理交接。</div>
                        ) : pendingHandoffs.map(ho => (
                            <div key={ho.id} className="p-4 rounded-xl border border-white/5 bg-white/[0.02] hover:bg-white/[0.04] transition-colors group">
                                <div className="flex items-center justify-between mb-3">
                                    <span className="text-lg font-black text-white drop-shadow-md">{ho.room_id}</span>
                                    <span className="text-[10px] text-zinc-500 flex items-center gap-1">
                                        <Clock size={12} />
                                        {new Date(ho.created_at).toLocaleTimeString('zh-HK')}
                                    </span>
                                </div>
                                <div className="flex items-center gap-3 mb-4 text-xs font-semibold">
                                    <div className="px-2 py-1 rounded shadow-inner" style={{ backgroundColor: `${DEPT_INFO[ho.from_dept]?.color}20`, color: DEPT_INFO[ho.from_dept]?.color }}>
                                        {DEPT_INFO[ho.from_dept]?.name || ho.from_dept}
                                    </div>
                                    <ArrowRightLeft size={14} className="text-zinc-600" />
                                    <div className="px-2 py-1 rounded shadow-inner" style={{ backgroundColor: `${DEPT_INFO[ho.to_dept]?.color}20`, color: DEPT_INFO[ho.to_dept]?.color }}>
                                        {DEPT_INFO[ho.to_dept]?.name || ho.to_dept}
                                    </div>
                                </div>
                                <div className="flex items-center justify-between">
                                    <div className="text-xs text-zinc-400 truncate pr-2 max-w-[150px]">{ho.action}</div>
                                    <button 
                                        onClick={() => handleAcknowledge(ho.id)}
                                        className="text-xs px-3 py-1.5 bg-indigo-500 text-white font-semibold rounded-lg hover:bg-indigo-400 transition-colors shadow-lg shadow-indigo-500/20 active:scale-95 flex items-center gap-1"
                                    >
                                        <CheckCircle2 size={14} /> 接收
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Live Message Feed & Simulator */}
                <div className="xl:col-span-2 border border-white/10 bg-[#14171d] rounded-2xl flex flex-col shadow-xl overflow-hidden">
                    <div className="p-5 border-b border-white/5 bg-indigo-600/5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <h2 className="text-sm font-semibold text-white">訊息流即時解析監控</h2>
                        
                        <div className="flex items-center gap-2 max-w-sm w-full">
                            <input 
                                type="text"
                                value={mockText}
                                onChange={(e) => setMockText(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleSendMock()}
                                placeholder="輸入測試訊息..."
                                className="flex-1 bg-[#1a1e27] border border-white/10 text-white rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all placeholder:text-zinc-600"
                            />
                            <button 
                                onClick={handleSendMock}
                                className="px-4 py-1.5 bg-zinc-100 text-zinc-900 font-bold rounded-lg hover:bg-white text-sm transition-colors active:scale-95"
                            >
                                發送
                            </button>
                        </div>
                    </div>
                    <div className="border-b border-white/5 bg-white/[0.02] px-5 py-2 text-xs text-zinc-500">
                        {labMessage}
                    </div>

                    <div className="p-5 flex-1 overflow-y-auto max-h-[500px] flex flex-col gap-3 custom-scrollbar">
                        {messages.slice(0, 15).map(msg => {
                            const isAI = msg.confidence > 0;
                            return (
                                <div key={msg.id} className="relative p-4 rounded-xl border border-white/5 bg-white/[0.02] grid grid-cols-1 md:grid-cols-[1fr_250px] gap-4">
                                    {/* Left: Raw Text */}
                                    <div>
                                        <div className="flex items-center gap-2 mb-2">
                                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full uppercase" style={{ backgroundColor: `${DEPT_INFO[msg.sender_dept]?.color}20`, color: DEPT_INFO[msg.sender_dept]?.color }}>
                                                {msg.sender_name} ({DEPT_INFO[msg.sender_dept]?.name || msg.sender_dept})
                                            </span>
                                            <span className="text-[10px] text-zinc-600 font-mono">
                                                {new Date(msg.sent_at).toLocaleTimeString('zh-HK')}
                                            </span>
                                        </div>
                                        <p className="text-sm text-zinc-300 leading-relaxed break-words">{msg.raw_text}</p>
                                    </div>

                                    {/* Right: AI Parsing */}
                                    {isAI ? (
                                        <div className="bg-indigo-500/5 border border-indigo-500/20 rounded-lg p-3 flex flex-col justify-center">
                                            <div className="flex items-center justify-between mb-2">
                                                <span className="text-[10px] uppercase font-bold text-indigo-400 font-mono tracking-wider">AI Parsing</span>
                                                <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded", msg.confidence >= 0.8 ? "bg-emerald-500/20 text-emerald-400" : "bg-amber-500/20 text-amber-400")}>
                                                    {Math.round(msg.confidence * 100)}%
                                                </span>
                                            </div>
                                            <div className="space-y-1.5">
                                                {msg.parsed_room.length > 0 && (
                                                    <div className="flex items-center gap-2 text-xs">
                                                        <span className="text-zinc-500 w-10">Room</span>
                                                        <span className="font-bold text-white px-1.5 rounded bg-white/10">{msg.parsed_room.join(', ')}</span>
                                                    </div>
                                                )}
                                                {msg.parsed_action && (
                                                    <div className="flex items-center gap-2 text-xs">
                                                        <span className="text-zinc-500 w-10">Action</span>
                                                        <span className="text-indigo-300 font-medium truncate">{msg.parsed_action}</span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="border border-white/5 border-dashed rounded-lg p-3 flex items-center justify-center text-[10px] text-zinc-600 uppercase tracking-widest font-mono">
                                            Unstructured
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>

            </div>
        </div>
    );
}
