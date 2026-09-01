<script setup>
import { ref, computed } from 'vue';
import Tooltip from './common/Tooltip.vue';

const props = defineProps({
  overview: {
    type: Object,
    default: () => ({})
  },
  sessions: {
    type: Array,
    default: () => []
  }
});

const selectedTimeFilter = ref('all');

const timeFilterOptions = [
  { id: 'all', label: 'All Time' },
  { id: 'today', label: 'Today' },
  { id: '24h', label: 'Past 24h' },
  { id: '7d', label: 'Past 7 Days' },
  { id: '30d', label: 'Past 30 Days' }
];

const filteredMetrics = computed(() => {
  if (selectedTimeFilter.value === 'all' || !props.sessions || props.sessions.length === 0) {
    return {
      totalTokens: props.overview?.totalTokens || 0,
      totalSessions: props.overview?.totalSessions || props.sessions?.length || 0,
      totalInput: props.overview?.totalInput || 0,
      totalCached: props.overview?.totalCached || 0,
      totalReasoning: props.overview?.totalReasoning || 0,
      cacheHitRate: props.overview?.cacheHitRate || 0,
      estimatedSavingsDollars: props.overview?.estimatedSavingsDollars || '0.00',
      isFiltered: false
    };
  }

  const now = Date.now();
  const todayDateStr = new Date().toISOString().split('T')[0];

  const matchedSessions = props.sessions.filter(s => {
    const rawTs = s.updatedAt || s.meta?.timestamp || s.turns?.[0]?.startedAt;
    if (!rawTs) return false;
    const sessionTime = new Date(rawTs).getTime();
    if (isNaN(sessionTime)) return false;

    if (selectedTimeFilter.value === 'today') {
      const sessionDateStr = new Date(sessionTime).toISOString().split('T')[0];
      return sessionDateStr === todayDateStr;
    }
    if (selectedTimeFilter.value === '24h') {
      return now - sessionTime <= 24 * 60 * 60 * 1000;
    }
    if (selectedTimeFilter.value === '7d') {
      return now - sessionTime <= 7 * 24 * 60 * 60 * 1000;
    }
    if (selectedTimeFilter.value === '30d') {
      return now - sessionTime <= 30 * 24 * 60 * 60 * 1000;
    }
    return true;
  });

  let totalInput = 0;
  let totalCached = 0;
  let totalOutput = 0;
  let totalReasoning = 0;
  let totalTokens = 0;

  for (const s of matchedSessions) {
    totalInput += s.totalUsage?.input_tokens || 0;
    totalCached += s.totalUsage?.cached_input_tokens || 0;
    totalOutput += s.totalUsage?.output_tokens || 0;
    totalReasoning += s.totalUsage?.reasoning_output_tokens || 0;
    totalTokens += s.totalUsage?.total_tokens || 0;
  }

  const cacheHitRate = totalInput > 0 ? Math.round(((totalCached / totalInput) * 100) * 10) / 10 : 0;
  const estimatedSavingsDollars = ((totalCached / 1000000) * 1.25).toFixed(2);

  return {
    totalTokens,
    totalSessions: matchedSessions.length,
    totalInput,
    totalCached,
    totalOutput,
    totalReasoning,
    cacheHitRate,
    estimatedSavingsDollars,
    isFiltered: true
  };
});

const cacheEfficiencyBadge = computed(() => {
  const rate = filteredMetrics.value.cacheHitRate;
  if (rate >= 80) return { type: 'green', label: '🔥 High Efficiency' };
  if (rate >= 50) return { type: 'blue', label: '⚡ Moderate Cache' };
  return { type: 'yellow', label: '⚠️ Low Cache Hit' };
});
</script>

