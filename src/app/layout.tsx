import type { Metadata } from 'next';
import './globals.css';
import { LayoutShell } from '@/components/LayoutShell';

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
                <LayoutShell>{children}</LayoutShell>
            </body>
        </html>
    );
}
