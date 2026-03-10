import { NextResponse } from 'next/server';
import { getStore, saveStore } from '@/lib/store';

export const dynamic = 'force-dynamic';

export async function GET() {
    const store = getStore();
    return NextResponse.json(store.bookings.sort((a, b) =>
        new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime()
    ));
}

export async function POST(request: Request) {
    const store = getStore();
    const body = await request.json();

    const booking = {
        id: `bk-${Date.now()}`,
        room_id: body.room_id || null,
        facility: body.facility || null,
        booking_type: body.booking_type,
        scheduled_at: body.scheduled_at,
        duration_minutes: body.duration_minutes || 30,
        booked_by: body.booked_by,
        dept: body.dept,
        notes: body.notes || null,
        created_at: new Date().toISOString(),
    };

    store.bookings.push(booking);
    saveStore(store);
    return NextResponse.json(booking, { status: 201 });
}
