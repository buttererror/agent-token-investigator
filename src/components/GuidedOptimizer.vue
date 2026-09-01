<script setup>
import { ref, onMounted, watch } from 'vue';
import Tooltip from './common/Tooltip.vue';

const props = defineProps({
  allSessions: {
    type: Array,
    default: () => []
  },
  activeWorkspace: {
    type: String,
    required: true
  },
  activeAgent: {
    type: String,
    default: 'codex'
  }
});

const emit = defineEmits(['open-handoff', 'open-skill-gen', 'open-linter']);

const activeDiagnosticIndex = ref(0);
const activeScopeMode = ref('all');
const filterDate = ref(new Date().toISOString().split('T')[0]);
const filter5HourStart = ref('latest'); // 'latest' or '0'..'19'
const filterSessionId = ref('');
const isDiagLoading = ref(false);

const localDiagnostics = ref([]);
const localScope = ref({
  mode: 'all',
  label: 'All Recorded History',
  sessionCount: 0,
  totalTokens: 0,
  cacheHitRate: 0
});


async function fetchLocalDiagnostics(
  scope = activeScopeMode.value, 
  date = filterDate.value, 
  startHour = filter5HourStart.value, 
  sessionId = filterSessionId.value
) {
  isDiagLoading.value = true;
  try {
    const params = new URLSearchParams({
      scope,
      targetProjectPath: props.activeWorkspace,
      agent: props.activeAgent || 'codex',
      workspace: props.activeWorkspace || 'all'
    });
    if (date && (scope === 'date' || scope === '5hour' || scope === 'weekly')) {
      params.set('date', date);
    }
    if (scope === '5hour' && startHour) {
      params.set('startHour', startHour);
    }
    if (sessionId && scope === 'session') {
      params.set('sessionId', sessionId);
    }

    const res = await fetch(`/api/diagnostics?${params.toString()}`);

    if (res.ok) {
      const data = await res.json();
      localDiagnostics.value = data.diagnostics || [];
      localScope.value = data.scope || { mode: scope, label: scope };
    }
  } catch (e) {
    // fallback
  } finally {
    isDiagLoading.value = false;
  }
}

function changeScopeMode(mode) {
  activeScopeMode.value = mode;
  activeDiagnosticIndex.value = 0;
  fetchLocalDiagnostics(mode, filterDate.value, filter5HourStart.value, filterSessionId.value);
}

function onDateChange() {
  fetchLocalDiagnostics(activeScopeMode.value, filterDate.value, filter5HourStart.value, filterSessionId.value);
}

function on5HourStartChange(val) {
  filter5HourStart.value = String(val);
  fetchLocalDiagnostics(activeScopeMode.value, filterDate.value, String(val), filterSessionId.value);
}

function onSessionChange() {
  const mode = filterSessionId.value ? 'session' : activeScopeMode.value;
  fetchLocalDiagnostics(mode, filterDate.value, filter5HourStart.value, filterSessionId.value);
}

const isGeneratingIssue = ref(false);

async function generateIssueFromRec(diagnostic, action) {
  isGeneratingIssue.value = true;
  try {
    const res = await fetch('/api/recommendations/generate-issue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        projectPath: props.activeWorkspace,
        diagnostic,
        action
      })
    });
    if (res.ok) {
      const data = await res.json();
      emit('issue-generated', data);
      alert(`✅ Created Agent Work Order!\nFile: ${data.relativePath}\n\nYou can now hand this off to an AI agent in the target repo.`);
    } else {
      const err = await res.json();
      alert(`Failed to generate issue: ${err.error}`);
    }
  } catch (e) {
    alert(`Error: ${e.message}`);
  } finally {
    isGeneratingIssue.value = false;
  }
}

watch([() => props.activeWorkspace, () => props.activeAgent], () => {
  fetchLocalDiagnostics(activeScopeMode.value, filterDate.value, filter5HourStart.value, filterSessionId.value);
});

onMounted(() => {
  fetchLocalDiagnostics('all');
});
</script>


