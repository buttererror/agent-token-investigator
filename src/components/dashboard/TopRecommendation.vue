<script setup>
import { computed, ref } from 'vue';
import RecommendationIssuePreviewModal from './RecommendationIssuePreviewModal.vue';

const props = defineProps({
  recommendation: {
    type: Object,
    default: null
  },
  activeWorkspace: {
    type: String,
    required: true
  },
  activeAgent: {
    type: String,
    default: 'codex'
  },
  isDiagnosticsLoading: {
    type: Boolean,
    default: false
  },
  isScopeStale: {
    type: Boolean,
    default: false
  },
  error: {
    type: String,
    default: null
  },
  sessionCount: {
    type: Number,
    default: 0
  }
});

const emit = defineEmits(['create-issue', 'inspect-affected', 'issue-generated', 'change-scope']);

const isDraftLoading = ref(false);
const isPreviewModalOpen = ref(false);
const currentDraft = ref(null);
const draftError = ref('');

const isAllProjects = computed(() => {
  return !props.activeWorkspace || props.activeWorkspace === 'all';
});
const issueSuccessMessage = ref('');

const rec = computed(() => props.recommendation);

const formattedTokens = computed(() => {
  const t = rec.value?.measuredImpact?.tokens || 0;
  if (t >= 1000000) {
    return `${(t / 1000000).toFixed(2)}M`;
  }
  if (t >= 1000) {
    return `${(t / 1000).toFixed(1)}k`;
  }
  return t.toLocaleString();
});

const affectedCount = computed(() => rec.value?.affectedCount ?? 0);
const affectedUnit = computed(() => rec.value?.affectedUnit ?? 'affected');

async function handleOpenPreview() {
  if (isAllProjects.value) return;
  isDraftLoading.value = true;
  draftError.value = '';
  issueSuccessMessage.value = '';

  try {
    const action = rec.value?.actions?.[0] || {};
    const res = await fetch('/api/recommendations/generate-issue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode: 'preview',
        projectPath: props.activeWorkspace,
        diagnostic: rec.value,
        action
      })
    });

    if (res.ok) {
      const data = await res.json();
      currentDraft.value = data;
      isPreviewModalOpen.value = true;
    } else {
      const err = await res.json();
      draftError.value = err.error || 'Failed to generate preview draft';
    }
  } catch (err) {
    draftError.value = err.message || 'Error generating preview draft';
  } finally {
    isDraftLoading.value = false;
  }
}

function handleIssueSaved(data) {
  emit('issue-generated', data);
  issueSuccessMessage.value = `Work order saved to ${data.relativePath || 'docs/tokens-consumptions/issues/'}`;
  setTimeout(() => {
    issueSuccessMessage.value = '';
  }, 6000);
}

function handleInspect() {
  emit('inspect-affected');
}
</script>

