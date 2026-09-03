import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateTurnQuotaImpact,
  calculateSessionQuotaImpact,
  detectTurnConcurrency,
  detectSessionConcurrency,
  enrichSessionsWithQuota
} from '../server/quotaCalculator.js';

describe('Quota Calculator Unit Tests', () => {

  describe('calculateTurnQuotaImpact', () => {
    test('calculates accurate positive 5h and weekly deltas between turns', () => {
      const prevTurn = {
        turnNumber: 1,
        startedAt: '2026-09-02T12:00:00.000Z',
        rateLimits: {
          primary: { used_percent: 10, window_minutes: 300, resets_at: 1788276000 },
          secondary: { used_percent: 25, window_minutes: 10080, resets_at: 1788770000 }
        }
      };

      const currTurn = {
        turnNumber: 2,
        startedAt: '2026-09-02T12:02:00.000Z',
        rateLimits: {
          primary: { used_percent: 14.5, window_minutes: 300, resets_at: 1788276000 },
          secondary: { used_percent: 26.2, window_minutes: 10080, resets_at: 1788770000 }
        }
      };

      const impact = calculateTurnQuotaImpact(currTurn, prevTurn, 0);

      assert.equal(impact.available, true);
      assert.equal(impact.primaryUsedPercent, 14.5);
      assert.equal(impact.secondaryUsedPercent, 26.2);
      assert.equal(impact.primaryDeltaPercent, 4.5);
      assert.equal(impact.secondaryDeltaPercent, 1.2);
      assert.equal(impact.isIsolated, true);
      assert.equal(impact.isReset, false);
      assert.equal(impact.concurrentSessionCount, 0);
    });

    test('detects quota reset or window roll-off when usage drops', () => {
      const prevTurn = {
        turnNumber: 1,
        rateLimits: {
          primary: { used_percent: 85, window_minutes: 300 },
          secondary: { used_percent: 30, window_minutes: 10080 }
        }
      };

      const currTurn = {
        turnNumber: 2,
        rateLimits: {
          primary: { used_percent: 5, window_minutes: 300 },
          secondary: { used_percent: 31, window_minutes: 10080 }
        }
      };

      const impact = calculateTurnQuotaImpact(currTurn, prevTurn, 0);

      assert.equal(impact.available, true);
      assert.equal(impact.primaryDeltaPercent, -80);
      assert.equal(impact.isReset, true);
      assert.equal(impact.isPrimaryReset, true);
    });

    test('correctly calculates delta when provider window resets with new resets_at', () => {
      const prevTurn = {
        turnNumber: 14,
        rateLimits: {
          primary: { used_percent: 44, window_minutes: 300, resets_at: 1788364977 },
          secondary: { used_percent: 48, window_minutes: 10080, resets_at: 1788773928 }
        }
      };

      const currTurn = {
        turnNumber: 15,
        rateLimits: {
          primary: { used_percent: 1, window_minutes: 300, resets_at: 1788451830 },
          secondary: { used_percent: 48, window_minutes: 10080, resets_at: 1788773928 }
        }
      };

      const impact = calculateTurnQuotaImpact(currTurn, prevTurn, 0);

      assert.equal(impact.available, true);
      assert.equal(impact.primaryDeltaPercent, 1);
      assert.equal(impact.secondaryDeltaPercent, 0);
      assert.equal(impact.isReset, true);
      assert.equal(impact.isPrimaryReset, true);
      assert.equal(impact.isSecondaryReset, false);
    });

    test('handles first turn with no previous snapshot', () => {
      const firstTurn = {
        turnNumber: 1,
        rateLimits: {
          primary: { used_percent: 12, window_minutes: 300 },
          secondary: { used_percent: 40, window_minutes: 10080 }
        }
      };

      const impact = calculateTurnQuotaImpact(firstTurn, null, 1);

      assert.equal(impact.available, true);
      assert.equal(impact.primaryUsedPercent, 12);
      assert.equal(impact.secondaryUsedPercent, 40);
      assert.equal(impact.primaryDeltaPercent, null);
      assert.equal(impact.secondaryDeltaPercent, null);
      assert.equal(impact.isIsolated, false);
      assert.equal(impact.concurrentSessionCount, 1);
    });

    test('returns unavailable for sessions without provider rate limits (e.g. Antigravity)', () => {
      const turnWithoutQuota = {
        turnNumber: 1,
        rateLimits: null
      };

      const impact = calculateTurnQuotaImpact(turnWithoutQuota, null, 0);

      assert.equal(impact.available, false);
      assert.equal(impact.primaryUsedPercent, null);
      assert.equal(impact.primaryDeltaPercent, null);
    });
  });

  describe('calculateSessionQuotaImpact', () => {
    test('computes overall session start-to-end quota consumption', () => {
      const session = {
        sessionId: 'test-session-1',
        createdAt: '2026-09-02T12:00:00.000Z',
        updatedAt: '2026-09-02T12:30:00.000Z',
        turns: [
          {
            turnNumber: 1,
            rateLimits: {
              primary: { used_percent: 10 },
              secondary: { used_percent: 20 }
            }
          },
          {
            turnNumber: 2,
            rateLimits: {
              primary: { used_percent: 18 },
              secondary: { used_percent: 22 }
            }
          },
          {
            turnNumber: 3,
            rateLimits: {
              primary: { used_percent: 25 },
              secondary: { used_percent: 24 }
            }
          }
        ]
      };

      const impact = calculateSessionQuotaImpact(session, [session]);

      assert.equal(impact.available, true);
      assert.equal(impact.startPrimaryPercent, 10);
      assert.equal(impact.endPrimaryPercent, 25);
      assert.equal(impact.primaryDeltaPercent, 15);
      assert.equal(impact.startSecondaryPercent, 20);
      assert.equal(impact.endSecondaryPercent, 24);
      assert.equal(impact.secondaryDeltaPercent, 4);
      assert.equal(impact.isIsolated, true);
    });
  });

  describe('Concurrency Detection', () => {
    test('identifies concurrent overlapping sessions', () => {
      const allSessions = [
        {
          sessionId: 'session-A',
          turns: [
            { turnNumber: 1, startedAt: '2026-09-02T12:00:00.000Z', durationMs: 60000 }
          ]
        },
        {
          sessionId: 'session-B',
          turns: [
            { turnNumber: 1, startedAt: '2026-09-02T12:00:30.000Z', durationMs: 60000 }
          ]
        },
        {
          sessionId: 'session-C',
          turns: [
            { turnNumber: 1, startedAt: '2026-09-02T14:00:00.000Z', durationMs: 60000 }
          ]
        }
      ];

      const overlapA = detectTurnConcurrency(
        '2026-09-02T12:00:00.000Z',
        '2026-09-02T12:01:00.000Z',
        'session-A',
        allSessions
      );
      assert.equal(overlapA.count, 1); // session-B overlaps, session-C is 2 hours later
      assert.equal(overlapA.sessions[0].sessionId, 'session-B');

      const overlapC = detectTurnConcurrency(
        '2026-09-02T14:00:00.000Z',
        '2026-09-02T14:01:00.000Z',
        'session-C',
        allSessions
      );
      assert.equal(overlapC.count, 0); // session-C is isolated
      assert.equal(overlapC.sessions.length, 0);
    });
  });

  describe('enrichSessionsWithQuota', () => {
    test('enriches all sessions and turns with quota telemetry', () => {
      const mockSessions = [
        {
          sessionId: 'session-1',
          createdAt: '2026-09-02T10:00:00.000Z',
          updatedAt: '2026-09-02T10:05:00.000Z',
          turns: [
            {
              turnNumber: 1,
              startedAt: '2026-09-02T10:00:00.000Z',
              rateLimits: { primary: { used_percent: 5 }, secondary: { used_percent: 10 } }
            },
            {
              turnNumber: 2,
              startedAt: '2026-09-02T10:02:00.000Z',
              rateLimits: { primary: { used_percent: 8 }, secondary: { used_percent: 11 } }
            }
          ]
        }
      ];

      const enriched = enrichSessionsWithQuota(mockSessions);

      assert.equal(enriched.length, 1);
      assert.equal(enriched[0].quotaImpact.available, true);
      assert.equal(enriched[0].quotaImpact.primaryDeltaPercent, 3);
      assert.equal(enriched[0].turns[1].quotaImpact.primaryDeltaPercent, 3);
      assert.equal(enriched[0].turns[1].quotaImpact.secondaryDeltaPercent, 1);
    });

    test('handles sessions without rate limits gracefully without crashing', () => {
      const antigravitySession = {
        sessionId: 'agy-session-1',
        agentType: 'antigravity',
        turns: [
          { turnNumber: 1, startedAt: '2026-09-02T11:00:00.000Z', rateLimits: null }
        ]
      };

      const enriched = enrichSessionsWithQuota([antigravitySession]);
      assert.equal(enriched.length, 1);
      assert.equal(enriched[0].quotaImpact.available, false);
      assert.equal(enriched[0].turns[0].quotaImpact.available, false);
    });
  });

});