<template>
  <div class="guided-optimizer card">
    <div class="opt-header">
      <div class="opt-title-group">
        <h3>🎯 Recommendations for This Scope</h3>
        <span class="opt-sub">Observed telemetry, likely contributors, and a documented next step</span>
      </div>

      <!-- Scope / Date Filter Controls (Scoped specifically to this section) -->
      <div class="scope-filter-toolbar">
        <div class="scope-pills">
          <button 
            :class="['scope-btn', { active: activeScopeMode === 'all' }]"
            @click="changeScopeMode('all')"
          >
            🌐 All Time
          </button>
          <button 
            :class="['scope-btn', { active: activeScopeMode === '5hour' }]"
            @click="changeScopeMode('5hour')"
          >
            ⚡ 5-Hour Window
          </button>
          <button 
            :class="['scope-btn', { active: activeScopeMode === 'weekly' }]"
            @click="changeScopeMode('weekly')"
          >
            📅 7-Day Week
          </button>
        </div>

        <div class="date-picker-wrap">
          <span class="ctrl-label">Date:</span>
          <input 
            type="date" 
            v-model="filterDate" 
            class="date-input mono"
            @change="onDateChange"
          />
        </div>

        <!-- 5-Hour Window Specific Time Range Selector -->
        <div v-if="activeScopeMode === '5hour'" class="hour-picker-wrap">
          <span class="ctrl-label">5h Slice:</span>
          <select 
            :value="filter5HourStart" 
            class="hour-select mono"
            @change="e => on5HourStartChange(e.target.value)"
          >
            <option value="latest">⚡ Latest 5 Hours</option>
            <option value="0">🌙 00:00 – 05:00 (Night)</option>
            <option value="5">🌅 05:00 – 10:00 (Early Morning)</option>
            <option value="8">💼 08:00 – 13:00 (Morning)</option>
            <option value="10">☀️ 10:00 – 15:00 (Midday)</option>
            <option value="12">☕ 12:00 – 17:00 (Afternoon)</option>
            <option value="14">🚀 14:00 – 19:00 (Late Afternoon)</option>
            <option value="17">🌆 17:00 – 22:00 (Evening)</option>
            <option value="19">🌌 19:00 – 24:00 (Late Night)</option>
          </select>
          
          <div class="hour-slider-inline">
            <input 
              type="range" 
              min="0" 
              max="19" 
              :value="filter5HourStart === 'latest' ? 14 : (parseInt(filter5HourStart, 10) || 0)"
              @input="e => on5HourStartChange(e.target.value)"
              class="hour-range-slider"
              title="Drag to select start hour (0:00 to 19:00)"
            />
            <span v-if="filter5HourStart !== 'latest'" class="slider-val-tag mono">
              {{ String(filter5HourStart).padStart(2, '0') }}:00 – {{ String(parseInt(filter5HourStart, 10) + 5).padStart(2, '0') }}:00
            </span>
          </div>
        </div>

        <div class="session-picker-wrap" v-if="allSessions.length > 0">
          <span class="ctrl-label">Thread:</span>
          <select v-model="filterSessionId" class="thread-select mono" @change="onSessionChange">
            <option value="">-- All Threads --</option>
            <option v-for="s in allSessions.slice(0, 15)" :key="s.sessionId" :value="s.sessionId">
              {{ s.threadName }} ({{ s.turnCount }}t)
            </option>
          </select>
        </div>
      </div>
    </div>

    <!-- Active Scope Summary Pill -->
    <div class="scope-summary-pill">
      <span class="pill-icon">📊</span>
      <span class="pill-text">
        <strong>Optimization Scope:</strong> {{ localScope?.label || 'All History' }} • 
        <strong>{{ localScope?.sessionCount || 0 }}</strong> session(s) diagnosed • 
        <strong>{{ (localScope?.totalTokens || 0).toLocaleString() }}</strong> tokens 
        <span v-if="localScope?.cacheHitRate">({{ localScope.cacheHitRate }}% cached)</span>
      </span>
    </div>

    <!-- Diagnostic Tabs -->
    <div class="tabs-nav" v-if="localDiagnostics.length > 1">
      <button 
        v-for="(diag, idx) in localDiagnostics" 
        :key="diag.id"
        :class="['tab-btn', { active: activeDiagnosticIndex === idx }]"
        @click="activeDiagnosticIndex = idx"
      >
        {{ diag.title }}
        <span v-if="diag.isAddedFromLogs" class="tab-log-indicator" title="Rule/action recorded in guidance history">📜</span>
      </button>
    </div>

    <!-- Loading State -->
    <div v-if="isDiagLoading" class="diag-loading">
      <div class="spinner"></div>
      <p>Simulating diagnostics for {{ localScope?.label }}...</p>
    </div>

    <!-- Active Diagnostic View -->
    <div v-else-if="localDiagnostics.length > 0" class="diagnostic-container">
      <div class="diag-banner">
        <div class="banner-top">
          <span class="badge badge-yellow">⚠️ Detected Inefficiency</span>
          <span v-if="localDiagnostics[activeDiagnosticIndex].isAddedFromLogs" class="badge badge-purple" title="Rule or action was recorded in Guidance Log">
            📜 Added from Guidance Log
          </span>
          <h4 class="diag-title">{{ localDiagnostics[activeDiagnosticIndex].title }}</h4>
        </div>
        <p class="diag-headline">{{ localDiagnostics[activeDiagnosticIndex].headline }}</p>

        <!-- Measured evidence box -->
        <div class="what-if-box">
          <div class="what-if-head">
            <span class="what-if-tag">🔎 Measured Telemetry Evidence ({{ localScope?.label || 'All Time' }})</span>
            <Tooltip 
              title="Measured Telemetry Evidence"
              text="Shows observed tokens and tool signals. It does not claim that all affected tokens were waste or predict savings that telemetry cannot prove."
            />
          </div>
          <div class="sim-metrics-grid">
            <div class="sim-stat">
              <span class="sim-stat-label">{{ localDiagnostics[activeDiagnosticIndex].measuredImpact.label }}</span>
              <span class="sim-stat-val text-yellow mono">{{ localDiagnostics[activeDiagnosticIndex].measuredImpact.tokens.toLocaleString() }} tokens</span>
            </div>
            <div class="sim-stat">
              <span class="sim-stat-label">Share of Recorded Usage</span>
              <span class="sim-stat-val text-yellow mono">{{ localDiagnostics[activeDiagnosticIndex].measuredImpact.sharePercent ?? '—' }}<template v-if="localDiagnostics[activeDiagnosticIndex].measuredImpact.sharePercent !== null">%</template></span>
            </div>
            <div class="sim-stat">
              <span class="sim-stat-label">Savings Forecast</span>
              <span class="sim-stat-val mono">Requires validation</span>
            </div>
          </div>
          <p class="sim-forecast">{{ localDiagnostics[activeDiagnosticIndex].measuredImpact.description }}</p>
          <p class="sim-forecast">{{ localDiagnostics[activeDiagnosticIndex].measuredImpact.validation }}</p>
        </div>
      </div>

      <!-- Action Selector Section -->
      <div class="actions-section">
        <div class="actions-header">
          <h5>Recommended next steps</h5>
          <span class="text-dim text-xs">Read-only guidance; generate an issue document when follow-up is needed.</span>
        </div>

        <div class="actions-list">
          <div 
            v-for="action in localDiagnostics[activeDiagnosticIndex].actions" 
            :key="action.actionId"
            :class="['action-card', { 'recommended-card': action.isRecommended }]"
          >
            <div class="action-top">
              <div class="action-title-wrap">
                <span :class="['badge', action.isRecommended ? 'badge-green' : 'badge-blue']">
                  {{ action.badge }}
                </span>
                <span class="action-name">{{ action.title }}</span>
                <Tooltip 
                  :title="action.title" 
                  :text="action.whatItDoes" 
                  :why-it-matters="action.whatItAchieves" 
                />
              </div>
              <div class="action-top-right">
                <span v-if="action.isAddedFromLogs" class="badge badge-purple" :title="'Recorded in guidance log: ' + (action.logRecord?.what || '')">
                  📜 Logged in History
                </span>
                <span v-if="action.isAlreadyApplied" class="badge badge-green">✅ Rule Active in Project</span>
                <span class="target-tag mono">{{ action.targetFile }}</span>
              </div>
            </div>

            <p class="action-desc">{{ action.description }}</p>

            <div class="action-impact-box">
              <div class="impact-row">
                <strong class="impact-lbl">What it does:</strong>
                <span>{{ action.whatItDoes }}</span>
              </div>
              <div class="impact-row">
                <strong class="impact-lbl">What it achieves:</strong>
                <span class="text-green">{{ action.whatItAchieves }}</span>
              </div>
            </div>

            <div class="action-footer">
              <span v-if="action.isAlreadyApplied" class="text-green text-xs">Already active in this project</span>

              <button 
                class="btn btn-secondary btn-sm btn-doc-issue"
                :disabled="isGeneratingIssue"
                @click="generateIssueFromRec(localDiagnostics[activeDiagnosticIndex], action)"
                title="Generate a structured Agent Work Order in docs/tokens-consumptions/issues/ for a project agent to solve"
              >
                <span>📑</span> Generate Agent Issue Doc
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Empty Diagnostic State -->
    <div v-else class="empty-diag-box">
      <span class="empty-icon">🟢</span>
      <h4>No Major Inefficiencies Detected in this Scope</h4>
      <p>All sessions in this filtered window were executed with high efficiency and low noise.</p>
    </div>

  </div>
