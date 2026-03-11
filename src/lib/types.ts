// ===========================
// TOWNPLACE SOHO — Type Definitions
// ===========================

export type DeptCode = 'eng' | 'conc' | 'clean' | 'hskp' | 'mgmt' | 'lease' | 'comm' | 'security';

export type EngStatus = 'completed' | 'in_progress' | 'pending' | 'n_a';
export type CleanStatus = 'completed' | 'in_progress' | 'pending' | 'n_a';
export type LeaseStatus = 'occupied' | 'vacant' | 'newlet' | 'checkout';
export type HandoffStatus = 'pending' | 'acknowledged' | 'completed';
export type HandoffType = 'handoff' | 'request' | 'update' | 'trigger' | 'query' | 'escalation';
export type ChatType = 'group' | 'direct';
export type DocType = 'DRF' | 'TA' | 'Surrender' | 'Inventory' | 'Newlet';
export type DocStatus = 'not_started' | 'preparing' | 'pending_sign' | 'with_tenant' | 'with_company' | 'completed';
export type BookingType = 'viewing' | 'shooting' | 'event' | 'tenant_booking';
export type FollowupStatus = 'open' | 'in_progress' | 'done' | 'dismissed';
export type FollowupSourceType = 'suggestion' | 'manual';
export type ParseEngine = 'rules' | 'anthropic' | 'openai' | 'review';
export type AuditEntityType = 'document' | 'followup' | 'handoff';
export type AuditAction = 'created' | 'status_advanced' | 'status_reverted' | 'status_changed' | 'field_updated';

export interface AuditFieldChange {
    field: string;
    from: string | null;
    to: string | null;
}

export interface Room {
    id: string;
    property_id: string;
    floor: number;
    unit_letter: string;
    room_type: string;
    eng_status: EngStatus;
    clean_status: CleanStatus;
    lease_status: LeaseStatus;
    tenant_name: string | null;
    lease_start: string | null;
    lease_end: string | null;
    notes: string | null;
    last_updated_at: string;
    last_updated_by: string | null;
    needs_attention: boolean;
    attention_reason: string | null;
    version: number;
}

export interface Message {
    id: string;
    property_id: string;
    raw_text: string;
    sender_name: string;
    sender_dept: DeptCode;
    wa_group: string;
    chat_name: string;
    chat_type: ChatType;
    sent_at: string;
    parsed_room: string[];
    parsed_action: string | null;
    parsed_type: HandoffType | null;
    confidence: number;
    parsed_explanation: string | null;
    parsed_by: ParseEngine;
    parsed_model: string | null;
    created_at: string;
}

export interface Handoff {
    id: string;
    property_id: string;
    room_id: string;
    from_dept: DeptCode;
    to_dept: DeptCode;
    action: string;
    status: HandoffStatus;
    triggered_by: string;
    created_at: string;
    acknowledged_at: string | null;
    version: number;
}

export interface Document {
    id: string;
    property_id: string;
    room_id: string;
    doc_type: DocType;
    status: DocStatus;
    current_holder: string | null;
    days_outstanding: number;
    notes: string | null;
    updated_at: string;
    version: number;
}

export interface Booking {
    id: string;
    property_id: string;
    room_id: string | null;
    facility: string | null;
    booking_type: BookingType;
    scheduled_at: string;
    duration_minutes: number;
    booked_by: string;
    dept: DeptCode;
    notes: string | null;
    created_at: string;
}

export interface Followup {
    id: string;
    property_id: string;
    title: string;
    description: string;
    source_type: FollowupSourceType;
    source_id: string;
    priority: 'urgent' | 'warning' | 'info';
    assigned_dept: DeptCode;
    assigned_to: string | null;
    related_rooms: string[];
    status: FollowupStatus;
    due_at: string | null;
    created_at: string;
    updated_at: string;
    version: number;
}

export interface AuditLog {
    id: string;
    property_id: string;
    entity_type: AuditEntityType;
    entity_id: string;
    action: AuditAction;
    actor: string;
    actor_id: string | null;
    reason: string;
    from_status: string | null;
    to_status: string | null;
    created_at: string;
    changes?: AuditFieldChange[];
}

