<script setup>
import { ref, onMounted  } from 'vue';
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
import ProjectSelectorModal from './components/ProjectSelectorModal.vue';
import AgentIssuesModal from './components/AgentIssuesModal.vue';

const {
  overview,
  filteredOverview,
  sessions,
  filteredSessions,
  pacingForecast,
  filteredPacingForecast,
  glossary,
  projects,
  guidanceRecords,
  isLoading,
  isRecordsLoading,
  error,
  selectedSession,
  activeWorkspace,
  activeAgent,
  isAutoRefresh,
  setWorkspace,
  setAgent,
  addProject,
  removeProject,
  fetchGuidanceRecords,
  addGuidanceRecord,
  refresh
} = useTokenData();

const { undoLastAction } = useActionSelector();

const activeTimeFilter = ref('all');
const isGuideOpen = ref(false);
const isLinterOpen = ref(false);
const isHandoffOpen = ref(false);
const isSkillGenOpen = ref(false);
const isBenchmarkOpen = ref(false);
const isGuidanceRecordsOpen = ref(false);
const isProjectSelectorOpen = ref(false);
const isIssuesOpen = ref(false);
const issuesCount = ref(0);
const activeInspectSession = ref(null);

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

function handleProjectAdded(newProj) {
  setWorkspace(newProj.path);
  fetchIssuesCount(newProj.path);
  refresh();
}

async function handleProjectRemoved(projPath) {
  await removeProject(projPath);
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
    <!-- Header Navigation with Project Selector & Guidance Log -->
    <HeaderNav 
      :active-workspace="activeWorkspace"
      :active-agent="activeAgent"
      :projects="projects"
      :records-count="guidanceRecords.length"
      :issues-count="issuesCount"
      :is-auto-refresh="isAutoRefresh"
      @toggle-refresh="toggleRefresh"
      @open-guide="isGuideOpen = true"
      @open-linter="isLinterOpen = true"
      @open-benchmark="isBenchmarkOpen = true"
      @open-guidance-records="isGuidanceRecordsOpen = true"
      @open-project-selector="isProjectSelectorOpen = true"
      @open-issues="isIssuesOpen = true"
      @change-workspace="handleWorkspaceChange"
      @change-agent="handleAgentChange"
    />

    <!-- Main Content -->
    <main v-if="!isLoading">
      <!-- Action 7: Rate Limits & Quota Meter -->
      <RateLimitMeter 
        :rate-limits="filteredOverview?.latestRateLimit || (activeAgent === 'antigravity' ? null : overview?.latestRateLimit)"
        :pacing-forecast="filteredPacingForecast || pacingForecast"
        :active-agent="activeAgent"
      />


      <!-- Overview Metrics Grid -->
      <MetricsOverview
        :overview="filteredOverview"
        :sessions="filteredSessions"
        :time-filter="activeTimeFilter"
        @update-time-filter="activeTimeFilter = $event"
      />

      <!-- Token Burn Velocity Chart -->
      <TokenBurnChart 
        :overview="filteredOverview" 
        :sessions="filteredSessions" 
        :active-agent="activeAgent"
        :active-workspace="activeWorkspace"
        :time-filter="activeTimeFilter"
      />


      <!-- Guided Optimizer & What-If Action Selector -->
      <GuidedOptimizer 
        :all-sessions="filteredSessions"
        :active-workspace="activeWorkspace"
        :active-agent="activeAgent"
        @open-handoff="isHandoffOpen = true"
        @open-skill-gen="isSkillGenOpen = true"
        @open-linter="isLinterOpen = true"
        @issue-generated="() => fetchIssuesCount(activeWorkspace)"
      />


      <!-- Actionable Session List & Turn Inspector -->
      <SessionList 
        :sessions="filteredSessions" 
        @inspect-session="handleInspect"
      />
    </main>

    <!-- Loading State -->
    <div v-else class="loading-screen">
      <div class="spinner"></div>
      <p>Parsing agent telemetry & analyzing token consumption...</p>
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

    <ProjectSelectorModal 
      v-if="isProjectSelectorOpen"
      :active-workspace="activeWorkspace"
      :projects="projects"
      @close="isProjectSelectorOpen = false"
      @project-selected="handleWorkspaceChange"
      @project-added="handleProjectAdded"
      @project-removed="handleProjectRemoved"
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
