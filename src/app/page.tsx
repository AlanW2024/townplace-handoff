'use client';

import { memo, useState, useEffect, useCallback, useMemo, useDeferredValue, useRef } from 'react';
import { usePolling } from '@/hooks/usePolling';
import {
    MessageSquare, ArrowRightLeft, Send, AlertTriangle, Brain, MessagesSquare, Phone, ShieldCheck
} from 'lucide-react';
import { Message, Handoff, DEPT_INFO, DeptCode, ChatType, AiMessageClassification } from '@/lib/types';
import { cn, formatTime, timeAgo } from '@/lib/utils';
import { useToast } from '@/components/Toast';

type HandoffRecord = Handoff & {
    room_display_code?: string;
};

type DashboardMessage = Message & {
    needs_review?: boolean;
};

type MessageCounts = {
    all: number;
    parsed: number;
    review: number;
    relevant: number;
    irrelevant: number;
    group: number;
    direct: number;
};

const MESSAGE_PAGE_SIZE = 120;
const EMPTY_COUNTS: MessageCounts = {
    all: 0,
    parsed: 0,
    review: 0,
    relevant: 0,
    irrelevant: 0,
    group: 0,
    direct: 0,
};

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

const ParseCard = memo(function ParseCard({ message, needsReview }: { message: DashboardMessage; needsReview: boolean }) {
    const deptInfo = DEPT_INFO[message.sender_dept] || DEPT_INFO.conc;
    const parserLabel = message.parsed_by === 'anthropic'
        ? 'Claude AI'
        : message.parsed_by === 'openrouter'
            ? 'OpenRouter'
        : message.parsed_by === 'openai'
            ? 'OpenAI'
            : message.parsed_by === 'review'
                ? '人工覆核'
                : '規則引擎';

    const classification = message.ai_classification;
    const classificationLabel: Record<AiMessageClassification, string> = {
        actionable: '有用',
        context: '背景',
        irrelevant: '無關',
        review: '覆核',
    };

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
                                <span className={cn(
                                    'status-badge',
                                    message.parsed_by === 'anthropic'
                                        ? 'bg-violet-100 text-violet-700'
                                        : message.parsed_by === 'openrouter'
                                            ? 'bg-cyan-100 text-cyan-700'
                                        : message.parsed_by === 'openai'
                                            ? 'bg-sky-100 text-sky-700'
                                            : message.parsed_by === 'review'
                                                ? 'bg-rose-100 text-rose-700'
                                                : 'bg-slate-100 text-slate-600'
                                )}>
                                    <Brain size={11} className="inline mr-1" />
                                    {parserLabel}
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
                                {classification && (
                                    <span className={cn(
                                        'status-badge',
                                        classification === 'actionable' ? 'bg-emerald-100 text-emerald-700' :
                                            classification === 'context' ? 'bg-sky-100 text-sky-700' :
                                                classification === 'review' ? 'bg-amber-100 text-amber-700' :
                                                    'bg-slate-100 text-slate-500'
                                    )}>
                                        {classificationLabel[classification]}
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
                                    {(message.parsed_room_refs?.length ?? 0) > 0 ? message.parsed_room_refs!.map(ref => (
                                        <span
                                            key={`${ref.display_code}-${ref.scope}`}
                                            className="px-2 py-0.5 bg-white rounded-md text-xs font-bold text-slate-700 shadow-sm border border-slate-200"
                                        >
                                            {ref.display_code}
                                        </span>
                                    )) : message.parsed_room.length > 0 ? message.parsed_room.map(room => (
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

                        <div className="mt-3 rounded-lg bg-white/80 border border-slate-200 px-3 py-2.5">
                            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">判斷原因</p>
                            <p className="mt-1 text-xs leading-relaxed text-slate-600">
                                {message.parsed_explanation || '未提供額外解釋。'}
                            </p>
                            {message.ai_classification_reason && (
                                <p className="mt-1 text-[11px] text-slate-500">
                                    AI 分類：{message.ai_classification_reason}
                                </p>
                            )}
                            {message.parsed_model && (
                                <p className="mt-1 text-[11px] text-slate-400">
                                    模型 / 引擎：{message.parsed_model}
                                </p>
                            )}
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
});

const HandoffCard = memo(function HandoffCard({
    handoff,
    operatorName,
    reason,
    submitting,
    onReasonChange,
    onAcknowledge,
}: {
    handoff: HandoffRecord;
    operatorName: string;
    reason: string;
    submitting: boolean;
    onReasonChange: (id: string, value: string) => void;
    onAcknowledge: (handoff: Handoff, reason: string) => void;
}) {
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
                        <span className="px-2 py-0.5 bg-slate-100 rounded-md text-sm font-bold text-slate-800">{handoff.room_display_code || handoff.room_id}</span>
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
                    <div className="shrink-0 w-full sm:w-44 space-y-2">
                        <input
                            type="text"
                            value={reason}
                            onChange={e => onReasonChange(handoff.id, e.target.value)}
                            placeholder="確認原因"
                            className="input-field text-xs"
                        />
                        <button
                            onClick={() => onAcknowledge(handoff, reason)}
                            disabled={submitting || !operatorName.trim() || !reason.trim()}
                            className="w-full px-3 py-1.5 bg-blue-50 text-blue-600 rounded-lg text-xs font-semibold hover:bg-blue-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {submitting ? '提交中...' : '確認'}
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
});

type CenterFilter = 'all' | 'parsed' | 'review' | 'group' | 'direct' | 'relevant' | 'irrelevant';
const OPERATOR_STORAGE_KEY = 'tpsoho-operator-name';

export default function DashboardPage() {
    const [messages, setMessages] = useState<DashboardMessage[]>([]);
    const [handoffs, setHandoffs] = useState<HandoffRecord[]>([]);
    const [messageCounts, setMessageCounts] = useState<MessageCounts>(EMPTY_COUNTS);
    const [filteredMessageTotal, setFilteredMessageTotal] = useState(0);
    const [hasMoreMessages, setHasMoreMessages] = useState(false);
    const [loading, setLoading] = useState(true);
    const [loadingMoreMessages, setLoadingMoreMessages] = useState(false);
    const [newMessage, setNewMessage] = useState('');
    const [senderName, setSenderName] = useState('');
    const [chatName, setChatName] = useState('SOHO 前線🏡🧹🦫🐿️');
    const [chatType, setChatType] = useState<ChatType>('group');
    const [centerFilter, setCenterFilter] = useState<CenterFilter>('all');
    const [sendingMessage, setSendingMessage] = useState(false);
    const [operatorName, setOperatorName] = useState('');
    const [handoffReasons, setHandoffReasons] = useState<Record<string, string>>({});
    const [updatingHandoffId, setUpdatingHandoffId] = useState<string | null>(null);
    const { showToast } = useToast();
    const loadedMessageCountRef = useRef(0);

    useEffect(() => {
        loadedMessageCountRef.current = messages.length;
    }, [messages.length]);

    useEffect(() => {
        const saved = window.localStorage.getItem(OPERATOR_STORAGE_KEY);
        if (saved) setOperatorName(saved);
    }, []);

    useEffect(() => {
        if (operatorName.trim()) {
            window.localStorage.setItem(OPERATOR_STORAGE_KEY, operatorName.trim());
        }
    }, [operatorName]);

    const fetchMessages = useCallback(async (options?: { append?: boolean; keepLoadedCount?: boolean }) => {
        const append = options?.append ?? false;
        const loadedCount = loadedMessageCountRef.current;
        const offset = append ? loadedCount : 0;
        const limit = options?.keepLoadedCount ? Math.max(loadedCount, MESSAGE_PAGE_SIZE) : MESSAGE_PAGE_SIZE;
        const params = new URLSearchParams({
            filter: centerFilter,
            offset: String(offset),
            limit: String(limit),
        });
        const res = await fetch(`/api/messages?${params.toString()}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || '載入訊息失敗');

        setMessageCounts(data.counts ?? EMPTY_COUNTS);
        setHasMoreMessages(Boolean(data.pagination?.has_more));
        setFilteredMessageTotal(data.pagination?.total_filtered ?? 0);
        setMessages((previous) => append ? [...previous, ...(data.messages ?? [])] : (data.messages ?? []));
    }, [centerFilter]);

    const fetchData = useCallback(async (options?: { messagesOnly?: boolean; appendMessages?: boolean; keepLoadedCount?: boolean }) => {
        try {
            if (options?.messagesOnly) {
                await fetchMessages({
                    append: options.appendMessages,
                    keepLoadedCount: options.keepLoadedCount,
                });
                return;
            }

            const [messagesRes, handoffsRes] = await Promise.all([
                fetch(`/api/messages?filter=${centerFilter}&offset=0&limit=${options?.keepLoadedCount ? Math.max(loadedMessageCountRef.current, MESSAGE_PAGE_SIZE) : MESSAGE_PAGE_SIZE}`),
                fetch('/api/handoffs'),
            ]);
            const [messagesData, handoffsData] = await Promise.all([messagesRes.json(), handoffsRes.json()]);
            if (!messagesRes.ok || !handoffsRes.ok) throw new Error(messagesData.error || handoffsData.error || '載入失敗');
            setMessages(messagesData.messages ?? []);
            setMessageCounts(messagesData.counts ?? EMPTY_COUNTS);
            setHasMoreMessages(Boolean(messagesData.pagination?.has_more));
            setFilteredMessageTotal(messagesData.pagination?.total_filtered ?? 0);
            setHandoffs(handoffsData);
        } catch (e: unknown) {
            showToast(e instanceof Error ? e.message : '操作失敗', 'error');
        } finally {
            setLoading(false);
            setLoadingMoreMessages(false);
        }
    }, [centerFilter, fetchMessages, showToast]);

    useEffect(() => {
        setLoading(true);
        fetchData();
    }, [centerFilter, fetchData]);

    usePolling(() => {
        fetchData({ keepLoadedCount: true });
    }, 15000);
    const deferredMessages = useDeferredValue(messages);

    const stats = useMemo(() => {
        return {
            parsedCount: messageCounts.parsed,
            relevantCount: messageCounts.relevant,
            irrelevantCount: messageCounts.irrelevant,
            groupCount: messageCounts.group,
            directCount: messageCounts.direct,
        };
    }, [messageCounts]);

    const handleSendMessage = async () => {
        if (!newMessage.trim() || sendingMessage) return;
        setSendingMessage(true);
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
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || '發送失敗');
            setNewMessage('');
            showToast('訊息已匯入訊息中心', 'success');
            fetchData();
        } catch (e: unknown) {
            showToast(e instanceof Error ? e.message : '操作失敗', 'error');
        } finally {
            setSendingMessage(false);
        }
    };

    const handleAcknowledge = async (handoff: HandoffRecord, reason: string) => {
        const actor = operatorName.trim();
        const actionReason = reason.trim();

        if (!actor) {
            showToast('請先填寫操作人', 'error');
            return;
        }

        if (!actionReason) {
            showToast('請先填寫確認原因', 'error');
            return;
        }

        setUpdatingHandoffId(handoff.id);
        try {
            const res = await fetch('/api/handoffs', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id: handoff.id,
                    status: 'acknowledged',
                    actor,
                    reason: actionReason,
                    expectedVersion: handoff.version,
                }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || '確認失敗');
            setHandoffReasons(prev => ({ ...prev, [handoff.id]: '' }));
            showToast('交接已確認', 'success');
            fetchData();
        } catch (e: unknown) {
            showToast(e instanceof Error ? e.message : '操作失敗', 'error');
        } finally {
            setUpdatingHandoffId(null);
        }
    };

    const pendingHandoffs = useMemo(() => handoffs.filter(h => h.status === 'pending'), [handoffs]);
    const otherHandoffs = useMemo(() => handoffs.filter(h => h.status !== 'pending'), [handoffs]);
    const reviewCount = messageCounts.review;

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
                    { label: '已解析訊息', value: stats.parsedCount, icon: Brain, bg: 'bg-violet-50', color: 'text-violet-700' },
                    { label: '待覆核訊息', value: reviewCount, icon: AlertTriangle, bg: 'bg-amber-50', color: 'text-amber-700' },
                    { label: '群組來源', value: stats.groupCount, icon: MessagesSquare, bg: 'bg-blue-50', color: 'text-blue-700' },
                    { label: '直聊來源', value: stats.directCount, icon: Phone, bg: 'bg-emerald-50', color: 'text-emerald-700' },
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
                                onKeyDown={e => e.key === 'Enter' && !sendingMessage && handleSendMessage()}
                                placeholder="模擬 duty phone 收到的文字訊息..."
                                className="input-field"
                            />
                            <button
                                onClick={handleSendMessage}
                                disabled={sendingMessage || !newMessage.trim()}
                                className="btn-primary flex items-center gap-2 justify-center disabled:opacity-60 disabled:cursor-not-allowed"
                            >
                                <Send size={14} />
                                {sendingMessage ? 'AI 解析中...' : '匯入'}
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
                                    { key: 'all' as CenterFilter, label: `全部 (${messageCounts.all})` },
                                    { key: 'relevant' as CenterFilter, label: `有用/背景 (${stats.relevantCount})` },
                                    { key: 'irrelevant' as CenterFilter, label: `無關 (${stats.irrelevantCount})` },
                                    { key: 'parsed' as CenterFilter, label: `已解析 (${stats.parsedCount})` },
                                    { key: 'review' as CenterFilter, label: `待覆核 (${reviewCount})` },
                                    { key: 'group' as CenterFilter, label: `群組 (${stats.groupCount})` },
                                { key: 'direct' as CenterFilter, label: `直聊 (${stats.directCount})` },
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

                    <div className="glass-card p-3 flex items-center justify-between gap-3 flex-wrap">
                        <p className="text-xs text-slate-500">
                            為了順暢瀏覽，現時載入 <span className="font-semibold text-slate-700">{deferredMessages.length}</span> / <span className="font-semibold text-slate-700">{filteredMessageTotal}</span> 則訊息。
                        </p>
                        <div className="flex items-center gap-2 flex-wrap">
                            {hasMoreMessages && (
                                <button
                                    onClick={() => {
                                        if (loadingMoreMessages) return;
                                        setLoadingMoreMessages(true);
                                        fetchData({ messagesOnly: true, appendMessages: true });
                                    }}
                                    disabled={loadingMoreMessages}
                                    className="px-3 py-1.5 rounded-lg text-xs font-medium bg-white text-slate-600 hover:bg-slate-50 border border-slate-200 disabled:opacity-60 disabled:cursor-not-allowed"
                                >
                                    {loadingMoreMessages ? '載入中...' : `載入更多 ${MESSAGE_PAGE_SIZE} 則`}
                                </button>
                            )}
                        </div>
                    </div>

                    <div className="space-y-3">
                        {deferredMessages.map(message => (
                            <ParseCard
                                key={message.id}
                                message={message}
                                needsReview={Boolean(message.needs_review)}
                            />
                        ))}

                        {deferredMessages.length === 0 && (
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

                    <div className="glass-card p-4 space-y-2">
                        <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">操作人</label>
                        <input
                            type="text"
                            value={operatorName}
                            onChange={e => setOperatorName(e.target.value)}
                            placeholder="例如：May / Admin"
                            className="input-field"
                        />
                        <p className="text-[11px] text-slate-400">待確認交接會沿用這個操作人名稱，並要求逐筆填寫確認原因。</p>
                    </div>

                    {pendingHandoffs.length > 0 && (
                        <div className="space-y-3">
                            <p className="text-xs font-semibold text-amber-600 flex items-center gap-1.5">
                                <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse-gentle" />
                                待確認 ({pendingHandoffs.length})
                            </p>
                            {pendingHandoffs.map(handoff => (
                                <HandoffCard
                                    key={handoff.id}
                                    handoff={handoff}
                                    operatorName={operatorName}
                                    reason={handoffReasons[handoff.id] || ''}
                                    submitting={updatingHandoffId === handoff.id}
                                    onReasonChange={(id, value) => setHandoffReasons(prev => ({ ...prev, [id]: value }))}
                                    onAcknowledge={handleAcknowledge}
                                />
                            ))}
                        </div>
                    )}

                    {otherHandoffs.length > 0 && (
                        <div className="space-y-3 mt-4">
                            <p className="text-xs font-semibold text-slate-400">已處理</p>
                            {otherHandoffs.map(handoff => (
                                <HandoffCard
                                    key={handoff.id}
                                    handoff={handoff}
                                    operatorName={operatorName}
                                    reason={handoffReasons[handoff.id] || ''}
                                    submitting={false}
                                    onReasonChange={(id, value) => setHandoffReasons(prev => ({ ...prev, [id]: value }))}
                                    onAcknowledge={handleAcknowledge}
                                />
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
