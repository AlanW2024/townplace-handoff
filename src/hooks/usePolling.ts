'use client';

import { useEffect, useRef } from 'react';

export function usePolling(callback: () => void, intervalMs: number) {
    const callbackRef = useRef(callback);
    callbackRef.current = callback;

    useEffect(() => {
        if (intervalMs <= 0) {
            return;
        }

        let timer: ReturnType<typeof setInterval> | null = null;

        function start() {
            if (timer) return;
            timer = setInterval(() => callbackRef.current(), intervalMs);
        }

        function stop() {
            if (timer) {
                clearInterval(timer);
                timer = null;
            }
        }

        function handleVisibility() {
            if (document.hidden) {
                stop();
            } else {
                callbackRef.current();
                start();
            }
        }

        start();
        document.addEventListener('visibilitychange', handleVisibility);

        return () => {
            stop();
            document.removeEventListener('visibilitychange', handleVisibility);
        };
    }, [intervalMs]);
}