</template>

<style scoped>
.guided-optimizer {
  margin-bottom: 24px;
}

.opt-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  flex-wrap: wrap;
  gap: 14px;
}

.opt-title-group h3 {
  font-size: 1.15rem;
}

.opt-sub {
  font-size: 0.78rem;
  color: var(--text-dim);
}

.scope-filter-toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.scope-pills {
  display: flex;
  gap: 6px;
}

.scope-btn {
  padding: 5px 10px;
  background-color: var(--bg-input);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  color: var(--text-muted);
  font-size: 0.75rem;
  font-weight: 600;
  cursor: pointer;
}

.scope-btn.active {
  background: var(--accent-blue);
  color: #0b0f19;
  border-color: var(--accent-blue);
}

.date-picker-wrap, .session-picker-wrap {
  display: flex;
  align-items: center;
  gap: 6px;
}

.ctrl-label {
  font-size: 0.72rem;
  color: var(--text-dim);
  text-transform: uppercase;
  font-weight: 700;
}

.date-input, .thread-select {
  background-color: var(--bg-input);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  color: var(--text-main);
  padding: 4px 8px;
  font-size: 0.75rem;
  outline: none;
}

.date-picker-wrap, .session-picker-wrap, .hour-picker-wrap {
  display: flex;
  align-items: center;
  gap: 6px;
  background: var(--bg-input);
  border: 1px solid var(--border-color);
  padding: 4px 8px;
  border-radius: 6px;
}