export type ReviewStatus = 'pending' | 'approved' | 'corrected' | 'dismissed';

export interface ParseReview {
    id: string;
    property_id: string;
    message_id: string;
    raw_text: string;
    sender_name: string;
    sender_dept: DeptCode;
    confidence: number;
    suggested_rooms: string[];
    suggested_action: string | null;
    suggested_type: HandoffType | null;
    suggested_from_dept: DeptCode | null;
    suggested_to_dept: DeptCode | null;
    reviewed_rooms: string[];
    reviewed_action: string | null;
    reviewed_type: HandoffType | null;
    reviewed_from_dept: DeptCode | null;
    reviewed_to_dept: DeptCode | null;
    review_status: ReviewStatus;
    reviewed_by: string | null;
    reviewed_at: string | null;
    created_at: string;
    updated_at: string;
    version: number;
}

export interface ParseResult {
    rooms: string[];
    action: string | null;
    type: HandoffType | null;
    from_dept: DeptCode | null;
    to_dept: DeptCode | null;
    confidence: number;
    explanation?: string | null;
    engine?: ParseEngine;
    model?: string | null;
}

// ===========================
// Multi-tenancy types
// ===========================

export type UserRole = 'admin' | 'manager' | 'operator' | 'viewer';

export type PermissionAction =
    | 'room:change_status'
    | 'handoff:approve'
    | 'document:edit'
    | 'document:advance'
    | 'followup:close'
    | 'review:approve';

export interface Property {
    id: string;
    name: string;
    address: string;
    floors: { min: number; max: number };
    units: string[];
    created_at: string;
}

export interface User {
    id: string;
    name: string;
    email: string;
    role: UserRole;
    dept: DeptCode | null;
    property_ids: string[];
    is_active: boolean;
    created_at: string;
}

export interface Permission {
    action: PermissionAction;
    allowed: boolean;
    reason?: string;
}

// Department display info
export const DEPT_INFO: Record<DeptCode, { name: string; nameEn: string; color: string; lightColor: string }> = {
    eng: { name: '工程部', nameEn: 'Engineering', color: '#F59E0B', lightColor: '#FEF3C7' },
    conc: { name: '禮賓部', nameEn: 'Concierge', color: '#3B82F6', lightColor: '#DBEAFE' },
    clean: { name: '清潔部', nameEn: 'Cleaning', color: '#10B981', lightColor: '#D1FAE5' },
    hskp: { name: '房務部', nameEn: 'Housekeeping', color: '#10B981', lightColor: '#D1FAE5' },
    mgmt: { name: '管理層', nameEn: 'Management', color: '#8B5CF6', lightColor: '#EDE9FE' },
    lease: { name: '租務部', nameEn: 'Leasing', color: '#EC4899', lightColor: '#FCE7F3' },
    comm: { name: '社區部', nameEn: 'Community', color: '#EF4444', lightColor: '#FEE2E2' },
    security: { name: '保安部', nameEn: 'Security', color: '#6B7280', lightColor: '#F3F4F6' },
};

export const STATUS_LABELS: Record<string, string> = {
    completed: '已完成',
    in_progress: '進行中',
    pending: '待處理',
    n_a: '不適用',
    occupied: '已入住',
    vacant: '空置',
    newlet: '新租',
    checkout: '退房',
    approved: '已批准',
    corrected: '已修正',
    acknowledged: '已確認',
    not_started: '未開始',
    preparing: '準備中',
    pending_sign: '待簽署',
    with_tenant: '租客持有',
    with_company: '公司持有',
    open: '待處理',
    done: '已完成',
    dismissed: '已略過',
};

export const AUDIT_ACTION_LABELS: Record<AuditAction, string> = {
    created: '建立',
    status_advanced: '推進',
    status_reverted: '退回',
    status_changed: '狀態更新',
    field_updated: '欄位更新',
};
