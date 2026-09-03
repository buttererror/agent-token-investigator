<script setup>
import { ref, computed, watch } from 'vue';
import { usePromptLinter } from '../composables/usePromptLinter.js';
import Tooltip from './common/Tooltip.vue';

const props = defineProps({
  isOpen: {
    type: Boolean,
    required: true
  },
  initialPrompt: {
    type: String,
    default: ''
  },
  initialAgent: {
    type: String,
    default: 'codex'
  }
});

const emit = defineEmits(['close']);

const { 
  draftPrompt, 
  targetAgent, 
  lintResult, 
  isLinting, 
  evaluatePrompt, 
  evaluatePromptImmediate, 
  setTargetAgent 
} = usePromptLinter();

const isCopied = ref(false);

const samplePrompts = [
  {
    label: 'Noisy Tests & Git Log',
    text: 'Run all tests across the repository and show me the full git log.'
  },
  {
    label: 'Broad Scan & Full File',
    text: 'Check all files in the project and read the whole App.vue to see what is broken.'
  },
  {
    label: 'Multi-Task Sprawl',
    text: 'Fix the auth bug and also rewrite the navbar and also add unit tests.'
  },
  {
    label: 'High Reasoning Routine Edit',
    text: 'Think deeply and exhaustively to rename the variable and format code.'
  },
  {
    label: 'Directory Tree Dump',
    text: 'Print the full directory tree to understand the repo structure.'
  }
];

const wordCount = computed(() => {
  if (!draftPrompt.value.trim()) return 0;
  return draftPrompt.value.trim().split(/\s+/).length;
});

function setSample(text) {
  draftPrompt.value = text;
  evaluatePromptImmediate(text);
}

function handleInput() {
  evaluatePrompt(draftPrompt.value);
}

function applyOptimizedPrompt() {
  if (lintResult.value?.optimizedPrompt) {
    draftPrompt.value = lintResult.value.optimizedPrompt;
    evaluatePromptImmediate(draftPrompt.value);
  }
}

async function copyOptimized() {
  if (!lintResult.value?.optimizedPrompt) return;
  try {
    await navigator.clipboard.writeText(lintResult.value.optimizedPrompt);
    isCopied.value = true;
    setTimeout(() => {
      isCopied.value = false;
    }, 2000);
  } catch (e) {
    // fallback
  }
}

function clearPrompt() {
  draftPrompt.value = '';
  evaluatePromptImmediate('');
}

watch(() => props.isOpen, (open) => {
  if (open) {
    const agent = props.initialAgent || 'codex';
    setTargetAgent(agent);
    if (props.initialPrompt) {
      draftPrompt.value = props.initialPrompt;
      evaluatePromptImmediate(props.initialPrompt, agent);
    } else {
      draftPrompt.value = '';
      evaluatePromptImmediate('', agent);
    }
  }
}, { immediate: true });
</script>