.hour-picker-wrap {
  background: rgba(56, 189, 248, 0.05);
  border-color: rgba(56, 189, 248, 0.3);
}

.hour-select {
  background: transparent;
  border: none;
  color: var(--text-main);
  font-size: 0.76rem;
  outline: none;
  cursor: pointer;
}

.hour-select option {
  background: var(--bg-card);
  color: var(--text-main);
}

.hour-slider-inline {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-left: 4px;
  border-left: 1px solid rgba(255, 255, 255, 0.1);
  padding-left: 6px;
}

.hour-range-slider {
  width: 70px;
  height: 4px;
  accent-color: var(--accent-blue);
  cursor: pointer;
}

.slider-val-tag {
  font-size: 0.72rem;
  color: var(--accent-blue);
  font-weight: 700;
  white-space: nowrap;
}

.scope-summary-pill {
  display: flex;
  align-items: center;
  gap: 8px;
  background-color: rgba(56, 189, 248, 0.08);
  border: 1px solid rgba(56, 189, 248, 0.2);
  padding: 8px 14px;
  border-radius: 8px;
  font-size: 0.78rem;
  margin-bottom: 18px;
}

.tabs-nav {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 16px;
}

.tab-btn {
  padding: 6px 14px;
  background-color: var(--bg-input);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  color: var(--text-muted);
  font-size: 0.78rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;
}

.tab-btn.active {
  background: rgba(56, 189, 248, 0.15);
  color: var(--accent-blue);
  border-color: var(--accent-blue);
}

.tab-log-indicator {
  font-size: 0.7rem;
  margin-left: 4px;
}

.diag-loading {
  padding: 40px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: var(--text-muted);
}

.diag-banner {
  background-color: rgba(234, 179, 8, 0.05);
  border: 1px solid rgba(234, 179, 8, 0.2);
  border-radius: 12px;
  padding: 18px;
  margin-bottom: 20px;
}

.banner-top {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 6px;
}

.diag-title {
  font-size: 1.05rem;
  font-weight: 700;
}

.diag-headline {
  font-size: 0.85rem;
  color: var(--text-muted);
  margin-bottom: 16px;
}

.what-if-box {
  background-color: var(--bg-input);
  border: 1px solid var(--border-color);
  border-radius: 10px;
  padding: 14px;
}

.what-if-head {
  display: flex;
  align-items: center;
  margin-bottom: 10px;
}

.what-if-tag {
  font-size: 0.75rem;
  font-weight: 700;
  color: var(--accent-blue);
  text-transform: uppercase;
}

.sim-metrics-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
  margin-bottom: 10px;
}

@media (max-width: 768px) {
  .sim-metrics-grid {
    grid-template-columns: 1fr;
  }
}

