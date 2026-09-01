<script setup>
import { ref, onMounted } from 'vue';
import Tooltip from './common/Tooltip.vue';

const props = defineProps({
  isOpen: {
    type: Boolean,
    required: true
  },
  activeWorkspace: {
    type: String,
    required: true
  }
});

defineEmits(['close']);

const isRunning = ref(false);
const benchmarkData = ref(null);
const contextSize = ref(174500);

async function runBenchmark() {
  isRunning.value = true;
  try {
    const res = await fetch(`/api/run-benchmark?targetProjectPath=${encodeURIComponent(props.activeWorkspace)}&contextSize=${contextSize.value}`);
    if (res.ok) {
      benchmarkData.value = await res.json();
    }
  } catch (e) {
    // fallback
  } finally {
    isRunning.value = false;
  }
}

onMounted(() => {
  runBenchmark();
});
</script>

<template>
  <div v-if="isOpen" class="modal-overlay" @click="$emit('close')">
    <div class="modal-card benchmark-modal" @click.stop>
      <div class="modal-head">
        <div class="head-info">
          <h3>⚡ Live Verification Benchmark</h3>
          <span class="sub-text">Option A (5 Sequential Tool Calls) vs. Option B (1 Packaged Skill)</span>
        </div>
        <button class="close-btn" @click="$emit('close')">✕</button>
      </div>

      <div class="benchmark-controls">
        <div class="ctx-input-wrap">
          <label>Simulated Active Context Carryover:</label>
          <select v-model="contextSize" class="ctx-select mono" @change="runBenchmark">
            <option :value="50000">50,000 tokens (Early Session - Turn 4)</option>
            <option :value="100000">100,000 tokens (Mid Session - Turn 8)</option>
            <option :value="174500">174,500 tokens (Turn 12 in your project)</option>
            <option :value="220000">220,000 tokens (Late Session - Turn 18)</option>
          </select>
        </div>
        <button class="btn btn-secondary btn-sm" :disabled="isRunning" @click="runBenchmark">
          <span>🔄</span> {{ isRunning ? 'Running Tests...' : 'Re-Run Live Benchmark' }}
        </button>
      </div>

      <div v-if="isRunning" class="loading-box">
        <div class="spinner"></div>
        <p>Executing live tests, linter, build, and git status on {{ activeWorkspace }}...</p>
      </div>

      <div v-else-if="benchmarkData" class="benchmark-results">
        <!-- Comparison Summary Hero Box -->
        <div class="hero-verdict-box">
          <div class="verdict-head">
            <span class="verdict-tag">🏆 BENCHMARK RESULTS</span>
            <span class="verdict-stat mono text-green">-{{ benchmarkData.comparison.percentageSaved }}% Total Tokens Saved</span>
          </div>
          <p class="verdict-desc">{{ benchmarkData.comparison.verdict }}</p>
          <div class="savings-pills">
            <div class="pill">
              <span class="lbl">Tokens Saved per Check:</span>
              <strong class="val mono text-green">~{{ benchmarkData.comparison.tokensSaved.toLocaleString() }} tokens</strong>
            </div>
            <div class="pill">
              <span class="lbl">API Round-Trips Eliminated:</span>
              <strong class="val mono text-blue">{{ benchmarkData.comparison.roundTripsSaved }} fewer round-trips</strong>
            </div>
            <div class="pill">
              <span class="lbl">Execution Speed:</span>
              <strong class="val mono text-yellow">{{ (benchmarkData.optionB.durationMs / 1000).toFixed(2) }}s vs {{ (benchmarkData.optionA.durationMs / 1000).toFixed(2) }}s</strong>
            </div>
          </div>
        </div>

        <!-- Side-by-Side Comparison Columns -->
        <div class="columns-grid">
          <!-- Option A -->
          <div class="option-col col-bad card">
            <div class="col-head">
              <span class="badge badge-red">Option A</span>
              <h4>5 Sequential Tool Calls</h4>
            </div>
            <p class="col-desc">Model runs 5 individual commands, re-sending the entire context window on every step.</p>

            <div class="steps-list">
              <div v-for="(s, idx) in benchmarkData.optionA.steps" :key="idx" class="step-row mono">
                <span class="step-num">{{ idx + 1 }}.</span>
                <span class="step-name">{{ s.name }}</span>
                <span class="step-tok text-dim">{{ s.outputTokens }} tok</span>
              </div>
            </div>

            <div class="col-summary">
              <div class="sum-row">
                <span>API Round-Trips:</span>
                <strong class="mono">{{ benchmarkData.optionA.roundTrips }} cycles</strong>
              </div>
              <div class="sum-row">
                <span>Total Tokens Exchanged:</span>
                <strong class="mono text-red">{{ benchmarkData.optionA.totalCumulativeContext.toLocaleString() }}</strong>
              </div>
              <div class="sum-row">
                <span>Total Time:</span>
                <strong class="mono">{{ (benchmarkData.optionA.durationMs / 1000).toFixed(2) }}s</strong>
              </div>
            </div>
          </div>

          <!-- Option B -->
          <div class="option-col col-good card">
            <div class="col-head">
              <span class="badge badge-green">Option B</span>
              <h4>1 Packaged Skill ($verify-slice)</h4>
            </div>
            <p class="col-desc">Combined lean script suppresses non-failing noise and completes in 1 step.</p>

            <div class="command-box mono">
              <code>{{ benchmarkData.optionB.command }}</code>
            </div>

            <div class="output-preview mono">
              <span class="preview-lbl">Single Clean Output:</span>
              <pre>{{ benchmarkData.optionB.outputSnippet || '✓ Tests passed cleanly' }}</pre>
            </div>

            <div class="col-summary">
              <div class="sum-row">
                <span>API Round-Trips:</span>
                <strong class="mono text-green">{{ benchmarkData.optionB.roundTrips }} cycles</strong>
              </div>
              <div class="sum-row">
                <span>Total Tokens Exchanged:</span>
                <strong class="mono text-green">{{ benchmarkData.optionB.totalCumulativeContext.toLocaleString() }}</strong>
              </div>
              <div class="sum-row">
                <span>Total Time:</span>
                <strong class="mono text-green">{{ (benchmarkData.optionB.durationMs / 1000).toFixed(2) }}s</strong>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.benchmark-modal {
  max-width: 860px;
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
  font-size: 1.2rem;
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

.benchmark-controls {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  background-color: var(--bg-input);
  padding: 10px 14px;
  border-radius: 8px;
  flex-wrap: wrap;
  gap: 10px;
}

.ctx-input-wrap {
  display: flex;
  align-items: center;
  gap: 10px;
}

.ctx-input-wrap label {
  font-size: 0.78rem;
  color: var(--text-muted);
}

.ctx-select {
  background-color: #0b0f19;
  border: 1px solid var(--border-color);
  color: var(--text-main);
  padding: 6px 10px;
  border-radius: 6px;
  font-size: 0.78rem;
}

.loading-box {
  padding: 60px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
  color: var(--text-muted);
}

.hero-verdict-box {
  background-color: rgba(34, 197, 94, 0.08);
  border: 1px solid rgba(34, 197, 94, 0.3);
  padding: 16px 20px;
  border-radius: 12px;
  margin-bottom: 20px;
}

.verdict-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6px;
}