<template>
  <div v-if="isOpen" class="modal-overlay" @click="$emit('close')">
    <div class="modal-card" @click.stop>
      <div class="modal-head">
        <div class="head-info">
          <h3>🔍 Pre-Flight Prompt Token Linter</h3>
          <span class="sub-text">Lint your draft prompt before dispatching to catch token expansion anti-patterns</span>
        </div>
        <button class="close-btn" @click="$emit('close')">✕</button>
      </div>

      <div class="linter-body">
        <!-- Target Agent Switcher & Quick Stats -->
        <div class="agent-bar">
          <div class="agent-toggle-group">
            <span class="agent-toggle-lbl">Target Agent:</span>
            <button 
              :class="['agent-btn', { active: targetAgent === 'codex' }]"
              @click="setTargetAgent('codex')"
            >
              <span>⚡</span> OpenAI Codex
            </button>
            <button 
              :class="['agent-btn', { active: targetAgent === 'antigravity' }]"
              @click="setTargetAgent('antigravity')"
            >
              <span>🌌</span> Google Antigravity
            </button>
          </div>

          <div v-if="draftPrompt" class="prompt-meta-pill mono text-dim">
            <span>{{ draftPrompt.length }} chars</span>
            <span class="sep">•</span>
            <span>~{{ wordCount }} words</span>
            <button class="clear-btn" title="Clear text" @click="clearPrompt">✕ Clear</button>
          </div>
        </div>

        <!-- Sample Pills -->
        <div class="sample-pills">
          <span class="sample-label">Try an example:</span>
          <button 
            v-for="(s, i) in samplePrompts" 
            :key="i"
            class="sample-btn"
            @click="setSample(s.text)"
          >
            {{ s.label }}
          </button>
        </div>

        <!-- Prompt Textarea -->
        <div class="prompt-input-group">
          <div class="input-head">
            <label>Draft Prompt Text:</label>
            <span v-if="isLinting" class="lint-indicator text-cyan mono">Evaluating rules...</span>
          </div>
          <textarea 
            v-model="draftPrompt" 
            class="prompt-textarea mono"
            rows="4"
            placeholder="Type your prompt here (e.g. 'Run tests and inspect src/features/auth/')..."
            @input="handleInput"
          ></textarea>
        </div>

        <!-- Linter Feedback -->
        <div v-if="lintResult" class="lint-result-box">
          <div class="result-top">
            <div class="risk-badge-wrap">
              <span :class="['badge', lintResult.riskLevel === 'HIGH' ? 'badge-red' : lintResult.riskLevel === 'MEDIUM' ? 'badge-yellow' : 'badge-green']">
                {{ lintResult.riskLevel }} TOKEN RISK (Score: {{ lintResult.riskScore }}/100)
              </span>
              <Tooltip title="Token Expansion Risk" text="Evaluates likelihood of triggering massive file reads, unbounded directory trees, or noisy command outputs." />
            </div>

            <div class="savings-estimate mono">
              <span class="orig-tok text-dim">Original: ~{{ lintResult.estimatedOriginalTokens.toLocaleString() }} tok</span>
              <span class="arrow">➔</span>
              <span class="opt-tok text-green">Optimized: ~{{ lintResult.estimatedOptimizedTokens.toLocaleString() }} tok</span>
              <span v-if="lintResult.tokensSaved > 0" class="saved-tag text-green">
                (-{{ lintResult.tokensSaved.toLocaleString() }})
              </span>
            </div>
          </div>

          <!-- Matched Anti-Pattern Chips -->
          <div v-if="lintResult.ruleMatches?.length > 0" class="rule-chips-wrap">
            <span class="chips-title">Detected Anti-Patterns:</span>
            <div class="chips-list">
              <span 
                v-for="(r, rIdx) in lintResult.ruleMatches" 
                :key="rIdx"
                :class="['rule-chip', `severity-${r.severity.toLowerCase()}`]"
              >
                {{ r.label }}
              </span>
            </div>
          </div>

          <!-- Warnings -->
          <div v-if="lintResult.warnings.length > 0" class="warnings-list">
            <div 
              v-for="(w, idx) in lintResult.warnings" 
              :key="idx" 
              :class="['warning-item', `warn-${w.severity.toLowerCase()}`]"
            >
              <span class="warn-icon">{{ w.severity === 'HIGH' ? '🚨' : (w.severity === 'MEDIUM' ? '⚠️' : 'ℹ️') }}</span>
              <div class="warn-content">
                <span class="warn-cat mono">{{ w.category }}:</span>
                <span class="warn-msg">{{ w.message }}</span>
              </div>
            </div>
          </div>

          <!-- Optimized Lean Rewrite -->
          <div class="optimized-section">
            <div class="opt-head">
              <span class="opt-title">✨ Recommended Token-Lean Rewrite:</span>
            </div>
            <div class="rewrite-bubble mono">{{ lintResult.optimizedPrompt }}</div>
            <div class="rewrite-actions">
              <button 
                :class="['btn btn-sm', isCopied ? 'btn-copied' : 'btn-primary']"
                @click="copyOptimized"
              >
                <span>{{ isCopied ? '✅' : '📋' }}</span>
                {{ isCopied ? 'Copied to Clipboard!' : 'Copy Optimized Prompt' }}
              </button>
              <button 
                class="btn btn-secondary btn-sm"
                @click="applyOptimizedPrompt"
              >
                <span>↵</span> Apply to Draft
              </button>
            </div>
          </div>

          <!-- Tips -->
          <div v-if="lintResult.tips?.length > 0" class="tips-list">
            <span v-for="(tip, tIdx) in lintResult.tips" :key="tIdx" class="tip-item">
              💡 {{ tip }}
            </span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  background-color: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  backdrop-filter: blur(4px);
}

.modal-card {
  background-color: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 14px;
  width: 90%;
  max-width: 780px;
  max-height: 90vh;
  overflow-y: auto;
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.5);
  padding: 24px;
}

.modal-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 16px;
  border-bottom: 1px solid var(--border-color);
  padding-bottom: 14px;
}

.head-info h3 {
  font-size: 1.15rem;
  font-weight: 700;
  color: var(--text-main);
  margin-bottom: 4px;
}

.sub-text {
  font-size: 0.78rem;
  color: var(--text-dim);
}

.close-btn {
  background: none;
  border: none;
  color: var(--text-dim);
  font-size: 1.3rem;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 6px;
}

.close-btn:hover {
  color: var(--text-main);
  background-color: rgba(255, 255, 255, 0.05);
}

.agent-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 14px;
  flex-wrap: wrap;
  gap: 10px;
}

.agent-toggle-group {
  display: flex;
  align-items: center;
  gap: 6px;
}

.agent-toggle-lbl {
  font-size: 0.75rem;
  color: var(--text-dim);
  font-weight: 600;
}

.agent-btn {
  background-color: var(--bg-input);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  padding: 4px 10px;
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--text-muted);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  transition: all 0.2s ease;
}

