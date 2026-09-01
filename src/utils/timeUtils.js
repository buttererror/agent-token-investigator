export function getSessionTimestamp(session) {
  return new Date(session.updatedAt || session.meta?.timestamp || 0).getTime();
}

/**
 * Returns startTime and endTime in milliseconds for the given scope.
 * 
 * @param {string} scope - '5h', 'today', '24h', '7d', '30d', 'all'
 * @param {number} baseTimeMs - base time for calculations (defaults to Date.now())
 */
export function getTimeRangeBoundary(scope, baseTimeMs = Date.now()) {
  let startTime = 0;
  let endTime = Number.MAX_SAFE_INTEGER;
  let scopeLabel = 'All Recorded History';

  if (!scope || scope === 'all') {
    return { startTime, endTime, scopeLabel };
  }

  if (scope === '5h' || scope === '5hour') {
    startTime = baseTimeMs - (5 * 60 * 60 * 1000);
    endTime = baseTimeMs;
    scopeLabel = 'Latest 5-Hour Window';
  } else if (scope === 'today') {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0); // Local browser/server time
    startTime = todayStart.getTime();
    endTime = baseTimeMs;
    scopeLabel = 'Today';
  } else if (scope === '24h') {
    startTime = baseTimeMs - (24 * 60 * 60 * 1000);
    endTime = baseTimeMs;
    scopeLabel = 'Last 24 Hours';
  } else if (scope === '7d' || scope === 'weekly') {
    startTime = baseTimeMs - (7 * 24 * 60 * 60 * 1000);
    endTime = baseTimeMs;
    scopeLabel = 'Last 7 Days';
  } else if (scope === '30d') {
    startTime = baseTimeMs - (30 * 24 * 60 * 60 * 1000);
    endTime = baseTimeMs;
    scopeLabel = 'Last 30 Days';
  }

  return { startTime, endTime, scopeLabel };
}
