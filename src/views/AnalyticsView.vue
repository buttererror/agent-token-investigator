<script setup>
import { ref } from 'vue';
import MetricsOverview from '../components/MetricsOverview.vue';
import TokenBurnChart from '../components/TokenBurnChart.vue';

const props = defineProps({
  overview: {
    type: Object,
    default: () => ({})
  },
  sessions: {
    type: Array,
    default: () => []
  },
  activeAgent: {
    type: String,
    default: 'codex'
  },
  activeWorkspace: {
    type: String,
    required: true
  },
  activeTimeRange: {
    type: String,
    default: '7d'
  }
});

const emit = defineEmits(['update-time-range']);

function handleTimeFilterUpdate(newRange) {
  emit('update-time-range', newRange);
}
</script>

<template>
  <div class="analytics-view">
    <!-- Aggregate Metrics Overview Cards -->
    <MetricsOverview
      :overview="overview"
      :sessions="sessions"
      :time-filter="activeTimeRange"
      @update-time-filter="handleTimeFilterUpdate"
    />

    <!-- Token Composition Breakdown & Burn Velocity -->
    <TokenBurnChart 
      :overview="overview" 
      :sessions="sessions" 
      :active-agent="activeAgent"
      :active-workspace="activeWorkspace"
      :time-filter="activeTimeRange"
    />
  </div>
</template>

<style scoped>
.analytics-view {
  display: flex;
  flex-direction: column;
  gap: 24px;
}
</style>