<template>
  <div class="metrics-section">
    <!-- Header with Filter Controls -->
    <div class="metrics-section-header">
      <div class="section-title-wrap">
        <h3 class="section-title">📊 Token Metrics & Spend</h3>
        <span class="section-subtitle">
          {{ filteredMetrics.isFiltered ? `Filtered view (${filteredMetrics.totalSessions} of ${props.sessions.length} sessions)` : 'Lifetime aggregate metrics across all sessions' }}
        </span>
      </div>

      <div class="time-filter-pills">
        <button
          v-for="opt in timeFilterOptions"
          :key="opt.id"
          :class="['filter-pill-btn', { active: selectedTimeFilter === opt.id }]"
          @click="selectedTimeFilter = opt.id"
        >
          {{ opt.label }}
        </button>
      </div>
    </div>

    <!-- 4 Cards Grid -->
    <div class="metrics-grid grid-4">
      <!-- Card 1: Total Tokens -->
      <div class="metric-card card">
        <div class="metric-head">
          <span class="metric-title">Total Tokens</span>
          <Tooltip 
            title="Total Tokens" 
            text="The combined sum of all input, cached, reasoning, and output tokens for the selected timeframe." 
            why-it-matters="Gives you a high-level view of your overall token volume."
          />
        </div>
        <div class="metric-main">
          <span class="metric-value mono">
            {{ filteredMetrics.totalTokens.toLocaleString() }}
          </span>
        </div>
        <div class="metric-footer">
          <span class="sub-stat">
            <strong class="mono">{{ filteredMetrics.totalSessions }}</strong>
            {{ filteredMetrics.isFiltered ? ` / ${props.sessions.length} sessions` : ' total sessions' }}
          </span>
        </div>
      </div>

      <!-- Card 2: Cache Hit Rate -->
      <div class="metric-card card">
        <div class="metric-head">
          <span class="metric-title">Cache Hit Rate</span>
          <Tooltip 
            title="Prompt Cache Hit Rate" 
            text="The percentage of prompt inputs that were served directly from OpenAI's memory cache in the selected timeframe." 
            why-it-matters="Cached tokens are processed up to 80% cheaper and much faster than fresh input tokens."
          />
        </div>
        <div class="metric-main">
          <span class="metric-value mono text-blue">
            {{ filteredMetrics.cacheHitRate }}%
          </span>
        </div>
        <div class="metric-footer">
          <span :class="['badge', `badge-${cacheEfficiencyBadge.type}`]">
            {{ cacheEfficiencyBadge.label }}
          </span>
        </div>
      </div>

      <!-- Card 3: Reasoning Tokens -->
      <div class="metric-card card">
        <div class="metric-head">
          <span class="metric-title">Reasoning Tokens</span>
          <Tooltip 
            title="Internal Thinking Tokens" 
            text="Tokens generated by reasoning models (like o3-mini) during their internal deliberation phase." 
            why-it-matters="Crucial for difficult coding problems, but wasteful if spent on simple formatting or chore tasks."
          />
        </div>
        <div class="metric-main">
          <span class="metric-value mono text-purple">
            {{ filteredMetrics.totalReasoning.toLocaleString() }}
          </span>
        </div>
        <div class="metric-footer">
          <span class="sub-stat text-dim">
            Model Thinking Effort
          </span>
        </div>
      </div>

      <!-- Card 4: Estimated Savings -->
      <div class="metric-card card">
        <div class="metric-head">
          <span class="metric-title">Estimated $ Saved</span>
          <Tooltip 
            title="Cost Savings from Caching" 
            text="Estimated financial savings gained from OpenAI's prompt caching discounts compared to raw full-price input." 
            why-it-matters="Shows the direct financial ROI of keeping prompt prefixes stable and modular."
          />
        </div>
        <div class="metric-main">
          <span class="metric-value mono text-green">
            ${{ filteredMetrics.estimatedSavingsDollars }}
          </span>
        </div>
        <div class="metric-footer">
          <span class="sub-stat text-green">
            💰 Saved via prompt cache
          </span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.metrics-section {
  margin-bottom: 24px;
}

.metrics-section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  flex-wrap: wrap;
  gap: 12px;
}

.section-title-wrap {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.section-title {
  font-size: 1.1rem;
  font-weight: 700;
  color: var(--text-main);
  letter-spacing: -0.01em;
}

.section-subtitle {
  font-size: 0.8rem;
  color: var(--text-muted);
}

.time-filter-pills {
  display: flex;
  align-items: center;
  gap: 6px;
  background-color: var(--bg-card);
  padding: 4px;
  border-radius: 12px;
  border: 1px solid var(--border-color);
}

.filter-pill-btn {
  background: transparent;
  border: 1px solid transparent;
  color: var(--text-muted);
  font-size: 0.78rem;
  font-weight: 600;
  padding: 5px 12px;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.15s ease;
  white-space: nowrap;
}

.filter-pill-btn:hover {
  color: var(--text-main);
  background: rgba(255, 255, 255, 0.05);
}

.filter-pill-btn.active {
  background: #1e293b;
  color: var(--accent-blue);
  border-color: rgba(56, 189, 248, 0.35);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
}

.metrics-grid {
  margin-bottom: 0;
}

.metric-card {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
}

.metric-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.metric-title {
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.metric-main {
  margin-bottom: 14px;
}

.metric-value {
  font-size: 1.65rem;
  font-weight: 800;
}

.metric-footer {
  display: flex;
  align-items: center;
  font-size: 0.78rem;
  color: var(--text-muted);
}

.text-blue { color: var(--accent-blue); }
.text-purple { color: var(--accent-purple); }
.text-green { color: var(--accent-green); }
</style>
