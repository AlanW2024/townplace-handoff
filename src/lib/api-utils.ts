import { NextResponse } from 'next/server';
import { emitEvent } from './observability';

export async function parseJsonBody<T>(request: Request): Promise<{ data: T } | { error: NextResponse }> {
    try {
        const data = await request.json() as T;
        return { data };
    } catch {
        emitEvent('api.error', 'warn', { error: 'Invalid JSON body' });
        return { error: NextResponse.json({ error: '請求格式錯誤，必須是有效的 JSON' }, { status: 400 }) };
    }
}
