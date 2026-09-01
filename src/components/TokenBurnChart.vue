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
  },
  activeAgent: {
    type: String,
    default: 'codex'
  },
  activeWorkspace: {
    type: String,
    default: 'all'
  },
  timeFilter: {
    type: String,
    default: 'all'
  }
});

const isAntigravity = computed(() => props.activeAgent === 'antigravity');

const scopeLabel = computed(() => {
  const agentLabel = isAntigravity.value ? 'Antigravity' : 'Codex';
  const count = scopedSessions.value.length;
  if (!props.activeWorkspace || props.activeWorkspace === 'all') {
    return `${agentLabel} • All Projects (${count} session${count === 1 ? '' : 's'})`;
  }
  const folder = props.activeWorkspace.split(/[\/\\]/).filter(Boolean).pop() || props.activeWorkspace;
  return `${agentLabel} • ${folder} (${count} session${count === 1 ? '' : 's'})`;
});

// Non-overlapping token quantities:
// 1. Cached Input: props.overview.totalCached
// 2. Fresh Input: props.overview.totalInput - props.overview.totalCached
// 3. Reasoning Output: props.overview.totalReasoning
// 4. Standard Output Text: Math.max(props.overview.totalOutput - props.overview.totalReasoning, 0)
const scopedSessions = computed(() => {
  if (props.timeFilter === 'all' || !props.sessions.length) return props.sessions;
  const now = Date.now();
  const today = new Date().toISOString().split('T')[0];
  return props.sessions.filter(session => {
    const rawTs = session.updatedAt || session.meta?.timestamp || session.turns?.[0]?.startedAt;
    const timestamp = rawTs ? new Date(rawTs).getTime() : NaN;
    if (!Number.isFinite(timestamp)) return false;
    if (props.timeFilter === 'today') return new Date(timestamp).toISOString().split('T')[0] === today;
    const windows = { '24h': 1, '7d': 7, '30d': 30 };
    return windows[props.timeFilter] ? now - timestamp <= windows[props.timeFilter] * 24 * 60 * 60 * 1000 : true;
  });
});

const scopedOverview = computed(() => {
  if (props.timeFilter === 'all') return props.overview || {};
  return scopedSessions.value.reduce((summary, session) => {
    const usage = session.totalUsage || {};
    summary.totalTokens += usage.total_tokens || 0;
    summary.totalInput += usage.input_tokens || 0;
    summary.totalCached += usage.cached_input_tokens || 0;
    summary.totalOutput += usage.output_tokens || 0;
    summary.totalReasoning += usage.reasoning_output_tokens || 0;
    return summary;
  }, { totalTokens: 0, totalInput: 0, totalCached: 0, totalOutput: 0, totalReasoning: 0 });
});

const total = computed(() => scopedOverview.value.totalTokens || 1);
const cachedTokens = computed(() => scopedOverview.value.totalCached || 0);
const freshTokens = computed(() => Math.max((scopedOverview.value.totalInput || 0) - cachedTokens.value, 0));
const reasoningTokens = computed(() => scopedOverview.value.totalReasoning || 0);
const standardOutputTokens = computed(() => Math.max((scopedOverview.value.totalOutput || 0) - reasoningTokens.value, 0));

// Exact percentage formatters (showing decimals for precision)
function formatPct(val) {
  const pct = (val / total.value) * 100;
  if (pct === 0) return '0%';
  if (pct < 0.1) return `${pct.toFixed(2)}%`;
  if (pct < 1) return `${pct.toFixed(1)}%`;
  return `${Math.round(pct)}%`;
}

const cachedPctNum = computed(() => (cachedTokens.value / total.value) * 100);
const freshPctNum = computed(() => (freshTokens.value / total.value) * 100);
const reasoningPctNum = computed(() => (reasoningTokens.value / total.value) * 100);
const outputPctNum = computed(() => (standardOutputTokens.value / total.value) * 100);

// Reasoning ratio against total generated output
const reasoningShareOfOutput = computed(() => {
  const totalOut = scopedOverview.value.totalOutput || 1;
  return Math.round((reasoningTokens.value / totalOut) * 100);
});

