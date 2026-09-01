<script setup>
import { ref, watch } from 'vue';
import Tooltip from './common/Tooltip.vue';

const props = defineProps({
  activeScopeMode: {
    type: String,
    default: 'all'
  },
  activeScopeDate: {
    type: String,
    default: () => new Date().toISOString().split('T')[0]
  },
  activeScopeSessionId: {
    type: String,
    default: ''
  },
  diagnosticScope: {
    type: Object,
    default: () => ({})
  },
  allSessions: {
    type: Array,
    default: () => []
  }
});

const emit = defineEmits(['change-scope']);

const localDate = ref(props.activeScopeDate);
const localSessionId = ref(props.activeScopeSessionId);

watch(() => props.activeScopeDate, (val) => { localDate.value = val; });
watch(() => props.activeScopeSessionId, (val) => { localSessionId.value = val; });

function setMode(mode) {
  emit('change-scope', mode, localDate.value, localSessionId.value);
}

function onDateChange() {
  emit('change-scope', 'date', localDate.value, '');
}

function onSessionChange() {
  if (localSessionId.value) {
    emit('change-scope', 'session', '', localSessionId.value);
  }
}

function resetFilter() {
  localSessionId.value = '';
  emit('change-scope', 'all', new Date().toISOString().split('T')[0], '');
}
</script>

<template>
  <div class="global-filter-card card">
    <div class="filter-main">
      <div class="filter-left">
        <span class="filter-title">
          <span>🔍</span> Filter Dashboard State:
        </span>

        <div class="scope-buttons">
          <button 
            :class="['filter-pill-btn', { active: activeScopeMode === 'all' }]"
            @click="setMode('all')"
          >
            🌐 All History
          </button>
          <button 
            :class="['filter-pill-btn', { active: activeScopeMode === '5hour' }]"
            @click="setMode('5hour')"
          >
            ⚡ 5-Hour Window
          </button>
          <button 
            :class="['filter-pill-btn', { active: activeScopeMode === 'weekly' }]"
            @click="setMode('weekly')"
          >
            📅 7-Day Week
          </button>
        </div>

        <div class="date-select-group">
          <span class="sub-label">Date:</span>
          <input 
            type="date" 
            v-model="localDate" 
            class="filter-date-input mono"
            @change="onDateChange"
          />
        </div>

        <div class="thread-select-group" v-if="allSessions.length > 0">
          <span class="sub-label">Focus Thread:</span>
          <select 
            v-model="localSessionId" 
            class="filter-thread-select mono"
            @change="onSessionChange"
          >
            <option value="">-- All Threads --</option>
            <option v-for="s in allSessions.slice(0, 20)" :key="s.sessionId" :value="s.sessionId">
              {{ s.threadName }} ({{ s.turnCount }}t)
            </option>
          </select>
        </div>
      </div>

      <div class="filter-right">
        <button 
          v-if="activeScopeMode !== 'all' || activeScopeSessionId" 
          class="btn btn-secondary btn-sm reset-btn"
          @click="resetFilter"
        >
          <span>↩️</span> Reset to All History
        </button>
      </div>
    </div>

    <!-- Active Filter State Summary Banner -->
    <div class="active-state-banner">
      <span class="state-pill mono">
        📊 Active State: <strong>{{ diagnosticScope?.label || 'All History' }}</strong> • 
        <strong>{{ diagnosticScope?.sessionCount || 0 }}</strong> session(s) active • 
        <strong>{{ (diagnosticScope?.totalTokens || 0).toLocaleString() }}</strong> tokens in view 
        <span v-if="diagnosticScope?.cacheHitRate">({{ diagnosticScope.cacheHitRate }}% cached)</span>
      </span>
      <Tooltip 
        title="Dashboard State Filter" 
        text="All metrics overview cards, timeline charts, What-If diagnostics, and session tables below are strictly scoped to this selected time window." 
      />
    </div>
  </div>
</template>

<style scoped>
.global-filter-card {
  margin-bottom: 24px;
  padding: 14px 20px;
  background-color: var(--bg-card);
  border: 1px solid var(--border-color);
}

.filter-main {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 14px;
  margin-bottom: 12px;
}

.filter-left {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.filter-title {
  font-size: 0.82rem;
  font-weight: 700;
  color: var(--text-main);
  display: flex;
  align-items: center;
  gap: 6px;
}

.scope-buttons {
  display: flex;
  gap: 6px;
}

.filter-pill-btn {
  padding: 5px 12px;
  background-color: var(--bg-input);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  color: var(--text-muted);
  font-size: 0.75rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;
}

.filter-pill-btn.active {
  background: var(--accent-blue);
  color: #0b0f19;
  border-color: var(--accent-blue);
}

.date-select-group, .thread-select-group {
  display: flex;
  align-items: center;
  gap: 6px;
}

.sub-label {
  font-size: 0.72rem;
  color: var(--text-dim);
  text-transform: uppercase;
  font-weight: 700;
}

.filter-date-input, .filter-thread-select {
  background-color: var(--bg-input);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  color: var(--text-main);
  padding: 5px 8px;
  font-size: 0.75rem;
  outline: none;
}

.active-state-banner {
  display: flex;
  align-items: center;
  background-color: rgba(56, 189, 248, 0.06);
  border: 1px solid rgba(56, 189, 248, 0.18);
  padding: 6px 12px;
  border-radius: 6px;
  font-size: 0.78rem;
  justify-content: space-between;
}

.state-pill {
  color: var(--text-main);
}

.reset-btn {
  font-size: 0.75rem;
}
</style>
