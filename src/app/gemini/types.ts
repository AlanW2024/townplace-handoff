export type DeptCode = 'eng' | 'conc' | 'clean' | 'hskp' | 'mgmt' | 'lease' | 'comm' | 'security';

export const DEPT_INFO: Record<DeptCode, { name: string; color: string }> = {
    eng: { name: '工程部', color: '#F59E0B' },
    conc: { name: '禮賓部', color: '#3B82F6' },
    clean: { name: '清潔部', color: '#10B981' },
    hskp: { name: '房務部', color: '#10B981' },
    mgmt: { name: '管理層', color: '#8B5CF6' },
    lease: { name: '租務部', color: '#EC4899' },
    comm: { name: '社區部', color: '#EF4444' },
    security: { name: '保安部', color: '#6B7280' },
};

export interface Room {
    id: string;              
    floor: number;
    unit_letter: string;
    room_type: string;       
    eng_status: 'completed' | 'in_progress' | 'pending' | 'n_a';
    clean_status: 'completed' | 'in_progress' | 'pending' | 'n_a';
    lease_status: 'occupied' | 'vacant' | 'newlet' | 'checkout';
    needs_attention: boolean;
    attention_reason: string | null;
    last_updated_by: string | null;
}

export interface Message {
    id: string;
    raw_text: string;
    sender_name: string;
    sender_dept: DeptCode;
    chat_name: string;
    chat_type: 'group' | 'direct';
    sent_at: string;         
    parsed_room: string[];
    parsed_action: string | null;
    parsed_type: 'handoff' | 'request' | 'update' | 'trigger' | 'query' | 'escalation' | null;
    confidence: number;      
}

export interface Handoff {
    id: string;
    room_id: string;
    from_dept: DeptCode;
    to_dept: DeptCode;
    action: string;
    status: 'pending' | 'acknowledged' | 'completed';
    created_at: string;
}

export interface AuditLog {
    id: string;
    entity_type: 'document' | 'followup';
    action: 'created' | 'status_advanced' | 'status_reverted' | 'status_changed' | 'field_updated';
    actor: string;
    reason: string;
    from_status: string | null;
    to_status: string | null;
    created_at: string;
}

export interface Document {
    id: string;
    room_id: string;
    doc_type: 'DRF' | 'TA' | 'Surrender' | 'Inventory' | 'Newlet';
    status: 'not_started' | 'preparing' | 'pending_sign' | 'with_tenant' | 'with_company' | 'completed';
    current_holder: string | null;
    days_outstanding: number;
    notes: string | null;
    audit_logs: AuditLog[];  
    last_log: AuditLog | null;
}

export interface Suggestion {
    id: string;
    priority: 'urgent' | 'warning' | 'info';
    category: string;
    title: string;
    description: string;
    affected_rooms: string[];
    recommended_action: string;
}

export interface Followup {
    id: string;
    title: string;
    description: string;
    priority: 'urgent' | 'warning' | 'info';
    assigned_dept: DeptCode;
    status: 'open' | 'in_progress' | 'done' | 'dismissed';
    due_at: string | null;
    related_rooms: string[];
    audit_logs: AuditLog[];
}

export interface ParseReview {
    id: string;
    raw_text: string;
    sender_name: string;
    sender_dept: DeptCode;
    confidence: number;
    suggested_rooms: string[];
    suggested_action: string | null;
    suggested_type: string | null;
    review_status: 'pending' | 'approved' | 'corrected' | 'dismissed';
}

export interface Notification {
    id: string;
    type: string;
    level: 'critical' | 'warning' | 'info';
    title: string;
    body: string;
    related_rooms: string[];
    related_dept: DeptCode;
    created_at: string;
}

export interface Booking {
    id: string;
    room_id: string | null;
    facility: string | null;
    booking_type: 'viewing' | 'shooting' | 'event' | 'tenant_booking';
    scheduled_at: string;
    duration_minutes: number;
    booked_by: string;
    dept: DeptCode;
    notes: string | null;
}
