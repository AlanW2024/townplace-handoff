import { Room, Message, Handoff, Document, Booking, Followup, ParseReview, AuditLog } from '../types';

// Future work: this interface is reserved for a real database-backed repository.
// The current app still reads and writes through store.ts directly.
export interface Repository {
    // Rooms
    findRooms(propertyId: string): Promise<Room[]>;
    findRoomById(propertyId: string, roomId: string): Promise<Room | null>;
    updateRoom(propertyId: string, roomId: string, updates: Partial<Room>): Promise<Room>;

    // Messages
    findMessages(propertyId: string): Promise<Message[]>;
    createMessage(message: Message): Promise<Message>;

    // Handoffs
    findHandoffs(propertyId: string): Promise<Handoff[]>;
    createHandoff(handoff: Handoff): Promise<Handoff>;

    // Documents
    findDocuments(propertyId: string): Promise<Document[]>;
    findDocumentById(propertyId: string, docId: string): Promise<Document | null>;
    updateDocument(propertyId: string, docId: string, updates: Partial<Document>): Promise<Document>;

    // Bookings
    findBookings(propertyId: string): Promise<Booking[]>;

    // Followups
    findFollowups(propertyId: string): Promise<Followup[]>;
    createFollowup(followup: Followup): Promise<Followup>;
    updateFollowup(propertyId: string, id: string, updates: Partial<Followup>): Promise<Followup>;

    // Parse Reviews
    findParseReviews(propertyId: string): Promise<ParseReview[]>;
    createParseReview(review: ParseReview): Promise<ParseReview>;
    updateParseReview(propertyId: string, id: string, updates: Partial<ParseReview>): Promise<ParseReview>;

    // Audit Logs
    findAuditLogs(propertyId: string): Promise<AuditLog[]>;
    createAuditLog(log: AuditLog): Promise<AuditLog>;

    // Transaction support
    withTransaction<T>(fn: () => Promise<T>): Promise<T>;
}

export interface RepositoryConfig {
    type: 'json-store';
    // Future: type: 'postgres', connectionString: string
}
