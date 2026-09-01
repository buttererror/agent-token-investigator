<script setup>
import Tooltip from './common/Tooltip.vue';

defineProps({
  session: {
    type: Object,
    required: true
  }
});

defineEmits(['close', 'export-handoff']);
</script>

<template>
  <div class="modal-overlay" @click="$emit('close')">
    <div class="modal-card" @click.stop>
      <div class="modal-head">
        <div class="head-info">
          <h3>🔍 Turn-by-Turn Session Inspector</h3>
          <span class="session-name-lg">{{ session.threadName }}</span>
          <span class="session-path mono text-dim text-xs">{{ session.meta.cwd }} • {{ session.sessionId }}</span>
        </div>
        <div class="head-actions">
          <button 
            class="btn btn-primary btn-sm"
            @click="$emit('export-handoff', session)"
          >
            <span>📋</span> Export Handoff Prompt
          </button>
          <button class="close-btn" @click="$emit('close')">✕</button>
        </div>
      </div>

      <!-- Quick Session Stats Bar -->
      <div class="stats-summary-bar">
        <div class="summary-item">
          <span class="lbl">Total Turns:</span>
          <span class="val mono">{{ session.turnCount }}</span>
        </div>
        <div class="summary-item">
          <span class="lbl">Total Tokens:</span>
          <span class="val mono">{{ (session.totalUsage.total_tokens || 0).toLocaleString() }}</span>
        </div>
        <div class="summary-item">
          <span class="lbl">Cached Input:</span>
          <span class="val mono text-green">{{ (session.totalUsage.cached_input_tokens || 0).toLocaleString() }}</span>
        </div>
        <div class="summary-item">
          <span class="lbl">Reasoning:</span>
          <span class="val mono text-purple">{{ (session.totalUsage.reasoning_output_tokens || 0).toLocaleString() }}</span>
        </div>
      </div>

      <!-- Turns Timeline -->
      <div class="turns-timeline">
        <div 
          v-for="turn in session.turns" 
          :key="turn.turnNumber"
          :class="['turn-box', { 'has-spike': turn.noiseSpikes?.length > 0 }]"
        >
          <div class="turn-top">
            <div class="turn-index-group">
              <span class="turn-badge mono">Turn #{{ turn.turnNumber }}</span>
              <span class="turn-time mono text-dim">{{ (turn.startedAt || '').slice(11, 19) }}</span>
              <span v-if="turn.durationMs" class="turn-dur mono text-dim">({{ (turn.durationMs / 1000).toFixed(1) }}s)</span>
            </div>

            <!-- Per Turn Token Breakdown -->
            <div v-if="turn.tokenUsage" class="turn-tokens-pill mono">
              <span title="Input Tokens">In: {{ (turn.tokenUsage.input_tokens || 0).toLocaleString() }}</span>
              <span class="sep">•</span>
              <span class="text-green" title="Cached Tokens">Cache: {{ (turn.tokenUsage.cached_input_tokens || 0).toLocaleString() }}</span>
              <span class="sep">•</span>
              <span class="text-purple" title="Reasoning Tokens">Think: {{ (turn.tokenUsage.reasoning_output_tokens || 0).toLocaleString() }}</span>
              <span class="sep">•</span>
              <span title="Output Tokens">Out: {{ (turn.tokenUsage.output_tokens || 0).toLocaleString() }}</span>
            </div>
          </div>

          <!-- Noise Spikes Alert (if any) -->
          <div v-if="turn.noiseSpikes?.length > 0" class="spike-alert">
            <span v-for="(spike, i) in turn.noiseSpikes" :key="i" class="spike-item">
              🚨 <strong>{{ spike.type }}:</strong> {{ spike.message }}
            </span>
          </div>

          <!-- User Prompt Section -->
          <div v-if="turn.userPrompt" class="prompt-section">
            <div class="section-label">User Request:</div>
            <div class="prompt-bubble mono">{{ turn.userPrompt }}</div>
          </div>

          <!-- Tool Calls Section -->
          <div v-if="turn.toolCalls?.length > 0" class="tools-section">
            <div class="section-label">Tool Invocations ({{ turn.toolCalls.length }}):</div>
            <div class="tools-list">
              <div v-for="(tc, i) in turn.toolCalls" :key="i" class="tool-pill mono">
                <span class="tool-name">🔧 {{ tc.tool }}</span>
                <span v-if="tc.input?.cmd" class="tool-arg">{{ tc.input.cmd.substring(0, 70) }}...</span>
                <span v-else-if="tc.input?.AbsolutePath" class="tool-arg">{{ tc.input.AbsolutePath }}</span>
              </div>
            </div>
          </div>

          <!-- Assistant Message Preview -->
          <div v-if="turn.assistantMessage" class="assistant-section">
            <div class="section-label">Assistant Response:</div>
            <div class="assistant-preview mono">{{ turn.assistantMessage.substring(0, 240) }}...</div>
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
  padding-bottom: 16px;
}

