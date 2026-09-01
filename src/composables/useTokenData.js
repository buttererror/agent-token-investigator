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

  const getSavedAgent = () => {
    try {
      if (typeof localStorage !== 'undefined') {
        const saved = localStorage.getItem('agent_tracker_agent');
        if (saved === 'codex' || saved === 'antigravity') return saved;
      }
    } catch {}
    return 'codex';
  };

  const activeWorkspace = ref(getSavedWorkspace());
  const activeAgent = ref(getSavedAgent()); // 'codex' | 'antigravity'
  const isAutoRefresh = ref(true);

  const filteredSessions = computed(() => {
    let list = sessions.value || [];
    
    // Strict 2-way filter by active agent with safe fallback
    const currentAgent = activeAgent.value === 'antigravity' ? 'antigravity' : 'codex';
    list = list.filter(s => (s.agentType || 'codex') === currentAgent);
    
    if (!activeWorkspace.value || activeWorkspace.value === 'all') {
      return list;
    }
    const target = activeWorkspace.value.toLowerCase().replace(/[\/\\]+$/, '');
    return list.filter(s => {
      const cwd = (s.meta?.cwd || '').toLowerCase().replace(/[\/\\]+$/, '');
      return cwd.startsWith(target) || target.startsWith(cwd);
    });
  });

  const filteredOverview = computed(() => {
    const list = filteredSessions.value || [];
    if (!list.length) {
      return {
        totalTokens: 0,
        totalSessions: 0,
        totalInput: 0,
        totalCached: 0,
        totalOutput: 0,
        totalReasoning: 0,
        cacheHitRate: 0,
        averageCacheHitRate: 0,
        totalReasoningTokens: 0,
        estimatedCostSaved: 0,
        estimatedSavingsDollars: '0.00'
      };
    }

    let totalTokens = 0;
    let totalInput = 0;
    let totalCached = 0;
    let totalOutput = 0;
    let totalReasoning = 0;

    for (const s of list) {
      const usage = s.totalUsage || {};
      totalTokens += (usage.total_tokens || 0);
      totalInput += (usage.input_tokens || 0);
      totalCached += (usage.cached_input_tokens || 0);
      totalOutput += (usage.output_tokens || 0);
      totalReasoning += (usage.reasoning_output_tokens || 0);
    }

    const rate = totalInput > 0 ? Math.round((totalCached / totalInput) * 100) : 0;
    const saved = (totalCached / 1000000) * 2.00;

    // Find latest rateLimit among filtered sessions
    let latestRate = null;
    for (const s of list) {
      if (s.rateLimits) {
        latestRate = s.rateLimits;
        break;
      }
    }

    if (!latestRate) {
      if (activeAgent.value !== 'antigravity') {
        latestRate = overview.value?.latestRateLimit || {
          primary: { used_percent: 0, window_minutes: 300, resets_at: Date.now() / 1000 + 18000 },
          secondary: { used_percent: 0, window_minutes: 10080, resets_at: Date.now() / 1000 + 604800 },
          plan_type: 'Plus'
        };
      }
    }

    return {
      totalTokens,
      totalSessions: list.length,
      totalInput,
      totalCached,
      totalOutput,
      totalReasoning,
      cacheHitRate: rate,
      averageCacheHitRate: rate,
      totalReasoningTokens: totalReasoning,
      estimatedCostSaved: parseFloat(saved.toFixed(2)),
      estimatedSavingsDollars: saved.toFixed(2),
      latestRateLimit: latestRate
    };
  });

  const filteredPacingForecast = computed(() => {
    const rateLimits = filteredOverview.value?.latestRateLimit || (
      activeAgent.value === 'antigravity' ? null : overview.value?.latestRateLimit
    );
    const list = filteredSessions.value || [];
    
    const primary = rateLimits?.primary;
    const quotaAvailable = Number.isFinite(primary?.used_percent) && Number.isFinite(primary?.resets_at);
    const usedPercent = quotaAvailable ? primary.used_percent : null;
    const resetsAt = quotaAvailable ? primary.resets_at : null;
    const nowSec = Date.now() / 1000;
    const minutesUntilReset = quotaAvailable ? Math.max(Math.round((resetsAt - nowSec) / 60), 0) : null;

    // Estimate local activity from transcript turns in the last two hours.
    let recentTokens = 0;
    const twoHoursAgo = nowSec - (2 * 60 * 60);
    for (const session of list) {
      for (const turn of session.turns || []) {
        const timestamp = Date.parse(turn.startedAt) / 1000;
        if (Number.isFinite(timestamp) && timestamp >= twoHoursAgo) {
          recentTokens += turn.tokenUsage?.total_tokens || 0;
        }
      }
    }
    const burnRatePerMin = Math.round(recentTokens / 120);

    if (!quotaAvailable) {
      return {
        quotaAvailable: false,
        usedPercent: null,
        minutesUntilReset: null,
        burnRatePerMin,
        minutesUntilExhaustion: null,
        status: 'UNAVAILABLE',
        advice: 'Live provider quota is unavailable in Antigravity transcript logs. Local activity is estimated from the last two hours only.'
      };
    }

    const remainingPercent = 100 - usedPercent;
    const minutesUntilExhaustion = remainingPercent > 0 
      ? Math.round((remainingPercent / 100) * (250000 / Math.max(burnRatePerMin, 500)))
      : 0;

    let status = 'HEALTHY';
    let advice = activeAgent.value === 'antigravity'
      ? 'Antigravity pacing is sustainable. Context caching and tool telemetry are operating normally.'
      : 'Pacing is sustainable. You have plenty of quota before the next reset.';

    if (usedPercent >= 80) {
      status = 'CRITICAL';
      advice = `You are at ${usedPercent}% of your 5-hour limit. Pause heavy subagents for ${minutesUntilReset}m until reset.`;
    } else if (usedPercent >= 60 && minutesUntilExhaustion < minutesUntilReset) {
      status = 'WARNING';
      advice = `Burn velocity (${burnRatePerMin.toLocaleString()} tok/min) may exhaust quota in ~${minutesUntilExhaustion}m. Consider switching to low reasoning effort.`;
    }

    return {
      quotaAvailable: true,
      usedPercent,
      minutesUntilReset,
      burnRatePerMin,
      minutesUntilExhaustion,
      status,
      advice
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

  async function addProject(dirPath, customName) {
    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: dirPath, name: customName })
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to add project');
      }
      const newProj = await res.json();
      await fetchProjects();
      setWorkspace(newProj.path);
      return newProj;
    } catch (e) {
      throw e;
    }
  }

  async function removeProject(dirPath) {
    try {
      const res = await fetch('/api/projects', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: dirPath })
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to remove project');
      }
      await fetchProjects();
      if (activeWorkspace.value === dirPath) {
        setWorkspace('all');
      }
    } catch (e) {
      throw e;
    }
  }

  async function browseDirectoryApi(dirPath) {
    const url = dirPath ? `/api/browse-directory?path=${encodeURIComponent(dirPath)}` : '/api/browse-directory';
    const res = await fetch(url);
    if (!res.ok) throw new Error('Failed to browse directory');
    return await res.json();
  }

  async function inspectDirectoryApi(dirPath) {
    const res = await fetch(`/api/inspect-directory?path=${encodeURIComponent(dirPath)}`);
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to inspect directory');
    }
    return await res.json();
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

  function setAgent(type) {
    if (type !== 'codex' && type !== 'antigravity') return;
    activeAgent.value = type;
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('agent_tracker_agent', type);
      }
    } catch {}
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
    filteredPacingForecast,
    glossary,
    projects,
    guidanceRecords,
    isLoading,
    isRecordsLoading,
    error,
    selectedSession,
    activeWorkspace,
    activeAgent,
    isAutoRefresh,
    setWorkspace,
    setAgent,
    addProject,
    removeProject,
    browseDirectoryApi,
    inspectDirectoryApi,
    fetchGuidanceRecords,
    addGuidanceRecord,
    refresh: fetchAll
  };
}
