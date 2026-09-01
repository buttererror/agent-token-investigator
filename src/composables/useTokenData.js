import { ref, computed, onMounted, onUnmounted } from 'vue';

export function useTokenData() {
  const overview = ref(null);
  const sessions = ref([]);
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

  const diagnostics = computed(() => diagnosticsResult.value?.diagnostics || []);
  const diagnosticScope = computed(() => diagnosticsResult.value?.scope || {});

  let pollTimer = null;

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

      if (overviewRes.ok) overview.value = await overviewRes.json();
      if (sessionsRes.ok) sessions.value = await sessionsRes.json();
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
