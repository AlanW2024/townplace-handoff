import { NextResponse } from 'next/server';
import { generateNotifications } from '@/lib/notifications';

export const dynamic = 'force-dynamic';

export async function GET() {
    const notifications = generateNotifications();
    return NextResponse.json(notifications);
}