// Group sessions by day for timeline chart
const dailyUsage = computed(() => {
  const map = new Map();
  scopedSessions.value.forEach(s => {
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
          <h4>{{ isAntigravity ? '🌌 Antigravity Token Composition Breakdown' : 'Token Composition Breakdown' }}</h4>
          <Tooltip 
            title="Token Type Distribution" 
            :text="isAntigravity 
              ? 'Visual breakdown of Antigravity Gemini tokens between Cached Context, Fresh Uncached Input, Model Reasoning (Thinking), and Generated Code/Output.' 
              : 'Visual breakdown of how your tokens are split between Cached Prompt Input, Fresh Input, Model Reasoning (Thinking), and Standard Output.'" 
            :why-it-matters="isAntigravity 
              ? 'Context caching preserves prompt history across turns and speeds up subagent responses.' 
              : 'A high Cached Input percentage means OpenAI cache is giving you an 80% discount on prompt input.'"
          />
        </div>
        <span class="mono text-muted text-xs scope-pill" :class="{ 'pill-antigravity': isAntigravity }">{{ scopeLabel }}</span>
      </div>

      <!-- Segmented Track (with min-width for small slices so Reasoning is always clearly visible) -->
      <div class="composition-bar-track">
        <div 
          class="comp-slice slice-cached" 
          :style="{ width: `${cachedPctNum}%` }" 
          :title="`Cached Input: ${cachedTokens.toLocaleString()} (${formatPct(cachedTokens)})`"
        ></div>
        <div 
          class="comp-slice slice-fresh" 
          :style="{ width: `${freshPctNum}%` }" 
          :title="`Fresh Input: ${freshTokens.toLocaleString()} (${formatPct(freshTokens)})`"
        ></div>
        <div 
          v-if="reasoningTokens > 0"
          class="comp-slice slice-reasoning" 
          :style="{ width: `${Math.max(reasoningPctNum, 1.5)}%`, minWidth: '8px' }" 
          :title="`Reasoning Tokens: ${reasoningTokens.toLocaleString()} (${formatPct(reasoningTokens)})`"
        ></div>
        <div 
          class="comp-slice slice-output" 
          :style="{ width: `${Math.max(outputPctNum, 1.5)}%`, minWidth: '8px' }" 
          :title="`Output Code/Text: ${standardOutputTokens.toLocaleString()} (${formatPct(standardOutputTokens)})`"
        ></div>
      </div>

      <div class="legend-grid">
        <div class="legend-item">
          <span class="legend-dot dot-cached"></span>
          <div class="legend-texts">
            <span class="legend-label">{{ isAntigravity ? 'Cached Context Input' : 'Cached Input (80% Off)' }}</span>
            <span class="legend-val mono text-green">{{ cachedTokens.toLocaleString() }} ({{ formatPct(cachedTokens) }})</span>

          </div>
        </div>

        <div class="legend-item">
          <span class="legend-dot dot-fresh"></span>
          <div class="legend-texts">
            <span class="legend-label">Fresh Uncached Input</span>
            <span class="legend-val mono text-blue">{{ freshTokens.toLocaleString() }} ({{ formatPct(freshTokens) }})</span>
          </div>
        </div>

        <div class="legend-item">
          <span class="legend-dot dot-reasoning"></span>
          <div class="legend-texts">
            <span class="legend-label">Reasoning Tokens (Thinking)</span>
            <span class="legend-val mono text-purple">{{ reasoningTokens.toLocaleString() }} ({{ formatPct(reasoningTokens) }})</span>
          </div>
        </div>

        <div class="legend-item">
          <span class="legend-dot dot-output"></span>
          <div class="legend-texts">
            <span class="legend-label">Generated Code & Output</span>
            <span class="legend-val mono text-yellow">{{ standardOutputTokens.toLocaleString() }} ({{ formatPct(standardOutputTokens) }})</span>
          </div>
        </div>
      </div>

      <!-- Quick Reasoning Share Callout -->
      <div class="reasoning-share-bar" :class="{ 'reasoning-share-antigravity': isAntigravity }">
        <span>🧠 <strong>Reasoning Effort Share:</strong> Reasoning accounts for <strong>{{ reasoningShareOfOutput }}%</strong> of all generated model output ({{ reasoningTokens.toLocaleString() }} of {{ (scopedOverview?.totalOutput || 0).toLocaleString() }} tokens).</span>
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
  height: 22px;
  background-color: var(--bg-input);
  border-radius: 9999px;
  overflow: hidden;
  display: flex;
  margin-bottom: 16px;
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
  margin-bottom: 14px;
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
  font-size: 0.73rem;
  color: var(--text-dim);
}

.legend-val {
  font-size: 0.8rem;
  font-weight: 600;
}

.reasoning-share-bar {
  background-color: rgba(168, 85, 247, 0.08);
  border: 1px solid rgba(168, 85, 247, 0.2);
  padding: 8px 12px;
  border-radius: 6px;
  font-size: 0.75rem;
  color: var(--text-main);
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

.text-green { color: var(--accent-green); }
.text-blue { color: var(--accent-blue); }
.text-purple { color: var(--accent-purple); }
.text-yellow { color: var(--accent-yellow); }

.scope-pill {
  font-size: 0.72rem;
  background: rgba(255, 255, 255, 0.05);
  padding: 2px 8px;
  border-radius: 6px;
  border: 1px solid var(--border-color);
}

.pill-antigravity {
  color: #c084fc;
  background: rgba(168, 85, 247, 0.12);
  border-color: rgba(168, 85, 247, 0.3);
}

.reasoning-share-antigravity {
  background: rgba(168, 85, 247, 0.08);
  border-color: rgba(168, 85, 247, 0.25);
}
</style>
