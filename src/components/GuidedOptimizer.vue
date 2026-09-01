<script setup>
import { ref, watch } from 'vue';
import Tooltip from './common/Tooltip.vue';
import { useActionSelector } from '../composables/useActionSelector.js';

const props = defineProps({
  diagnostics: {
    type: Array,
    default: () => []
  },
  diagnosticScope: {
    type: Object,
    default: () => ({})
  },
  allSessions: {
    type: Array,
    default: () => []
  },
  activeWorkspace: {
    type: String,
    required: true
  }
});

const emit = defineEmits(['open-handoff', 'open-skill-gen', 'open-linter', 'change-scope']);

const { isApplying, feedbackMessage, feedbackType, appliedBackups, applyAction, undoLastAction } = useActionSelector();

const activeDiagnosticIndex = ref(0);
const activeScopeMode = ref(props.diagnosticScope?.mode || 'all');
const filterDate = ref(new Date().toISOString().split('T')[0]);
const filterSessionId = ref('');

// Diff Preview Modal state
const diffModalAction = ref(null);
const diffModalCustomPayload = ref(null);

const editingAction = ref(null);
const customRuleText = ref('');
const customScriptName = ref('');
const customScriptCmd = ref('');

function changeScopeMode(mode) {
  activeScopeMode.value = mode;
  activeDiagnosticIndex.value = 0;
  emit('change-scope', mode, filterDate.value, filterSessionId.value);
}

function onDateChange() {
  activeScopeMode.value = 'date';
  activeDiagnosticIndex.value = 0;
  emit('change-scope', 'date', filterDate.value, '');
}

function onSessionChange() {
  if (filterSessionId.value) {
    activeScopeMode.value = 'session';
    activeDiagnosticIndex.value = 0;
    emit('change-scope', 'session', '', filterSessionId.value);
  }
}

function startEditing(action) {
  editingAction.value = action;
  if (action.payload?.ruleText) customRuleText.value = action.payload.ruleText;
  if (action.payload?.scriptName) customScriptName.value = action.payload.scriptName;
  if (action.payload?.scriptCommand) customScriptCmd.value = action.payload.scriptCommand;
}

function cancelEditing() {
  editingAction.value = null;
}

function openDiffPreview(action) {
  if (action.payload?.actionType === 'OPEN_HANDOFF_MODAL') {
    emit('open-handoff');
    return;
  }
  if (action.systemId === 3 && !action.payload?.instructions) {
    emit('open-skill-gen');
    return;
  }
  if (action.systemId === 5) {
    emit('open-linter');
    return;
  }

  let customPayload = null;
  if (editingAction.value?.actionId === action.actionId) {
    if (action.systemId === 1) customPayload = { ruleText: customRuleText.value };
    if (action.systemId === 2) customPayload = { scriptName: customScriptName.value, scriptCommand: customScriptCmd.value };
  }

  diffModalAction.value = action;
  diffModalCustomPayload.value = customPayload;
}

async function confirmAndApply() {
  if (!diffModalAction.value) return;
  const action = diffModalAction.value;
  const payload = diffModalCustomPayload.value;
  diffModalAction.value = null;

  await applyAction(action, props.activeWorkspace, payload);
  editingAction.value = null;
}
</script>