.verdict-tag {
  font-weight: 800;
  font-size: 0.82rem;
  color: var(--accent-green);
}

.verdict-stat {
  font-size: 1.1rem;
  font-weight: 800;
}

.verdict-desc {
  font-size: 0.85rem;
  color: var(--text-main);
  margin-bottom: 14px;
}

.savings-pills {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
}

@media (max-width: 768px) {
  .savings-pills {
    grid-template-columns: 1fr;
  }
}

.savings-pills .pill {
  background-color: var(--bg-input);
  border: 1px solid var(--border-color);
  padding: 8px 12px;
  border-radius: 8px;
  display: flex;
  flex-direction: column;
}

.savings-pills .lbl {
  font-size: 0.7rem;
  color: var(--text-dim);
}

.savings-pills .val {
  font-size: 0.9rem;
}

.columns-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

@media (max-width: 768px) {
  .columns-grid {
    grid-template-columns: 1fr;
  }
}

.option-col {
  padding: 16px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
}

.col-bad {
  border-color: rgba(239, 68, 68, 0.3);
  background-color: rgba(239, 68, 68, 0.02);
}

.col-good {
  border-color: rgba(34, 197, 94, 0.3);
  background-color: rgba(34, 197, 94, 0.02);
}

.col-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}

.col-head h4 {
  font-size: 0.95rem;
}

.col-desc {
  font-size: 0.78rem;
  color: var(--text-muted);
  margin-bottom: 14px;
}

.steps-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 16px;
}

.step-row {
  background-color: #0b0f19;
  padding: 6px 10px;
  border-radius: 6px;
  font-size: 0.75rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.step-num {
  color: var(--accent-blue);
  margin-right: 6px;
}

.step-name {
  flex: 1;
  color: var(--text-main);
}

.command-box {
  background-color: #0b0f19;
  padding: 10px;
  border-radius: 6px;
  border: 1px solid var(--border-color);
  margin-bottom: 12px;
  font-size: 0.75rem;
  color: var(--accent-green);
  word-break: break-all;
}

.output-preview {
  background-color: #0b0f19;
  padding: 10px;
  border-radius: 6px;
  border: 1px solid var(--border-color);
  margin-bottom: 16px;
  font-size: 0.72rem;
  max-height: 100px;
  overflow-y: auto;
}

.preview-lbl {
  color: var(--text-dim);
  display: block;
  margin-bottom: 4px;
}

.col-summary {
  background-color: var(--bg-input);
  padding: 12px;
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.sum-row {
  display: flex;
  justify-content: space-between;
  font-size: 0.8rem;
}

.text-red { color: var(--accent-red); }
.text-green { color: var(--accent-green); }
.text-blue { color: var(--accent-blue); }
.text-yellow { color: var(--accent-yellow); }
</style>
