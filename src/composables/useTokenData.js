import { ref, onMounted, onUnmounted } from 'vue';

export function useTokenData() {
  const overview = ref(null);
  const sessions = ref([]);
  const pacingForecast = ref(null);
  const glossary = ref([]);
  const projects = ref([]);
  const guidanceRecords = ref([]);
  const isLoading = ref(true);
  const isRecordsLoading = ref(false);
  const error = ref(null);
  const selectedSession = ref(null);
  const activeWorkspace = ref('/home/ellol/solutions/clinic-platform');
  const isAutoRefresh = ref(true);

  let pollTimer = null;

  async function fetchGuidanceRecords(projectPath = activeWorkspace.value) {
    isRecordsLoading.value = true;
    try {
      const res = await fetch(`/api/guidance-records?projectPath=${encodeURIComponent(projectPath || 'all')}`);
      if (res.ok) {
        guidanceRecords.value = await res.json();
      }
    } catch (err) {
      console.error('Failed to load guidance records:', err);
    } finally {
      isRecordsLoading.value = false;
    }
  }

  async function fetchProjects() {
    try {
      const res = await fetch('/api/projects');
      if (res.ok) {
        projects.value = await res.json();
      }
    } catch (err) {
      console.error('Failed to load tracked projects:', err);
    }
  }

  async function addGuidanceRecord(recordData) {
    try {
      const res = await fetch('/api/guidance-records', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectPath: activeWorkspace.value,
          ...recordData
        })
      });
      if (res.ok) {
        const saved = await res.json();
        guidanceRecords.value.unshift(saved);
        return saved;
      }
      const err = await res.json();
      throw new Error(err.error || 'Failed to save guidance record');
    } catch (e) {
      throw e;
    }
  }

  function setWorkspace(path) {
    activeWorkspace.value = path;
    fetchGuidanceRecords(path);
  }

  async function fetchAll() {
    try {
      const [overviewRes, sessionsRes, pacingRes, glossaryRes, projectsRes] = await Promise.all([
        fetch('/api/overview'),
        fetch('/api/sessions'),
        fetch('/api/pacing-forecast'),
        fetch('/api/glossary'),
        fetch('/api/projects')
      ]);

      if (overviewRes.ok) overview.value = await overviewRes.json();
      if (sessionsRes.ok) sessions.value = await sessionsRes.json();
      if (pacingRes.ok) pacingForecast.value = await pacingRes.json();
      if (glossaryRes.ok) glossary.value = await glossaryRes.json();
      if (projectsRes.ok) projects.value = await projectsRes.json();

      await fetchGuidanceRecords(activeWorkspace.value);

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
    projects,
    guidanceRecords,
    isLoading,
    isRecordsLoading,
    error,
    selectedSession,
    activeWorkspace,
    isAutoRefresh,
    setWorkspace,
    fetchGuidanceRecords,
    addGuidanceRecord,
    refresh: fetchAll
  };
}
