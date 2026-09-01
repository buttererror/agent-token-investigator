<script setup>
import { ref, watch, onMounted } from 'vue';

const props = defineProps({
  session: {
    type: Object,
    required: true
  },
  allSessions: {
    type: Array,
    default: () => []
  }
});

const emit = defineEmits(['close']);

const currentSession = ref(props.session);
const handoffData = ref(null);
const isLoading = ref(true);
const copied = ref(false);

async function loadHandoff(sessionId) {
  isLoading.value = true;
  try {
    const res = await fetch(`/api/generate-handoff/${sessionId}`);
    if (res.ok) {
      handoffData.value = await res.json();
    }
  } catch (e) {
    // fallback
  } finally {
    isLoading.value = false;
  }
}

onMounted(() => {
  if (currentSession.value?.sessionId) {
    loadHandoff(currentSession.value.sessionId);
  }
});

watch(currentSession, (newSession) => {
  if (newSession?.sessionId) {
    loadHandoff(newSession.sessionId);
  }
});

function copyHandoff() {
  if (handoffData.value?.summaryPrompt) {
    navigator.clipboard.writeText(handoffData.value.summaryPrompt);
    copied.value = true;
    setTimeout(() => { copied.value = false; }, 3000);
  }
}
</script>

<template>
  <div class="modal-overlay" @click="$emit('close')">
    <div class="modal-card" @click.stop>
      <div class="modal-head">
        <div class="head-info">
          <h3>📋 State-Preserving Session Handoff</h3>
          <span class="sub-text">Export compact resumption prompt to start a fresh thread without losing progress</span>
        </div>
        <button class="close-btn" @click="$emit('close')">✕</button>
      </div>

      <!-- Optional Session Switcher -->
      <div v-if="allSessions.length > 1" class="session-picker">
        <label>Selected Thread:</label>
        <select v-model="currentSession" class="picker-select mono">
          <option v-for="s in allSessions" :key="s.sessionId" :value="s">
            {{ s.threadName }} ({{ s.turnCount }} turns)
          </option>
        </select>
      </div>

      <div v-if="isLoading" class="loading-box">
        Compiling session state and extracting file references...
      </div>

      <div v-else-if="handoffData" class="handoff-content">
        <!-- Honest Context-Aware Advice Banner -->
        <div v-if="handoffData.turnCount <= 8" class="advice-banner banner-info">
          <span>🟢 <strong>Note on Short Threads:</strong> This thread is only <strong>{{ handoffData.turnCount }} turns</strong> and currently lean. A handoff prompt is most useful when a thread reaches <strong>15–20+ turns</strong> with context fatigue.</span>
        </div>
        <div v-else class="advice-banner banner-savings">
          <span>💡 <strong>Context Reset Savings:</strong> This thread has reached <strong>{{ handoffData.turnCount }} turns</strong> (~{{ (handoffData.lastTurnInputTokens || 0).toLocaleString() }} tokens/turn). Moving to a fresh window saves <strong>~{{ (handoffData.tokensSavedEstimate || 0).toLocaleString() }} tokens</strong> on every new question.</span>
        </div>

        <div class="extracted-details-grid">
          <div class="detail-item">
            <span class="lbl">Detected Objective:</span>
            <span class="val">{{ handoffData.taskGoal }}</span>
          </div>
          <div class="detail-item">
            <span class="lbl">Active Files ({{ handoffData.modifiedFiles.length }}):</span>
            <div class="files-pills">
              <span v-for="f in handoffData.modifiedFiles" :key="f" class="file-pill mono">
                {{ f }}
              </span>
              <span v-if="handoffData.modifiedFiles.length === 0" class="text-dim text-xs">No specific files modified yet</span>
            </div>
          </div>
        </div>

        <div class="prompt-output-box">
          <div class="box-head">
            <span class="box-title">Generated Fresh-Start Prompt:</span>
            <button class="btn btn-primary btn-sm" @click="copyHandoff">
              <span>{{ copied ? '✅ Copied!' : '📋 Copy Prompt' }}</span>
            </button>
          </div>
          <textarea 
            v-model="handoffData.summaryPrompt" 
            class="handoff-textarea mono"
            rows="8"
          ></textarea>
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

.session-picker {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 14px;
  background-color: var(--bg-input);
  padding: 8px 12px;
  border-radius: 8px;
}

.session-picker label {
  font-size: 0.75rem;
  font-weight: 700;
  color: var(--text-dim);
  text-transform: uppercase;
}

.picker-select {
  flex: 1;
  background-color: #0b0f19;
  border: 1px solid var(--border-color);
  color: var(--text-main);
  padding: 6px 10px;
  border-radius: 6px;
  font-size: 0.8rem;
  outline: none;
}

.loading-box {
  padding: 40px;
  text-align: center;
  color: var(--text-dim);
}

.advice-banner {
  padding: 10px 14px;
  border-radius: 8px;
  font-size: 0.82rem;
  margin-bottom: 16px;
}

.banner-info {
  background-color: rgba(56, 189, 248, 0.08);
  border: 1px solid rgba(56, 189, 248, 0.2);
  color: var(--text-main);
}

.banner-savings {
  background-color: rgba(34, 197, 94, 0.1);
  border: 1px solid rgba(34, 197, 94, 0.3);
  color: var(--accent-green);
}

.extracted-details-grid {
  display: flex;
  flex-direction: column;
  gap: 10px;
  background-color: var(--bg-input);
  padding: 14px;
  border-radius: 10px;
  margin-bottom: 16px;
}

.detail-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.detail-item .lbl {
  font-size: 0.72rem;
  font-weight: 700;
  text-transform: uppercase;
  color: var(--text-dim);
}

.detail-item .val {
  font-size: 0.85rem;
  color: var(--text-main);
}

.files-pills {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.file-pill {
  background-color: #0b0f19;
  border: 1px solid var(--border-color);
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 0.75rem;
  color: var(--accent-blue);
}

.prompt-output-box {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.box-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.box-title {
  font-size: 0.82rem;
  font-weight: 700;
  color: var(--text-muted);
}

.handoff-textarea {
  width: 100%;
  background-color: var(--bg-input);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  color: var(--text-main);
  padding: 12px;
  font-size: 0.82rem;
  outline: none;
}

.text-xs { font-size: 0.72rem; }
</style>
