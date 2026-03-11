import fs from 'fs';
import path from 'path';
import { Room, Message, Handoff, Document, Booking, Followup, ParseReview, AuditLog, DeptCode, ChatType, ParseEngine } from './types';
import { createAuditLog } from './audit';
import { parseWhatsAppMessage } from './parser';

export interface StoreData {
    rooms: Room[];
    messages: Message[];
    handoffs: Handoff[];
    documents: Document[];
    bookings: Booking[];
    followups: Followup[];
    parse_reviews: ParseReview[];
    audit_logs: AuditLog[];
}

const STORE_PATH = path.join(process.cwd(), '.demo-store.json');
const TMP_STORE_PATH = `${STORE_PATH}.tmp`;
const LOCK_PATH = `${STORE_PATH}.lock`;
const STORE_LOCK_STALE_MS = 30_000;
const STORE_LOCK_TIMEOUT_MS = 5_000;
const STORE_LOCK_POLL_MS = 25;
let writeQueue: Promise<void> = Promise.resolve();
let seedStoreCache: StoreData | null = null;

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function removeLockDir(): void {
    if (fs.existsSync(LOCK_PATH)) {
        fs.rmSync(LOCK_PATH, { recursive: true, force: true });
    }
}

async function acquireStoreLock(): Promise<() => void> {
    const startedAt = Date.now();

    while (true) {
        try {
            fs.mkdirSync(LOCK_PATH);
            fs.writeFileSync(
                path.join(LOCK_PATH, 'owner.json'),
                JSON.stringify({ pid: process.pid, acquired_at: new Date().toISOString() }),
                'utf8'
            );

            let released = false;
            return () => {
                if (released) return;
                released = true;
                try {
                    removeLockDir();
                } catch {}
            };
        } catch (error) {
            const nodeError = error as NodeJS.ErrnoException;
            if (nodeError.code !== 'EEXIST') {
                throw error;
            }

            try {
                const stats = fs.statSync(LOCK_PATH);
                if (Date.now() - stats.mtimeMs > STORE_LOCK_STALE_MS) {
                    removeLockDir();
                    continue;
                }
            } catch {}

            if (Date.now() - startedAt > STORE_LOCK_TIMEOUT_MS) {
                throw new Error('Timed out waiting for store lock');
            }

            await sleep(STORE_LOCK_POLL_MS);
        }
    }
}

function roomNeedsAttention(room: Pick<Room, 'eng_status' | 'clean_status' | 'lease_status' | 'needs_attention'>): boolean {
    return Boolean(
        room.needs_attention ||
        room.eng_status === 'pending' ||
        room.clean_status === 'pending' ||
        room.lease_status === 'checkout'
    );
}

function normalizeRoom(room: Room): Room {
    const needsAttention = roomNeedsAttention(room);
    return {
        ...room,
        needs_attention: needsAttention,
        attention_reason: room.attention_reason ?? (needsAttention ? '需要即時跟進' : null),
    };
}

function inferSeedChatMetadata(senderName: string, rawText: string): { chat_name: string; chat_type: ChatType } {
    const name = senderName.toLowerCase();

    if (name.includes('don ho') || name.includes('housekeeping')) {
        return { chat_name: 'TPSH🤝Ascent', chat_type: 'group' };
    }

    if (name.includes('karen townplace') || name.includes('michael') || name.includes('josephine') || rawText.includes('是日跟進')) {
        return { chat_name: 'TP Soho Con士', chat_type: 'group' };
    }

    if (name.includes('angel') || name.includes('dennis') || name.includes('cindy') || name.includes('karen man')) {
        return { chat_name: senderName, chat_type: 'direct' };
    }

    return { chat_name: 'SOHO 前線🏡🧹🦫🐿️', chat_type: 'group' };
}

