/**
 * Quota & Rate Limit Calculator
 *
 * Computes 5-hour (primary) and weekly (secondary) rolling quota consumption,
 * deltas, resets, and multi-session concurrency attribution for turns and sessions.
 */

/**
 * Format timestamp to ISO string safely
 */
function toIsoSafe(timestamp) {
  if (!Number.isFinite(timestamp)) return null;
  const ms = timestamp < 1e11 ? timestamp * 1000 : timestamp;
  try {
    return new Date(ms).toISOString();
  } catch {
    return null;
  }
}

/**
 * Parses timestamp from string or number to epoch ms
 */
function parseTimeMs(timeVal) {
  if (!timeVal) return null;
  if (typeof timeVal === 'number' && Number.isFinite(timeVal)) {
    return timeVal < 1e11 ? timeVal * 1000 : timeVal;
  }
  const parsed = Date.parse(timeVal);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Detects how many other sessions had active turns in the same time window
 */
export function detectTurnConcurrency(turnStartedAt, turnEndedAt, currentSessionId, allSessions = []) {
  const startMs = parseTimeMs(turnStartedAt);
  if (!startMs) return { count: 0, sessions: [] };
  // Default window of 2 minutes if turnEndedAt is not explicitly provided
  const endMs = parseTimeMs(turnEndedAt) || (startMs + 120000);

  const concurrentSessions = [];

  for (const session of allSessions) {
    if (session.sessionId === currentSessionId) continue;
    const sessionTurns = session.turns || [];
    const hasOverlap = sessionTurns.some((t) => {
      const tStart = parseTimeMs(t.startedAt);
      if (!tStart) return false;
      const tEnd = tStart + (t.durationMs || 120000);
      return Math.max(startMs, tStart) < Math.min(endMs, tEnd);
    });

    if (hasOverlap) {
      concurrentSessions.push({
        sessionId: session.sessionId,
        threadName: session.threadName || 'Session ' + session.sessionId.substring(0, 8),
        agentType: session.agentType || 'codex',
        agentLabel: session.agentLabel || 'Codex'
      });
    }
  }

  return {
    count: concurrentSessions.length,
    sessions: concurrentSessions
  };
}

/**
 * Detects how many other sessions overlapped this session's lifespan
 */
export function detectSessionConcurrency(session, allSessions = []) {
  const startMs = parseTimeMs(session.createdAt || session.turns?.[0]?.startedAt);
  const endMs = parseTimeMs(session.updatedAt || session.turns?.[session.turns.length - 1]?.startedAt);

  if (!startMs || !endMs) return { count: 0, sessions: [] };

  const concurrentSessions = [];
  for (const other of allSessions) {
    if (other.sessionId === session.sessionId) continue;
    const otherStart = parseTimeMs(other.createdAt || other.turns?.[0]?.startedAt);
    const otherEnd = parseTimeMs(other.updatedAt || other.turns?.[other.turns.length - 1]?.startedAt);
    if (!otherStart || !otherEnd) continue;

    if (Math.max(startMs, otherStart) < Math.min(endMs, otherEnd)) {
      concurrentSessions.push({
        sessionId: other.sessionId,
        threadName: other.threadName || 'Session ' + other.sessionId.substring(0, 8),
        agentType: other.agentType || 'codex',
        agentLabel: other.agentLabel || 'Codex'
      });
    }
  }

  return {
    count: concurrentSessions.length,
    sessions: concurrentSessions
  };
}

/**
 * Calculates quota impact for an individual turn relative to previous snapshot
 */
export function calculateTurnQuotaImpact(currentTurn, previousTurn = null, concurrencyInput = { count: 0, sessions: [] }) {
  const rateLimits = currentTurn?.rateLimits;
  const primary = rateLimits?.primary;
  const secondary = rateLimits?.secondary;

  const count = typeof concurrencyInput === 'number' ? concurrencyInput : (concurrencyInput?.count || 0);
  const concurrentSessions = typeof concurrencyInput === 'number' ? [] : (concurrencyInput?.sessions || []);

  const quotaAvailable = Boolean(
    (primary && Number.isFinite(primary.used_percent)) ||
    (secondary && Number.isFinite(secondary.used_percent))
  );

  if (!quotaAvailable) {
    return {
      available: false,
      primaryUsedPercent: null,
      secondaryUsedPercent: null,
      primaryDeltaPercent: null,
      secondaryDeltaPercent: null,
      primaryResetsAt: null,
      secondaryResetsAt: null,
      concurrentSessionCount: count,
      concurrentSessions,
      isIsolated: count === 0,
      isReset: false
    };
  }

  const primaryUsed = primary && Number.isFinite(primary.used_percent) ? primary.used_percent : null;
  const secondaryUsed = secondary && Number.isFinite(secondary.used_percent) ? secondary.used_percent : null;

  const prevPrimaryUsed = previousTurn?.rateLimits?.primary && Number.isFinite(previousTurn.rateLimits.primary.used_percent)
    ? previousTurn.rateLimits.primary.used_percent
    : null;
  const prevSecondaryUsed = previousTurn?.rateLimits?.secondary && Number.isFinite(previousTurn.rateLimits.secondary.used_percent)
    ? previousTurn.rateLimits.secondary.used_percent
    : null;

  let primaryDelta = null;
  let secondaryDelta = null;
  let isPrimaryReset = false;
  let isSecondaryReset = false;

  const primaryResetOccurred = Boolean(
    primary?.resets_at &&
    previousTurn?.rateLimits?.primary?.resets_at &&
    primary.resets_at !== previousTurn.rateLimits.primary.resets_at
  );

  const secondaryResetOccurred = Boolean(
    secondary?.resets_at &&
    previousTurn?.rateLimits?.secondary?.resets_at &&
    secondary.resets_at !== previousTurn.rateLimits.secondary.resets_at
  );

  if (primaryUsed !== null && prevPrimaryUsed !== null) {
    if (primaryResetOccurred) {
      primaryDelta = primaryUsed;
      isPrimaryReset = true;
    } else {
      primaryDelta = Math.round((primaryUsed - prevPrimaryUsed) * 100) / 100;
      if (primaryDelta < 0) isPrimaryReset = true;
    }
  }

  if (secondaryUsed !== null && prevSecondaryUsed !== null) {
    if (secondaryResetOccurred) {
      secondaryDelta = secondaryUsed;
      isSecondaryReset = true;
    } else {
      secondaryDelta = Math.round((secondaryUsed - prevSecondaryUsed) * 100) / 100;
      if (secondaryDelta < 0) isSecondaryReset = true;
    }
  }

  const isReset = isPrimaryReset || isSecondaryReset;

  return {
    available: true,
    primaryUsedPercent: primaryUsed,
    secondaryUsedPercent: secondaryUsed,
    primaryDeltaPercent: primaryDelta,
    secondaryDeltaPercent: secondaryDelta,
    primaryResetsAt: toIsoSafe(primary?.resets_at),
    secondaryResetsAt: toIsoSafe(secondary?.resets_at),
    concurrentSessionCount: count,
    concurrentSessions,
    isIsolated: count === 0,
    isReset,
    isPrimaryReset,
    isSecondaryReset
  };
}

/**
 * Calculates start-to-end quota consumption for a full session
 */
export function calculateSessionQuotaImpact(session, allSessions = []) {
  const turns = session.turns || [];
  const turnsWithQuota = turns.filter((t) => t.rateLimits && (
    Number.isFinite(t.rateLimits.primary?.used_percent) ||
    Number.isFinite(t.rateLimits.secondary?.used_percent)
  ));

  const sessionRateLimit = session.rateLimits;
  const hasDirectSessionQuota = sessionRateLimit && (
    Number.isFinite(sessionRateLimit.primary?.used_percent) ||
    Number.isFinite(sessionRateLimit.secondary?.used_percent)
  );

  if (turnsWithQuota.length === 0 && !hasDirectSessionQuota) {
    return {
      available: false,
      startPrimaryPercent: null,
      endPrimaryPercent: null,
      primaryDeltaPercent: null,
      startSecondaryPercent: null,
      endSecondaryPercent: null,
      secondaryDeltaPercent: null,
      concurrentSessionCount: 0,
      concurrentSessions: [],
      isIsolated: true,
      isReset: false
    };
  }

  const firstSnapshot = turnsWithQuota[0]?.rateLimits || sessionRateLimit;
  const lastSnapshot = turnsWithQuota[turnsWithQuota.length - 1]?.rateLimits || sessionRateLimit;

  const startPrimary = firstSnapshot?.primary?.used_percent ?? null;
  const endPrimary = lastSnapshot?.primary?.used_percent ?? null;
  const startSecondary = firstSnapshot?.secondary?.used_percent ?? null;
  const endSecondary = lastSnapshot?.secondary?.used_percent ?? null;

  let primaryDelta = null;
  let secondaryDelta = null;
  let isPrimaryReset = false;
  let isSecondaryReset = false;

  const primaryResetOccurred = Boolean(
    lastSnapshot?.primary?.resets_at &&
    firstSnapshot?.primary?.resets_at &&
    lastSnapshot.primary.resets_at !== firstSnapshot.primary.resets_at
  );

  const secondaryResetOccurred = Boolean(
    lastSnapshot?.secondary?.resets_at &&
    firstSnapshot?.secondary?.resets_at &&
    lastSnapshot.secondary.resets_at !== firstSnapshot.secondary.resets_at
  );

  if (startPrimary !== null && endPrimary !== null) {
    if (primaryResetOccurred) {
      primaryDelta = endPrimary;
      isPrimaryReset = true;
    } else {
      primaryDelta = Math.round((endPrimary - startPrimary) * 100) / 100;
      if (primaryDelta < 0) isPrimaryReset = true;
    }
  }

  if (startSecondary !== null && endSecondary !== null) {
    if (secondaryResetOccurred) {
      secondaryDelta = endSecondary;
      isSecondaryReset = true;
    } else {
      secondaryDelta = Math.round((endSecondary - startSecondary) * 100) / 100;
      if (secondaryDelta < 0) isSecondaryReset = true;
    }
  }

  const isReset = isPrimaryReset || isSecondaryReset;

  const concurrency = detectSessionConcurrency(session, allSessions);

  return {
    available: true,
    startPrimaryPercent: startPrimary,
    endPrimaryPercent: endPrimary,
    primaryDeltaPercent: primaryDelta,
    startSecondaryPercent: startSecondary,
    endSecondaryPercent: endSecondary,
    secondaryDeltaPercent: secondaryDelta,
    concurrentSessionCount: concurrency.count,
    concurrentSessions: concurrency.sessions,
    isIsolated: concurrency.count === 0,
    isReset,
    isPrimaryReset,
    isSecondaryReset
  };
}

/**
 * Enriches all sessions and their turns with standardized quota telemetry
 */
export function enrichSessionsWithQuota(sessions) {
  if (!Array.isArray(sessions)) return [];

  return sessions.map((session) => {
    const turns = (session.turns || []).map((turn, index, arr) => {
      const prevTurn = index > 0 ? arr[index - 1] : null;
      const nextTurn = index < arr.length - 1 ? arr[index + 1] : null;
      const concurrency = detectTurnConcurrency(
        turn.startedAt,
        nextTurn?.startedAt,
        session.sessionId,
        sessions
      );
      const quotaImpact = calculateTurnQuotaImpact(turn, prevTurn, concurrency);
      return {
        ...turn,
        quotaImpact
      };
    });

    const sessionWithTurns = { ...session, turns };
    const quotaImpact = calculateSessionQuotaImpact(sessionWithTurns, sessions);

    return {
      ...sessionWithTurns,
      quotaImpact
    };
  });
}
