'use client';

import { useState } from 'react';
import { 
    Star, TrendingUp, Users, MessageSquareHeart, 
    ThumbsUp, AlertCircle, ChevronRight, Calendar,
    ArrowUpRight, ArrowDownRight, Filter
} from 'lucide-react';
import { cn } from '@/lib/utils';

// --- Dummy Data ---
const STATS = [
    { label: '綜合滿意度', value: '4.8', max: '5.0', trend: '+0.2', isPositive: true, icon: Star, color: 'text-amber-500', bg: 'bg-amber-100' },
    { label: '本月回應數', value: '142', max: '份', trend: '+12%', isPositive: true, icon: MessageSquareHeart, color: 'text-rose-500', bg: 'bg-rose-100' },
    { label: '設施評分', value: '4.9', max: '5.0', trend: '+0.1', isPositive: true, icon: ThumbsUp, color: 'text-blue-500', bg: 'bg-blue-100' },
    { label: '需跟進回饋', value: '3', max: '宗', trend: '-2', isPositive: true, icon: AlertCircle, color: 'text-emerald-500', bg: 'bg-emerald-100' },
];

const RECENT_REVIEWS = [
    { id: 1, room: '15F', name: '陳先生', rating: 5, date: '今天 10:30', tag: '設施維護', comment: '工程部 Vic 師傅修理冷氣非常迅速，態度親切，完全沒影響到我原本的視訊會議，非常感謝！', status: 'completed' },
    { id: 2, room: '28G', name: 'Miss Lee', rating: 4, date: '昨天 15:20', tag: '清潔服務', comment: '房間 Deep Clean 得很乾淨，但希望能提前多一天通知清潔時間。', status: 'pending' },
    { id: 3, room: '9J', name: '王小姐', rating: 5, date: '12/07', tag: '禮賓服務', comment: 'Michael 幫忙代收了很重的海外包裹還幫我送到樓上，服務100分！', status: 'completed' },
    { id: 4, room: '22C', name: 'Mr. Smith', rating: 3, date: '11/07', tag: '噪音問題', comment: '隔壁房間昨晚有點吵，希望管理處能留意。', status: 'action_needed' },
];