<template>
  <div class="top-rec-card">
    <div class="rec-header-row">
      <span class="rec-label">TOP RECOMMENDATION</span>
      <span v-if="rec && !isDiagnosticsLoading && !error" class="badge badge-caution">
        <svg class="caution-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M8 2.5L2 13h12L8 2.5z" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M8 6.5v3M8 11.5h.01" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        CAUTION
      </span>
      <span v-if="isScopeStale && rec && !isDiagnosticsLoading" class="badge" style="background: rgba(245, 179, 1, 0.1); color: var(--dashboard-amber);">
        STALE
      </span>
    </div>

    <!-- STATE: Error -->
    <div v-if="error" class="state-container state-error">
      <div class="state-icon">⚠️</div>
      <div class="state-content">
        <h3>Diagnostic Failure</h3>
        <p>{{ error }}</p>
      </div>
    </div>

    <!-- STATE: Loading -->
    <div v-else-if="isDiagnosticsLoading && !isScopeStale" class="state-container state-loading">
      <div class="spinner"></div>
      <div class="state-content">
        <h3>Analyzing this scope…</h3>
        <p>Scanning token telemetry for optimization opportunities.</p>
      </div>
    </div>

    <!-- STATE: No Sessions -->
    <div v-else-if="sessionCount === 0" class="state-container state-empty">
      <div class="state-icon">🔍</div>
      <div class="state-content">
        <h3>No sessions recorded in this scope</h3>
        <p>There is no telemetry data for the selected agent and workspace in this time range.</p>
      </div>
    </div>

    <!-- STATE: No Meaningful Inefficiency -->
    <div v-else-if="!rec" class="state-container state-success">
      <div class="state-icon">✨</div>
      <div class="state-content">
        <h3>No major token inefficiencies found</h3>
        <p>Your current usage appears healthy. You can manually inspect <a href="#" @click.prevent="handleInspect">Sessions</a> or <a href="#" @click.prevent="$emit('change-scope')">change the scope</a> to analyze further.</p>
      </div>
    </div>

    <!-- STATE: Recommendation Available -->
    <div v-else class="rec-grid" :class="{ 'is-stale': isDiagnosticsLoading || isScopeStale }">
      <!-- 1. Finding Region -->
      <div class="finding-region">
        <div class="finding-icon-wrap">
          <svg class="terminal-icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8">
            <rect x="2" y="3" width="16" height="14" rx="3" stroke-width="1.5"/>
            <path d="M5 8l3 2.5-3 2.5M10 13h5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </div>
        <div class="finding-content">
          <h3 class="finding-title">{{ rec.title }}</h3>
          <p class="finding-explanation">
            {{ rec.headline.replace(/\s*\(\d+.*?\)/, '') }}
          </p>
        </div>
      </div>

      <!-- 2. Evidence Region -->
      <div class="evidence-region">
        <div class="column-top-label">EVIDENCE</div>

        <div class="evidence-item">
          <svg class="ev-icon cyan-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M11 13v-1a3 3 0 0 0-3-3H4a3 3 0 0 0-3 3v1"/>
            <circle cx="6" cy="5" r="2.5"/>
            <path d="M15 13v-1a2.5 2.5 0 0 0-2-2.45M10.5 2.6a2.5 2.5 0 0 1 0 4.8"/>
          </svg>
          <div class="ev-text">
            <span class="ev-highlight-val">{{ affectedCount }}</span>
            <span class="ev-highlight-label">{{ affectedUnit }}</span>
          </div>
        </div>

        <div class="evidence-item">
          <svg class="ev-icon cyan-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M5 4L2 8L5 12M11 4L14 8L11 12" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          <div class="ev-text">
            <span class="ev-highlight-val">{{ formattedTokens }}</span>
            <span class="ev-highlight-label">{{ rec.measuredImpact?.label || 'input tokens observed' }}</span>
          </div>
        </div>

        <div class="evidence-item">
          <svg class="ev-icon amber-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M6 2v4L2.5 12.5A1.5 1.5 0 0 0 3.8 14.5h8.4a1.5 1.5 0 0 0 1.3-2L10 6V2H6z" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M5 9h6"/>
          </svg>
          <div class="ev-text">
            <span class="ev-val-amber">Savings require validation</span>
            <span class="ev-sub-disclosure">This impact is estimated.</span>
          </div>
        </div>
      </div>

      <!-- 3. Recommended Action Region -->
      <div class="action-region">
        <div class="column-top-label">RECOMMENDED ACTION</div>

        <button 
          class="btn-primary-action"
          :disabled="isDraftLoading || isAllProjects"
          @click="handleOpenPreview"
        >
          <svg class="btn-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8">
            <path d="M10 2H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V5l-3-3z"/>
            <path d="M10 2v3h3M8 7.5v4M6 9.5h4"/>
          </svg>
          {{ isDraftLoading ? 'Opening preview…' : 'Preview implementation issue' }}
        </button>

        <div v-if="isAllProjects" class="issue-success-note" style="color: var(--dashboard-text-muted); font-size: 0.8rem; margin-top: 8px;">
          Cannot draft issue across all projects. Select a specific project first.
        </div>

        <div v-if="draftError" class="draft-error-banner" style="color: var(--dashboard-red, #ef4444); font-size: 0.8rem; margin-top: 8px;">
          ⚠️ {{ draftError }}
        </div>

        <button 
          class="btn-secondary-action"
          @click="handleInspect"
        >
          <svg class="btn-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
            <circle cx="7" cy="7" r="4.5"/>
            <path d="M10.5 10.5L14 14" stroke-linecap="round"/>
          </svg>
          Inspect affected sessions
        </button>

        <div v-if="issueSuccessMessage" class="issue-success-note">
          ✓ {{ issueSuccessMessage }}
        </div>
      </div>
    </div>

    <!-- Issue Preview Modal -->
    <RecommendationIssuePreviewModal
      v-if="isPreviewModalOpen && currentDraft"
      :draft="currentDraft"
      :project-path="activeWorkspace"
      @close="isPreviewModalOpen = false"
      @issue-saved="handleIssueSaved"
    />
  </div>
</template>

<style scoped>
.top-rec-card {
  background: var(--dashboard-surface);
  border: 1px solid rgba(245, 179, 1, 0.35);
  border-left: 3px solid var(--dashboard-amber);
  border-radius: var(--dashboard-radius);
  padding: 24px;
  margin-bottom: 24px;
}

.rec-header-row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 20px;
}

