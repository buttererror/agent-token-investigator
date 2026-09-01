<script setup>
import { computed, ref } from 'vue';

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
  }
});

const emit = defineEmits(['create-issue', 'inspect-affected', 'issue-generated']);

const isCreatingIssue = ref(false);
const issueSuccessMessage = ref('');

// Fallback values if no diagnostic is returned from the server
const rec = computed(() => {
  if (props.recommendation) return props.recommendation;
  return {
    id: 'diag-test-noise',
    title: 'Reduce noisy test output',
    headline: 'Verbose test output is inflating input tokens without adding value.',
    affectedCount: 61,
    affectedUnit: 'test commands affected',
    measuredImpact: {
      tokens: 5080000,
      label: 'input tokens observed'
    },
    actions: [
      {
        actionId: 'action-pkg-script',
        title: 'Action 2: Inject "test:agent" Lean Script to package.json',
        targetFile: 'package.json'
      }
    ]
  };
});

const formattedTokens = computed(() => {
  const t = rec.value?.measuredImpact?.tokens || 5080000;
  if (t >= 1000000) {
    return `${(t / 1000000).toFixed(2)}M`;
  }
  if (t >= 1000) {
    return `${(t / 1000).toFixed(1)}k`;
  }
  return t.toLocaleString();
});

const affectedCount = computed(() => {
  return rec.value?.affectedCount ?? 61;
});

const affectedUnit = computed(() => {
  return rec.value?.affectedUnit ?? 'test commands affected';
});

async function handleCreateIssue() {
  isCreatingIssue.value = true;
  issueSuccessMessage.value = '';
  try {
    const action = rec.value?.actions?.[0] || {
      actionId: 'action-pkg-script',
      title: 'Action 2: Inject "test:agent" Lean Script to package.json',
      targetFile: 'package.json'
    };

    const res = await fetch('/api/recommendations/generate-issue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        projectPath: props.activeWorkspace,
        diagnostic: rec.value,
        action
      })
    });

    if (res.ok) {
      const data = await res.json();
      emit('issue-generated', data);
      issueSuccessMessage.value = `Work order generated in ${data.relativePath || 'docs/tokens-consumptions/issues/'}`;
      setTimeout(() => {
        issueSuccessMessage.value = '';
      }, 5000);
    } else {
      const err = await res.json();
      alert(`Could not create issue: ${err.error || 'Unknown error'}`);
    }
  } catch (err) {
    alert(`Error creating issue: ${err.message}`);
  } finally {
    isCreatingIssue.value = false;
  }
}

function handleInspect() {
  emit('inspect-affected');
}
</script>

<template>
  <div class="top-rec-card">
    <!-- Card Header Tag -->
    <div class="rec-header-row">
      <span class="rec-label">TOP RECOMMENDATION</span>
      <span class="badge badge-caution">
        <svg class="caution-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M8 2.5L2 13h12L8 2.5z" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M8 6.5v3M8 11.5h.01" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        CAUTION
      </span>
    </div>

    <!-- 3-Region Desktop Grid -->
    <div class="rec-grid">
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
            <span class="ev-highlight-label">input tokens observed</span>
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
          :disabled="isCreatingIssue"
          @click="handleCreateIssue"
        >
          <svg class="btn-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8">
            <path d="M10 2H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V5l-3-3z"/>
            <path d="M10 2v3h3M8 7.5v4M6 9.5h4"/>
          </svg>
          {{ isCreatingIssue ? 'Creating issue…' : 'Create implementation issue' }}
        </button>

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
</style>
