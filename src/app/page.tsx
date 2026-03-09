'use client';

import { useState, useEffect, useCallback } from 'react';
import { MessageSquare, ArrowRightLeft, Send, AlertTriangle } from 'lucide-react';
import { Message, Handoff, DEPT_INFO, DeptCode } from '@/lib/types';
import { cn, formatTime, timeAgo } from '@/lib/utils';

// ===========================
// Department Badge Component
// ===========================
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

// ===========================
// Message Card Component
// ===========================
function MessageCard({ message }: { message: Message }) {
    const deptInfo = DEPT_INFO[message.sender_dept] || DEPT_INFO.conc;

    return (
        <div className="glass-card p-4 animate-fade-in">
            <div className="flex items-start gap-3">
                {/* Avatar */}
                <div
                    className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0 shadow-sm"
                    style={{ backgroundColor: deptInfo.color }}
                >
                    {message.sender_name.charAt(0).toUpperCase()}
                </div>

                <div className="flex-1 min-w-0">
                    {/* Header */}
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="font-semibold text-sm text-slate-800">{message.sender_name}</span>
                        <DeptBadge dept={message.sender_dept} />
                        <span className="text-xs text-slate-400 ml-auto whitespace-nowrap">{formatTime(message.sent_at)}</span>
                    </div>

                    {/* Raw text */}
                    <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap break-words">{message.raw_text}</p>

                    {/* Parsed result */}
                    {message.parsed_action && (
                        <div className="mt-2 p-2.5 rounded-lg bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-100">
                            <div className="flex items-center gap-2 flex-wrap">
                                {message.parsed_room.map(room => (
                                    <span key={room} className="px-2 py-0.5 bg-white rounded-md text-xs font-bold text-slate-700 shadow-sm border border-slate-200">
                                        {room}
                                    </span>
                                ))}
                                <span className="text-xs text-blue-700 font-medium">{message.parsed_action}</span>
                                {message.parsed_type && (
                                    <span className={cn(
                                        'ml-auto text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase tracking-wide',
                                        message.parsed_type === 'handoff' ? 'bg-amber-100 text-amber-700' :
                                            message.parsed_type === 'request' ? 'bg-red-100 text-red-700' :
                                                message.parsed_type === 'query' ? 'bg-purple-100 text-purple-700' :
                                                    message.parsed_type === 'trigger' ? 'bg-pink-100 text-pink-700' :
                                                        'bg-slate-100 text-slate-600'
                                    )}>
                                        {message.parsed_type}
                                    </span>
                                )}
                            </div>
                            {message.confidence > 0 && (
                                <div className="mt-1.5 flex items-center gap-1.5">
                                    <div className="flex-1 h-1 bg-blue-100 rounded-full overflow-hidden">
                                        <div
                                            className="h-full rounded-full transition-all"
                                            style={{
                                                width: `${message.confidence * 100}%`,
                                                backgroundColor: message.confidence > 0.8 ? '#10B981' : message.confidence > 0.5 ? '#F59E0B' : '#EF4444'
                                            }}
                                        />
                                    </div>
                                    <span className="text-[10px] text-slate-400 tabular-nums">{Math.round(message.confidence * 100)}%</span>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

// ===========================
// Handoff Card Component
// ===========================
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
                <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1.5">
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

// ===========================
// Main Dashboard Page
// ===========================
export default function DashboardPage() {
    const [messages, setMessages] = useState<Message[]>([]);
    const [handoffs, setHandoffs] = useState<Handoff[]>([]);
    const [loading, setLoading] = useState(true);
    const [newMessage, setNewMessage] = useState('');
    const [senderName, setSenderName] = useState('');

    const fetchData = useCallback(async () => {
        try {
            const [msgRes, hoRes] = await Promise.all([
                fetch('/api/messages'),
                fetch('/api/handoffs'),
            ]);
            const [msgs, hos] = await Promise.all([msgRes.json(), hoRes.json()]);
            setMessages(msgs);
            setHandoffs(hos);
        } catch (e) {
            console.error('Failed to fetch:', e);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchData(); }, [fetchData]);

    const handleSendMessage = async () => {
        if (!newMessage.trim()) return;
        try {
            await fetch('/api/messages', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    raw_text: newMessage,
                    sender_name: senderName || 'Test User',
                }),
            });
            setNewMessage('');
            fetchData();
        } catch (e) {
            console.error('Failed to send:', e);
        }
    };

    const handleAcknowledge = async (id: string) => {
        try {
            await fetch('/api/handoffs', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id, status: 'acknowledged' }),
            });
            fetchData();
        } catch (e) {
            console.error('Failed to acknowledge:', e);
        }
    };

    const pendingHandoffs = handoffs.filter(h => h.status === 'pending');
    const otherHandoffs = handoffs.filter(h => h.status !== 'pending');

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
            {/* Header */}
            <div className="flex items-center justify-between flex-wrap gap-4">
                <div>
                    <h1 className="page-title">訊息中心</h1>
                    <p className="text-sm text-slate-500 mt-1">即時查看 WhatsApp 訊息和交接信號</p>
                </div>
                <div className="flex items-center gap-3">
                    {pendingHandoffs.length > 0 && (
                        <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-xl">
                            <AlertTriangle size={16} className="text-amber-500" />
                            <span className="text-sm font-semibold text-amber-700">{pendingHandoffs.length} 個待確認交接</span>
                        </div>
                    )}
                    <div className="text-xs text-slate-400 px-3 py-2 bg-white rounded-xl border border-slate-200">
                        共 {messages.length} 則訊息
                    </div>
                </div>
            </div>

            {/* Two-column layout */}
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                {/* Message Feed - 2/3 */}
                <div className="xl:col-span-2 space-y-4">
                    <div className="flex items-center gap-2 mb-2">
                        <MessageSquare size={16} className="text-blue-500" />
                        <h2 className="section-title">訊息動態</h2>
                    </div>

                    {/* Send message form */}
                    <div className="glass-card p-4">
                        <div className="flex gap-2 mb-2">
                            <input
                                type="text"
                                value={senderName}
                                onChange={e => setSenderName(e.target.value)}
                                placeholder="發送者名稱（如 Vic Lee）"
                                className="input-field w-40"
                            />
                            <input
                                type="text"
                                value={newMessage}
                                onChange={e => setNewMessage(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && handleSendMessage()}
                                placeholder="模擬 WhatsApp 訊息..."
                                className="input-field flex-1"
                            />
                            <button onClick={handleSendMessage} className="btn-primary flex items-center gap-2">
                                <Send size={14} />
                                發送
                            </button>
                        </div>
                        <p className="text-[11px] text-slate-400">輸入訊息測試 AI 解析引擎（嘗試：&quot;10F 已完成，可清潔&quot;）</p>
                    </div>

                    {/* Message list */}
                    <div className="space-y-3">
                        {messages.map(msg => (
                            <MessageCard key={msg.id} message={msg} />
                        ))}
                    </div>
                </div>

                {/* Handoff Panel - 1/3 */}
                <div className="space-y-4">
                    <div className="flex items-center gap-2 mb-2">
                        <ArrowRightLeft size={16} className="text-amber-500" />
                        <h2 className="section-title">交接信號</h2>
                    </div>

                    {/* Pending */}
                    {pendingHandoffs.length > 0 && (
                        <div className="space-y-3">
                            <p className="text-xs font-semibold text-amber-600 flex items-center gap-1.5">
                                <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse-gentle" />
                                待確認 ({pendingHandoffs.length})
                            </p>
                            {pendingHandoffs.map(h => (
                                <HandoffCard key={h.id} handoff={h} onAcknowledge={handleAcknowledge} />
                            ))}
                        </div>
                    )}

                    {/* Other handoffs */}
                    {otherHandoffs.length > 0 && (
                        <div className="space-y-3 mt-4">
                            <p className="text-xs font-semibold text-slate-400">已處理</p>
                            {otherHandoffs.map(h => (
                                <HandoffCard key={h.id} handoff={h} onAcknowledge={handleAcknowledge} />
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