// --- Components ---
export default function SatisfactionPage() {
    const [activeTab, setActiveTab] = useState('overview');

    return (
        <div className="space-y-6 animate-fade-in pb-10">
            {/* Header Section */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 flex items-center gap-3">
                        住客滿意度分析
                        <span className="px-2.5 py-1 rounded-full bg-gradient-to-r from-amber-200 to-orange-200 text-orange-800 text-xs font-bold uppercase tracking-wider shadow-sm">
                            Beta
                        </span>
                    </h1>
                    <p className="text-sm text-slate-500 mt-2 flex items-center gap-2">
                        <Calendar size={14} /> 2025年7月數據匯總
                    </p>
                </div>
                
                <div className="flex items-center gap-2">
                    <button className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-all shadow-sm">
                        <Filter size={16} /> 篩選
                    </button>
                    <button className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-xl text-sm font-semibold hover:bg-slate-800 transition-all shadow-md shadow-slate-900/20">
                        匯出報表
                    </button>
                </div>
            </div>

            {/* Quick Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {STATS.map((stat, idx) => (
                    <div key={idx} className="relative overflow-hidden bg-white/60 backdrop-blur-xl border border-white p-5 rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] hover:shadow-[0_8px_30px_rgb(0,0,0,0.08)] transition-all group">
                        {/* Decorative background glow */}
                        <div className={cn("absolute -right-6 -top-6 w-24 h-24 rounded-full blur-2xl opacity-40 transition-opacity group-hover:opacity-60", stat.bg)} />
                        
                        <div className="flex justify-between items-start relative z-10">
                            <div className={cn("p-2.5 rounded-xl", stat.bg)}>
                                <stat.icon size={20} className={stat.color} />
                            </div>
                            <div className={cn("flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-lg", stat.isPositive ? "text-emerald-700 bg-emerald-50" : "text-rose-700 bg-rose-50")}>
                                {stat.isPositive ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                                {stat.trend}
                            </div>
                        </div>

                        <div className="mt-4 relative z-10">
                            <h3 className="text-slate-500 text-sm font-medium">{stat.label}</h3>
                            <div className="flex items-baseline gap-1 mt-1">
                                <span className="text-3xl font-black text-slate-800 tracking-tight">{stat.value}</span>
                                <span className="text-sm font-medium text-slate-400">/ {stat.max}</span>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Main Content Area */}
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 mt-2">
                
                {/* Left Column: Charts Area */}
                <div className="xl:col-span-2 space-y-6">
                    <div className="bg-white/70 backdrop-blur-xl border border-white rounded-2xl p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
                        <div className="flex items-center justify-between mb-6">
                            <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                                <TrendingUp size={18} className="text-blue-500" />
                                近六個月滿意度趨勢
                            </h2>
                            <div className="flex p-1 bg-slate-100 rounded-lg">
                                {['綜合', '工程', '清潔'].map(tab => (
                                    <button 
                                        key={tab}
                                        onClick={() => setActiveTab(tab)}
                                        className={cn(
                                            "px-4 py-1.5 text-xs font-semibold rounded-md transition-all", 
                                            activeTab === tab ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"
                                        )}
                                    >
                                        {tab}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* CSS-only Mock Bar Chart */}
                        <div className="h-64 flex items-end gap-2 sm:gap-4 pt-10 px-2">
                            {[60, 75, 65, 85, 80, 95].map((height, i) => (
                                <div key={i} className="flex-1 h-full flex flex-col justify-end items-center gap-3 group">
                                    {/* Tooltip on hover */}
                                    <div className="opacity-0 group-hover:opacity-100 transition-opacity bg-slate-800 text-white text-[10px] py-1 px-2 rounded-md font-bold absolute -translate-y-8">
                                        {(height / 20).toFixed(1)} 分
                                    </div>
                                    {/* Bar */}
                                    <div className="w-full flex-1 relative bg-blue-50 rounded-t-lg overflow-hidden flex items-end">
                                        <div 
                                            className="w-full bg-gradient-to-t from-blue-600 to-indigo-400 rounded-t-lg transition-all duration-1000 ease-out group-hover:brightness-110"
                                            style={{ height: `${height}%` }}
                                        />
                                    </div>
                                    <span className="text-xs font-semibold text-slate-400">{i + 2}月</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Right Column: Recent Reviews */}
                <div className="bg-white/70 backdrop-blur-xl border border-white rounded-2xl flex flex-col shadow-[0_8px_30px_rgb(0,0,0,0.04)] relative overflow-hidden">
                    {/* Top gradient band */}
                    <div className="h-1.5 w-full bg-gradient-to-r from-emerald-400 via-blue-500 to-purple-500 absolute top-0 left-0" />
                    
                    <div className="p-6 pb-2 border-b border-slate-100 flex items-center justify-between">
                        <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                            <Users size={18} className="text-emerald-500" />
                            最新住客回饋
                        </h2>
                        <button className="text-xs font-semibold text-blue-600 hover:text-blue-700 flex items-center">
                            查看全部 <ChevronRight size={14} />
                        </button>
                    </div>

                    <div className="p-6 flex-1 overflow-y-auto space-y-4">
                        {RECENT_REVIEWS.map((review) => (
                            <div key={review.id} className="group p-4 bg-slate-50/50 hover:bg-blue-50/50 rounded-xl border border-transparent hover:border-blue-100 transition-all cursor-pointer">
                                <div className="flex items-center justify-between mb-2">
                                    <div className="flex items-center gap-2">
                                        <span className="px-2 py-0.5 bg-slate-200 text-slate-700 font-bold text-[10px] rounded">
                                            {review.room}
                                        </span>
                                        <span className="text-sm font-bold text-slate-800">{review.name}</span>
                                    </div>
                                    <div className="flex items-center gap-0.5">
                                        {[1, 2, 3, 4, 5].map((star) => (
                                            <Star 
                                                key={star} 
                                                size={12} 
                                                className={star <= review.rating ? "text-amber-400 fill-amber-400" : "text-slate-200"} 
                                            />
                                        ))}
                                    </div>
                                </div>
                                <p className="text-xs text-slate-600 leading-relaxed line-clamp-2 group-hover:line-clamp-none transition-all">
                                    &quot;{review.comment}&quot;
                                </p>
                                <div className="mt-3 flex items-center justify-between">
                                    <span className="text-[10px] text-slate-400">{review.date}</span>
                                    <span className={cn(
                                        "text-[10px] font-semibold px-2 py-0.5 rounded-full",
                                        review.status === 'completed' ? 'text-emerald-600 bg-emerald-100' :
                                        review.status === 'pending' ? 'text-amber-600 bg-amber-100' :
                                        'text-rose-600 bg-rose-100 animate-pulse'
                                    )}>
                                        {review.tag}
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

            </div>
        </div>
    );
}
