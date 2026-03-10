'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
    MessageSquare, ArrowRightLeft, Send, AlertTriangle, Brain, MessagesSquare, Phone, ShieldCheck
} from 'lucide-react';
import { Message, Handoff, DEPT_INFO, DeptCode, ChatType } from '@/lib/types';
import { cn, formatTime, timeAgo } from '@/lib/utils';
import { useToast } from '@/components/Toast';

function DeptBadge({ dept }: { dept: DeptCode }) {
    const info = DEPT_INFO[dept];
    if (!info) return null;
    return (
        <span
            className="dept-badge"
            style={{ backgroundColor: info.lightColor, color: info.color }}
        >
            {info.name}
        </span>
    );
}

function SourceBadge({ type, name }: { type: ChatType; name: string }) {
    return (
        <span className={cn(
            'status-badge',
            type === 'group'
                ? 'bg-blue-100 text-blue-700'
                : 'bg-emerald-100 text-emerald-700'
        )}>
            {type === 'group' ? '群組' : '直聊'} · {name}
        </span>
    );
}

function ParseCard({ message }: { message: Message }) {
    const deptInfo = DEPT_INFO[message.sender_dept] || DEPT_INFO.conc;
    const needsReview = message.confidence < 0.75 || !message.parsed_action;

    return (
        <div className="glass-card p-4 animate-fade-in">
            <div className="flex items-start gap-3">
                <div
                    className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0 shadow-sm"
                    style={{ backgroundColor: deptInfo.color }}
                >
                    {message.sender_name.charAt(0).toUpperCase()}
                </div>

                <div className="flex-1 min-w-0">
                    <div className="flex items-start gap-2 flex-wrap">
                        <span className="font-semibold text-sm text-slate-800">{message.sender_name}</span>
                        <DeptBadge dept={message.sender_dept} />
                        <SourceBadge type={message.chat_type} name={message.chat_name} />
                        <span className="text-xs text-slate-400 ml-auto whitespace-nowrap">{formatTime(message.sent_at)}</span>
                    </div>

                    <p className="mt-2 text-sm text-slate-700 leading-relaxed whitespace-pre-wrap break-words">
                        {message.raw_text}
                    </p>

                    <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50/80 p-3">
                        <div className="flex items-center justify-between gap-3 flex-wrap">
                            <div className="flex items-center gap-2 flex-wrap">
                                <span className={cn(
                                    'status-badge',
                                    needsReview ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'
                                )}>
                                    {needsReview ? '待覆核' : 'AI 已解析'}
                                </span>
                                {message.parsed_type && (
                                    <span className={cn(
                                        'status-badge',
                                        message.parsed_type === 'handoff' ? 'bg-orange-100 text-orange-700' :
                                            message.parsed_type === 'request' ? 'bg-red-100 text-red-700' :
                                                message.parsed_type === 'query' ? 'bg-purple-100 text-purple-700' :
                                                    message.parsed_type === 'trigger' ? 'bg-pink-100 text-pink-700' :
                                                        'bg-slate-100 text-slate-600'
                                    )}>
                                        {message.parsed_type}
                                    </span>
                                )}
                            </div>
                            <span className="text-[11px] text-slate-400 tabular-nums">
                                信心度 {Math.round(message.confidence * 100)}%
                            </span>
                        </div>

                        <div className="mt-3 flex items-start gap-3 flex-wrap">
                            <div className="min-w-[88px]">
                                <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">房號</p>
                                <div className="mt-1 flex gap-1.5 flex-wrap">
                                    {message.parsed_room.length > 0 ? message.parsed_room.map(room => (
                                        <span
                                            key={room}
                                            className="px-2 py-0.5 bg-white rounded-md text-xs font-bold text-slate-700 shadow-sm border border-slate-200"
                                        >
                                            {room}
                                        </span>
                                    )) : (
                                        <span className="text-xs text-slate-400">未識別</span>
                                    )}
                                </div>
                            </div>

                            <div className="min-w-[180px] flex-1">
                                <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">AI 判斷</p>
                                <p className="mt-1 text-sm font-medium text-slate-700">
                                    {message.parsed_action || '未能穩定判斷，需要人工覆核'}
                                </p>
                            </div>
                        </div>

                        <div className="mt-3 flex items-center gap-1.5">
                            <div className="flex-1 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                                <div
                                    className="h-full rounded-full transition-all"
                                    style={{
                                        width: `${message.confidence * 100}%`,
                                        backgroundColor: message.confidence > 0.8 ? '#10B981' : message.confidence > 0.5 ? '#F59E0B' : '#EF4444'
                                    }}
                                />
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

function HandoffCard({ handoff, onAcknowledge }: { handoff: Handoff; onAcknowledge: (id: string) => void }) {
    const fromInfo = DEPT_INFO[handoff.from_dept];
    const toInfo = DEPT_INFO[handoff.to_dept];

    return (
        <div className={cn(
            'glass-card p-4 animate-slide-in border-l-4',
            handoff.status === 'pending' ? 'border-l-amber-400' :
                handoff.status === 'acknowledged' ? 'border-l-blue-400' :
                    'border-l-emerald-400'
        )}>
            <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                        <span className="px-2 py-0.5 bg-slate-100 rounded-md text-sm font-bold text-slate-800">{handoff.room_id}</span>
                        <span className={cn(
                            'status-badge text-[10px]',
                            handoff.status === 'pending' ? 'bg-amber-100 text-amber-700' :
                                handoff.status === 'acknowledged' ? 'bg-blue-100 text-blue-700' :
                                    'bg-emerald-100 text-emerald-700'
                        )}>
                            {handoff.status === 'pending' ? '待確認' : handoff.status === 'acknowledged' ? '已確認' : '已完成'}
                        </span>
                    </div>
                    <p className="text-sm text-slate-700 mb-2">{handoff.action}</p>
                    <div className="flex items-center gap-1.5 text-xs">
                        <span className="dept-badge" style={{ backgroundColor: fromInfo?.lightColor, color: fromInfo?.color }}>
                            {fromInfo?.name}
                        </span>
                        <ArrowRightLeft size={12} className="text-slate-400" />
                        <span className="dept-badge" style={{ backgroundColor: toInfo?.lightColor, color: toInfo?.color }}>
                            {toInfo?.name}
                        </span>
                        <span className="text-slate-400 ml-auto">{timeAgo(handoff.created_at)}</span>
                    </div>
                </div>
                {handoff.status === 'pending' && (
                    <button
                        onClick={() => onAcknowledge(handoff.id)}
                        className="shrink-0 px-3 py-1.5 bg-blue-50 text-blue-600 rounded-lg text-xs font-semibold hover:bg-blue-100 transition-colors"
                    >
                        確認
                    </button>
                )}
            </div>
        </div>
    );
}

type CenterFilter = 'all' | 'parsed' | 'review' | 'group' | 'direct';

export default function DashboardPage() {
    const [messages, setMessages] = useState<Message[]>([]);
    const [handoffs, setHandoffs] = useState<Handoff[]>([]);
    const [loading, setLoading] = useState(true);
    const [newMessage, setNewMessage] = useState('');
    const [senderName, setSenderName] = useState('');
    const [chatName, setChatName] = useState('SOHO 前線🏡🧹🦫🐿️');
    const [chatType, setChatType] = useState<ChatType>('group');
    const [centerFilter, setCenterFilter] = useState<CenterFilter>('all');
    const { showToast } = useToast();

    const fetchData = useCallback(async () => {
        try {
            const [msgRes, hoRes] = await Promise.all([
                fetch('/api/messages'),
                fetch('/api/handoffs'),
            ]);
            if (!msgRes.ok || !hoRes.ok) throw new Error('載入失敗');
            const [msgs, hos] = await Promise.all([msgRes.json(), hoRes.json()]);
            setMessages(msgs);
            setHandoffs(hos);
        } catch (e: any) {
            showToast(e.message || '載入資料失敗', 'error');
        } finally {
            setLoading(false);
        }
    }, [showToast]);

    useEffect(() => { fetchData(); }, [fetchData]);

    useEffect(() => {
        const interval = setInterval(fetchData, 5000);
        return () => clearInterval(interval);
    }, [fetchData]);

    const filteredMessages = useMemo(() => {
        switch (centerFilter) {
            case 'parsed':
                return messages.filter(message => Boolean(message.parsed_action));
            case 'review':
                return messages.filter(message => message.confidence < 0.75 || !message.parsed_action);
            case 'group':
                return messages.filter(message => message.chat_type === 'group');
            case 'direct':
                return messages.filter(message => message.chat_type === 'direct');
            default:
                return messages;
        }
    }, [centerFilter, messages]);

    const handleSendMessage = async () => {
        if (!newMessage.trim()) return;
        try {
            const res = await fetch('/api/messages', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    raw_text: newMessage,
                    sender_name: senderName || 'Duty Phone',
                    chat_name: chatName || 'SOHO 前線🏡🧹🦫🐿️',
                    chat_type: chatType,
                }),
            });
            if (!res.ok) throw new Error('發送失敗');
            setNewMessage('');
            showToast('訊息已匯入訊息中心', 'success');
            fetchData();
        } catch (e: any) {
            showToast(e.message || '發送訊息失敗', 'error');
        }
    };

    const handleAcknowledge = async (id: string) => {
        try {
            const res = await fetch('/api/handoffs', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id, status: 'acknowledged' }),
            });
            if (!res.ok) throw new Error('確認失敗');
            showToast('交接已確認', 'success');
            fetchData();
        } catch (e: any) {
            showToast(e.message || '確認失敗', 'error');
        }
    };

    const pendingHandoffs = handoffs.filter(h => h.status === 'pending');
    const otherHandoffs = handoffs.filter(h => h.status !== 'pending');
    const reviewCount = messages.filter(message => message.confidence < 0.75 || !message.parsed_action).length;
    const parsedCount = messages.filter(message => Boolean(message.parsed_action)).length;
    const groupCount = messages.filter(message => message.chat_type === 'group').length;
    const directCount = messages.filter(message => message.chat_type === 'direct').length;

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
                    <h1 className="page-title">訊息中心</h1>
                    <p className="text-sm text-slate-500 mt-1">建議與左側真 WhatsApp 分屏使用：左邊看原文，中間看 AI 判斷，右邊看交接信號。</p>
                </div>
                <div className="flex items-center gap-3 flex-wrap">
                    <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 border border-blue-200 rounded-xl">
                        <ShieldCheck size={16} className="text-blue-500" />
                        <span className="text-sm font-semibold text-blue-700">設計給 manager fact check</span>
                    </div>
                    {pendingHandoffs.length > 0 && (
                        <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-xl">
                            <AlertTriangle size={16} className="text-amber-500" />
                            <span className="text-sm font-semibold text-amber-700">{pendingHandoffs.length} 個待確認交接</span>
                        </div>
                    )}
                </div>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {[
                    { label: '已解析訊息', value: parsedCount, icon: Brain, bg: 'bg-violet-50', color: 'text-violet-700' },
                    { label: '待覆核訊息', value: reviewCount, icon: AlertTriangle, bg: 'bg-amber-50', color: 'text-amber-700' },
                    { label: '群組來源', value: groupCount, icon: MessagesSquare, bg: 'bg-blue-50', color: 'text-blue-700' },
                    { label: '直聊來源', value: directCount, icon: Phone, bg: 'bg-emerald-50', color: 'text-emerald-700' },
                ].map(stat => (
                    <div key={stat.label} className={cn('glass-card p-4', stat.bg)}>
                        <div className="flex items-center gap-1.5 mb-1">
                            <stat.icon size={13} className="text-slate-400" />
                            <p className="text-xs text-slate-500">{stat.label}</p>
                        </div>
                        <p className={cn('text-2xl font-bold', stat.color)}>{stat.value}</p>
                    </div>
                ))}
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.7fr)_minmax(320px,0.95fr)] gap-6">
                <div className="space-y-4">
                    <div className="flex items-center gap-2">
                        <Brain size={16} className="text-blue-500" />
                        <h2 className="section-title">訊息中心</h2>
                    </div>

                    <div className="glass-card p-4 space-y-3">
                        <div className="grid md:grid-cols-[160px_130px_1fr_1fr_auto] gap-2">
                            <input
                                type="text"
                                value={senderName}
                                onChange={e => setSenderName(e.target.value)}
                                placeholder="發送者名稱"
                                className="input-field"
                            />
                            <select
                                value={chatType}
                                onChange={e => setChatType(e.target.value as ChatType)}
                                className="input-field"
                            >
                                <option value="group">群組</option>
                                <option value="direct">直聊</option>
                            </select>
                            <input
                                type="text"
                                value={chatName}
                                onChange={e => setChatName(e.target.value)}
                                placeholder="對話名稱"
                                className="input-field"
                            />
                            <input
                                type="text"
                                value={newMessage}
                                onChange={e => setNewMessage(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && handleSendMessage()}
                                placeholder="模擬 duty phone 收到的文字訊息..."
                                className="input-field"
                            />
                            <button onClick={handleSendMessage} className="btn-primary flex items-center gap-2 justify-center">
                                <Send size={14} />
                                匯入
                            </button>
                        </div>
                        <p className="text-[11px] text-slate-400">這裡顯示 AI 如何理解左側 WhatsApp 原文，不再嘗試取代原生 WhatsApp 畫面。</p>
                    </div>

                    <div className="glass-card p-4 space-y-3">
                        <div className="flex items-center gap-2 text-xs text-slate-500">
                            <MessageSquare size={12} />
                            <span>AI 判斷篩選</span>
                        </div>
                        <div className="flex gap-2 flex-wrap">
                            {([
                                { key: 'all' as CenterFilter, label: `全部 (${messages.length})` },
                                { key: 'parsed' as CenterFilter, label: `已解析 (${parsedCount})` },
                                { key: 'review' as CenterFilter, label: `待覆核 (${reviewCount})` },
                                { key: 'group' as CenterFilter, label: `群組 (${groupCount})` },
                                { key: 'direct' as CenterFilter, label: `直聊 (${directCount})` },
                            ]).map(filter => (
                                <button
                                    key={filter.key}
                                    onClick={() => setCenterFilter(filter.key)}
                                    className={cn(
                                        'px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
                                        centerFilter === filter.key
                                            ? 'bg-blue-600 text-white shadow-sm'
                                            : 'bg-white text-slate-600 hover:bg-slate-50 border border-slate-200'
                                    )}
                                >
                                    {filter.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="space-y-3">
                        {filteredMessages.map(message => (
                            <ParseCard key={message.id} message={message} />
                        ))}

                        {filteredMessages.length === 0 && (
                            <div className="glass-card p-8 text-center">
                                <MessageSquare size={32} className="text-slate-300 mx-auto mb-3" />
                                <p className="text-sm text-slate-500">目前沒有符合條件的訊息</p>
                            </div>
                        )}
                    </div>
                </div>

                <div className="space-y-4">
                    <div className="flex items-center gap-2">
                        <ArrowRightLeft size={16} className="text-amber-500" />
                        <h2 className="section-title">交接信號</h2>
                    </div>

                    {pendingHandoffs.length > 0 && (
                        <div className="space-y-3">
                            <p className="text-xs font-semibold text-amber-600 flex items-center gap-1.5">
                                <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse-gentle" />
                                待確認 ({pendingHandoffs.length})
                            </p>
                            {pendingHandoffs.map(handoff => (
                                <HandoffCard key={handoff.id} handoff={handoff} onAcknowledge={handleAcknowledge} />
                            ))}
                        </div>
                    )}

                    {otherHandoffs.length > 0 && (
                        <div className="space-y-3 mt-4">
                            <p className="text-xs font-semibold text-slate-400">已處理</p>
                            {otherHandoffs.map(handoff => (
                                <HandoffCard key={handoff.id} handoff={handoff} onAcknowledge={handleAcknowledge} />
                            ))}
                        </div>
                    )}

                    {handoffs.length === 0 && (
                        <div className="glass-card p-8 text-center">
                            <ArrowRightLeft size={32} className="text-slate-300 mx-auto mb-3" />
                            <p className="text-sm text-slate-400">暫無交接信號</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
