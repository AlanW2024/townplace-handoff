import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { Room } from './types';

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

export function generateId(): string {
    return crypto.randomUUID ? crypto.randomUUID() :
        'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
            const r = (Math.random() * 16) | 0;
            const v = c === 'x' ? r : (r & 0x3) | 0x8;
            return v.toString(16);
        });
}

export function formatTime(dateStr: string): string {
    const d = new Date(dateStr);
    return d.toLocaleTimeString('zh-HK', { hour: '2-digit', minute: '2-digit', hour12: false });
}

export function formatDate(dateStr: string): string {
    const d = new Date(dateStr);
    return d.toLocaleDateString('zh-HK', { month: 'short', day: 'numeric' });
}

export function formatDateTime(dateStr: string): string {
    const d = new Date(dateStr);
    return d.toLocaleDateString('zh-HK', {
        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false
    });
}

export function timeAgo(dateStr: string): string {
    const now = new Date();
    const d = new Date(dateStr);
    const diffMs = now.getTime() - d.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return '剛剛';
    if (diffMins < 60) return `${diffMins} 分鐘前`;
    const diffHrs = Math.floor(diffMins / 60);
    if (diffHrs < 24) return `${diffHrs} 小時前`;
    const diffDays = Math.floor(diffHrs / 24);
    return `${diffDays} 日前`;
}

export function roomNeedsAttention(
    room: Pick<Room, 'eng_status' | 'clean_status' | 'lease_status' | 'needs_attention'>
): boolean {
    return Boolean(
        room.needs_attention ||
        room.eng_status === 'pending' ||
        room.clean_status === 'pending' ||
        room.lease_status === 'checkout'
    );
}

export function deriveRoomAttentionState(
    room: Pick<Room, 'eng_status' | 'clean_status' | 'lease_status'>
): { needs_attention: boolean; attention_reason: string | null } {
    if (room.lease_status === 'checkout') {
        return { needs_attention: true, attention_reason: '退房後待跟進' };
    }

    if (room.eng_status === 'pending') {
        return { needs_attention: true, attention_reason: '待工程處理' };
    }

    if (room.eng_status === 'in_progress') {
        return { needs_attention: true, attention_reason: '工程跟進中' };
    }

    if (room.clean_status === 'pending') {
        return { needs_attention: true, attention_reason: '待清潔接手' };
    }

    if (room.clean_status === 'in_progress') {
        return { needs_attention: true, attention_reason: '已安排清潔' };
    }

    if (room.lease_status === 'newlet') {
        return { needs_attention: true, attention_reason: '入住前準備' };
    }

    return { needs_attention: false, attention_reason: null };
}
