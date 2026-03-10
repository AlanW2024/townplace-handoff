import { NextResponse } from 'next/server';
import { getStore } from '@/lib/store';

export const dynamic = 'force-dynamic';

export async function GET() {
    const store = getStore();

    // Get today's messages
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const todayMessages = store.messages.filter(m => {
        const sentDate = new Date(m.sent_at);
        sentDate.setHours(0, 0, 0, 0);
        return sentDate.getTime() === today.getTime();
    });

    // Build report
    const reportItems: string[] = [];
    const seenRooms = new Set<string>();

    for (const msg of todayMessages) {
        if (!msg.parsed_action || msg.parsed_room.length === 0) continue;

        for (const room of msg.parsed_room) {
            const key = `${room}-${msg.parsed_action}`;
            if (seenRooms.has(key)) continue;
            seenRooms.add(key);
            reportItems.push(`- ${room} ${msg.parsed_action}`);
        }
    }

    // Get outstanding handoffs
    const pendingHandoffs = store.handoffs.filter(h => {
        if (h.status !== 'pending') return false;
        const createdDate = new Date(h.created_at);
        createdDate.setHours(0, 0, 0, 0);
        return createdDate.getTime() === today.getTime();
    });
    if (pendingHandoffs.length > 0) {
        reportItems.push('');
        reportItems.push('待處理交接：');
        for (const h of pendingHandoffs) {
            reportItems.push(`- ${h.room_id} ${h.action} (${h.from_dept} → ${h.to_dept})`);
        }
    }

    const dateStr = today.toLocaleDateString('zh-HK', { day: 'numeric', month: 'short', year: 'numeric' });
    const report = `是日跟進 ${dateStr}\n${reportItems.join('\n')}`;

    return NextResponse.json({ report, items: reportItems.length });
}
