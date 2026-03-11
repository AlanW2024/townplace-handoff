import { DeptCode } from '../types';
import {
    ActionPatternConfig,
    DocumentPipelineConfig,
    HandoffPolicy,
    NotificationThresholds,
    PolicyConfig,
    ReviewPolicy,
    RoomStatusRule,
} from './types';

// ===========================
// Extracted from parser.ts ACTION_PATTERNS (lines 44-155)
// ===========================
export const DEFAULT_ACTION_PATTERNS: ActionPatternConfig[] = [
    {
        keywords: ['已?完成.*可清', '完成[,，]?\\s*可清', '完成.*可清潔', '可清潔', '可清$'],
        action: '工程完成 → 可清潔',
        type: 'handoff',
        from_dept: 'eng',
        to_dept: 'clean',
    },
    {
        keywords: ['[Dd]eep\\s*clean.*完成', '深層清潔.*完成'],
        action: '深層清潔完成',
        type: 'update',
        from_dept: 'clean',
    },
    {
        keywords: ['清潔完成', '清潔.*完成', 'clean.*done', 'clean.*完成'],
        action: '清潔完成',
        type: 'update',
        from_dept: 'clean',
    },
    {
        keywords: ['執修', '維修', 'repair'],
        action: '執修中',
        type: 'update',
        from_dept: 'conc',
        to_dept: 'eng',
    },
    {
        keywords: ['脫落', '壞', '漏水', '滴水', '損壞', '爆', '裂'],
        action: '報修 — 需要維修',
        type: 'request',
        to_dept: 'eng',
    },
    {
        keywords: ['[Cc]heck\\s*out', '退房', 'checkout'],
        action: '退房',
        type: 'trigger',
    },
    {
        keywords: ['[Cc]heck\\s*in', '入住', 'checkin', '有in'],
        action: '入住',
        type: 'trigger',
    },
    {
        keywords: ['[Ff]inal', '最後檢查'],
        action: 'Final 檢查',
        type: 'update',
    },
    {
        keywords: ['DRF'],
        action: 'DRF 文件',
        type: 'update',
    },
    {
        keywords: ['\\bTA\\b'],
        action: 'TA 文件',
        type: 'update',
    },
    {
        keywords: ['[Ss]urrender'],
        action: 'Surrender 文件',
        type: 'update',
    },
    {
        keywords: ['[Ii]nventory'],
        action: 'Inventory 文件',
        type: 'update',
    },
    {
        keywords: ['[Vv]iewing', '睇樓', '參觀'],
        action: '預約睇樓',
        type: 'trigger',
        to_dept: 'lease',
    },
    {
        keywords: ['吱膠', '打膠'],
        action: '吱膠工程',
        type: 'update',
        from_dept: 'eng',
    },
    {
        keywords: ['幾耐', '幾時', '要做幾', '幾長時間'],
        action: '查詢進度',
        type: 'query',
    },
    {
        keywords: ['知了', '收到', '\\bnoted\\b', '\\bok\\b', '好的'],
        action: '已確認',
        type: 'update',
    },
    {
        keywords: ['清潔安排', '吉房清潔'],
        action: '清潔安排通知',
        type: 'trigger',
        from_dept: 'mgmt',
        to_dept: 'clean',
    },
];

