<script setup>
import { ref, onMounted } from 'vue';
import { useTokenData } from './composables/useTokenData.js';
import { useActionSelector } from './composables/useActionSelector.js';
import AppHeader from './components/dashboard/AppHeader.vue';
import OverviewView from './views/OverviewView.vue';
import SessionsView from './views/SessionsView.vue';
import AnalyticsView from './views/AnalyticsView.vue';
import TurnInspectorModal from './components/TurnInspectorModal.vue';
import GuideDrawer from './components/GuideDrawer.vue';
import ActionPromptLinterModal from './components/ActionPromptLinterModal.vue';
import ActionHandoffModal from './components/ActionHandoffModal.vue';
import ActionSkillGeneratorModal from './components/ActionSkillGeneratorModal.vue';
import BenchmarkModal from './components/BenchmarkModal.vue';
import GuidanceRecordsModal from './components/GuidanceRecordsModal.vue';
import AgentIssuesModal from './components/AgentIssuesModal.vue';

const {
  overview,
  filteredOverview,
  sessions,
  filteredSessions,
  pacingForecast,
  filteredPacingForecast,
  diagnostics,
  topRecommendation,
  attentionSessions,
  glossary,
  projects,
  guidanceRecords,
  isLoading,
  isRecordsLoading,
  isDiagnosticsLoading,
  lastDiagnosticsScope,
  error,
  selectedSession,
  activeWorkspace,
  activeAgent,
  activeTimeRange,
  currentView,
  isAutoRefresh,
  setWorkspace,
  setAgent,
  setTimeRange,
  setCurrentView,
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
const isIssuesOpen = ref(false);
const issuesCount = ref(0);
const activeInspectSession = ref(null);

import { computed } from 'vue';
const isScopeStale = computed(() => {
  const last = lastDiagnosticsScope.value;
  if (!last) return false;
  return last.timeRange !== activeTimeRange.value || last.workspace !== activeWorkspace.value || last.agent !== activeAgent.value;
});

async function fetchIssuesCount(targetPath = activeWorkspace.value) {
  try {
    const res = await fetch(`/api/token-issues?projectPath=${encodeURIComponent(targetPath)}`);
    if (res.ok) {
      const list = await res.json();
      issuesCount.value = list.length;
    }
  } catch {}
}

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
  fetchIssuesCount(newPath);
}

function handleAgentChange(newAgent) {
  setAgent(newAgent);
}

function handleTimeRangeChange(newRange) {
  setTimeRange(newRange);
}

function handleViewChange(newView) {
  setCurrentView(newView);
}

async function handleAddGuidanceRecord(recordData) {
  await addGuidanceRecord(recordData);
  fetchIssuesCount(activeWorkspace.value);
}

async function handleRollback(backupId) {
  await undoLastAction(backupId);
  fetchGuidanceRecords();
  fetchIssuesCount(activeWorkspace.value);
}

onMounted(() => {
  fetchIssuesCount(activeWorkspace.value);
});
</script>

<template>
  <div class="app-container">
    <!-- Header with Views, Scope Dropdowns, Live Sync & Tools Menu -->
    <AppHeader 
      :current-view="currentView"
      :active-workspace="activeWorkspace"
      :active-agent="activeAgent"
      :active-time-range="activeTimeRange"
      :projects="projects"
      :records-count="guidanceRecords.length"
      :issues-count="issuesCount"
      :is-auto-refresh="isAutoRefresh"
      @change-view="handleViewChange"
      @change-workspace="handleWorkspaceChange"
      @change-agent="handleAgentChange"
      @change-time-range="handleTimeRangeChange"
      @toggle-refresh="toggleRefresh"
      @open-guide="isGuideOpen = true"
      @open-linter="isLinterOpen = true"
      @open-benchmark="isBenchmarkOpen = true"
      @open-guidance-records="isGuidanceRecordsOpen = true"
      @open-issues="isIssuesOpen = true"
    />

    <!-- Main Content Views -->
    <main v-if="!isLoading">
      <!-- 1. Overview View (Default) -->
      <OverviewView 
        v-if="currentView === 'overview'"
        :overview="filteredOverview"
        :sessions="filteredSessions"
        :attention-sessions="attentionSessions"
        :pacing-forecast="filteredPacingForecast"
        :top-recommendation="topRecommendation"
        :active-workspace="activeWorkspace"
        :active-agent="activeAgent"
        :active-time-range="activeTimeRange"
        @inspect-session="handleInspect"
        @view-all-sessions="currentView = 'sessions'"
        @issue-generated="() => fetchIssuesCount(activeWorkspace)"
      />

      <!-- 2. Sessions View -->
      <SessionsView 
        v-else-if="currentView === 'sessions'"
        :sessions="filteredSessions"
        @inspect-session="handleInspect"
      />

      <!-- 3. Analytics View -->
      <AnalyticsView 
        v-else-if="currentView === 'analytics'"
        :overview="filteredOverview"
        :sessions="filteredSessions"
        :active-agent="activeAgent"
        :active-workspace="activeWorkspace"
        :active-time-range="activeTimeRange"
        @update-time-range="handleTimeRangeChange"
      />
    </main>

    <!-- Skeleton Loading State -->
    <div v-else class="skeleton-view">
      <div class="skeleton-grid-2">
        <div class="skeleton-box h-140"></div>
        <div class="skeleton-box h-140"></div>
      </div>
      <div class="skeleton-box h-160"></div>
      <div class="skeleton-box h-200"></div>
    </div>

    <!-- Modals & Drawers -->
    <GuidanceRecordsModal 
      v-if="isGuidanceRecordsOpen"
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
      @guidance-updated="() => { fetchGuidanceRecords(activeWorkspace); fetchIssuesCount(activeWorkspace); }"
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

    <AgentIssuesModal 
      :is-open="isIssuesOpen"
      :active-workspace="activeWorkspace"
      @close="isIssuesOpen = false"
      @issues-updated="cnt => issuesCount = cnt"
    />
  </div>
</template>

<style scoped>
.skeleton-view {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.skeleton-grid-2 {
  display: grid;
  grid-template-columns: 2fr 3fr;
  gap: 24px;
}

.skeleton-box {
  background: var(--dashboard-surface);
  border: 1px solid var(--dashboard-border);
  border-radius: var(--dashboard-radius);
  animation: pulse-skeleton 1.5s infinite ease-in-out;
}

.h-140 { height: 140px; }
.h-160 { height: 160px; }
.h-200 { height: 220px; }

@keyframes pulse-skeleton {
  0% { opacity: 0.6; }
  50% { opacity: 0.25; }
  100% { opacity: 0.6; }
}

@media (max-width: 1024px) {
  .skeleton-grid-2 {
    grid-template-columns: 1fr;
  }
}
</style>

