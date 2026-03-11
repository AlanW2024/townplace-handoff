import { NextResponse } from 'next/server';
import { getDeptFromSender } from '@/lib/parser';
import { parseJsonBody } from '@/lib/api-utils';
import { previewMessageParsing } from '@/lib/ingest';
import { DeptCode } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
    const parsed = await parseJsonBody<{
        text?: string;
        sender_name?: string;
        sender_dept?: DeptCode | null;
    }>(request);
    if ('error' in parsed) return parsed.error;
    const { text, sender_name, sender_dept } = parsed.data;

    if (typeof text !== 'string' || text.trim() === '') {
        return NextResponse.json({ error: 'Missing text' }, { status: 400 });
    }

    const dept = sender_dept || (sender_name ? getDeptFromSender(sender_name) : null);
    const preview = await previewMessageParsing({
        raw_text: text,
        sender_name: sender_name || 'Unknown',
        sender_dept: dept || undefined,
    });

    const reviewReasons = [
        preview.safeParsed.confidence < 0.75 ? 'low_confidence' : null,
        preview.signals.isSummary ? 'summary_message' : null,
        preview.signals.isAmbiguousCompletion ? 'ambiguous_completion' : null,
        preview.signals.hasFutureHandoffLanguage ? 'future_handoff_language' : null,
    ].filter(Boolean);

    return NextResponse.json({
        ...preview.safeParsed,
        sender_dept: preview.senderDept,
        needs_review: preview.needsReview,
        review_reasons: reviewReasons,
    });
}
