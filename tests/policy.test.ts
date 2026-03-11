import { describe, expect, it } from 'vitest';
import { parseWhatsAppMessage, getDeptFromSender } from '../src/lib/parser';
import { analyzeHandoffSignal } from '../src/lib/message-parsing';
import { applyRoomStatusUpdate, shouldRequireReview } from '../src/lib/ingest';
import {
    DEFAULT_ACTION_PATTERNS,
    DEFAULT_STAFF_DIRECTORY,
    DEFAULT_HANDOFF_POLICY,
    DEFAULT_REVIEW_POLICY,
    DEFAULT_ROOM_STATUS_RULES,
    DEFAULT_POLICY,
    mergePolicy,
} from '../src/lib/policy';

function makeRoom(overrides: Record<string, unknown> = {}) {
    return {
        eng_status: 'n_a',
        clean_status: 'n_a',
        lease_status: 'vacant' as string,
        last_updated_at: new Date().toISOString(),
        last_updated_by: null as string | null,
        needs_attention: false,
        attention_reason: null as string | null,
        ...overrides,
    };
}

describe('Policy Engine', () => {
    // ── Regression: default policy matches original behavior ──

    it('default action patterns produce same result as hardcoded parser', () => {
        const hardcoded = parseWhatsAppMessage('10F 已完成，可清潔', 'Vic Lee', 'eng');
        const withConfig = parseWhatsAppMessage('10F 已完成，可清潔', 'Vic Lee', 'eng', {
            actionPatterns: DEFAULT_ACTION_PATTERNS,
        });

        expect(withConfig.action).toBe(hardcoded.action);
        expect(withConfig.type).toBe(hardcoded.type);
        expect(withConfig.rooms).toEqual(hardcoded.rooms);
        expect(withConfig.confidence).toBe(hardcoded.confidence);
    });

    it('default staff directory produces same result as hardcoded mapping', () => {
        const hardcoded = getDeptFromSender('Vic Lee');
        const withConfig = getDeptFromSender('Vic Lee', DEFAULT_STAFF_DIRECTORY);
        expect(withConfig).toBe(hardcoded);
        expect(withConfig).toBe('eng');
    });

    it('default handoff policy produces same result as hardcoded regex', () => {
        const hardcoded = analyzeHandoffSignal('可清潔');
        const withPolicy = analyzeHandoffSignal('可清潔', DEFAULT_HANDOFF_POLICY);
        expect(withPolicy).toEqual(hardcoded);
    });

    it('default room status rules produce same result as hardcoded switch', () => {
        const roomA = makeRoom();
        const roomB = makeRoom();

        applyRoomStatusUpdate(roomA, '工程完成 → 可清潔', 'eng', 'Test');
        applyRoomStatusUpdate(roomB, '工程完成 → 可清潔', 'eng', 'Test', DEFAULT_ROOM_STATUS_RULES);

        expect(roomB.eng_status).toBe(roomA.eng_status);
        expect(roomB.clean_status).toBe(roomA.clean_status);
        expect(roomB.needs_attention).toBe(roomA.needs_attention);
        expect(roomB.attention_reason).toBe(roomA.attention_reason);
    });

    it('default review policy matches hardcoded thresholds', () => {
        const needsReview = shouldRequireReview(
            { confidence: 0.5, action: '工程進度更新' },
            { isSummary: false, isAmbiguousCompletion: false, hasFutureHandoffLanguage: false }
        );
        const withPolicy = shouldRequireReview(
            { confidence: 0.5, action: '工程進度更新' },
            { isSummary: false, isAmbiguousCompletion: false, hasFutureHandoffLanguage: false },
            DEFAULT_REVIEW_POLICY
        );
        expect(withPolicy).toBe(needsReview);
        expect(withPolicy).toBe(true); // 0.5 < 0.75
    });

    // ── Custom policy changes behavior ──

    it('custom minConfidence changes review threshold', () => {
        // With lower threshold, 0.5 confidence passes
        const relaxed = shouldRequireReview(
            { confidence: 0.5, action: '工程進度更新' },
            { isSummary: false, isAmbiguousCompletion: false, hasFutureHandoffLanguage: false },
            { ...DEFAULT_REVIEW_POLICY, minConfidence: 0.3 }
        );
        expect(relaxed).toBe(false);

        // With higher threshold, 0.8 confidence fails
        const strict = shouldRequireReview(
            { confidence: 0.8, action: '工程進度更新' },
            { isSummary: false, isAmbiguousCompletion: false, hasFutureHandoffLanguage: false },
            { ...DEFAULT_REVIEW_POLICY, minConfidence: 0.9 }
        );
        expect(strict).toBe(true);
    });

    it('custom staff directory maps new staff', () => {
        const customDir = { ...DEFAULT_STAFF_DIRECTORY, 'new person': 'lease' as const };
        expect(getDeptFromSender('New Person', customDir)).toBe('lease');
        // Original still works
        expect(getDeptFromSender('Vic Lee', customDir)).toBe('eng');
    });

    it('custom action patterns add new actions', () => {
        const customPatterns = [
            ...DEFAULT_ACTION_PATTERNS,
            { keywords: ['消毒'], action: '消毒工程', type: 'update' as const, from_dept: 'clean' as const },
        ];
        const result = parseWhatsAppMessage('10F 消毒', undefined, 'clean', { actionPatterns: customPatterns });
        expect(result.action).toBe('消毒工程');
    });

    it('removing patterns prevents matching', () => {
        // Remove the acknowledgment pattern
        const filteredPatterns = DEFAULT_ACTION_PATTERNS.filter(p => p.action !== '已確認');
        const result = parseWhatsAppMessage('收到', undefined, undefined, { actionPatterns: filteredPatterns });
        expect(result.action).not.toBe('已確認');
    });

    it('custom handoff policy adds new positive pattern', () => {
        const customPolicy = {
            ...DEFAULT_HANDOFF_POLICY,
            positivePatterns: [...DEFAULT_HANDOFF_POLICY.positivePatterns, '可以做清潔'],
        };
        const analysis = analyzeHandoffSignal('可以做清潔', customPolicy);
        expect(analysis.hasExplicitPositiveHandoff).toBe(true);
        expect(analysis.allowsImmediateHandoff).toBe(true);

        // Same text with default policy should not match
        const defaultAnalysis = analyzeHandoffSignal('可以做清潔');
        expect(defaultAnalysis.hasExplicitPositiveHandoff).toBe(false);
    });

    it('custom room status rules apply new action', () => {
        const customRules = [
            ...DEFAULT_ROOM_STATUS_RULES,
            {
                action: '消毒完成',
                apply: (room: { clean_status: string; needs_attention: boolean; attention_reason: string | null }) => {
                    room.clean_status = 'completed';
                    room.needs_attention = false;
                    room.attention_reason = null;
                },
            },
        ];
        const room = makeRoom({ clean_status: 'in_progress' });
        applyRoomStatusUpdate(room, '消毒完成', 'clean', 'Test', customRules);
        expect(room.clean_status).toBe('completed');
    });

    // ── mergePolicy ──

    it('mergePolicy preserves defaults for unspecified keys', () => {
        const merged = mergePolicy({ reviewPolicy: { ...DEFAULT_REVIEW_POLICY, minConfidence: 0.5 } });
        expect(merged.staffDirectory).toBe(DEFAULT_POLICY.staffDirectory);
        expect(merged.actionPatterns).toBe(DEFAULT_POLICY.actionPatterns);
        expect(merged.reviewPolicy.minConfidence).toBe(0.5);
        expect(merged.reviewPolicy.alwaysReviewSummary).toBe(true);
    });
});
