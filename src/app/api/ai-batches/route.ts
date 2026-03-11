import { NextResponse } from 'next/server';
import { getStore } from '@/lib/store';

export const dynamic = 'force-dynamic';

export async function GET() {
    const store = getStore();
    const runs = [...store.ai_batch_runs]
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .map(run => ({
            ...run,
            upload_batch: store.upload_batches.find(batch => batch.id === run.upload_batch_id) ?? null,
            event_count: store.ai_extracted_events.filter(event => event.ai_batch_run_id === run.id).length,
        }));

    return NextResponse.json(runs);
}
