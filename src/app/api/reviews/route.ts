import { NextResponse } from 'next/server';
import { StoreData, getStore, withStoreWrite } from '@/lib/store';
import { applyRoomStatusUpdate } from '@/lib/ingest';
import { analyzeHandoffSignal, enforceHandoffSafety } from '@/lib/message-parsing';
import { DeptCode, Handoff, HandoffType, ParseReview, ReviewStatus, RoomReference } from '@/lib/types';
import { parseJsonBody } from '@/lib/api-utils';
import { canApproveReview } from '@/lib/permissions';
import {
    assertAllowed,
    assertExpectedVersion,
    getRouteErrorStatus,
    requireAuthenticatedUser,
} from '@/lib/route-mutations';
import { ensureRoomCycleForReference, resolveRoomDisplayCodes } from '@/lib/room-lifecycle';

export const dynamic = 'force-dynamic';

const FINAL_REVIEW_STATUSES: ReviewStatus[] = ['approved', 'corrected', 'dismissed'];
const VALID_TYPES: HandoffType[] = ['handoff', 'request', 'update', 'trigger', 'query', 'escalation'];
const VALID_DEPTS: DeptCode[] = ['eng', 'conc', 'clean', 'hskp', 'mgmt', 'lease', 'comm', 'security'];

function validateReviewStatus(status: unknown): status is ReviewStatus {
    return typeof status === 'string' && ['pending', 'approved', 'corrected', 'dismissed'].includes(status);
}

function validateType(type: unknown): type is HandoffType {
    return typeof type === 'string' && VALID_TYPES.includes(type as HandoffType);
}

function validateDept(dept: unknown): dept is DeptCode {
    return typeof dept === 'string' && VALID_DEPTS.includes(dept as DeptCode);
}

function hasOverlappingPendingReview(store: StoreData, reviewId: string, rooms: string[]): boolean {
    return store.parse_reviews.some(other =>
        other.id !== reviewId &&
        other.review_status === 'pending' &&
        other.reviewed_rooms.some(room => rooms.includes(room))
    );
}

function handoffExists(store: StoreData, handoff: Pick<Handoff, 'room_id' | 'from_dept' | 'to_dept' | 'action' | 'triggered_by'>): boolean {
    return store.handoffs.some(existing =>
        existing.room_id === handoff.room_id &&
        existing.from_dept === handoff.from_dept &&
        existing.to_dept === handoff.to_dept &&
        existing.action === handoff.action &&
        existing.triggered_by === handoff.triggered_by
    );
}

function roomRefsFromReview(store: StoreData, review: ParseReview, fallbackRooms: string[]): RoomReference[] {
    if (Array.isArray(review.room_cycle_ids) && review.room_cycle_ids.length > 0) {
        const refs = review.room_cycle_ids
            .map(id => store.room_cycles.find(cycle => cycle.id === id))
            .filter((cycle): cycle is NonNullable<typeof cycle> => Boolean(cycle))
            .map(cycle => ({
                physical_room_id: cycle.room_id,
                display_code: cycle.display_code,
                scope: cycle.scope,
                raw_match: cycle.display_code,
            }));
        if (refs.length > 0) return refs;
    }

    return fallbackRooms.map(room => ({
        physical_room_id: room,
        display_code: room,
        scope: 'active',
        raw_match: room,
    }));
}

export async function GET() {
    const store = getStore();
    const sorted = [...store.parse_reviews].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
    return NextResponse.json(sorted.map(review => ({
        ...review,
        suggested_room_display_codes: resolveRoomDisplayCodes(store, review.suggested_rooms, review.room_cycle_ids ?? []),
        reviewed_room_display_codes: resolveRoomDisplayCodes(store, review.reviewed_rooms, review.room_cycle_ids ?? []),
    })));
}

