import { Repository } from './types';
import { getStore, withStoreWrite } from '../store';
import { Room, Message, Handoff, Document, Booking, Followup, ParseReview, AuditLog } from '../types';

export class JsonStoreRepository implements Repository {
    // ── Rooms ──────────────────────────────────────────────

    async findRooms(propertyId: string): Promise<Room[]> {
        const store = getStore();
        return store.rooms.filter(r => r.property_id === propertyId);
    }

    async findRoomById(propertyId: string, roomId: string): Promise<Room | null> {
        const store = getStore();
        return store.rooms.find(r => r.property_id === propertyId && r.id === roomId) ?? null;
    }

    async updateRoom(propertyId: string, roomId: string, updates: Partial<Room>): Promise<Room> {
        return withStoreWrite(store => {
            const index = store.rooms.findIndex(r => r.property_id === propertyId && r.id === roomId);
            if (index === -1) {
                throw new Error(`Room not found: ${propertyId}/${roomId}`);
            }
            Object.assign(store.rooms[index], updates);
            return store.rooms[index];
        });
    }

    // ── Messages ───────────────────────────────────────────

    async findMessages(propertyId: string): Promise<Message[]> {
        const store = getStore();
        return store.messages.filter(m => m.property_id === propertyId);
    }

    async createMessage(message: Message): Promise<Message> {
        return withStoreWrite(store => {
            store.messages.push(message);
            return message;
        });
    }

    // ── Handoffs ───────────────────────────────────────────

    async findHandoffs(propertyId: string): Promise<Handoff[]> {
        const store = getStore();
        return store.handoffs.filter(h => h.property_id === propertyId);
    }

    async createHandoff(handoff: Handoff): Promise<Handoff> {
        return withStoreWrite(store => {
            store.handoffs.push(handoff);
            return handoff;
        });
    }

    // ── Documents ──────────────────────────────────────────

    async findDocuments(propertyId: string): Promise<Document[]> {
        const store = getStore();
        return store.documents.filter(d => d.property_id === propertyId);
    }

    async findDocumentById(propertyId: string, docId: string): Promise<Document | null> {
        const store = getStore();
        return store.documents.find(d => d.property_id === propertyId && d.id === docId) ?? null;
    }

    async updateDocument(propertyId: string, docId: string, updates: Partial<Document>): Promise<Document> {
        return withStoreWrite(store => {
            const index = store.documents.findIndex(d => d.property_id === propertyId && d.id === docId);
            if (index === -1) {
                throw new Error(`Document not found: ${propertyId}/${docId}`);
            }
            Object.assign(store.documents[index], updates);
            return store.documents[index];
        });
    }

    // ── Bookings ───────────────────────────────────────────

    async findBookings(propertyId: string): Promise<Booking[]> {
        const store = getStore();
        return store.bookings.filter(b => b.property_id === propertyId);
    }

    // ── Followups ──────────────────────────────────────────

    async findFollowups(propertyId: string): Promise<Followup[]> {
        const store = getStore();
        return store.followups.filter(f => f.property_id === propertyId);
    }

    async createFollowup(followup: Followup): Promise<Followup> {
        return withStoreWrite(store => {
            store.followups.push(followup);
            return followup;
        });
    }

    async updateFollowup(propertyId: string, id: string, updates: Partial<Followup>): Promise<Followup> {
        return withStoreWrite(store => {
            const index = store.followups.findIndex(f => f.property_id === propertyId && f.id === id);
            if (index === -1) {
                throw new Error(`Followup not found: ${propertyId}/${id}`);
            }
            Object.assign(store.followups[index], updates);
            return store.followups[index];
        });
    }

    // ── Parse Reviews ──────────────────────────────────────

    async findParseReviews(propertyId: string): Promise<ParseReview[]> {
        const store = getStore();
        return store.parse_reviews.filter(r => r.property_id === propertyId);
    }

    async createParseReview(review: ParseReview): Promise<ParseReview> {
        return withStoreWrite(store => {
            store.parse_reviews.push(review);
            return review;
        });
    }

    async updateParseReview(propertyId: string, id: string, updates: Partial<ParseReview>): Promise<ParseReview> {
        return withStoreWrite(store => {
            const index = store.parse_reviews.findIndex(r => r.property_id === propertyId && r.id === id);
            if (index === -1) {
                throw new Error(`ParseReview not found: ${propertyId}/${id}`);
            }
            Object.assign(store.parse_reviews[index], updates);
            return store.parse_reviews[index];
        });
    }

    // ── Audit Logs ─────────────────────────────────────────

    async findAuditLogs(propertyId: string): Promise<AuditLog[]> {
        const store = getStore();
        return store.audit_logs.filter(l => l.property_id === propertyId);
    }

    async createAuditLog(log: AuditLog): Promise<AuditLog> {
        return withStoreWrite(store => {
            store.audit_logs.push(log);
            return log;
        });
    }

    // ── Transaction ────────────────────────────────────────

    async withTransaction<T>(fn: () => Promise<T>): Promise<T> {
        // JSON store has no real transaction support.
        // withStoreWrite already serialises writes via a queue + file lock,
        // so we simply execute the callback directly.
        return fn();
    }
}
