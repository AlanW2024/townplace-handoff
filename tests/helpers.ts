import fs from 'fs';
import os from 'os';
import path from 'path';
import { vi } from 'vitest';

export const originalCwd = process.cwd();

export async function withTempWorkspace(run: () => Promise<void>, prefix = 'townplace-test-') {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
    process.chdir(tempDir);
    vi.resetModules();
    try {
        await run();
    } finally {
        process.chdir(originalCwd);
        vi.resetModules();
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
}

export function jsonRequest(
    url: string,
    method: string,
    body: unknown,
    headers: Record<string, string> = {}
): Request {
    return new Request(url, {
        method,
        headers: {
            'content-type': 'application/json',
            cookie: 'tp-auth=authenticated',
            ...headers,
        },
        body: JSON.stringify(body),
    });
}

export function isoNow(offsetMs = 0): string {
    return new Date(Date.now() + offsetMs).toISOString();
}

export async function waitFor(
    predicate: () => boolean,
    options?: { timeoutMs?: number; intervalMs?: number }
) {
    const timeoutMs = options?.timeoutMs ?? 1500;
    const intervalMs = options?.intervalMs ?? 25;
    const started = Date.now();

    while (Date.now() - started < timeoutMs) {
        if (predicate()) return;
        await new Promise(resolve => setTimeout(resolve, intervalMs));
    }

    throw new Error(`waitFor timeout after ${timeoutMs}ms`);
}

export function makeRoom(id: string, overrides: Record<string, unknown> = {}) {
    const floor = Number(id.slice(0, -1));
    return {
        id,
        property_id: 'tp-soho',
        floor,
        unit_letter: id.slice(-1),
        room_type: 'Studio',
        eng_status: 'n_a' as const,
        clean_status: 'n_a' as const,
        lease_status: 'vacant' as const,
        tenant_name: null,
        lease_start: null,
        lease_end: null,
        notes: null,
        last_updated_at: isoNow(),
        last_updated_by: null,
        needs_attention: false,
        attention_reason: null,
        version: 1,
        ...overrides,
    };
}
