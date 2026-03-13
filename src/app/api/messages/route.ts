import { NextResponse } from 'next/server';
import { getStore } from '@/lib/store';
import { AiMessageClassification, ChatType, DeptCode, Message } from '@/lib/types';
import { parseJsonBody } from '@/lib/api-utils';
import { canIngestMessage } from '@/lib/permissions';
import { assertAllowed, requireAuthenticatedUser } from '@/lib/route-mutations';

export const dynamic = 'force-dynamic';

type MessageCenterFilter = 'all' | 'parsed' | 'review' | 'group' | 'direct' | 'relevant' | 'irrelevant';

const VALID_FILTERS: MessageCenterFilter[] = ['all', 'parsed', 'review', 'group', 'direct', 'relevant', 'irrelevant'];
const DEFAULT_LIMIT = 120;
const MAX_LIMIT = 500;

function applyFilter(messages: Message[], filter: MessageCenterFilter, pendingReviewIds: Set<string>) {
    switch (filter) {
        case 'parsed':
            return messages.filter(message => Boolean(message.parsed_action));
        case 'review':
            return messages.filter(message => pendingReviewIds.has(message.id));
        case 'relevant':
            return messages.filter(message => message.ai_classification && message.ai_classification !== 'irrelevant');
        case 'irrelevant':
            return messages.filter(message => message.ai_classification === 'irrelevant');
        case 'group':
            return messages.filter(message => message.chat_type === 'group');
        case 'direct':
            return messages.filter(message => message.chat_type === 'direct');
        default:
            return messages;
    }
}

function buildCounts(messages: Message[], pendingReviewIds: Set<string>) {
    return {
        all: messages.length,
        parsed: messages.filter(message => Boolean(message.parsed_action)).length,
        review: pendingReviewIds.size,
        relevant: messages.filter(message => message.ai_classification && message.ai_classification !== 'irrelevant').length,
        irrelevant: messages.filter(message => message.ai_classification === 'irrelevant').length,
        group: messages.filter(message => message.chat_type === 'group').length,
        direct: messages.filter(message => message.chat_type === 'direct').length,
    };
}

export async function GET(request: Request) {
    const store = getStore();
    const sortedMessages = [...store.messages].sort((a, b) =>
        new Date(b.sent_at).getTime() - new Date(a.sent_at).getTime()
    );
    const pendingReviewIds = new Set(
        store.parse_reviews
            .filter(review => review.review_status === 'pending')
            .map(review => review.message_id)
    );
    const { searchParams } = new URL(request.url);
    const usePagedResponse = searchParams.has('limit') || searchParams.has('offset') || searchParams.has('filter');

    if (!usePagedResponse) {
        return NextResponse.json(sortedMessages);
    }

    const requestedFilter = searchParams.get('filter');
    const filter: MessageCenterFilter = requestedFilter && VALID_FILTERS.includes(requestedFilter as MessageCenterFilter)
        ? requestedFilter as MessageCenterFilter
        : 'all';
    const offset = Math.max(0, Number(searchParams.get('offset') ?? 0) || 0);
    const requestedLimit = Number(searchParams.get('limit') ?? DEFAULT_LIMIT) || DEFAULT_LIMIT;
    const limit = Math.min(MAX_LIMIT, Math.max(1, requestedLimit));
    const filteredMessages = applyFilter(sortedMessages, filter, pendingReviewIds);
    const pagedMessages = filteredMessages
        .slice(offset, offset + limit)
        .map(message => ({
            ...message,
            needs_review: pendingReviewIds.has(message.id),
        }));

    return NextResponse.json({
        messages: pagedMessages,
        counts: buildCounts(sortedMessages, pendingReviewIds),
        pagination: {
            filter,
            offset,
            limit,
            returned: pagedMessages.length,
            total_filtered: filteredMessages.length,
            has_more: offset + limit < filteredMessages.length,
        },
    });
}

export async function POST(request: Request) {
    const parsed = await parseJsonBody<{
        raw_text?: string;
        sender_name?: string;
        sender_dept?: DeptCode | null;
        wa_group?: string;
        chat_name?: string;
        chat_type?: ChatType;
    }>(request);
    if ('error' in parsed) return parsed.error;
    const body = parsed.data;

    if (typeof body.raw_text !== 'string' || body.raw_text.trim() === '') {
        return NextResponse.json({ error: 'raw_text 必須是非空字串' }, { status: 400 });
    }

    const auth = await requireAuthenticatedUser(request);
    if ('error' in auth) return auth.error;
    try {
        assertAllowed(canIngestMessage(auth.user));
    } catch (error) {
        return NextResponse.json(
            { error: error instanceof Error ? error.message : '權限不足' },
            { status: 403 }
        );
    }

    const { ingestMessage } = await import('@/lib/ingest');

    // Pass everything to the central ingestion function
    const result = await ingestMessage({
        raw_text: body.raw_text,
        sender_name: body.sender_name || 'Unknown',
        sender_dept: body.sender_dept,
        wa_group: body.wa_group,
        chat_name: body.chat_name || body.wa_group || 'SOHO 前線🏡🧹🦫🐿️',
        chat_type: body.chat_type || 'group',
    });

    return NextResponse.json(result.message, { status: 201 });
}