.head-info h3 {
  font-size: 1.15rem;
}

.session-name-lg {
  font-size: 1rem;
  font-weight: 700;
  color: var(--accent-blue);
  display: block;
}

.head-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.close-btn {
  background: none;
  border: none;
  color: var(--text-dim);
  font-size: 1.3rem;
  cursor: pointer;
}

.stats-summary-bar {
  display: flex;
  gap: 20px;
  background-color: var(--bg-input);
  padding: 12px 18px;
  border-radius: 10px;
  margin-bottom: 20px;
  flex-wrap: wrap;
}

.summary-item {
  display: flex;
  gap: 6px;
  font-size: 0.82rem;
}

.summary-item .lbl {
  color: var(--text-dim);
}

.turns-timeline {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.turn-box {
  background-color: var(--bg-input);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 14px;
}

.turn-box.has-spike {
  border-color: rgba(239, 68, 68, 0.4);
  background-color: rgba(239, 68, 68, 0.02);
}

.turn-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
  flex-wrap: wrap;
  gap: 8px;
}

.turn-index-group {
  display: flex;
  align-items: center;
  gap: 8px;
}

.turn-badge {
  background: rgba(56, 189, 248, 0.15);
  color: var(--accent-blue);
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 0.75rem;
  font-weight: 700;
}

.turn-time, .turn-dur {
  font-size: 0.72rem;
}

.turn-tokens-pill {
  font-size: 0.72rem;
  background-color: #1e293b;
  padding: 3px 8px;
  border-radius: 6px;
  display: flex;
  gap: 6px;
}

.sep {
  color: var(--text-dim);
}

.spike-alert {
  background-color: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.3);
  padding: 8px 12px;
  border-radius: 6px;
  font-size: 0.78rem;
  color: var(--accent-red);
  margin-bottom: 10px;
}

.section-label {
  font-size: 0.7rem;
  font-weight: 700;
  text-transform: uppercase;
  color: var(--text-dim);
  margin-bottom: 4px;
}

.prompt-bubble {
  background-color: #1e293b;
  padding: 10px 12px;
  border-radius: 8px;
  font-size: 0.8rem;
  color: var(--text-main);
  margin-bottom: 10px;
  white-space: pre-wrap;
}

.tools-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 10px;
}

.tool-pill {
  background-color: #0b0f19;
  border: 1px solid var(--border-color);
  padding: 6px 10px;
  border-radius: 6px;
  font-size: 0.75rem;
  display: flex;
  gap: 8px;
  align-items: center;
}

.tool-name {
  color: var(--accent-yellow);
  font-weight: 600;
}

.tool-arg {
  color: var(--text-muted);
}

.assistant-preview {
  font-size: 0.78rem;
  color: var(--text-muted);
  background-color: rgba(0,0,0,0.2);
  padding: 8px 10px;
  border-radius: 6px;
}

.text-xs { font-size: 0.72rem; }
.text-green { color: var(--accent-green); }
.text-purple { color: var(--accent-purple); }
</style>
