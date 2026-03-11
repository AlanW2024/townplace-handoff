import { AiExtractedEventType, AiMessageClassification, ParseEngine, RoomReference } from '../types';

export interface BatchMessageView {
    id: string;
    raw_text: string;
    sender_name: string;
    sender_dept: string;
    sent_at: string;
    chat_name: string;
    parsed_room_refs: RoomReference[];
    parsed_action: string | null;
    parsed_type: string | null;
    confidence: number;
}

export interface BatchMessageClassification {
    message_id: string;
    classification: AiMessageClassification;
    reason: string;
}

export interface BatchEventCandidate {
    event_type: AiExtractedEventType;
    title: string;
    description: string;
    room_refs: RoomReference[];
    confidence: number;
    evidence_message_ids: string[];
}

export interface BatchChunkAnalysis {
    message_classifications: BatchMessageClassification[];
    events: BatchEventCandidate[];
    summary_digest: string;
    provider: ParseEngine | 'fallback';
    model: string | null;
}
