import { NextResponse } from 'next/server';
import { generateSuggestions } from '@/lib/suggestions';

export const dynamic = 'force-dynamic';

export async function GET() {
    const suggestions = generateSuggestions();
    return NextResponse.json(suggestions);
}