.agent-btn.active {
  background: rgba(45, 202, 245, 0.15);
  border-color: var(--dashboard-cyan, #2dcaf5);
  color: var(--dashboard-cyan, #2dcaf5);
}

.prompt-meta-pill {
  font-size: 0.72rem;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.clear-btn {
  background: none;
  border: none;
  color: var(--text-dim);
  cursor: pointer;
  font-size: 0.72rem;
  padding: 2px 4px;
  border-radius: 4px;
}

.clear-btn:hover {
  color: var(--accent-red, #ef4444);
}

.sample-pills {
  display: flex;
  gap: 8px;
  margin-bottom: 14px;
  align-items: center;
  flex-wrap: wrap;
}

.sample-label {
  font-size: 0.75rem;
  color: var(--text-dim);
}

.sample-btn {
  background-color: var(--bg-input);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  padding: 4px 10px;
  font-size: 0.72rem;
  color: var(--text-muted);
  cursor: pointer;
  transition: border-color 0.2s;
}

.sample-btn:hover {
  color: var(--accent-blue);
  border-color: var(--accent-blue);
}

.input-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6px;
}

.prompt-input-group label {
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--text-muted);
}

.lint-indicator {
  font-size: 0.72rem;
  animation: pulse 1.2s infinite;
}

@keyframes pulse {
  0% { opacity: 0.4; }
  50% { opacity: 1; }
  100% { opacity: 0.4; }
}

.prompt-textarea {
  width: 100%;
  background-color: var(--bg-input);
  border: 1px solid var(--border-color);
  border-radius: 10px;
  color: var(--text-main);
  padding: 12px;
  font-size: 0.85rem;
  outline: none;
  margin-bottom: 16px;
  resize: vertical;
}

.prompt-textarea:focus {
  border-color: var(--border-focus);
}

.lint-result-box {
  background-color: var(--bg-input);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 16px;
}

.result-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 14px;
  flex-wrap: wrap;
  gap: 10px;
}

.risk-badge-wrap {
  display: flex;
  align-items: center;
  gap: 6px;
}

.savings-estimate {
  font-size: 0.8rem;
  display: flex;
  gap: 8px;
  align-items: center;
}

.arrow { color: var(--accent-blue); }

.rule-chips-wrap {
  margin-bottom: 12px;
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.chips-title {
  font-size: 0.72rem;
  color: var(--text-dim);
  font-weight: 600;
}

.chips-list {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.rule-chip {
  font-size: 0.68rem;
  font-weight: 700;
  padding: 2px 7px;
  border-radius: 4px;
}

.rule-chip.severity-high {
  background: rgba(239, 68, 68, 0.15);
  color: var(--accent-red, #ef4444);
  border: 1px solid rgba(239, 68, 68, 0.3);
}

.rule-chip.severity-medium {
  background: rgba(245, 158, 11, 0.15);
  color: var(--accent-yellow, #f59e0b);
  border: 1px solid rgba(245, 158, 11, 0.3);
}

.rule-chip.severity-low {
  background: rgba(56, 189, 248, 0.15);
  color: var(--accent-blue, #38bdf8);
  border: 1px solid rgba(56, 189, 248, 0.3);
}

.warnings-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 14px;
}

.warning-item {
  padding: 8px 12px;
  border-radius: 6px;
  font-size: 0.78rem;
  display: flex;
  gap: 10px;
  align-items: flex-start;
}

.warning-item.warn-high {
  background-color: rgba(239, 68, 68, 0.08);
  border-left: 3px solid var(--accent-red, #ef4444);
}

.warning-item.warn-medium {
  background-color: rgba(245, 158, 11, 0.08);
  border-left: 3px solid var(--accent-yellow, #f59e0b);
}

.warning-item.warn-low {
  background-color: rgba(56, 189, 248, 0.08);
  border-left: 3px solid var(--accent-blue, #38bdf8);
}

.warn-content {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.warn-cat {
  font-size: 0.7rem;
  font-weight: 700;
  color: var(--text-main);
}

.warn-msg {
  color: var(--text-muted);
}

.optimized-section {
  background-color: rgba(34, 197, 94, 0.05);
  border: 1px solid rgba(34, 197, 94, 0.2);
  padding: 14px;
  border-radius: 10px;
  margin-bottom: 12px;
}

.opt-head {
  margin-bottom: 8px;
}

.opt-title {
  font-size: 0.82rem;
  font-weight: 700;
  color: var(--accent-green);
}

.rewrite-bubble {
  background-color: #0b0f19;
  padding: 10px 12px;
  border-radius: 6px;
  font-size: 0.8rem;
  color: var(--text-main);
  margin-bottom: 10px;
  border: 1px solid var(--border-color);
  white-space: pre-wrap;
  word-break: break-word;
}

.rewrite-actions {
  display: flex;
  gap: 8px;
  align-items: center;
}

.btn-copied {
  background-color: var(--accent-green, #22c55e) !important;
  color: #0b0f19 !important;
  font-weight: 700;
}

.tips-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 0.75rem;
  color: var(--text-muted);
}

.tip-item {
  line-height: 1.4;
}

.sep {
  color: var(--text-dim);
}

.text-cyan {
  color: var(--dashboard-cyan, #2dcaf5);
}
</style>
