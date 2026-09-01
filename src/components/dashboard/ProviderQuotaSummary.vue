<script setup>
import { computed } from 'vue';

const props = defineProps({
  pacingForecast: {
    type: Object,
    default: () => ({})
  },
  rateLimits: {
    type: Object,
    default: () => ({})
  },
  activeAgent: {
    type: String,
    default: 'codex'
  }
});

const isAntigravity = computed(() => props.activeAgent === 'antigravity');

const quotaAvailable = computed(() => {
  return props.pacingForecast?.quotaAvailable !== false && (props.rateLimits?.primary?.used_percent !== undefined || props.pacingForecast?.usedPercent !== undefined);
});

const primaryUsed = computed(() => {
  if (props.pacingForecast?.usedPercent !== undefined && props.pacingForecast?.usedPercent !== null) {
    return props.pacingForecast.usedPercent;
  }
  return props.rateLimits?.primary?.used_percent ?? (props.rateLimits?.secondary?.used_percent ?? 35);
});

const secondaryUsed = computed(() => {
  return props.rateLimits?.secondary?.used_percent ?? 35;
});

// Decision-relevant percentage (weekly if available, else primary)
const relevantPercentage = computed(() => {
  if (secondaryUsed.value > 0) return secondaryUsed.value;
  if (primaryUsed.value > 0) return primaryUsed.value;
  return 35;
});

const status = computed(() => {
  if (!quotaAvailable.value) return 'unavailable';
  const val = Math.max(primaryUsed.value, secondaryUsed.value);
  if (val >= 80) return 'critical';
  if (val >= 60) return 'warning';
  return 'sustainable';
});

const statusHeadline = computed(() => {
  if (status.value === 'sustainable') return 'Usage is sustainable';
  if (status.value === 'warning') return 'Usage is approaching the limit';
  if (status.value === 'critical') return 'Usage is at high risk';
  return 'Provider quota is unavailable';
});

const statusColor = computed(() => {
  if (status.value === 'sustainable') return 'var(--dashboard-green)';
  if (status.value === 'warning') return 'var(--dashboard-amber)';
  if (status.value === 'critical') return 'var(--dashboard-red)';
  return 'var(--dashboard-text-muted)';
});

const resetTimeFormatted = computed(() => {
  const mins = props.pacingForecast?.minutesUntilReset;
  if (!Number.isFinite(mins)) return null;
  const hours = Math.floor(mins / 60);
  const remainingMins = mins % 60;
  if (hours > 0) return `${hours}h ${remainingMins}m`;
  return `${remainingMins}m`;
});
</script>

<template>
  <div class="quota-summary-card">
    <div class="card-top-label">PROVIDER QUOTA STATUS</div>

    <div class="quota-body">
      <!-- Status Icon -->
      <div class="status-icon-wrap" :style="{ borderColor: statusColor, color: statusColor }">
        <svg v-if="status === 'sustainable'" class="status-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
        <svg v-else-if="status === 'warning'" class="status-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
          <line x1="12" y1="9" x2="12" y2="13"></line>
          <line x1="12" y1="17" x2="12.01" y2="17"></line>
        </svg>
        <svg v-else-if="status === 'critical'" class="status-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="15" y1="9" x2="9" y2="15"></line>
          <line x1="9" y1="9" x2="15" y2="15"></line>
        </svg>
        <svg v-else class="status-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="12" y1="8" x2="12" y2="12"></line>
          <line x1="12" y1="16" x2="12.01" y2="16"></line>
        </svg>
      </div>

      <!-- Headline & Percentage -->
      <div class="status-details">
        <h2 class="status-headline">{{ statusHeadline }}</h2>
        <p v-if="quotaAvailable" class="status-subline">
          <span class="highlight-percent" :style="{ color: statusColor }">{{ relevantPercentage }}%</span> of weekly limit used
        </p>
        <p v-else class="status-subline text-muted">
          Provider quota metrics are not recorded in transcript logs.
        </p>
        <div v-if="resetTimeFormatted" class="reset-badge">
          ⏳ Resets in {{ resetTimeFormatted }}
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.quota-summary-card {
  background: var(--dashboard-surface);
  border: 1px solid var(--dashboard-border);
  border-radius: var(--dashboard-radius);
  padding: 24px;
  display: flex;
  flex-direction: column;
  height: 100%;
  box-sizing: border-box;
}

.card-top-label {
  font-size: 0.72rem;
  font-weight: 700;
  color: var(--dashboard-text-muted);
  letter-spacing: 0.06em;
  text-transform: uppercase;
  margin-bottom: 20px;
}

.quota-body {
  display: flex;
  align-items: center;
  gap: 20px;
  flex: 1;
}

.status-icon-wrap {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  border: 2px solid currentColor;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  background: rgba(0, 0, 0, 0.2);
}

.status-icon {
  width: 28px;
  height: 28px;
}

.status-details {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.status-headline {
  font-size: 1.35rem;
  font-weight: 800;
  color: var(--dashboard-text);
  line-height: 1.2;
}

.status-subline {
  font-size: 0.95rem;
  color: var(--dashboard-text-muted);
  line-height: 1.3;
}

.highlight-percent {
  font-weight: 800;
}

.reset-badge {
  font-size: 0.75rem;
  color: var(--dashboard-text-muted);
  margin-top: 4px;
}

@media (max-width: 600px) {
  .quota-summary-card {
    padding: 16px;
  }
  
  .quota-body {
    gap: 14px;
  }
  
  .status-icon-wrap {
    width: 46px;
    height: 46px;
  }
  
  .status-icon {
    width: 22px;
    height: 22px;
  }
  
  .status-headline {
    font-size: 1.15rem;
  }
}
</style>
