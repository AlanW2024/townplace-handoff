import { NextResponse } from 'next/server';
import { getStore, saveStore } from '@/lib/store';
import { ReviewStatus, Handoff, ParseReview } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function GET() {
    const store = getStore();
    const sorted = store.parse_reviews.sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
    return NextResponse.json(sorted);
}

export async function POST(request: Request) {
    const store = getStore();
    const body = await request.json();
    const now = new Date().toISOString();

    const review: ParseReview = {
        id: `rev-${Date.now()}`,
        message_id: body.message_id || '',
        raw_text: body.raw_text || '',
        sender_name: body.sender_name || '',
        sender_dept: body.sender_dept || 'conc',
        confidence: body.confidence ?? 0,
        suggested_rooms: body.suggested_rooms || [],
        suggested_action: body.suggested_action ?? null,
        suggested_type: body.suggested_type ?? null,
        suggested_from_dept: body.suggested_from_dept ?? null,
        suggested_to_dept: body.suggested_to_dept ?? null,
        reviewed_rooms: body.suggested_rooms || [],
        reviewed_action: body.suggested_action ?? null,
        reviewed_type: body.suggested_type ?? null,
        reviewed_from_dept: body.suggested_from_dept ?? null,
        reviewed_to_dept: body.suggested_to_dept ?? null,
        review_status: 'pending',
        reviewed_by: null,
        reviewed_at: null,
        created_at: now,
        updated_at: now,
    };

    store.parse_reviews.push(review);
    saveStore(store);

    return NextResponse.json(review, { status: 201 });
}

export async function PUT(request: Request) {
    const store = getStore();
    const body = await request.json();
    const { id, review_status, reviewed_by, ...corrections } = body as {
        id: string;
        review_status: ReviewStatus;
        reviewed_by?: string;
        reviewed_rooms?: string[];
        reviewed_action?: string | null;
        reviewed_type?: string | null;
        reviewed_from_dept?: string | null;
        reviewed_to_dept?: string | null;
    };

    const idx = store.parse_reviews.findIndex(r => r.id === id);
    if (idx === -1) {
        return NextResponse.json({ error: 'Review not found' }, { status: 404 });
    }

    const review = store.parse_reviews[idx];
    const now = new Date().toISOString();

    // Update review fields
    review.review_status = review_status;
    review.reviewed_by = reviewed_by || 'Admin';
    review.reviewed_at = now;
    review.updated_at = now;

    // Apply corrections if provided
    if (corrections.reviewed_rooms !== undefined) review.reviewed_rooms = corrections.reviewed_rooms;
    if (corrections.reviewed_action !== undefined) review.reviewed_action = corrections.reviewed_action;
    if (corrections.reviewed_type !== undefined) review.reviewed_type = corrections.reviewed_type as any;
    if (corrections.reviewed_from_dept !== undefined) review.reviewed_from_dept = corrections.reviewed_from_dept as any;
    if (corrections.reviewed_to_dept !== undefined) review.reviewed_to_dept = corrections.reviewed_to_dept as any;

    // On approve or correct: apply deferred side effects
    if (review_status === 'approved' || review_status === 'corrected') {
        const rooms = review.reviewed_rooms;
        const action = review.reviewed_action;
        const fromDept = review.reviewed_from_dept;
        const toDept = review.reviewed_to_dept;
        const reviewedType = review.reviewed_type;

        // Also update the original message's parsed fields
        const msg = store.messages.find(m => m.id === review.message_id);
        if (msg) {
            msg.parsed_room = rooms;
            msg.parsed_action = action;
            msg.parsed_type = reviewedType;
            msg.confidence = review_status === 'approved' ? review.confidence : 1.0;
        }

        // Create handoffs if applicable
        if (reviewedType === 'handoff' && fromDept && toDept) {
            for (const roomId of rooms) {
                const ho: Handoff = {
                    id: `ho-rev-${Date.now()}-${roomId}`,
                    room_id: roomId,
                    from_dept: fromDept,
                    to_dept: toDept,
                    action: action || '',
                    status: 'pending',
                    triggered_by: review.message_id,
                    created_at: now,
                    acknowledged_at: null,
                };
                store.handoffs.push(ho);
            }
        }

        // Apply room status updates
        for (const roomId of rooms) {
            const room = store.rooms.find(r => r.id === roomId);
            if (!room || !action) continue;

            room.last_updated_at = now;
            room.last_updated_by = review.sender_name;

            switch (action) {
                case '工程完成 → 可清潔':
                    room.eng_status = 'completed';
                    room.clean_status = 'pending';
                    room.needs_attention = true;
                    room.attention_reason = '待清潔接手';
                    break;
                case '工程完成':
                    room.eng_status = 'completed';
                    room.attention_reason = null;
                    break;
                case '深層清潔完成':
                case '清潔完成':
                    room.clean_status = 'completed';
                    if (room.lease_status !== 'checkout') {
                        room.needs_attention = false;
                        room.attention_reason = null;
                    }
                    break;
                case '執修中':
                    room.eng_status = 'in_progress';
                    room.needs_attention = true;
                    room.attention_reason = '工程跟進中';
                    break;
                case '報修 — 需要維修':
                    room.eng_status = 'pending';
                    room.needs_attention = true;
                    room.attention_reason = '待工程處理';
                    break;
                case '退房':
                    room.lease_status = 'checkout';
                    room.needs_attention = true;
                    room.attention_reason = '退房後待跟進';
                    break;
                case '入住':
                    room.lease_status = 'newlet';
                    room.needs_attention = true;
                    room.attention_reason = '入住前準備';
                    break;
                default:
                    break;
            }
        }
    }

    saveStore(store);
    return NextResponse.json(review);
}
