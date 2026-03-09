import type { Metadata } from 'next';
import './globals.css';
import Sidebar from '@/components/Sidebar';

export const metadata: Metadata = {
    title: 'TOWNPLACE SOHO — Handoff Bridge',
    description: '跨部門交接橋系統 | Cross-Department Handoff Bridge System',
};

export default function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <html lang="zh-Hant">
            <body>
                <div className="min-h-screen flex">
                    <Sidebar />
                    <main className="flex-1 lg:ml-64 min-h-screen">
                        <div className="p-4 lg:p-8 max-w-[1600px] mx-auto">
                            {children}
                        </div>
                    </main>
                </div>
            </body>
        </html>
    );
}
