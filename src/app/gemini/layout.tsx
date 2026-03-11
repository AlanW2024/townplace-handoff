'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
    LayoutDashboard,
    Home,
    FileSignature,
    BrainCircuit, 
    ListTodo, 
    FileSearch, 
    BellRing, 
    CalendarDays, 
    ClipboardList, 
    UploadCloud,
    Menu,
    X,
    Sparkles
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { GEMINI_EXPERIMENTAL_BADGE, GEMINI_EXPERIMENTAL_CTA, GEMINI_EXPERIMENTAL_NOTE } from './experimental';

const NAV_ITEMS = [
    { href: '/gemini', icon: LayoutDashboard, label: '總覽 Dashboard' },
    { href: '/gemini/rooms', icon: Home, label: '房間看板' },
    { href: '/gemini/documents', icon: FileSignature, label: '文件追蹤' },
    { href: '/gemini/ai', icon: BrainCircuit, label: 'AI 管理建議' },
    { href: '/gemini/followups', icon: ListTodo, label: '跟進事項' },
    { href: '/gemini/reviews', icon: FileSearch, label: '人工覆核' },
    { href: '/gemini/notifications', icon: BellRing, label: '通知中心' },
    { href: '/gemini/bookings', icon: CalendarDays, label: '預約日曆' },
    { href: '/gemini/report', icon: ClipboardList, label: '每日報告' },
    { href: '/gemini/upload', icon: UploadCloud, label: '上傳訊息' },
];

export default function GeminiLayout({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

    return (
        <div className="min-h-screen bg-[#0f1115] text-white selection:bg-indigo-500/30 font-sans flex text-sm">
            {/* Mobile Navigation Toggle */}
            <button 
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                className="lg:hidden fixed top-4 right-4 z-50 p-2.5 bg-indigo-600 rounded-xl shadow-lg shadow-indigo-500/30 text-white"
            >
                {isMobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
            </button>

            {/* Sidebar Overlay */}
            {isMobileMenuOpen && (
                <div 
                    className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden"
                    onClick={() => setIsMobileMenuOpen(false)}
                />
            )}

            {/* Sidebar */}
            <aside className={cn(
                "fixed lg:sticky top-0 left-0 h-screen w-64 bg-[#14171d] border-r border-white/5 z-40 flex flex-col transition-transform duration-300",
                isMobileMenuOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
            )}>
                <div className="p-6 flex items-center gap-3 border-b border-white/5">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/20">
                        <Sparkles size={20} className="text-white" />
                    </div>
                    <div>
                        <h1 className="font-bold text-base tracking-wide bg-gradient-to-r from-indigo-300 to-purple-300 bg-clip-text text-transparent">
                            Gemini Style Lab
                        </h1>
                        <p className="text-[10px] text-zinc-500 uppercase tracking-widest font-mono">
                            Compare UI
                        </p>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto py-6 px-4 space-y-1.5 custom-scrollbar">
                    {NAV_ITEMS.map((item) => {
                        const isActive = pathname === item.href;
                        return (
                            <Link
                                key={item.href}
                                href={item.href}
                                onClick={() => setIsMobileMenuOpen(false)}
                                className={cn(
                                    "flex items-center gap-3 px-3.5 py-2.5 rounded-xl transition-all duration-200 group relative",
                                    isActive 
                                        ? "bg-indigo-600/10 text-indigo-400" 
                                        : "text-zinc-400 hover:bg-white/5 hover:text-zinc-200"
                                )}
                            >
                                {isActive && (
                                    <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 bg-indigo-500 rounded-r-md" />
                                )}
                                <item.icon size={18} className={cn("transition-colors", isActive ? "text-indigo-400" : "text-zinc-500 group-hover:text-zinc-300")} />
                                <span className={cn("font-medium", isActive ? "font-semibold" : "")}>{item.label}</span>
                            </Link>
                        );
                    })}
                </div>

                <div className="p-6 border-t border-white/5">
                    <div className="bg-white/5 p-4 rounded-xl border border-white/10 flex items-start gap-3">
                        <div className="flex-1">
                            <p className="font-semibold text-zinc-300 text-xs">{GEMINI_EXPERIMENTAL_BADGE}</p>
                            <p className="text-[10px] text-zinc-500 mt-0.5">Read-only compare route</p>
                        </div>
                        <div className="w-2 h-2 rounded-full bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.5)] mt-1" />
                    </div>
                </div>
            </aside>

            {/* Main Content */}
            <main className="flex-1 min-w-0 h-screen overflow-y-auto bg-[#0a0c10] custom-scrollbar">
                <div className="p-4 lg:p-10 max-w-7xl mx-auto">
                    <div className="mb-6 rounded-2xl border border-amber-400/20 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
                        <div className="font-semibold">{GEMINI_EXPERIMENTAL_BADGE}</div>
                        <div className="mt-1 text-amber-100/80">{GEMINI_EXPERIMENTAL_NOTE}</div>
                        <div className="mt-2 flex items-center gap-2 text-xs text-amber-50">
                            <span>{GEMINI_EXPERIMENTAL_CTA}</span>
                            <Link href="/" className="font-semibold underline underline-offset-4 hover:text-white">
                                返回主線 frontend
                            </Link>
                        </div>
                    </div>
                    {children}
                </div>
            </main>
        </div>
    );
}