.sim-stat {
  display: flex;
  flex-direction: column;
}

.sim-stat-label {
  font-size: 0.72rem;
  color: var(--text-dim);
}

.sim-stat-val {
  font-size: 0.95rem;
  font-weight: 700;
}

.sim-forecast {
  font-size: 0.8rem;
  color: var(--accent-green);
  border-top: 1px dashed var(--border-color);
  padding-top: 8px;
}

/* Actions */
.actions-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 14px;
}

.actions-header h5 {
  font-size: 0.95rem;
}

.actions-list {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.action-card {
  background-color: var(--bg-input);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 16px;
  transition: all 0.2s ease;
}

.recommended-card {
  border-color: rgba(34, 197, 94, 0.4);
  background-color: rgba(34, 197, 94, 0.03);
}

.action-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
  flex-wrap: wrap;
  gap: 8px;
}

.action-title-wrap {
  display: flex;
  align-items: center;
  gap: 8px;
}

.action-top-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.action-name {
  font-weight: 700;
  font-size: 0.9rem;
}

.target-tag {
  font-size: 0.75rem;
  color: var(--text-dim);
  background-color: rgba(255,255,255,0.05);
  padding: 2px 8px;
  border-radius: 4px;
}

.action-desc {
  font-size: 0.82rem;
  color: var(--text-muted);
  margin-bottom: 12px;
}

.action-impact-box {
  background-color: rgba(0,0,0,0.2);
  border-radius: 8px;
  padding: 10px 12px;
  font-size: 0.78rem;
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 12px;
}

.impact-row {
  display: flex;
  gap: 6px;
}

.impact-lbl {
  color: var(--text-dim);
  min-width: 110px;
}

.action-footer {
  display: flex;
  gap: 10px;
}

.inline-edit-box {
  background-color: #1e293b;
  padding: 12px;
  border-radius: 8px;
  margin-top: 10px;
}

.edit-group label {
  display: block;
  font-size: 0.75rem;
  color: var(--text-dim);
  margin-bottom: 4px;
}

.edit-textarea, .edit-input {
  width: 100%;
  background-color: var(--bg-input);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  color: var(--text-main);
  padding: 8px;
  font-size: 0.8rem;
}

.edit-actions {
  display: flex;
  gap: 8px;
  margin-top: 10px;
}

.empty-diag-box {
  padding: 40px;
  text-align: center;
  color: var(--text-muted);
}

.empty-icon {
  font-size: 2rem;
  display: block;
  margin-bottom: 10px;
}

.feedback-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  border-radius: 8px;
  margin-top: 16px;
  font-size: 0.85rem;
}

.feedback-success {
  background-color: rgba(34, 197, 94, 0.15);
  color: var(--accent-green);
  border: 1px solid rgba(34, 197, 94, 0.3);
}

.feedback-error {
  background-color: rgba(239, 68, 68, 0.15);
  color: var(--accent-red);
  border: 1px solid rgba(239, 68, 68, 0.3);
}

/* Diff Modal */
.diff-modal {
  max-width: 580px;
}

.diff-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  border-bottom: 1px solid var(--border-color);
  padding-bottom: 12px;
}

.diff-body {
  display: flex;
  flex-direction: column;
  gap: 14px;
  margin-bottom: 20px;
}

.diff-target-info {
  display: flex;
  gap: 8px;
  font-size: 0.82rem;
}

.diff-view {
  background-color: #0b0f19;
  border: 1px solid var(--border-color);
  padding: 12px;
  border-radius: 8px;
}

.diff-title {
  font-size: 0.72rem;
  color: var(--text-dim);
  margin-bottom: 6px;
}

.diff-code {
  font-size: 0.8rem;
  white-space: pre-wrap;
  word-break: break-all;
}

.diff-plus {
  color: var(--accent-green);
  background-color: rgba(34, 197, 94, 0.1);
  display: block;
  padding: 4px 6px;
  border-radius: 4px;
}

.diff-notice {
  font-size: 0.78rem;
  color: var(--text-muted);
  background-color: rgba(56, 189, 248, 0.06);
  padding: 8px 12px;
  border-radius: 6px;
  border: 1px solid rgba(56, 189, 248, 0.2);
}

.diff-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.text-red { color: var(--accent-red); }
.text-yellow { color: var(--accent-yellow); }
.text-green { color: var(--accent-green); }
.text-blue { color: var(--accent-blue); }
.text-xs { font-size: 0.75rem; }
</style>
