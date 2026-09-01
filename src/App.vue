<script setup>
import { ref } from 'vue';
import { useTokenData } from './composables/useTokenData.js';
import { useActionSelector } from './composables/useActionSelector.js';
import HeaderNav from './components/HeaderNav.vue';
import RateLimitMeter from './components/RateLimitMeter.vue';
import MetricsOverview from './components/MetricsOverview.vue';
import TokenBurnChart from './components/TokenBurnChart.vue';
import GuidedOptimizer from './components/GuidedOptimizer.vue';
import SessionList from './components/SessionList.vue';
import TurnInspectorModal from './components/TurnInspectorModal.vue';
import GuideDrawer from './components/GuideDrawer.vue';
import ActionPromptLinterModal from './components/ActionPromptLinterModal.vue';
import ActionHandoffModal from './components/ActionHandoffModal.vue';
import ActionSkillGeneratorModal from './components/ActionSkillGeneratorModal.vue';
import BenchmarkModal from './components/BenchmarkModal.vue';
import GuidanceRecordsModal from './components/GuidanceRecordsModal.vue';

const {
  overview,
  sessions,
  pacingForecast,
  glossary,
  projects,
  guidanceRecords,
  isLoading,
  isRecordsLoading,
  error,
  selectedSession,
  activeWorkspace,
  isAutoRefresh,
  setWorkspace,
  fetchGuidanceRecords,
  addGuidanceRecord,
  refresh
} = useTokenData();

const { undoLastAction } = useActionSelector();

const isGuideOpen = ref(false);
const isLinterOpen = ref(false);
const isHandoffOpen = ref(false);
const isSkillGenOpen = ref(false);
const isBenchmarkOpen = ref(false);
const isGuidanceRecordsOpen = ref(false);
const activeInspectSession = ref(null);

function handleInspect(session) {
  activeInspectSession.value = session;
}

function handleExportHandoff(session) {
  activeInspectSession.value = null;
  selectedSession.value = session;
  isHandoffOpen.value = true;
}

function toggleRefresh() {
  isAutoRefresh.value = !isAutoRefresh.value;
}

function handleWorkspaceChange(newPath) {
  setWorkspace(newPath);
}

async function handleRollback(backupId) {
  await undoLastAction(backupId);
  await fetchGuidanceRecords(activeWorkspace.value);
}

async function handleAddGuidanceRecord(data) {
  await addGuidanceRecord(data);
}
</script>

<template>
  <div class="app-container">
    <!-- Header Navigation with Project Selector & Guidance Log -->
    <HeaderNav 
      :active-workspace="activeWorkspace"
      :projects="projects"
      :records-count="guidanceRecords.length"
      :is-auto-refresh="isAutoRefresh"
      @toggle-refresh="toggleRefresh"
      @open-guide="isGuideOpen = true"
      @open-linter="isLinterOpen = true"
      @open-benchmark="isBenchmarkOpen = true"
      @open-guidance-records="isGuidanceRecordsOpen = true"
      @change-workspace="handleWorkspaceChange"
    />

    <!-- Main Content -->
    <main v-if="!isLoading">
      <!-- Action 7: Rate Limits & Quota Meter -->
      <RateLimitMeter 
        :rate-limits="overview?.latestRateLimit"
        :pacing-forecast="pacingForecast"
      />

      <!-- Top Summary Metrics Cards with Inline Time Filters -->
      <MetricsOverview :overview="overview" :sessions="sessions" />

      <!-- Interactive Analytics & Burn Charts -->
      <TokenBurnChart :overview="overview" :sessions="sessions" />

      <!-- Centerpiece: Guided Optimization Advisor (Section-Scoped What-If Simulator & Actions) -->
      <GuidedOptimizer 
        :all-sessions="sessions"
        :active-workspace="activeWorkspace"
        @open-handoff="isHandoffOpen = true"
        @open-skill-gen="isSkillGenOpen = true"
        @open-linter="isLinterOpen = true"
      />

      <!-- Session Explorer Table -->
      <SessionList 
        :sessions="sessions" 
        @inspect-session="handleInspect"
      />
    </main>

    <!-- Loading State -->
    <div v-else class="loading-screen">
      <div class="spinner"></div>
      <p>Reading ~/.codex session rollouts and computing token analytics...</p>
    </div>

    <!-- Modals & Drawers -->
    <GuidanceRecordsModal 
      :is-open="isGuidanceRecordsOpen"
      :active-workspace="activeWorkspace"
      :projects="projects"
      :records="guidanceRecords"
      :is-loading="isRecordsLoading"
      @close="isGuidanceRecordsOpen = false"
      @select-project="fetchGuidanceRecords"
      @add-record="handleAddGuidanceRecord"
      @rollback="handleRollback"
    />

    <GuideDrawer 
      :is-open="isGuideOpen"
      :glossary="glossary"
      @close="isGuideOpen = false"
    />

    <TurnInspectorModal 
      v-if="activeInspectSession"
      :session="activeInspectSession"
      :active-workspace="activeWorkspace"
      @close="activeInspectSession = null"
      @export-handoff="handleExportHandoff"
      @guidance-updated="() => fetchGuidanceRecords(activeWorkspace)"
    />

    <ActionPromptLinterModal 
      :is-open="isLinterOpen"
      @close="isLinterOpen = false"
    />

    <ActionHandoffModal 
      v-if="isHandoffOpen"
      :session="selectedSession || sessions.find(s => s.turnCount > 10) || sessions[0]"
      :all-sessions="sessions"
      @close="isHandoffOpen = false"
    />

    <ActionSkillGeneratorModal 
      :is-open="isSkillGenOpen"
      :active-workspace="activeWorkspace"
      @close="isSkillGenOpen = false"
    />

    <BenchmarkModal 
      :is-open="isBenchmarkOpen"
      :active-workspace="activeWorkspace"
      @close="isBenchmarkOpen = false"
    />
  </div>
</template>

<style scoped>
.loading-screen {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 400px;
  gap: 16px;
  color: var(--text-muted);
}

.spinner {
  width: 40px;
  height: 40px;
  border: 3px solid rgba(56, 189, 248, 0.2);
  border-top-color: var(--accent-blue);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>
