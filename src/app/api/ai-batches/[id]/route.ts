import { NextResponse } from 'next/server';
import { getStore } from '@/lib/store';

export const dynamic = 'force-dynamic';

export async function GET(
    _request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    const store = getStore();
    const run = store.ai_batch_runs.find(item => item.id === id);
    if (!run) {
        return NextResponse.json({ error: 'AI batch not found' }, { status: 404 });
    }

    const uploadBatch = store.upload_batches.find(batch => batch.id === run.upload_batch_id) ?? null;
    const events = store.ai_extracted_events.filter(event => event.ai_batch_run_id === run.id);
    const messages = store.messages.filter(message => message.upload_batch_id === run.upload_batch_id);

    return NextResponse.json({
        ...run,
        upload_batch: uploadBatch,
        events,
        message_count: messages.length,
    });
}
