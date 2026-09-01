import { ref, computed, onMounted, onUnmounted } from 'vue';

export function useTokenData() {
  const rawOverview = ref(null);
  const rawSessions = ref([]);
  const diagnosticsResult = ref({ scope: {}, diagnostics: [] });
  const pacingForecast = ref(null);
  const glossary = ref([]);
  const isLoading = ref(true);
  const error = ref(null);
  const selectedSession = ref(null);
  const activeWorkspace = ref('/home/ellol/solutions/clinic-platform');
  const isAutoRefresh = ref(true);

  const activeScopeMode = ref('all'); // 'all', '5hour', 'weekly', 'date', 'session'
  const activeScopeDate = ref(new Date().toISOString().split('T')[0]);
  const activeScopeSessionId = ref('');

  let pollTimer = null;

  // Filtered sessions according to active filter state
  const sessions = computed(() => {
    const all = rawSessions.value || [];
    const mode = activeScopeMode.value;
    const date = activeScopeDate.value;
    const sId = activeScopeSessionId.value;

    if (mode === 'session' && sId) {
      return all.filter(s => s.sessionId === sId || s.meta?.id === sId);
    }
    if (mode === 'date' && date) {
      return all.filter(s => (s.updatedAt || s.meta?.timestamp || '').startsWith(date));
    }
    if (mode === '5hour') {
      const baseTime = date 
        ? new Date(date + 'T23:59:59Z').getTime() 
        : (all[0]?.updatedAt ? new Date(all[0].updatedAt).getTime() : Date.now());
      const fiveHoursAgo = baseTime - (5 * 60 * 60 * 1000);
      return all.filter(s => {
        const sTime = new Date(s.updatedAt || s.meta?.timestamp || 0).getTime();
        return sTime >= fiveHoursAgo && sTime <= baseTime;
      });
    }
    if (mode === 'weekly') {
      const baseTime = date 
        ? new Date(date + 'T23:59:59Z').getTime() 
        : (all[0]?.updatedAt ? new Date(all[0].updatedAt).getTime() : Date.now());
      const sevenDaysAgo = baseTime - (7 * 24 * 60 * 60 * 1000);
      return all.filter(s => {
        const sTime = new Date(s.updatedAt || s.meta?.timestamp || 0).getTime();
        return sTime >= sevenDaysAgo && sTime <= baseTime;
      });
    }
    return all;
  });

  // Dynamically computed metrics for the filtered state
  const overview = computed(() => {
    if (activeScopeMode.value === 'all') {
      return rawOverview.value;
    }

    const currentSessions = sessions.value;
    let totalInput = 0;
    let totalCached = 0;
    let totalOutput = 0;
    let totalReasoning = 0;
    let totalTokens = 0;

    for (const s of currentSessions) {
      totalInput += s.totalUsage?.input_tokens || 0;
      totalCached += s.totalUsage?.cached_input_tokens || 0;
      totalOutput += s.totalUsage?.output_tokens || 0;
      totalReasoning += s.totalUsage?.reasoning_output_tokens || 0;
      totalTokens += s.totalUsage?.total_tokens || 0;
    }

    const cacheHitRate = totalInput > 0 ? (totalCached / totalInput) * 100 : 0;
    const estimatedSavingsDollars = ((totalCached / 1000000) * 1.25).toFixed(2);

    return {
      totalSessions: currentSessions.length,
      totalTokens,
      totalInput,
      totalCached,
      totalOutput,
      totalReasoning,
      cacheHitRate: Math.round(cacheHitRate * 10) / 10,
      estimatedSavingsDollars,
      latestRateLimit: rawOverview.value?.latestRateLimit || {
        primary: { used_percent: 0, window_minutes: 300, resets_at: Date.now() / 1000 + 18000 },
        secondary: { used_percent: 0, window_minutes: 10080, resets_at: Date.now() / 1000 + 604800 },
        plan_type: 'plus'
      }
    };
  });

  const diagnostics = computed(() => diagnosticsResult.value?.diagnostics || []);
  const diagnosticScope = computed(() => diagnosticsResult.value?.scope || {});

  async function fetchDiagnostics(scope = activeScopeMode.value, date = activeScopeDate.value, sessionId = activeScopeSessionId.value) {
    try {
      const params = new URLSearchParams({
        scope,
        targetProjectPath: activeWorkspace.value
      });
      if (date && (scope === 'date' || scope === '5hour' || scope === 'weekly')) {
        params.set('date', date);
      }
      if (sessionId && scope === 'session') {
        params.set('sessionId', sessionId);
      }

      const res = await fetch(`/api/diagnostics?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        diagnosticsResult.value = data.diagnostics ? data : { scope: { mode: scope }, diagnostics: data };
      }
    } catch (e) {
      // fallback
    }
  }

  async function fetchAll() {
    try {
      const [overviewRes, sessionsRes, pacingRes, glossaryRes] = await Promise.all([
        fetch('/api/overview'),
        fetch('/api/sessions'),
        fetch('/api/pacing-forecast'),
        fetch('/api/glossary')
      ]);

      if (overviewRes.ok) rawOverview.value = await overviewRes.json();
      if (sessionsRes.ok) rawSessions.value = await sessionsRes.json();
      if (pacingRes.ok) pacingForecast.value = await pacingRes.json();
      if (glossaryRes.ok) glossary.value = await glossaryRes.json();

      await fetchDiagnostics();

      error.value = null;
    } catch (err) {
      error.value = err.message;
    } finally {
      isLoading.value = false;
    }
  }

  function setScope(mode, date = activeScopeDate.value, sessionId = activeScopeSessionId.value) {
    activeScopeMode.value = mode;
    activeScopeDate.value = date;
    activeScopeSessionId.value = sessionId;
    return fetchDiagnostics(mode, date, sessionId);
  }

  function startPolling(interval = 5000) {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(() => {
      if (isAutoRefresh.value) {
        fetchAll();
      }
    }, interval);
  }

  function stopPolling() {
    if (pollTimer) clearInterval(pollTimer);
  }

  onMounted(() => {
    fetchAll();
    startPolling(5000);
  });

  onUnmounted(() => {
    stopPolling();
  });

  return {
    rawOverview,
    rawSessions,
    overview,
    sessions,
    diagnostics,
    diagnosticScope,
    activeScopeMode,
    activeScopeDate,
    activeScopeSessionId,
    pacingForecast,
    glossary,
    isLoading,
    error,
    selectedSession,
    activeWorkspace,
    isAutoRefresh,
    setScope,
    fetchDiagnostics,
    refresh: fetchAll
  };
}
