import { NextResponse } from 'next/server';
import { getStore, withStoreWrite } from '@/lib/store';
import { BookingType, DeptCode } from '@/lib/types';
import { parseJsonBody } from '@/lib/api-utils';
import { canCreateBooking } from '@/lib/permissions';
import { resolveRoomCycleDisplayCode } from '@/lib/room-lifecycle';
import { assertAllowed, getRouteErrorStatus, requireAuthenticatedUser } from '@/lib/route-mutations';

export const dynamic = 'force-dynamic';

const VALID_BOOKING_TYPES: BookingType[] = ['viewing', 'shooting', 'event', 'tenant_booking'];
const VALID_DEPTS: DeptCode[] = ['eng', 'conc', 'clean', 'hskp', 'mgmt', 'lease', 'comm', 'security'];

export async function GET() {
    const store = getStore();
    return NextResponse.json([...store.bookings]
        .map(booking => ({
            ...booking,
            room_display_code: booking.room_id
                ? resolveRoomCycleDisplayCode(store, booking.room_id, booking.room_cycle_id)
                : null,
        }))
        .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime()));
}

export async function POST(request: Request) {
    const parsed = await parseJsonBody<{
        booking_type?: string;
        dept?: string;
        scheduled_at?: string;
        duration_minutes?: number;
        property_id?: string;
        room_id?: string | null;
        facility?: string | null;
        booked_by?: string;
        notes?: string | null;
    }>(request);
    if ('error' in parsed) return parsed.error;
    const body = parsed.data;

    const scheduledAt = typeof body.scheduled_at === 'string' ? body.scheduled_at : '';

    if (!VALID_BOOKING_TYPES.includes(body.booking_type as BookingType)) {
        return NextResponse.json({ error: 'Invalid booking_type' }, { status: 400 });
    }

    if (!VALID_DEPTS.includes(body.dept as DeptCode)) {
        return NextResponse.json({ error: 'Invalid dept' }, { status: 400 });
    }

    if (!scheduledAt || Number.isNaN(new Date(scheduledAt).getTime())) {
        return NextResponse.json({ error: 'Invalid scheduled_at' }, { status: 400 });
    }

    if (body.duration_minutes !== undefined && body.duration_minutes !== null) {
        if (!Number.isInteger(body.duration_minutes) || body.duration_minutes <= 0) {
            return NextResponse.json({ error: 'duration_minutes 必須是正整數' }, { status: 400 });
        }
    }

    const auth = await requireAuthenticatedUser(request);
    if ('error' in auth) return auth.error;

    try {
        assertAllowed(canCreateBooking(auth.user, body.dept as DeptCode));
        const booking = await withStoreWrite(store => {
            const nextBooking = {
                id: `bk-${Date.now()}`,
                property_id: body.property_id || 'tp-soho',
                room_id: body.room_id || null,
                room_cycle_id: null,
                facility: body.facility || null,
                booking_type: body.booking_type as BookingType,
                scheduled_at: scheduledAt,
                duration_minutes: body.duration_minutes || 30,
                booked_by: body.booked_by || '',
                dept: body.dept as DeptCode,
                notes: body.notes || null,
                created_at: new Date().toISOString(),
            };

            store.bookings.push(nextBooking);
            return {
                ...nextBooking,
                room_display_code: nextBooking.room_id
                    ? resolveRoomCycleDisplayCode(store, nextBooking.room_id, nextBooking.room_cycle_id)
                    : null,
            };
        });

        return NextResponse.json(booking, { status: 201 });
    } catch (error) {
        return NextResponse.json(
            { error: error instanceof Error ? error.message : '建立預約失敗' },
            { status: getRouteErrorStatus(error) }
        );
    }
}
