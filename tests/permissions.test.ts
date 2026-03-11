import { describe, expect, it } from 'vitest';
import { User } from '../src/lib/types';
import {
    canChangeRoomStatus,
    canApproveHandoff,
    canEditDocument,
    canAdvanceDocument,
    canCloseFollowup,
    canApproveReview,
    assertPermission,
} from '../src/lib/permissions';
import { isAuthenticated } from '../src/lib/auth';

function makeUser(role: User['role'], dept: User['dept'] = null): User {
    return {
        id: `user-${role}`,
        name: role,
        email: `${role}@test.com`,
        role,
        dept,
        property_ids: ['tp-soho'],
        is_active: true,
        created_at: new Date().toISOString(),
    };
}

const admin = makeUser('admin');
const manager = makeUser('manager', 'mgmt');
const engOperator = makeUser('operator', 'eng');
const concOperator = makeUser('operator', 'conc');
const viewer = makeUser('viewer');

describe('Permissions', () => {
    // ── canChangeRoomStatus ──

    it('admin can change any room status', () => {
        expect(canChangeRoomStatus(admin, 'eng').allowed).toBe(true);
        expect(canChangeRoomStatus(admin, 'clean').allowed).toBe(true);
    });

    it('manager can change own dept room status', () => {
        expect(canChangeRoomStatus(manager, 'mgmt').allowed).toBe(true);
    });

    it('manager cannot change other dept room status', () => {
        expect(canChangeRoomStatus(manager, 'eng').allowed).toBe(false);
    });

    it('operator can change own dept room status', () => {
        expect(canChangeRoomStatus(engOperator, 'eng').allowed).toBe(true);
    });

    it('operator cannot change other dept room status', () => {
        expect(canChangeRoomStatus(engOperator, 'clean').allowed).toBe(false);
    });

    it('viewer cannot change room status', () => {
        expect(canChangeRoomStatus(viewer, 'eng').allowed).toBe(false);
        expect(canChangeRoomStatus(viewer, null).allowed).toBe(false);
    });

    // ── canApproveHandoff ──

    it('admin can approve any handoff', () => {
        expect(canApproveHandoff(admin, 'eng').allowed).toBe(true);
    });

    it('manager can approve any handoff', () => {
        expect(canApproveHandoff(manager, 'eng').allowed).toBe(true);
        expect(canApproveHandoff(manager, 'clean').allowed).toBe(true);
    });

    it('operator can approve own dept handoff', () => {
        expect(canApproveHandoff(engOperator, 'eng').allowed).toBe(true);
    });

    it('operator cannot approve other dept handoff', () => {
        expect(canApproveHandoff(engOperator, 'clean').allowed).toBe(false);
    });

    it('viewer cannot approve handoff', () => {
        expect(canApproveHandoff(viewer, 'eng').allowed).toBe(false);
    });

    // ── canEditDocument ──

    it('admin can edit any document', () => {
        expect(canEditDocument(admin, 'conc').allowed).toBe(true);
    });

    it('operator can edit own dept document', () => {
        expect(canEditDocument(concOperator, 'conc').allowed).toBe(true);
    });

    it('operator cannot edit other dept document', () => {
        expect(canEditDocument(concOperator, 'eng').allowed).toBe(false);
    });

    // ── canAdvanceDocument ──

    it('admin and manager can advance document', () => {
        expect(canAdvanceDocument(admin).allowed).toBe(true);
        expect(canAdvanceDocument(manager).allowed).toBe(true);
    });

    it('operator and viewer cannot advance document', () => {
        expect(canAdvanceDocument(engOperator).allowed).toBe(false);
        expect(canAdvanceDocument(viewer).allowed).toBe(false);
    });

    // ── canCloseFollowup ──

    it('operator can close own dept followup', () => {
        expect(canCloseFollowup(engOperator, 'eng').allowed).toBe(true);
    });

    it('operator cannot close other dept followup', () => {
        expect(canCloseFollowup(engOperator, 'clean').allowed).toBe(false);
    });

    // ── canApproveReview ──

    it('admin and manager can approve review', () => {
        expect(canApproveReview(admin).allowed).toBe(true);
        expect(canApproveReview(manager).allowed).toBe(true);
    });

    it('operator and viewer cannot approve review', () => {
        expect(canApproveReview(engOperator).allowed).toBe(false);
        expect(canApproveReview(viewer).allowed).toBe(false);
    });

    // ── assertPermission ──

    it('assertPermission throws on denied permission', () => {
        const denied = canChangeRoomStatus(viewer, 'eng');
        expect(() => assertPermission(denied)).toThrow('只有管理員或相關部門人員');
    });

    it('assertPermission does not throw on allowed permission', () => {
        const allowed = canChangeRoomStatus(admin, 'eng');
        expect(() => assertPermission(allowed)).not.toThrow();
    });

    // ── isAuthenticated (from auth.ts) ──

    it('isAuthenticated returns true for valid cookie value', () => {
        expect(isAuthenticated('authenticated')).toBe(true);
    });

    it('isAuthenticated returns false for invalid/missing cookie value', () => {
        expect(isAuthenticated(undefined)).toBe(false);
        expect(isAuthenticated(null)).toBe(false);
        expect(isAuthenticated('wrong')).toBe(false);
    });
});