// ===========================
// Extracted from parser.ts STAFF_DEPT_MAP (lines 7-22)
// ===========================
export const DEFAULT_STAFF_DIRECTORY: Record<string, DeptCode> = {
    '𝕋𝕒𝕟𝕃': 'eng', 'tanl': 'eng', 'vic lee': 'eng', 'vic': 'eng',
    '𝕋𝕒𝕟𝕃.𝕊𝕚𝕝𝕒𝕤': 'eng',
    'kaho': 'eng', 'g.a.r.y': 'eng', 'gary eng': 'eng',
    'kaho tp soho': 'eng',
    'wing哥': 'eng', 'wing': 'eng', '阿豪': 'eng',
    'michael': 'conc', 'michael townplace': 'conc', 'josephine': 'conc', 'tp-josephine': 'conc', 'kelvin': 'conc', 'kelvin tpsoho': 'conc',
    '艾倫黃': 'conc', 'renee': 'conc', 'renee tp soho': 'conc', 'gary': 'conc', 'concierge': 'conc', '[ concierge ] townplace soho': 'conc',
    'ooo': 'hskp', '英姐': 'hskp', 'nana': 'hskp', '洛': 'hskp', 'lok': 'hskp', 'housekeeping': 'hskp',
    'don ho': 'clean', 'don': 'clean', 'hugo': 'clean', '+852 9771 1310': 'clean',
    'karen townplace': 'mgmt', 'karen chan soho': 'mgmt', 'karen chan': 'mgmt',
    'karen': 'mgmt', 'alice': 'mgmt', 'tp-alice': 'mgmt', 'tp staff karen(duty)': 'mgmt',
    'angel': 'lease', 'dennis': 'lease', 'cindy': 'lease', 'karen man': 'lease',
    'karen lung': 'comm', 'eva': 'comm',
    'eric': 'security',
};

// ===========================
// Extracted from message-parsing.ts (lines 5-7)
// ===========================
export const DEFAULT_HANDOFF_POLICY: HandoffPolicy = {
    positivePatterns: [
        '可清(?:潔)?',
        'ready\\s*for\\s*clean(?:ing)?',
        '不影響可清(?:潔)?',
    ],
    negativePatterns: [
        '(?:仲)?未可清(?:潔)?',
        '暫時唔可清(?:潔)?',
        '唔可清(?:潔)?',
        '不可清(?:潔)?',
        'not\\s+ready\\s+for\\s*clean(?:ing)?',
    ],
    futurePatterns: [
        '(?:明天|聽日|稍後|稍后|之後|遲啲|遲些|later|tomorrow|afterwards|later\\s+on)\\s*(?:先)?\\s*(?:可以)?\\s*(?:ready\\s*for\\s*clean(?:ing)?|可清(?:潔)?)',
        '(?:ready\\s*for\\s*clean(?:ing)?|可清(?:潔)?).{0,8}(?:明天|聽日|稍後|稍后|之後|遲啲|遲些|later|tomorrow|afterwards|later\\s+on)',
    ],
};

// ===========================
// Review policy
// ===========================
export const DEFAULT_REVIEW_POLICY: ReviewPolicy = {
    minConfidence: 0.75,
    alwaysReviewSummary: true,
    alwaysReviewAmbiguousCompletion: true,
    alwaysReviewFutureHandoff: true,
};

// ===========================
// Document pipeline
// ===========================
export const DEFAULT_DOCUMENT_PIPELINE: DocumentPipelineConfig = {
    statuses: ['not_started', 'preparing', 'pending_sign', 'with_tenant', 'with_company', 'completed'],
    maxStepSize: 1,
};

// ===========================
// Notification thresholds (from notifications.ts)
// ===========================
export const DEFAULT_NOTIFICATION_THRESHOLDS: NotificationThresholds = {
    handoffTimeoutMs: 2 * 60 * 60 * 1000,
    docOverdueCriticalDays: 5,
    docOverdueWarningDays: 3,
    bookingConflictLookaheadMs: 48 * 60 * 60 * 1000,
    bookingConflictGraceMs: 12 * 60 * 60 * 1000,
    followupDueLookaheadMs: 24 * 60 * 60 * 1000,
};

