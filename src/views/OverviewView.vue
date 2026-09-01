<script setup>
import ProviderQuotaSummary from '../components/dashboard/ProviderQuotaSummary.vue';
import UsageTrend from '../components/dashboard/UsageTrend.vue';
import TopRecommendation from '../components/dashboard/TopRecommendation.vue';
import AttentionSessionList from '../components/dashboard/AttentionSessionList.vue';

const props = defineProps({
  overview: {
    type: Object,
    default: () => ({})
  },
  sessions: {
    type: Array,
    default: () => []
  },
  attentionSessions: {
    type: Array,
    default: () => []
  },
  pacingForecast: {
    type: Object,
    default: () => ({})
  },
  topRecommendation: {
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
  activeTimeRange: {
    type: String,
    default: '7d'
  }
});

const emit = defineEmits(['inspect-session', 'view-all-sessions', 'issue-generated']);
</script>

<template>
  <div class="overview-view">
    <!-- Top Grid: Quota Status (40%) & Usage Trend (60%) -->
    <div class="overview-top-grid">
      <div class="quota-col">
        <ProviderQuotaSummary 
          :pacing-forecast="pacingForecast"
          :rate-limits="overview?.latestRateLimit || pacingForecast?.rateLimits"
          :active-agent="activeAgent"
        />
      </div>

      <div class="trend-col">
        <UsageTrend 
          :sessions="sessions"
          :active-time-range="activeTimeRange"
          :rate-limits="overview?.latestRateLimit || pacingForecast?.rateLimits"
          :pacing-forecast="pacingForecast"
        />
      </div>
    </div>

    <!-- Top Recommendation Panel -->
    <TopRecommendation 
      :recommendation="topRecommendation"
      :active-workspace="activeWorkspace"
      :active-agent="activeAgent"
      @inspect-affected="$emit('view-all-sessions')"
      @issue-generated="data => $emit('issue-generated', data)"
    />

    <!-- Sessions Needing Attention (Max 3) -->
    <AttentionSessionList 
      :sessions="attentionSessions"
      @inspect-session="s => $emit('inspect-session', s)"
      @view-all-sessions="$emit('view-all-sessions')"
    />
  </div>
</template>

<style scoped>
.overview-view {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.overview-top-grid {
  display: grid;
  grid-template-columns: 2fr 3fr;
  gap: 24px;
  align-items: stretch;
}

.quota-col, .trend-col {
  min-width: 0;
  display: flex;
  flex-direction: column;
}

@media (max-width: 1024px) {
  .overview-top-grid {
    grid-template-columns: 1fr;
    gap: 16px;
  }
}
</style>
