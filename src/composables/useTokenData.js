import { ref, computed, onMounted, onUnmounted } from 'vue';

export function useTokenData() {
  const overview = ref(null);
  const sessions = ref([]);
  const pacingForecast = ref(null);
  const diagnostics = ref([]);
  const glossary = ref([]);
  const projects = ref([]);
  const guidanceRecords = ref([]);
  const isLoading = ref(true);
  const isRecordsLoading = ref(false);
  const isDiagnosticsLoading = ref(false);
  const error = ref(null);
  const selectedSession = ref(null);
  const currentView = ref('overview'); // 'overview' | 'sessions' | 'analytics'

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

  const getSavedTimeRange = () => {
    try {
      if (typeof localStorage !== 'undefined') {
        const saved = localStorage.getItem('agent_tracker_time_range');
        if (saved && ['5h', 'today', '24h', '7d', '30d', 'all'].includes(saved)) return saved;
      }
    } catch {}
    return '7d';
  };

  const activeWorkspace = ref(getSavedWorkspace());
  const activeAgent = ref(getSavedAgent()); // 'codex' | 'antigravity'
  const activeTimeRange = ref(getSavedTimeRange()); // '5h' | 'today' | '24h' | '7d' | '30d' | 'all'
  const isAutoRefresh = ref(true);

  const filteredSessions = computed(() => {
    let list = sessions.value || [];
    
    // 1. Strict filter by active agent
    const currentAgent = activeAgent.value === 'antigravity' ? 'antigravity' : 'codex';
    list = list.filter(s => (s.agentType || 'codex') === currentAgent);
    
    // 2. Filter by workspace
    if (activeWorkspace.value && activeWorkspace.value !== 'all') {
      const target = activeWorkspace.value.toLowerCase().replace(/[\/\\]+$/, '');
      list = list.filter(s => {
        const cwd = (s.meta?.cwd || '').toLowerCase().replace(/[\/\\]+$/, '');
        return cwd.startsWith(target) || target.startsWith(cwd);
      });
    }

    // 3. Filter by timeRange
    const timeRange = activeTimeRange.value;
    if (!timeRange || timeRange === 'all') {
      return list;
    }

    const now = Date.now();
    if (timeRange === '5h') {
      const fiveHoursAgo = now - (5 * 60 * 60 * 1000);
      return list.filter(s => {
        const t = new Date(s.updatedAt || s.meta?.timestamp || 0).getTime();
        return t >= fiveHoursAgo;
      });
    }

    if (timeRange === 'today') {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const startMs = todayStart.getTime();
      return list.filter(s => {
        const t = new Date(s.updatedAt || s.meta?.timestamp || 0).getTime();
        return t >= startMs;
      });
    }

    if (timeRange === '24h') {
      const dayAgo = now - (24 * 60 * 60 * 1000);
      return list.filter(s => {
        const t = new Date(s.updatedAt || s.meta?.timestamp || 0).getTime();
        return t >= dayAgo;
      });
    }

    if (timeRange === '7d') {
      const sevenDaysAgo = now - (7 * 24 * 60 * 60 * 1000);
      return list.filter(s => {
        const t = new Date(s.updatedAt || s.meta?.timestamp || 0).getTime();
        return t >= sevenDaysAgo;
      });
    }

    if (timeRange === '30d') {
      const thirtyDaysAgo = now - (30 * 24 * 60 * 60 * 1000);
      return list.filter(s => {
        const t = new Date(s.updatedAt || s.meta?.timestamp || 0).getTime();
        return t >= thirtyDaysAgo;
      });
    }

    return list;
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

  // Top recommendation from server diagnostics
  const topRecommendation = computed(() => {
    return diagnostics.value && diagnostics.value.length > 0 ? diagnostics.value[0] : null;
  });

  // Attention sessions computed from real session telemetry
  const attentionSessions = computed(() => {
    const list = [...filteredSessions.value];
    if (!list.length) return [];

    function scoreSession(s) {
      let score = 0;
      let reason = 'High activity';
      
      const turns = s.turns || [];
      const noisyTests = turns.reduce((cnt, t) => {
        const tests = (t.toolCalls || []).filter(call => {
          const name = String(call?.tool || '');
          if (!/(?:exec_command|run_command|\bexec\b)/i.test(name)) return false;
          const cmd = typeof call?.input === 'string' ? call.input : (call?.input?.cmd || call?.input?.command || '');
          return /(?:test|jest|vitest|mocha|pytest)\b/i.test(cmd) && !(/--silent/.test(cmd) && /--bail(?:\s+|=)1\b/.test(cmd));
        });
        return cnt + tests.length;
      }, 0);

      const unboundedReads = turns.reduce((cnt, t) => {
        const reads = (t.toolCalls || []).filter(call => {
          const isRead = /(?:view_file|read_file)/i.test(String(call?.tool || ''));
          const input = call?.input;
          const hasRange = input && typeof input === 'object' && ('startline' in input || 'StartLine' in input || 'fromLine' in input);
          return isRead && !hasRange;
        });
        return cnt + reads.length;
      }, 0);

      const isBloated = s.turnCount > 12;
      const input = s.totalUsage?.input_tokens || 0;
      const cached = s.totalUsage?.cached_input_tokens || 0;
      const fresh = Math.max(input - cached, 0);

      if (noisyTests > 0) {
        score += 100 + noisyTests * 10;
        reason = `Noisy test output (${noisyTests} turn${noisyTests > 1 ? 's' : ''})`;
      } else if (unboundedReads > 0) {
        score += 80 + unboundedReads * 5;
        reason = `Unbounded file read (${unboundedReads} turn${unboundedReads > 1 ? 's' : ''})`;
      } else if (isBloated) {
        score += 60 + s.turnCount;
        reason = `Context carryover (${s.turnCount} turns)`;
      } else if (fresh > 100000) {
        score += 40;
        reason = `High fresh input context`;
      } else if (input > 0 && (cached / input) < 0.5) {
        score += 20;
        reason = `Low prompt cache reuse`;
      }

      return { session: s, score, reason, freshInput: fresh, cacheReuse: input > 0 ? Math.round((cached / input) * 100) : 0 };
    }

    const scored = list.map(scoreSession);
    scored.sort((a, b) => b.score - a.score || b.freshInput - a.freshInput);

    return scored.slice(0, 3).map(item => ({
      ...item.session,
      freshInput: item.freshInput,
      cacheReuse: item.cacheReuse,
      attentionReason: item.reason
    }));
  });

  // The API is the single pacing implementation; do not recompute quota locally.
  const filteredPacingForecast = computed(() => pacingForecast.value);

  let pollTimer = null;

  async function fetchGuidanceRecords(targetWorkspace = activeWorkspace.value) {
    isRecordsLoading.value = true;
    try {
      const res = await fetch(`/api/guidance-records?projectPath=${encodeURIComponent(targetWorkspace || 'all')}`);
      if (res.ok) {
        guidanceRecords.value = await res.json();
      }
    } catch (err) {
      console.error('Failed to load guidance records:', err);
    } finally {
      isRecordsLoading.value = false;
    }
  }

  async function fetchDiagnostics() {
    isDiagnosticsLoading.value = true;
    try {
      const params = new URLSearchParams({
        agent: activeAgent.value,
        scope: activeTimeRange.value,
        timeRange: activeTimeRange.value,
        workspace: activeWorkspace.value || 'all',
        targetProjectPath: activeWorkspace.value || 'all'
      });
      const res = await fetch(`/api/diagnostics?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        diagnostics.value = data.diagnostics || [];
      }
    } catch (err) {
      console.error('Failed to load diagnostics:', err);
    } finally {
      isDiagnosticsLoading.value = false;
    }
  }

  async function fetchProjects() {
    try {
      const res = await fetch('/api/projects');
      if (res.ok) {
        const list = await res.json();
        projects.value = list;
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
    fetchAll();
  }

  function setAgent(type) {
    if (type !== 'codex' && type !== 'antigravity') return;
    activeAgent.value = type;
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('agent_tracker_agent', type);
      }
    } catch {}
    fetchAll();
  }

  function setTimeRange(range) {
    if (!['5h', 'today', '24h', '7d', '30d', 'all'].includes(range)) return;
    activeTimeRange.value = range;
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('agent_tracker_time_range', range);
      }
    } catch {}
    fetchDiagnostics();
  }

  function setCurrentView(view) {
    if (['overview', 'sessions', 'analytics'].includes(view)) {
      currentView.value = view;
    }
  }

  async function fetchAll() {
    try {
      const pacingParams = new URLSearchParams({ agent: activeAgent.value });
      if (activeWorkspace.value && activeWorkspace.value !== 'all') {
        pacingParams.set('workspace', activeWorkspace.value);
      }
      const [overviewRes, sessionsRes, pacingRes, glossaryRes, projectsRes] = await Promise.all([
        fetch('/api/overview'),
        fetch('/api/sessions'),
        fetch(`/api/pacing-forecast?${pacingParams}`),
        fetch('/api/glossary'),
        fetch('/api/projects')
      ]);

      if (overviewRes.ok) overview.value = await overviewRes.json();
      if (sessionsRes.ok) sessions.value = await sessionsRes.json();
      if (pacingRes.ok) pacingForecast.value = await pacingRes.json();
      if (glossaryRes.ok) glossary.value = await glossaryRes.json();
      if (projectsRes.ok) projects.value = await projectsRes.json();

      await Promise.all([
        fetchGuidanceRecords(activeWorkspace.value),
        fetchDiagnostics()
      ]);

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
    diagnostics,
    topRecommendation,
    attentionSessions,
    glossary,
    projects,
    guidanceRecords,
    isLoading,
    isRecordsLoading,
    isDiagnosticsLoading,
    error,
    selectedSession,
    activeWorkspace,
    activeAgent,
    activeTimeRange,
    currentView,
    isAutoRefresh,
    setWorkspace,
    setAgent,
    setTimeRange,
    setCurrentView,
    addProject,
    removeProject,
    browseDirectoryApi,
    inspectDirectoryApi,
    fetchGuidanceRecords,
    fetchDiagnostics,
    addGuidanceRecord,
    refresh: fetchAll
  };
}
