import { ref, computed, onMounted, onUnmounted } from 'vue';

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

  const getSavedWorkspace = () => {
    try {
      if (typeof localStorage !== 'undefined') {
        const saved = localStorage.getItem('agent_tracker_workspace');
        if (saved) return saved;
      }
    } catch {}
    return 'all';
  };

  const activeWorkspace = ref(getSavedWorkspace());
  const isAutoRefresh = ref(true);

  const filteredSessions = computed(() => {
    if (!activeWorkspace.value || activeWorkspace.value === 'all') {
      return sessions.value;
    }
    const target = activeWorkspace.value.toLowerCase().replace(/[\/\\]+$/, '');
    return sessions.value.filter(s => {
      const cwd = (s.meta?.cwd || '').toLowerCase().replace(/[\/\\]+$/, '');
      return cwd.startsWith(target) || target.startsWith(cwd);
    });
  });

  const filteredOverview = computed(() => {
    const list = filteredSessions.value;
    if (!list.length) {
      return {
        totalTokens: 0,
        totalSessions: 0,
        averageCacheHitRate: 0,
        totalReasoningTokens: 0,
        estimatedCostSaved: 0
      };
    }

    let totalTokens = 0;
    let totalInput = 0;
    let totalCached = 0;
    let totalReasoning = 0;

    for (const s of list) {
      const usage = s.totalUsage || {};
      totalTokens += (usage.total_tokens || 0);
      totalInput += (usage.input_tokens || 0);
      totalCached += (usage.cached_input_tokens || 0);
      totalReasoning += (usage.reasoning_output_tokens || 0);
    }

    const rate = totalInput > 0 ? Math.round((totalCached / totalInput) * 100) : 0;
    const saved = (totalCached / 1000000) * 2.00;

    return {
      totalTokens,
      totalSessions: list.length,
      averageCacheHitRate: rate,
      totalReasoningTokens: totalReasoning,
      estimatedCostSaved: parseFloat(saved.toFixed(2))
    };
  });

  let pollTimer = null;

  async function fetchGuidanceRecords() {
    isRecordsLoading.value = true;
    try {
      const res = await fetch('/api/guidance-records?projectPath=all');
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
        const list = await res.json();
        projects.value = list;
        // If current workspace is not set or not in defaults, verify
        if (!activeWorkspace.value && list.length > 0) {
          activeWorkspace.value = list[0].path;
        }
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
    if (!path) return;
    activeWorkspace.value = path;
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('agent_tracker_workspace', path);
      }
    } catch {}
    fetchGuidanceRecords();
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
    filteredOverview,
    sessions,
    filteredSessions,
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