<template>
  <div class="guided-optimizer card">
    <div class="opt-header">
      <div class="opt-title-group">
        <h3>🎯 Guided Optimization Advisor & What-If Simulator</h3>
        <span class="opt-sub">AI-driven diagnostics paired with date-filtered What-If simulations</span>
      </div>

      <!-- Scope / Date Filter Controls -->
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

        <div class="session-picker-wrap" v-if="allSessions.length > 0">
          <span class="ctrl-label">Thread:</span>
          <select v-model="filterSessionId" class="thread-select mono" @change="onSessionChange">
            <option value="">-- Focus Single Thread --</option>
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
        <strong>Diagnosis Scope:</strong> {{ diagnosticScope?.label || 'All History' }} • 
        <strong>{{ diagnosticScope?.sessionCount || 0 }}</strong> session(s) analyzed • 
        <strong>{{ (diagnosticScope?.totalTokens || 0).toLocaleString() }}</strong> tokens 
        <span v-if="diagnosticScope?.cacheHitRate">({{ diagnosticScope.cacheHitRate }}% cached)</span>
      </span>
    </div>

    <!-- Diagnostic Tabs -->
    <div class="tabs-nav" v-if="diagnostics.length > 1">
      <button 
        v-for="(diag, idx) in diagnostics" 
        :key="diag.id"
        :class="['tab-btn', { active: activeDiagnosticIndex === idx }]"
        @click="activeDiagnosticIndex = idx"
      >
        {{ diag.title }}
      </button>
    </div>

    <!-- Active Diagnostic View -->
    <div v-if="diagnostics.length > 0" class="diagnostic-container">
      <div class="diag-banner">
        <div class="banner-top">
          <span class="badge badge-yellow">⚠️ Detected Inefficiency</span>
          <h4 class="diag-title">{{ diagnostics[activeDiagnosticIndex].title }}</h4>
        </div>
        <p class="diag-headline">{{ diagnostics[activeDiagnosticIndex].headline }}</p>

        <!-- What-If Simulation Box -->
        <div class="what-if-box">
          <div class="what-if-head">
            <span class="what-if-tag">🔬 Quantified What-If Simulation ({{ diagnosticScope?.label || 'All Time' }})</span>
            <Tooltip 
              title="Mathematical Impact Simulation" 
              text="Calculates your exact historical waste in this time window and forecasts quota recovery if an optimization is applied." 
            />
          </div>
          <div class="sim-metrics-grid">
            <div class="sim-stat">
              <span class="sim-stat-label">Wasted in this Period</span>
              <span class="sim-stat-val text-red mono">~{{ diagnostics[activeDiagnosticIndex].quantifiedWaste.tokensWasted.toLocaleString() }} tokens</span>
            </div>
            <div class="sim-stat">
              <span class="sim-stat-label">5-Hour Quota Impact</span>
              <span class="sim-stat-val text-yellow mono">{{ diagnostics[activeDiagnosticIndex].quantifiedWaste.quotaPercent }}% of Limit</span>
            </div>
            <div class="sim-stat">
              <span class="sim-stat-label">Projected Token Reduction</span>
              <span class="sim-stat-val text-green mono">-{{ diagnostics[activeDiagnosticIndex].whatIfSimulation.savedPercent }}% Noise</span>
            </div>
          </div>
          <p class="sim-forecast">{{ diagnostics[activeDiagnosticIndex].whatIfSimulation.forecast }}</p>
        </div>
      </div>

      <!-- Action Selector Section -->
      <div class="actions-section">
        <div class="actions-header">
          <h5>Ways to Avoid & Fix This Issue (Select an Action):</h5>
          <span class="text-dim text-xs">All actions write directly to {{ activeWorkspace }} with 1-click Undo</span>
        </div>

        <div class="actions-list">
          <div 
            v-for="action in diagnostics[activeDiagnosticIndex].actions" 
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

            <!-- Inline Customization Form (if open) -->
            <div v-if="editingAction?.actionId === action.actionId" class="inline-edit-box">
              <div v-if="action.systemId === 1" class="edit-group">
                <label>Customize Rule to Append into AGENTS.md:</label>
                <textarea v-model="customRuleText" class="mono edit-textarea" rows="3"></textarea>
              </div>
              <div v-if="action.systemId === 2" class="edit-group">
                <label>Script Name in package.json:</label>
                <input v-model="customScriptName" class="mono edit-input" />
                <label style="margin-top: 8px;">Command Line:</label>
                <input v-model="customScriptCmd" class="mono edit-input" />
              </div>
              <div class="edit-actions">
                <button class="btn btn-primary btn-sm" :disabled="isApplying" @click="openDiffPreview(action)">
                  Preview & Apply
                </button>
                <button class="btn btn-secondary btn-sm" @click="cancelEditing">
                  Cancel
                </button>
              </div>
            </div>

            <!-- Action Buttons -->
            <div v-else class="action-footer">
              <button 
                v-if="!action.isAlreadyApplied"
                :class="['btn', 'btn-sm', action.isRecommended ? 'btn-primary' : 'btn-secondary']"
                :disabled="isApplying"
                @click="openDiffPreview(action)"
              >
                <span>🚀</span> Apply to Project
              </button>

              <button 
                v-else
                class="btn btn-secondary btn-sm"
                @click="startEditing(action)"
              >
                <span>✏️</span> Edit Active Rule
              </button>

              <button 
                v-if="!action.isAlreadyApplied && (action.systemId === 1 || action.systemId === 2)"
                class="btn btn-secondary btn-sm"
                @click="startEditing(action)"
              >
                <span>✏️</span> Edit Rule Text
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

    <!-- Feedback / Undo Bar -->
    <div v-if="feedbackMessage" :class="['feedback-bar', `feedback-${feedbackType}`]">
      <span>{{ feedbackMessage }}</span>
      <button 
        v-if="appliedBackups.length > 0" 
        class="btn btn-warning btn-sm"
        @click="undoLastAction(appliedBackups[0].backupId)"
      >
        <span>↩️</span> Undo Last Action
      </button>
    </div>

    <!-- Diff Preview & Confirmation Modal -->
    <div v-if="diffModalAction" class="modal-overlay" @click="diffModalAction = null">
      <div class="modal-card diff-modal" @click.stop>
        <div class="diff-head">
          <h3>📝 Review File Modification</h3>
          <button class="close-btn" @click="diffModalAction = null">✕</button>
        </div>

        <div class="diff-body">
          <div class="diff-target-info">
            <span class="lbl">Target Repository File:</span>
            <span class="val mono text-blue">{{ activeWorkspace }}/{{ diffModalAction.targetFile }}</span>
          </div>

          <div class="diff-view card">
            <div class="diff-title mono">// {{ diffModalAction.targetFile }}</div>
            <pre class="diff-code mono"><span class="diff-plus">+ {{ diffModalCustomPayload?.ruleText || diffModalAction.payload?.ruleText || (diffModalAction.payload?.scriptName ? `"${diffModalAction.payload.scriptName}": "${diffModalAction.payload.scriptCommand}"` : 'Skill / Rule Configuration') }}</span></pre>
          </div>

          <div class="diff-notice">
            <span>🛡️ <strong>Safety Guarantee:</strong> An atomic backup of your original file will be stored in <code>.backups/</code> with 1-click rollback available immediately.</span>
          </div>
        </div>

        <div class="diff-footer">
          <button class="btn btn-secondary btn-sm" @click="diffModalAction = null">
            Cancel
          </button>
          <button class="btn btn-primary btn-sm" :disabled="isApplying" @click="confirmAndApply">
            <span>🚀</span> Confirm & Write to Project
          </button>
        </div>
      </div>
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