// ===========================
// Room status rules (from ingest.ts lines 228-324)
// ===========================
export const DEFAULT_ROOM_STATUS_RULES: RoomStatusRule[] = [
    {
        action: '工程完成 → 可清潔',
        apply: (room) => {
            room.eng_status = 'completed';
            room.clean_status = 'pending';
            room.needs_attention = true;
            room.attention_reason = '待清潔接手';
        },
    },
    {
        action: '工程完成',
        apply: (room) => {
            room.eng_status = 'completed';
            room.needs_attention = false;
            room.attention_reason = null;
        },
    },
    {
        action: '部分工程完成',
        apply: (room) => {
            if (room.clean_status !== 'pending') {
                room.eng_status = 'in_progress';
            }
            room.needs_attention = true;
            room.attention_reason = '已完成部分工程，未可清';
        },
    },
    {
        action: '工程進度更新',
        apply: (room) => {
            if (room.clean_status !== 'pending') {
                room.eng_status = 'in_progress';
            }
            room.needs_attention = true;
            room.attention_reason = '工程仍在進行，未可清';
        },
    },
    {
        action: '深層清潔完成',
        apply: (room) => {
            room.clean_status = 'completed';
            if (room.lease_status !== 'checkout') {
                room.needs_attention = false;
                room.attention_reason = null;
            }
        },
    },
    {
        action: '清潔完成',
        apply: (room) => {
            room.clean_status = 'completed';
            if (room.lease_status !== 'checkout') {
                room.needs_attention = false;
                room.attention_reason = null;
            }
        },
    },
    {
        action: '執修中',
        apply: (room) => {
            room.eng_status = 'in_progress';
            room.needs_attention = true;
            room.attention_reason = '工程跟進中';
        },
    },
    {
        action: '報修 — 需要維修',
        apply: (room) => {
            room.eng_status = 'pending';
            room.needs_attention = true;
            room.attention_reason = '待工程處理';
        },
    },
    {
        action: '退房',
        apply: (room) => {
            room.lease_status = 'checkout';
            room.needs_attention = true;
            room.attention_reason = '退房後待跟進';
        },
    },
    {
        action: '入住',
        apply: (room) => {
            room.lease_status = 'newlet';
            room.needs_attention = true;
            room.attention_reason = '入住前準備';
        },
    },
    {
        action: '吱膠工程',
        apply: (room) => {
            if (room.eng_status === 'n_a') {
                room.eng_status = 'in_progress';
            }
            room.needs_attention = true;
            room.attention_reason = '工程跟進中';
        },
    },
    {
        action: '清潔安排通知',
        apply: (room) => {
            if (room.clean_status === 'n_a') {
                room.clean_status = 'pending';
            }
            room.needs_attention = true;
            room.attention_reason = '已安排清潔';
        },
    },
    {
        action: '查詢進度',
        apply: (room) => {
            room.needs_attention = true;
            room.attention_reason = '待回覆進度';
        },
    },
];

// ===========================
// Complete default policy
// ===========================
export const DEFAULT_POLICY: PolicyConfig = {
    actionPatterns: DEFAULT_ACTION_PATTERNS,
    staffDirectory: DEFAULT_STAFF_DIRECTORY,
    handoffPolicy: DEFAULT_HANDOFF_POLICY,
    reviewPolicy: DEFAULT_REVIEW_POLICY,
    documentPipeline: DEFAULT_DOCUMENT_PIPELINE,
    notificationThresholds: DEFAULT_NOTIFICATION_THRESHOLDS,
    roomStatusRules: DEFAULT_ROOM_STATUS_RULES,
};

// ===========================
// Utility: merge partial policy with defaults
// ===========================
export function mergePolicy(partial: Partial<PolicyConfig>): PolicyConfig {
    return {
        actionPatterns: partial.actionPatterns ?? DEFAULT_POLICY.actionPatterns,
        staffDirectory: partial.staffDirectory
            ? { ...DEFAULT_POLICY.staffDirectory, ...partial.staffDirectory }
            : DEFAULT_POLICY.staffDirectory,
        handoffPolicy: partial.handoffPolicy
            ? { ...DEFAULT_POLICY.handoffPolicy, ...partial.handoffPolicy }
            : DEFAULT_POLICY.handoffPolicy,
        reviewPolicy: partial.reviewPolicy
            ? { ...DEFAULT_POLICY.reviewPolicy, ...partial.reviewPolicy }
            : DEFAULT_POLICY.reviewPolicy,
        documentPipeline: partial.documentPipeline
            ? { ...DEFAULT_POLICY.documentPipeline, ...partial.documentPipeline }
            : DEFAULT_POLICY.documentPipeline,
        notificationThresholds: partial.notificationThresholds
            ? { ...DEFAULT_POLICY.notificationThresholds, ...partial.notificationThresholds }
            : DEFAULT_POLICY.notificationThresholds,
        roomStatusRules: partial.roomStatusRules ?? DEFAULT_POLICY.roomStatusRules,
    };
}