// Generate rooms: floors 3-32, units A-M (not all units on every floor)
function generateRooms(): Room[] {
    const rooms: Room[] = [];
    const units = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'J', 'K', 'L', 'M'];
    const types = ['Studio', 'Studio', '1B', '1B', '1B', '2B', 'Studio', '1B', 'Studio', '1B', '2B', 'Studio'];
    const seededAt = new Date().toISOString();

    for (let floor = 3; floor <= 32; floor++) {
        for (let i = 0; i < units.length; i++) {
            const id = `${floor}${units[i]}`;
            rooms.push({
                id,
                floor,
                unit_letter: units[i],
                room_type: types[i],
                eng_status: 'n_a',
                clean_status: 'n_a',
                lease_status: (floor + i) % 3 === 0 ? 'vacant' : 'occupied',
                tenant_name: null,
                lease_start: null,
                lease_end: null,
                notes: null,
                last_updated_at: seededAt,
                last_updated_by: null,
                needs_attention: false,
                attention_reason: null,
            });
        }
    }

    const statusOverrides: Record<string, Partial<Room>> = {
        '10F': { eng_status: 'completed', clean_status: 'pending', lease_status: 'vacant', last_updated_by: 'Vic Lee', needs_attention: true, attention_reason: '待清潔接手' },
        '23D': { eng_status: 'completed', clean_status: 'pending', lease_status: 'vacant', last_updated_by: 'Vic Lee', needs_attention: true, attention_reason: '待清潔接手' },
        '28G': { eng_status: 'completed', clean_status: 'pending', lease_status: 'vacant', last_updated_by: '𝕋𝕒𝕟𝕃', needs_attention: true, attention_reason: '待清潔接手' },
        '28F': { eng_status: 'completed', clean_status: 'pending', lease_status: 'vacant', last_updated_by: '𝕋𝕒𝕟𝕃', needs_attention: true, attention_reason: '待清潔接手' },
        '31J': { eng_status: 'completed', clean_status: 'pending', lease_status: 'vacant', last_updated_by: '𝕋𝕒𝕟𝕃', needs_attention: true, attention_reason: '待清潔接手' },
        '15A': { eng_status: 'completed', clean_status: 'pending', lease_status: 'vacant', last_updated_by: '𝕋𝕒𝕟𝕃', needs_attention: true, attention_reason: '待清潔接手' },
        '19C': { eng_status: 'completed', clean_status: 'pending', lease_status: 'vacant', last_updated_by: '𝕋𝕒𝕟𝕃', needs_attention: true, attention_reason: '待清潔接手' },
        '18A': { eng_status: 'in_progress', clean_status: 'n_a', lease_status: 'vacant', last_updated_by: 'Michael', needs_attention: true, attention_reason: '工程跟進中' },
        '9J': { eng_status: 'completed', clean_status: 'n_a', lease_status: 'occupied', last_updated_by: 'Michael' },
        '25B': { eng_status: 'pending', clean_status: 'n_a', lease_status: 'occupied', last_updated_by: 'Concierge', needs_attention: true, attention_reason: '待工程處理' },
        '22C': { eng_status: 'in_progress', clean_status: 'n_a', lease_status: 'vacant', last_updated_by: 'Concierge', needs_attention: true, attention_reason: '待回覆進度' },
        '29E': { eng_status: 'in_progress', clean_status: 'n_a', lease_status: 'occupied', last_updated_by: 'Concierge', needs_attention: true, attention_reason: '待回覆進度' },
        '3M': { eng_status: 'n_a', clean_status: 'completed', lease_status: 'newlet', last_updated_by: 'Don Ho' },
        '17J': { eng_status: 'n_a', clean_status: 'n_a', lease_status: 'checkout', last_updated_by: 'Concierge', needs_attention: true, attention_reason: '退房後待跟進' },
        '8J': { eng_status: 'n_a', clean_status: 'n_a', lease_status: 'checkout', last_updated_by: 'Concierge', needs_attention: true, attention_reason: '退房後待跟進' },
        '31K': { eng_status: 'completed', clean_status: 'n_a', lease_status: 'occupied', last_updated_by: '𝕋𝕒𝕟𝕃' },
    };

    return rooms.map(room => normalizeRoom({
        ...room,
        ...(statusOverrides[room.id] || {}),
    }));
}

