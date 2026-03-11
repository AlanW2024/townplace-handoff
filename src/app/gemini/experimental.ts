export const GEMINI_EXPERIMENTAL_BADGE = '純設計實驗場';
export const GEMINI_EXPERIMENTAL_NOTE = '這個 /gemini 路徑只用來比較前端風格與互動氣氛。所有操作只會在目前頁面模擬，不會寫入正式資料。';
export const GEMINI_EXPERIMENTAL_CTA = '需要真正處理資料，請回主線頁面。';

export function createGeminiId(prefix: string): string {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function extractGeminiRooms(text: string): string[] {
    const matches = text.match(/\b\d{1,2}[A-M]\b/gi) || [];
    return Array.from(new Set(matches.map(room => room.toUpperCase())));
}
