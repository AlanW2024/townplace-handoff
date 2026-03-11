'use client';

import { usePathname } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import { ToastProvider } from '@/components/Toast';

export function LayoutShell({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const isStandalonePage = pathname === '/login' || pathname?.startsWith('/gemini');

    if (isStandalonePage) {
        return <ToastProvider>{children}</ToastProvider>;
    }

    return (
        <ToastProvider>
            <div className="min-h-screen flex">
                <Sidebar />
                <main className="flex-1 lg:ml-64 min-h-screen">
                    <div className="p-4 lg:p-8 max-w-[1600px] mx-auto">
                        {children}
                    </div>
                </main>
            </div>
        </ToastProvider>
    );
}