function generateSeedMessages(): Omit<Message, 'parsed_room' | 'parsed_action' | 'parsed_type' | 'confidence' | 'parsed_explanation' | 'parsed_by' | 'parsed_model'>[] {
    const today = new Date();
    const baseTime = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 8, 0, 0);

    const messages = [
        { sender_name: 'Vic Lee', sender_dept: 'eng' as DeptCode, raw_text: '10F 已完成，可清潔', mins: 0 },
        { sender_name: 'Vic Lee', sender_dept: 'eng' as DeptCode, raw_text: '23D 已完成，可清潔(安裝止回閥，掃口，熱水爐安全掣，外判已完成油漆)', mins: 15 },
        { sender_name: '𝕋𝕒𝕟𝕃', sender_dept: 'eng' as DeptCode, raw_text: '28G,28F,31J,15A 完成，可清', mins: 45 },
        { sender_name: 'Michael', sender_dept: 'conc' as DeptCode, raw_text: '18A執修', mins: 60 },
        { sender_name: 'Michael', sender_dept: 'conc' as DeptCode, raw_text: '9J睡房已吱膠(床尾，窗台邊位及燈糟轉角)', mins: 85 },
        { sender_name: 'Concierge', sender_dept: 'conc' as DeptCode, raw_text: '25B 浴室門手柄脫落，客人想今天檢查，師傅哪個時間方便？', mins: 120 },
        { sender_name: 'Concierge', sender_dept: 'conc' as DeptCode, raw_text: '22C個工程要做幾耐，我哋可以試下約客', mins: 150 },
        { sender_name: '𝕋𝕒𝕟𝕃', sender_dept: 'eng' as DeptCode, raw_text: '19C完成可清', mins: 180 },
        { sender_name: 'Concierge', sender_dept: 'conc' as DeptCode, raw_text: '單位29E，維修大約搞幾耐?同幾時乾曬可以沖涼?', mins: 200 },
        { sender_name: 'Don Ho', sender_dept: 'clean' as DeptCode, raw_text: '3M Deep clean完成', mins: 240 },
        { sender_name: 'Karen', sender_dept: 'mgmt' as DeptCode, raw_text: '吉房清潔安排，FYI', mins: 270 },
        { sender_name: 'Karen', sender_dept: 'mgmt' as DeptCode, raw_text: '3M 1/10有in，leasing send咗email但係我哋收唔到', mins: 300 },
        { sender_name: 'Concierge', sender_dept: 'conc' as DeptCode, raw_text: '是日跟進 17 Jul 25\n- 17J已Check out\n- 8J已做Final\n- 31K工程部已調整大門鉸，回復正常(Logged)', mins: 330 },
        { sender_name: 'Kaho', sender_dept: 'hskp' as DeptCode, raw_text: 'House keep 知了', mins: 350 },
        { sender_name: '𝕋𝕒𝕟𝕃', sender_dept: 'eng' as DeptCode, raw_text: '盡做', mins: 355 },
    ];

    return messages.map((message, index) => {
        const sentAt = new Date(baseTime.getTime() + message.mins * 60000);
        const chatMeta = inferSeedChatMetadata(message.sender_name, message.raw_text);
        return {
            id: `msg-${String(index + 1).padStart(3, '0')}`,
            raw_text: message.raw_text,
            sender_name: message.sender_name,
            sender_dept: message.sender_dept,
            wa_group: chatMeta.chat_name,
            chat_name: chatMeta.chat_name,
            chat_type: chatMeta.chat_type,
            sent_at: sentAt.toISOString(),
            created_at: sentAt.toISOString(),
        };
    });
}

function generateSeedDocuments(): Document[] {
    const now = new Date().toISOString();
    return [
        { id: 'doc-001', room_id: '17J', doc_type: 'Surrender', status: 'preparing', current_holder: 'Concierge', days_outstanding: 1, notes: '退房文件處理中', updated_at: now },
        { id: 'doc-002', room_id: '8J', doc_type: 'Surrender', status: 'pending_sign', current_holder: '租客', days_outstanding: 2, notes: '等待租客簽署', updated_at: now },
        { id: 'doc-003', room_id: '3M', doc_type: 'Newlet', status: 'with_company', current_holder: 'Leasing', days_outstanding: 5, notes: '新租文件，已超期', updated_at: now },
        { id: 'doc-004', room_id: '10F', doc_type: 'Inventory', status: 'not_started', current_holder: null, days_outstanding: 0, notes: null, updated_at: now },
        { id: 'doc-005', room_id: '23D', doc_type: 'DRF', status: 'completed', current_holder: null, days_outstanding: 0, notes: '已完成', updated_at: now },
        { id: 'doc-006', room_id: '25B', doc_type: 'TA', status: 'with_tenant', current_holder: '租客', days_outstanding: 4, notes: '等待租客歸還', updated_at: now },
    ];
}

