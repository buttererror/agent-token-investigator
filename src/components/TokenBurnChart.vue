<script setup>
import { computed } from 'vue';
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

// Calculate composition percentages
const total = computed(() => props.overview?.totalTokens || 1);
const inputPct = computed(() => Math.round(((props.overview?.totalInput || 0) / total.value) * 100));
const cachedPct = computed(() => Math.round(((props.overview?.totalCached || 0) / total.value) * 100));
const reasoningPct = computed(() => Math.round(((props.overview?.totalReasoning || 0) / total.value) * 100));
const outputPct = computed(() => Math.max(100 - (inputPct.value + reasoningPct.value), 1));

// Group sessions by day for timeline chart
const dailyUsage = computed(() => {
  const map = new Map();
  props.sessions.forEach(s => {
    const date = s.updatedAt ? s.updatedAt.split('T')[0] : 'Recent';
    const current = map.get(date) || { date, tokens: 0, count: 0 };
    current.tokens += s.totalUsage?.total_tokens || 0;
    current.count += 1;
    map.set(date, current);
  });

  const arr = Array.from(map.values()).slice(0, 7).reverse();
  const maxTokens = Math.max(...arr.map(d => d.tokens), 1);
  return arr.map(d => ({
    ...d,
    heightPct: Math.max(Math.round((d.tokens / maxTokens) * 100), 8)
  }));
});
</script>

<template>
  <div class="charts-grid grid-2">
    <!-- Chart 1: Token Composition Breakdown -->
    <div class="chart-card card">
      <div class="chart-head">
        <div class="title-wrap">
          <h4>Token Composition Breakdown</h4>
          <Tooltip 
            title="Token Type Distribution" 
            text="Visual breakdown of how your tokens are split between Cached Prompt Input, Fresh Input, Model Reasoning, and Generated Output." 
            why-it-matters="A high Cached Input bar indicates strong prompt caching and progressive disclosure."
          />
        </div>
        <span class="mono text-muted text-xs">All Recorded Sessions</span>
      </div>

      <div class="composition-bar-track">
        <div class="comp-slice slice-cached" :style="{ width: `${cachedPct}%` }" title="Cached Input"></div>
        <div class="comp-slice slice-fresh" :style="{ width: `${Math.max(inputPct - cachedPct, 0)}%` }" title="Fresh Input"></div>
        <div class="comp-slice slice-reasoning" :style="{ width: `${reasoningPct}%` }" title="Reasoning Tokens"></div>
        <div class="comp-slice slice-output" :style="{ width: `${outputPct}%` }" title="Output Tokens"></div>
      </div>

      <div class="legend-grid">
        <div class="legend-item">
          <span class="legend-dot dot-cached"></span>
          <div class="legend-texts">
            <span class="legend-label">Cached Input</span>
            <span class="legend-val mono">{{ (overview?.totalCached || 0).toLocaleString() }} ({{ cachedPct }}%)</span>
          </div>
        </div>
        <div class="legend-item">
          <span class="legend-dot dot-fresh"></span>
          <div class="legend-texts">
            <span class="legend-label">Fresh Input</span>
            <span class="legend-val mono">{{ Math.max((overview?.totalInput || 0) - (overview?.totalCached || 0), 0).toLocaleString() }}</span>
          </div>
        </div>
        <div class="legend-item">
          <span class="legend-dot dot-reasoning"></span>
          <div class="legend-texts">
            <span class="legend-label">Reasoning Tokens</span>
            <span class="legend-val mono">{{ (overview?.totalReasoning || 0).toLocaleString() }} ({{ reasoningPct }}%)</span>
          </div>
        </div>
        <div class="legend-item">
          <span class="legend-dot dot-output"></span>
          <div class="legend-texts">
            <span class="legend-label">Output Code/Text</span>
            <span class="legend-val mono">{{ (overview?.totalOutput || 0).toLocaleString() }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Chart 2: Daily Token Burn Timeline -->
    <div class="chart-card card">
      <div class="chart-head">
        <div class="title-wrap">
          <h4>Daily Token Burn Timeline</h4>
          <Tooltip 
            title="Daily Token Burn Rate" 
            text="Shows total token consumption per day to help spot spikes from heavy debugging or refactoring sessions." 
          />
        </div>
        <span class="mono text-muted text-xs">Last 7 Active Days</span>
      </div>

      <div class="timeline-bars-container">
        <div v-for="day in dailyUsage" :key="day.date" class="bar-col">
          <div class="bar-wrap">
            <div 
              class="bar-fill" 
              :style="{ height: `${day.heightPct}%` }"
              :title="`${day.date}: ${day.tokens.toLocaleString()} tokens (${day.count} sessions)`"
            ></div>
          </div>
          <span class="bar-label mono">{{ day.date.slice(5) }}</span>
          <span class="bar-sub mono">{{ Math.round(day.tokens / 1000) }}k</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.charts-grid {
  margin-bottom: 24px;
}

.chart-card {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
}

.chart-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.title-wrap {
  display: flex;
  align-items: center;
}

.title-wrap h4 {
  font-size: 0.95rem;
}

.text-xs { font-size: 0.75rem; }

.composition-bar-track {
  height: 20px;
  background-color: var(--bg-input);
  border-radius: 9999px;
  overflow: hidden;
  display: flex;
  margin-bottom: 18px;
  border: 1px solid var(--border-color);
}

.comp-slice {
  height: 100%;
  transition: width 0.4s ease;
}

.slice-cached { background-color: var(--accent-green); }
.slice-fresh { background-color: var(--accent-blue); }
.slice-reasoning { background-color: var(--accent-purple); }
.slice-output { background-color: var(--accent-yellow); }

.legend-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 8px;
}

.legend-dot {
  width: 10px;
  height: 10px;
  border-radius: 3px;
}

.dot-cached { background-color: var(--accent-green); }
.dot-fresh { background-color: var(--accent-blue); }
.dot-reasoning { background-color: var(--accent-purple); }
.dot-output { background-color: var(--accent-yellow); }

.legend-texts {
  display: flex;
  flex-direction: column;
}

.legend-label {
  font-size: 0.75rem;
  color: var(--text-dim);
}

.legend-val {
  font-size: 0.8rem;
  font-weight: 600;
}

/* Timeline bars */
.timeline-bars-container {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  height: 130px;
  padding-top: 10px;
}

.bar-col {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  flex: 1;
}

.bar-wrap {
  width: 24px;
  height: 90px;
  background-color: var(--bg-input);
  border-radius: 6px;
  display: flex;
  align-items: flex-end;
  overflow: hidden;
}

.bar-fill {
  width: 100%;
  background: var(--accent-gradient);
  border-radius: 6px 6px 0 0;
  transition: height 0.4s ease;
}

.bar-fill:hover {
  filter: brightness(1.2);
}

.bar-label {
  font-size: 0.72rem;
  color: var(--text-muted);
}

.bar-sub {
  font-size: 0.68rem;
  color: var(--text-dim);
}
</style>
