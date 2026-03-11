export interface ObservabilityEvent {
    timestamp: string;
    event: string;
    level: 'info' | 'warn' | 'error';
    context: Record<string, unknown>;
    duration_ms?: number;
}

export interface ObservabilityHook {
    emit(event: ObservabilityEvent): void;
}

export const consoleHook: ObservabilityHook = {
    emit(event) {
        const line = JSON.stringify(event);
        switch (event.level) {
            case 'error': console.error(line); break;
            case 'warn': console.warn(line); break;
            default: console.log(line);
        }
    },
};

let activeHook: ObservabilityHook = consoleHook;

export function setObservabilityHook(hook: ObservabilityHook): void {
    activeHook = hook;
}

export function getObservabilityHook(): ObservabilityHook {
    return activeHook;
}

export function emitEvent(event: string, level: ObservabilityEvent['level'], context: Record<string, unknown>, duration_ms?: number): void {
    activeHook.emit({
        timestamp: new Date().toISOString(),
        event,
        level,
        context,
        duration_ms,
    });
}