function generateSeedBookings(): Booking[] {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dayAfter = new Date(now);
    dayAfter.setDate(dayAfter.getDate() + 2);

    return [
        { id: 'bk-001', room_id: '10F', facility: null, booking_type: 'viewing', scheduled_at: new Date(tomorrow.setHours(10, 0)).toISOString(), duration_minutes: 30, booked_by: 'Angel', dept: 'lease', notes: '準租客睇樓', created_at: now.toISOString() },
        { id: 'bk-002', room_id: '23D', facility: null, booking_type: 'viewing', scheduled_at: new Date(tomorrow.setHours(14, 0)).toISOString(), duration_minutes: 30, booked_by: 'Dennis', dept: 'lease', notes: null, created_at: now.toISOString() },
        { id: 'bk-003', room_id: null, facility: 'BBQ Area', booking_type: 'tenant_booking', scheduled_at: new Date(dayAfter.setHours(18, 0)).toISOString(), duration_minutes: 120, booked_by: 'Karen Lung', dept: 'comm', notes: '租戶聚會', created_at: now.toISOString() },
        { id: 'bk-004', room_id: '3M', facility: null, booking_type: 'shooting', scheduled_at: new Date(tomorrow.setHours(11, 0)).toISOString(), duration_minutes: 60, booked_by: 'Cindy', dept: 'lease', notes: '拍攝宣傳照', created_at: now.toISOString() },
        { id: 'bk-005', room_id: null, facility: 'Social Kitchen', booking_type: 'event', scheduled_at: new Date(dayAfter.setHours(19, 0)).toISOString(), duration_minutes: 180, booked_by: 'Eva', dept: 'comm', notes: '社區活動', created_at: now.toISOString() },
    ];
}

function generateSeedAuditLogs(documents: Document[], followups: Followup[]): AuditLog[] {
    const documentLogs = documents.map(document =>
        createAuditLog({
            entity_type: 'document',
            entity_id: document.id,
            action: 'created',
            actor: 'Seed Data',
            reason: '初始化示範文件資料',
            from_status: null,
            to_status: document.status,
            created_at: document.updated_at,
        })
    );

    const followupLogs = followups.map(followup =>
        createAuditLog({
            entity_type: 'followup',
            entity_id: followup.id,
            action: 'created',
            actor: 'Seed Data',
            reason: '初始化示範跟進事項',
            from_status: null,
            to_status: followup.status,
            created_at: followup.created_at,
        })
    );

    return [...documentLogs, ...followupLogs];
}

function buildSeedStore(): StoreData {
    const rooms = generateRooms();
    const rawMessages = generateSeedMessages();
    const documents = generateSeedDocuments();
    const bookings = generateSeedBookings();
    const followups: Followup[] = [];
    const messages = rawMessages.map(message => {
        const parsed = parseWhatsAppMessage(message.raw_text, message.sender_name, message.sender_dept);
        return {
            ...message,
            parsed_room: parsed.rooms,
            parsed_action: parsed.action,
            parsed_type: parsed.type,
            confidence: parsed.confidence,
            parsed_explanation: parsed.action
                ? '由規則引擎根據房號、關鍵字與發送者部門推斷。'
                : '規則引擎未能穩定判斷，需人工覆核。',
            parsed_by: 'rules' as ParseEngine,
            parsed_model: 'rule-engine',
        };
    });

    const handoffs: Handoff[] = [];
    for (const message of messages) {
        if (message.parsed_type !== 'handoff' || message.parsed_room.length === 0) continue;

        const parsed = parseWhatsAppMessage(message.raw_text, message.sender_name, message.sender_dept);
        if (!parsed.from_dept || !parsed.to_dept) continue;

        for (const roomId of message.parsed_room) {
            handoffs.push({
                id: `ho-${handoffs.length + 1}`,
                room_id: roomId,
                from_dept: parsed.from_dept,
                to_dept: parsed.to_dept,
                action: parsed.action || '',
                status: 'pending',
                triggered_by: message.id,
                created_at: message.sent_at,
                acknowledged_at: null,
            });
        }
    }

    return {
        rooms,
        messages,
        handoffs,
        documents,
        bookings,
        followups,
        parse_reviews: [],
        audit_logs: generateSeedAuditLogs(documents, followups),
    };
}

