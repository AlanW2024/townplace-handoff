import { NextResponse } from 'next/server';
import { getStore } from '@/lib/store';

export const dynamic = 'force-dynamic';

export async function GET(
    _request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    const store = getStore();
    const batch = store.upload_batches.find(item => item.id === id);
    if (!batch) {
        return NextResponse.json({ error: 'Upload batch not found' }, { status: 404 });
    }

    const run = batch.ai_batch_run_id
        ? store.ai_batch_runs.find(item => item.id === batch.ai_batch_run_id) ?? null
        : null;
    const messages = store.messages.filter(message => message.upload_batch_id === batch.id);
    const reviewCount = store.parse_reviews.filter(review =>
        messages.some(message => message.id === review.message_id && review.review_status === 'pending')
    ).length;

    return NextResponse.json({
        ...batch,
        ai_batch_run: run,
        message_count: messages.length,
        review_count: reviewCount,
        actionable_count: run?.actionable_count ?? 0,
        context_count: run?.context_count ?? 0,
        irrelevant_count: run?.irrelevant_count ?? 0,
    });
}
