import { DeptCode, DocStatus, HandoffType } from '../types';

export interface ActionPatternConfig {
    keywords: string[];
    action: string;
    type: HandoffType;
    from_dept?: DeptCode;
    to_dept?: DeptCode;
}

export interface StaffMapping {
    aliases: string[];
    dept: DeptCode;
}

export interface HandoffPolicy {
    positivePatterns: string[];
    negativePatterns: string[];
    futurePatterns: string[];
}

export interface ReviewPolicy {
    minConfidence: number;
    alwaysReviewSummary: boolean;
    alwaysReviewAmbiguousCompletion: boolean;
    alwaysReviewFutureHandoff: boolean;
}

export interface DocumentPipelineConfig {
    statuses: DocStatus[];
    maxStepSize: number;
}

export interface NotificationThresholds {
    handoffTimeoutMs: number;
    docOverdueCriticalDays: number;
    docOverdueWarningDays: number;
    bookingConflictLookaheadMs: number;
    bookingConflictGraceMs: number;
    followupDueLookaheadMs: number;
}

export interface RoomStatusRule {
    action: string;
    apply: (room: {
        eng_status: string;
        clean_status: string;
        lease_status: string;
        needs_attention: boolean;
        attention_reason: string | null;
    }) => void;
}

export interface PolicyConfig {
    actionPatterns: ActionPatternConfig[];
    staffDirectory: Record<string, DeptCode>;
    handoffPolicy: HandoffPolicy;
    reviewPolicy: ReviewPolicy;
    documentPipeline: DocumentPipelineConfig;
    notificationThresholds: NotificationThresholds;
    roomStatusRules: RoomStatusRule[];
}