function getSeedStore(): StoreData {
    if (!seedStoreCache) {
        seedStoreCache = buildSeedStore();
    }
    return JSON.parse(JSON.stringify(seedStoreCache)) as StoreData;
}

function normalizeStore(rawStore: Partial<StoreData> | null): StoreData {
    const seedStore = getSeedStore();
    const store = rawStore ?? seedStore;

    return {
        rooms: (store.rooms ?? seedStore.rooms).map(room => normalizeRoom({
            ...room,
            needs_attention: room.needs_attention ?? false,
            attention_reason: room.attention_reason ?? null,
        } as Room)),
        messages: (store.messages ?? seedStore.messages).map(message => {
            const chatMeta = inferSeedChatMetadata(message.sender_name, message.raw_text);
            return {
                ...message,
                wa_group: message.wa_group ?? chatMeta.chat_name,
                chat_name: message.chat_name ?? message.wa_group ?? chatMeta.chat_name,
                chat_type: message.chat_type ?? chatMeta.chat_type,
                parsed_explanation: message.parsed_explanation ?? (
                    message.parsed_action
                        ? '由規則引擎根據房號、關鍵字與發送者部門推斷。'
                        : '規則引擎未能穩定判斷，需人工覆核。'
                ),
                parsed_by: (message.parsed_by ?? 'rules') as ParseEngine,
                parsed_model: message.parsed_model ?? (message.parsed_by === 'review' ? 'human-review' : 'rule-engine'),
            };
        }),
        handoffs: store.handoffs ?? seedStore.handoffs,
        documents: store.documents ?? seedStore.documents,
        bookings: store.bookings ?? seedStore.bookings,
        followups: store.followups ?? seedStore.followups,
        parse_reviews: store.parse_reviews ?? seedStore.parse_reviews,
        audit_logs: store.audit_logs ?? seedStore.audit_logs,
    };
}

function readStoreFile(): Partial<StoreData> | null {
    if (!fs.existsSync(STORE_PATH)) {
        return null;
    }

    const text = fs.readFileSync(STORE_PATH, 'utf8');
    try {
        return JSON.parse(text) as Partial<StoreData>;
    } catch (error) {
        throw new Error(`Store file is corrupted: ${(error as Error).message}`);
    }
}

export function saveStore(store: StoreData): void {
    try {
        fs.writeFileSync(TMP_STORE_PATH, JSON.stringify(store, null, 2), 'utf8');
        fs.renameSync(TMP_STORE_PATH, STORE_PATH);
    } catch (error) {
        try {
            if (fs.existsSync(TMP_STORE_PATH)) {
                fs.rmSync(TMP_STORE_PATH, { force: true });
            }
        } catch {}
        throw new Error(`Failed to write store: ${(error as Error).message}`);
    }
}

export function getStore(): StoreData {
    return normalizeStore(readStoreFile());
}

export async function withStoreWrite<T>(mutator: (store: StoreData) => Promise<T> | T): Promise<T> {
    const run = writeQueue.then(async () => {
        const releaseLock = await acquireStoreLock();
        try {
            const store = getStore();
            const result = await mutator(store);
            saveStore(store);
            return result;
        } finally {
            releaseLock();
        }
    });

    writeQueue = run.then(() => undefined, () => undefined);
    return run;
}

export function resetStore(): StoreData {
    const store = getSeedStore();
    saveStore(store);
    return store;
}