export async function POST(request: Request) {
    const parsed = await parseJsonBody<Record<string, unknown>>(request);
    if ('error' in parsed) return parsed.error;
    const body = parsed.data;
    const auth = await requireAuthenticatedUser(request);
    if ('error' in auth) return auth.error;

    const now = new Date().toISOString();

    const review = await withStoreWrite(store => {
        assertAllowed(canApproveReview(auth.user));
        const nextReview: ParseReview = {
            id: `rev-${Date.now()}`,
            property_id: (body.property_id as string) || 'tp-soho',
            message_id: (body.message_id as string) || '',
            raw_text: (body.raw_text as string) || '',
            sender_name: (body.sender_name as string) || '',
            sender_dept: validateDept(body.sender_dept) ? body.sender_dept : 'conc',
            confidence: (body.confidence as number) ?? 0,
            suggested_rooms: Array.isArray(body.suggested_rooms) ? body.suggested_rooms : [],
            room_cycle_ids: Array.isArray(body.room_cycle_ids) ? body.room_cycle_ids.filter(id => typeof id === 'string') : [],
            suggested_action: (body.suggested_action as string) ?? null,
            suggested_type: validateType(body.suggested_type) ? body.suggested_type : null,
            suggested_from_dept: validateDept(body.suggested_from_dept) ? body.suggested_from_dept : null,
            suggested_to_dept: validateDept(body.suggested_to_dept) ? body.suggested_to_dept : null,
            reviewed_rooms: Array.isArray(body.reviewed_rooms) ? body.reviewed_rooms : (Array.isArray(body.suggested_rooms) ? body.suggested_rooms : []),
            reviewed_action: (body.reviewed_action as string) ?? (body.suggested_action as string) ?? null,
            reviewed_type: validateType(body.reviewed_type) ? body.reviewed_type : (validateType(body.suggested_type) ? body.suggested_type : null),
            reviewed_from_dept: validateDept(body.reviewed_from_dept) ? body.reviewed_from_dept : (validateDept(body.suggested_from_dept) ? body.suggested_from_dept : null),
            reviewed_to_dept: validateDept(body.reviewed_to_dept) ? body.reviewed_to_dept : (validateDept(body.suggested_to_dept) ? body.suggested_to_dept : null),
            review_status: 'pending',
            reviewed_by: null,
            reviewed_at: null,
            created_at: now,
            updated_at: now,
            version: 1,
        };

        store.parse_reviews.push(nextReview);
        return nextReview;
    });

    return NextResponse.json({
        ...review,
        suggested_room_display_codes: resolveRoomDisplayCodes(getStore(), review.suggested_rooms, review.room_cycle_ids ?? []),
        reviewed_room_display_codes: resolveRoomDisplayCodes(getStore(), review.reviewed_rooms, review.room_cycle_ids ?? []),
    }, { status: 201 });
}

