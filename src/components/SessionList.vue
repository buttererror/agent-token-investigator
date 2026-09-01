<script setup>
import { ref, computed } from 'vue';
import Tooltip from './common/Tooltip.vue';

const props = defineProps({
  sessions: {
    type: Array,
    default: () => []
  }
});

defineEmits(['inspect-session']);

const searchQuery = ref('');
const filterHealth = ref('ALL');

const filteredSessions = computed(() => {
  return props.sessions.filter(s => {
    const q = searchQuery.value.toLowerCase();
    const matchesSearch = !q || s.threadName.toLowerCase().includes(q) || s.sessionId.toLowerCase().includes(q);

    const isBloated = s.turnCount > 15 || (s.totalUsage.input_tokens > 200000);
    const hasSpikes = s.turns?.some(t => t.noiseSpikes?.length > 0);

    if (filterHealth.value === 'LEAN') return matchesSearch && !isBloated && !hasSpikes;
    if (filterHealth.value === 'BLOAT') return matchesSearch && isBloated;
    if (filterHealth.value === 'NOISE') return matchesSearch && hasSpikes;
    return matchesSearch;
  });
});

function getSessionHealth(session) {
  const isBloated = session.turnCount > 15 || (session.totalUsage.input_tokens > 200000);
  const hasSpikes = session.turns?.some(t => t.noiseSpikes?.length > 0);

  if (hasSpikes) return { type: 'red', label: '🔴 Heavy Output Spikes' };
  if (isBloated) return { type: 'yellow', label: '🟡 Context Bloat' };
  return { type: 'green', label: '🟢 Lean & Fast' };
}

function getCacheRate(session) {
  const inp = session.totalUsage.input_tokens || 0;
  const cached = session.totalUsage.cached_input_tokens || 0;
  if (!inp) return 0;
  return Math.round((cached / inp) * 100);
}
</script>

<template>
  <div class="sessions-card card">
    <div class="sessions-header">
      <div class="title-group">
        <h3>🧵 Session Explorer</h3>
        <span class="sub-text">Browse recent threads, turn histories, and token compositions</span>
      </div>

      <div class="filter-controls">
        <input 
          v-model="searchQuery" 
          type="text" 
          placeholder="Filter by thread name..."
          class="session-search mono"
        />

        <div class="filter-pills">
          <button 
            :class="['filter-btn', { active: filterHealth === 'ALL' }]"
            @click="filterHealth = 'ALL'"
          >All ({{ sessions.length }})</button>
          <button 
            :class="['filter-btn', { active: filterHealth === 'LEAN' }]"
            @click="filterHealth = 'LEAN'"
          >🟢 Lean</button>
          <button 
            :class="['filter-btn', { active: filterHealth === 'BLOAT' }]"
            @click="filterHealth = 'BLOAT'"
          >🟡 Bloated</button>
          <button 
            :class="['filter-btn', { active: filterHealth === 'NOISE' }]"
            @click="filterHealth = 'NOISE'"
          >🔴 Noisy</button>
        </div>
      </div>
    </div>

    <!-- Sessions Table -->
    <div class="table-responsive">
      <table class="session-table">
        <thead>
          <tr>
            <th>Thread Name & ID</th>
            <th>Turns</th>
            <th>
              <div class="th-wrap">
                <span>Total Tokens</span>
                <Tooltip placement="bottom" title="Session Total" text="Total tokens consumed across all turns in this conversation thread." />
              </div>
            </th>
            <th>
              <div class="th-wrap">
                <span>Cache Hit</span>
                <Tooltip placement="bottom" title="Prompt Cache Ratio" text="Percentage of input tokens served from cache for this session." />
              </div>
            </th>
            <th>Reasoning</th>
            <th>Health Status</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="s in filteredSessions" :key="s.sessionId" class="session-row">
            <td class="td-name">
              <div class="name-box">
                <span class="thread-title">{{ s.threadName }}</span>
                <span class="session-uuid mono text-dim">{{ s.sessionId.substring(0, 8) }}... • {{ (s.updatedAt || '').slice(0, 10) }}</span>
              </div>
            </td>
            <td class="mono font-semibold">{{ s.turnCount }}</td>
            <td class="mono">{{ (s.totalUsage.total_tokens || 0).toLocaleString() }}</td>
            <td class="mono">
              <span :class="getCacheRate(s) >= 80 ? 'text-green' : 'text-muted'">
                {{ getCacheRate(s) }}%
              </span>
            </td>
            <td class="mono text-purple">
              {{ (s.totalUsage.reasoning_output_tokens || 0).toLocaleString() }}
            </td>
            <td>
              <span :class="['badge', `badge-${getSessionHealth(s).type}`]">
                {{ getSessionHealth(s).label }}
              </span>
            </td>
            <td>
              <button 
                class="btn btn-secondary btn-sm"
                @click="$emit('inspect-session', s)"
              >
                Inspect
              </button>
            </td>
          </tr>

          <tr v-if="filteredSessions.length === 0">
            <td colspan="7" class="empty-cell">
              No matching sessions found.
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped>
.sessions-card {
  margin-bottom: 24px;
}

.sessions-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
  flex-wrap: wrap;
  gap: 16px;
}

.title-group h3 {
  font-size: 1.15rem;
}

.sub-text {
  font-size: 0.78rem;
  color: var(--text-dim);
}

.filter-controls {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.session-search {
  padding: 8px 12px;
  background-color: var(--bg-input);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  color: var(--text-main);
  font-size: 0.8rem;
  outline: none;
  min-width: 220px;
}

.session-search:focus {
  border-color: var(--border-focus);
}

.filter-pills {
  display: flex;
  gap: 6px;
}

.filter-btn {
  padding: 6px 12px;
  background-color: var(--bg-input);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  color: var(--text-muted);
  font-size: 0.75rem;
  cursor: pointer;
}

.filter-btn.active {
  background-color: #1e293b;
  color: var(--accent-blue);
  border-color: var(--accent-blue);
}

.table-responsive {
  overflow-x: auto;
  overflow-y: visible;
  padding-bottom: 28px;
}

.session-table {
  width: 100%;
  border-collapse: collapse;
  text-align: left;
  font-size: 0.82rem;
}

.session-table th {
  padding: 12px 14px;
  color: var(--text-dim);
  font-weight: 600;
  text-transform: uppercase;
  font-size: 0.72rem;
  border-bottom: 1px solid var(--border-color);
}

.th-wrap {
  display: flex;
  align-items: center;
}

.session-table td {
  padding: 14px;
  border-bottom: 1px solid rgba(255,255,255,0.03);
}

.session-row:hover td {
  background-color: var(--bg-card-hover);
}

.name-box {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.thread-title {
  font-weight: 600;
  color: var(--text-main);
}

.session-uuid {
  font-size: 0.7rem;
}

.empty-cell {
  text-align: center;
  color: var(--text-dim);
  padding: 30px 0;
}

.text-green { color: var(--accent-green); }
.text-purple { color: var(--accent-purple); }
.font-semibold { font-weight: 600; }
</style>