.rec-label {
  font-size: 0.72rem;
  font-weight: 700;
  color: var(--dashboard-text-muted);
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.badge-caution {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  background: rgba(245, 179, 1, 0.15);
  color: var(--dashboard-amber);
  border: 1px solid rgba(245, 179, 1, 0.35);
  font-size: 0.72rem;
  font-weight: 700;
  padding: 3px 8px;
  border-radius: 6px;
  letter-spacing: 0.04em;
}

.caution-icon {
  width: 13px;
  height: 13px;
}

.rec-grid {
  display: grid;
  grid-template-columns: 1.2fr 1fr 1fr;
  gap: 32px;
  align-items: start;
}

/* 1. Finding */
.finding-region {
  display: flex;
  gap: 16px;
}

.finding-icon-wrap {
  width: 48px;
  height: 48px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid var(--dashboard-border);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  color: var(--dashboard-text);
}

.terminal-icon {
  width: 22px;
  height: 22px;
}

.finding-content {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.finding-title {
  font-size: 1.22rem;
  font-weight: 800;
  color: var(--dashboard-text);
  line-height: 1.25;
}

.finding-explanation {
  font-size: 0.88rem;
  color: var(--dashboard-text-muted);
  line-height: 1.4;
}

/* 2. Evidence */
.column-top-label {
  font-size: 0.7rem;
  font-weight: 700;
  color: var(--dashboard-text-muted);
  letter-spacing: 0.06em;
  text-transform: uppercase;
  margin-bottom: 14px;
}

.evidence-region {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.evidence-item {
  display: flex;
  align-items: flex-start;
  gap: 10px;
}

.ev-icon {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
  margin-top: 2px;
}

.cyan-icon {
  color: var(--dashboard-cyan);
}

.amber-icon {
  color: var(--dashboard-amber);
}

.ev-text {
  display: flex;
  flex-direction: column;
  font-size: 0.86rem;
  line-height: 1.3;
}

.ev-highlight-val {
  font-size: 0.95rem;
  font-weight: 700;
  color: var(--dashboard-cyan);
  font-family: var(--font-mono);
  display: inline-block;
  margin-right: 4px;
}

.ev-highlight-label {
  color: var(--dashboard-text-muted);
}

.ev-val-amber {
  font-weight: 700;
  color: var(--dashboard-text);
}

.ev-sub-disclosure {
  font-size: 0.75rem;
  color: var(--dashboard-text-muted);
}

/* 3. Recommended Action */
.action-region {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.btn-primary-action {
  background: var(--dashboard-cyan);
  color: #07101d;
  font-size: 0.88rem;
  font-weight: 700;
  padding: 12px 18px;
  border-radius: 8px;
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  transition: all 0.15s ease;
  width: 100%;
  box-shadow: 0 4px 14px rgba(45, 202, 245, 0.25);
}

.btn-primary-action:hover:not(:disabled) {
  background: #4de0fb;
  transform: translateY(-1px);
}

.btn-primary-action:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}

.btn-secondary-action {
  background: var(--dashboard-surface-raised);
  border: 1px solid var(--dashboard-border);
  color: var(--dashboard-text);
  font-size: 0.88rem;
  font-weight: 600;
  padding: 10px 18px;
  border-radius: 8px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  transition: all 0.15s ease;
  width: 100%;
}

.btn-secondary-action:hover {
  background: #18283f;
  border-color: rgba(45, 202, 245, 0.3);
}

.btn-icon {
  width: 16px;
  height: 16px;
}

.issue-success-note {
  font-size: 0.78rem;
  color: var(--dashboard-green);
  margin-top: 4px;
}

@media (max-width: 1024px) {
  .rec-grid {
    grid-template-columns: 1fr;
    gap: 20px;
  }
}

.state-container {
  display: flex;
  align-items: flex-start;
  gap: 16px;
  padding: 24px;
  background: rgba(255, 255, 255, 0.02);
  border-radius: var(--dashboard-radius);
  border: 1px solid var(--dashboard-border);
}

.state-icon {
  font-size: 1.5rem;
  line-height: 1;
}

.spinner {
  width: 24px;
  height: 24px;
  border: 3px solid rgba(255,255,255,0.1);
  border-top-color: var(--dashboard-cyan);
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.state-content h3 {
  margin: 0 0 8px 0;
  font-size: 1.1rem;
  color: var(--dashboard-text);
}

.state-content p {
  margin: 0;
  color: var(--dashboard-text-muted);
  font-size: 0.95rem;
}

.state-content a {
  color: var(--dashboard-cyan);
  text-decoration: none;
}

.state-content a:hover {
  text-decoration: underline;
}

.is-stale {
  opacity: 0.6;
  pointer-events: none;
  filter: grayscale(0.5);
}

</style>
