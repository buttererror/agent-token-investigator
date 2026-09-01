import { ref, onMounted, onUnmounted } from 'vue';

export function useTokenData() {
  const overview = ref(null);
  const sessions = ref([]);
  const pacingForecast = ref(null);
  const glossary = ref([]);
  const isLoading = ref(true);
  const error = ref(null);
  const selectedSession = ref(null);
  const activeWorkspace = ref('/home/ellol/solutions/clinic-platform');
  const isAutoRefresh = ref(true);

  let pollTimer = null;

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

      error.value = null;
    } catch (err) {
      error.value = err.message;
    } finally {
      isLoading.value = false;
    }
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
    pacingForecast,
    glossary,
    isLoading,
    error,
    selectedSession,
    activeWorkspace,
    isAutoRefresh,
    refresh: fetchAll
  };
}
