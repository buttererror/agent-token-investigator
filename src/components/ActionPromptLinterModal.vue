<script setup>
import { ref } from 'vue';
import { usePromptLinter } from '../composables/usePromptLinter.js';
import Tooltip from './common/Tooltip.vue';

defineProps({
  isOpen: {
    type: Boolean,
    required: true
  }
});

defineEmits(['close']);

const { draftPrompt, lintResult, isLinting, evaluatePrompt } = usePromptLinter();
const samplePrompts = [
  'Check all files in the project and see what is broken.',
  'Read the whole App.tsx file and explain how routing works.',
  'Run all tests across the repository and show me the full git log.'
];

function setSample(text) {
  draftPrompt.value = text;
  evaluatePrompt(text);
}

function handleInput() {
  evaluatePrompt(draftPrompt.value);
}
</script>

<template>
  <div v-if="isOpen" class="modal-overlay" @click="$emit('close')">
    <div class="modal-card" @click.stop>
      <div class="modal-head">
        <div class="head-info">
          <h3>🔍 Pre-Flight Prompt Token Linter</h3>
          <span class="sub-text">Test your draft prompt before submitting to Codex to catch token expansion risks</span>
        </div>
        <button class="close-btn" @click="$emit('close')">✕</button>
      </div>

      <div class="linter-body">
        <div class="sample-pills">
          <span class="sample-label">Try an example:</span>
          <button 
            v-for="(s, i) in samplePrompts" 
            :key="i"
            class="sample-btn mono"
            @click="setSample(s)"
          >
            "{{ s.substring(0, 32) }}..."
          </button>
        </div>

        <div class="prompt-input-group">
          <label>Draft Prompt Text:</label>
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
              <Tooltip title="Token Expansion Risk" text="Evaluates likelihood of triggering massive file reads or noisy command outputs." />
            </div>

            <div class="savings-estimate mono">
              <span class="orig-tok text-dim">Original: ~{{ lintResult.estimatedOriginalTokens.toLocaleString() }} tok</span>
              <span class="arrow">➔</span>
              <span class="opt-tok text-green">Optimized: ~{{ lintResult.estimatedOptimizedTokens.toLocaleString() }} tok</span>
            </div>
          </div>

          <!-- Warnings -->
          <div v-if="lintResult.warnings.length > 0" class="warnings-list">
            <div v-for="(w, idx) in lintResult.warnings" :key="idx" class="warning-item">
              <span class="warn-icon">⚠️</span>
              <span class="warn-msg">{{ w.message }}</span>
            </div>
          </div>

          <!-- Optimized Lean Rewrite -->
          <div class="optimized-section">
            <div class="opt-head">
              <span class="opt-title">✨ Recommended Token-Lean Rewrite:</span>
            </div>
            <div class="rewrite-bubble mono">{{ lintResult.optimizedPrompt }}</div>
            <button 
              class="btn btn-primary btn-sm"
              @click="navigator.clipboard.writeText(lintResult.optimizedPrompt)"
            >
              <span>📋</span> Copy Optimized Prompt
            </button>
          </div>

          <!-- Tips -->
          <div class="tips-list">
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
}

.sample-btn:hover {
  color: var(--accent-blue);
  border-color: var(--accent-blue);
}

.prompt-input-group label {
  display: block;
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--text-muted);
  margin-bottom: 6px;
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
}

.savings-estimate {
  font-size: 0.8rem;
  display: flex;
  gap: 8px;
  align-items: center;
}

.arrow { color: var(--accent-blue); }

.warnings-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 14px;
}

.warning-item {
  background-color: rgba(239, 68, 68, 0.1);
  border-left: 3px solid var(--accent-red);
  padding: 8px 12px;
  border-radius: 6px;
  font-size: 0.78rem;
  display: flex;
  gap: 8px;
  align-items: center;
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
}

.tips-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 0.75rem;
  color: var(--text-muted);
}
</style>
