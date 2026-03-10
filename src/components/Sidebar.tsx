'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useRouter } from 'next/navigation';
import {
    MessageSquare, LayoutGrid, ArrowRightLeft, FileText,
    ClipboardList, Calendar, Upload, Building2, Menu, X, LogOut,
    Lightbulb, ListChecks, SearchCheck, Bell
} from 'lucide-react';
import { cn } from '@/lib/utils';

const NAV_ITEMS = [
    { href: '/', icon: MessageSquare, label: '訊息中心', labelEn: 'Messages' },
    { href: '/rooms', icon: LayoutGrid, label: '房間看板', labelEn: 'Rooms' },
    { href: '/documents', icon: FileText, label: '文件追蹤', labelEn: 'Documents' },
    { href: '/report', icon: ClipboardList, label: '每日報告', labelEn: 'Report' },
    { href: '/ai', icon: Lightbulb, label: 'AI 建議', labelEn: 'AI Suggestions' },
    { href: '/followups', icon: ListChecks, label: '跟進事項', labelEn: 'Follow-ups' },
    { href: '/reviews', icon: SearchCheck, label: '人工覆核', labelEn: 'Reviews' },
    { href: '/notifications', icon: Bell, label: '通知中心', labelEn: 'Notifications' },
    { href: '/bookings', icon: Calendar, label: '預約日曆', labelEn: 'Bookings' },
    { href: '/upload', icon: Upload, label: '上傳訊息', labelEn: 'Upload' },
];

export default function Sidebar() {
    const pathname = usePathname();
    const router = useRouter();
    const [mobileOpen, setMobileOpen] = useState(false);

    const handleLogout = async () => {
        await fetch('/api/auth', { method: 'DELETE' });
        router.push('/login');
    };

    return (
        <>
            {/* Mobile toggle */}
            <button
                onClick={() => setMobileOpen(!mobileOpen)}
                className="lg:hidden fixed top-4 left-4 z-50 p-2 bg-white rounded-xl shadow-md border border-slate-200"
            >
                {mobileOpen ? <X size={20} /> : <Menu size={20} />}
            </button>

            {/* Overlay */}
            {mobileOpen && (
                <div
                    className="lg:hidden fixed inset-0 bg-black/20 backdrop-blur-sm z-30"
                    onClick={() => setMobileOpen(false)}
                />
            )}

            {/* Sidebar */}
            <aside
                className={cn(
                    'fixed top-0 left-0 h-full z-40 w-64 flex flex-col',
                    'bg-gradient-to-b from-slate-50 to-slate-100/80 border-r border-slate-200/80',
                    'transition-transform duration-300 ease-out',
                    'lg:translate-x-0',
                    mobileOpen ? 'translate-x-0' : '-translate-x-full'
                )}
            >
                {/* Logo */}
                <div className="px-6 py-6 border-b border-slate-200/60">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center shadow-md shadow-blue-500/20">
                            <Building2 size={20} className="text-white" />
                        </div>
                        <div>
                            <h1 className="text-base font-bold text-slate-800 tracking-tight">TOWNPLACE</h1>
                            <p className="text-[11px] text-slate-400 font-medium tracking-widest">SOHO · HANDOFF BRIDGE</p>
                        </div>
                    </div>
                </div>

                {/* Navigation */}
                <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
                    <p className="section-title px-4 mb-3">功能</p>
                    {NAV_ITEMS.map(item => {
                        const isActive = pathname === item.href;
                        return (
                            <Link
                                key={item.href}
                                href={item.href}
                                onClick={() => setMobileOpen(false)}
                                className={cn('sidebar-link', isActive && 'active')}
                            >
                                <item.icon size={18} className={isActive ? 'text-blue-600' : 'text-slate-400'} />
                                <span>{item.label}</span>
                                <span className="text-[10px] text-slate-400 ml-auto">{item.labelEn}</span>
                            </Link>
                        );
                    })}
                </nav>

                {/* Footer */}
                <div className="px-6 py-4 border-t border-slate-200/60 space-y-3">
                    <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse-gentle" />
                        <span className="text-xs text-slate-400">系統運行中</span>
                    </div>
                    <button
                        onClick={handleLogout}
                        className="flex items-center gap-2 text-xs text-slate-400 hover:text-red-500 transition-colors w-full"
                    >
                        <LogOut size={14} />
                        <span>登出</span>
                    </button>
                </div>
            </aside>
        </>
    );
}