export async function PUT(request: Request) {
    const parsed = await parseJsonBody<{
        id: string;
        review_status: ReviewStatus;
        reviewed_by?: string;
        reviewed_rooms?: string[];
        reviewed_action?: string | null;
        reviewed_type?: HandoffType | null;
        reviewed_from_dept?: DeptCode | null;
        reviewed_to_dept?: DeptCode | null;
        expectedVersion?: number;
    }>(request);
    if ('error' in parsed) return parsed.error;
    const { id, review_status, reviewed_by, expectedVersion, ...corrections } = parsed.data;

    if (!validateReviewStatus(review_status)) {
        return NextResponse.json({ error: 'Invalid review status' }, { status: 400 });
    }

    if (!FINAL_REVIEW_STATUSES.includes(review_status)) {
        return NextResponse.json({ error: 'Review 只可標記為 approved / corrected / dismissed' }, { status: 400 });
    }

    const auth = await requireAuthenticatedUser(request);
    if ('error' in auth) return auth.error;

    try {
        const updatedReview = await withStoreWrite(store => {
            const idx = store.parse_reviews.findIndex(review => review.id === id);
            if (idx === -1) {
                throw new Error('Review not found');
            }

            const review = store.parse_reviews[idx];
            const now = new Date().toISOString();
            assertAllowed(canApproveReview(auth.user));
            assertExpectedVersion(expectedVersion, review.version, '覆核');

            if (review.review_status !== 'pending') {
                throw new Error('此覆核已處理，不能重複 approve / correct');
            }

            if (corrections.reviewed_type !== undefined && corrections.reviewed_type !== null && !validateType(corrections.reviewed_type)) {
                throw new Error('Invalid reviewed_type');
            }
            if (corrections.reviewed_from_dept !== undefined && corrections.reviewed_from_dept !== null && !validateDept(corrections.reviewed_from_dept)) {
                throw new Error('Invalid reviewed_from_dept');
            }
            if (corrections.reviewed_to_dept !== undefined && corrections.reviewed_to_dept !== null && !validateDept(corrections.reviewed_to_dept)) {
                throw new Error('Invalid reviewed_to_dept');
            }

            if (Array.isArray(corrections.reviewed_rooms)) {
                review.reviewed_rooms = corrections.reviewed_rooms;
            }
            if (corrections.reviewed_action !== undefined) {
                review.reviewed_action = corrections.reviewed_action;
            }
            if (corrections.reviewed_type !== undefined) {
                review.reviewed_type = corrections.reviewed_type;
            }
            if (corrections.reviewed_from_dept !== undefined) {
                review.reviewed_from_dept = corrections.reviewed_from_dept;
            }
            if (corrections.reviewed_to_dept !== undefined) {
                review.reviewed_to_dept = corrections.reviewed_to_dept;
            }

            if ((review_status === 'approved' || review_status === 'corrected') &&
                hasOverlappingPendingReview(store, review.id, review.reviewed_rooms)) {
                throw new Error('相關房間仍有其他待覆核訊息，請先處理衝突');
            }

            review.review_status = review_status;
            review.reviewed_by = reviewed_by?.trim() || auth.user.name;
            review.reviewed_at = now;
            review.updated_at = now;
            review.version = (review.version || 1) + 1;

            if (review_status === 'approved' || review_status === 'corrected') {
                const safeReviewed = enforceHandoffSafety(review.raw_text, {
                    rooms: review.reviewed_rooms,
                    action: review.reviewed_action,
                    type: review.reviewed_type,
                    from_dept: review.reviewed_from_dept,
                    to_dept: review.reviewed_to_dept,
                    confidence: review_status === 'approved' ? review.confidence : 1,
                    explanation: review_status === 'approved'
                        ? '已由人工覆核確認原建議結果。'
                        : '已由人工覆核修正解析結果。',
                });
                const handoffSignal = analyzeHandoffSignal(review.raw_text);
                const rooms = safeReviewed.rooms;
                const action = safeReviewed.action;
                const fromDept = safeReviewed.from_dept;
                const toDept = safeReviewed.to_dept;
                const reviewedType = safeReviewed.type;
                const roomRefs = roomRefsFromReview(store, review, rooms);
                const activeRoomRefs = roomRefs.filter(ref => ref.scope === 'active');

                review.reviewed_rooms = rooms;
                review.reviewed_action = action;
                review.reviewed_type = reviewedType;
                review.reviewed_from_dept = fromDept;
                review.reviewed_to_dept = toDept;
                review.room_cycle_ids = roomRefs.map(ref => ensureRoomCycleForReference(store, ref, review.property_id).id);

                const msg = store.messages.find(message => message.id === review.message_id);
                if (msg) {
                    msg.parsed_room = rooms;
                    msg.parsed_room_refs = roomRefs;
                    msg.parsed_action = action;
                    msg.parsed_type = reviewedType;
                    msg.confidence = safeReviewed.confidence;
                    msg.parsed_explanation = safeReviewed.explanation || null;
                    msg.parsed_by = 'review';
                    msg.parsed_model = 'human-review';
                }

                if (reviewedType === 'handoff' && handoffSignal.allowsImmediateHandoff && fromDept && toDept) {
                    for (const roomRef of activeRoomRefs) {
                        const nextHandoff: Handoff = {
                            id: `ho-rev-${Date.now()}-${roomRef.physical_room_id}`,
                            property_id: review.property_id ?? 'tp-soho',
                            room_id: roomRef.physical_room_id,
                            room_cycle_id: ensureRoomCycleForReference(store, roomRef, review.property_id).id,
                            from_dept: fromDept,
                            to_dept: toDept,
                            action: action || '',
                            status: 'pending',
                            triggered_by: review.message_id,
                            created_at: now,
                            acknowledged_at: null,
                            version: 1,
                        };

                        if (!handoffExists(store, nextHandoff)) {
                            store.handoffs.push(nextHandoff);
                        }
                    }
                }

                for (const roomRef of activeRoomRefs) {
                    const room = store.rooms.find(candidate => candidate.id === roomRef.physical_room_id);
                    if (!room || !action) continue;
                    applyRoomStatusUpdate(room, action, fromDept, review.sender_name);
                }
            }

            return review;
        });

        const store = getStore();
        return NextResponse.json({
            ...updatedReview,
            suggested_room_display_codes: resolveRoomDisplayCodes(store, updatedReview.suggested_rooms, updatedReview.room_cycle_ids ?? []),
            reviewed_room_display_codes: resolveRoomDisplayCodes(store, updatedReview.reviewed_rooms, updatedReview.room_cycle_ids ?? []),
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : '更新覆核失敗';
        const status = error instanceof Error && (error.message.includes('已處理') || error.message.includes('衝突'))
            ? 409
            : getRouteErrorStatus(error, 'Review not found');
        return NextResponse.json({ error: message }, { status });
    }
}
