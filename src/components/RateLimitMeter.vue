<script setup>
import { computed } from 'vue';
import Tooltip from './common/Tooltip.vue';

const props = defineProps({
  rateLimits: {
    type: Object,
    default: () => ({})
  },
  pacingForecast: {
    type: Object,
    default: () => ({})
  },
  activeAgent: {
    type: String,
    default: 'codex'
  }
});

const isAntigravity = computed(() => props.activeAgent === 'antigravity');

const primaryUsed = computed(() => {
  return props.rateLimits?.primary?.used_percent ?? 0;
});

const secondaryUsed = computed(() => {
  return props.rateLimits?.secondary?.used_percent ?? 0;
});

const quotaAvailable = computed(() => props.pacingForecast?.quotaAvailable !== false);

const planType = computed(() => {
  if (isAntigravity.value) {
    return quotaAvailable.value ? (props.rateLimits?.plan_type || 'ANTIGRAVITY').toUpperCase() : 'LOCAL ACTIVITY ONLY';
  }
  return (props.rateLimits?.plan_type || 'Plus').toUpperCase();
});

const resetTimeFormatted = computed(() => {
  const mins = props.pacingForecast?.minutesUntilReset;
  if (!Number.isFinite(mins)) return 'Unavailable';
  const hours = Math.floor(mins / 60);
  const remainingMins = mins % 60;
  if (hours > 0) return `${hours}h ${remainingMins}m`;
  return `${remainingMins}m`;
});

const pacingStatusBadge = computed(() => {
  const status = props.pacingForecast?.status;
  if (status === 'UNAVAILABLE') return { type: 'muted', text: 'Local Estimate' };
  if (status === 'CRITICAL') return { type: 'red', text: '⚠️ High Risk' };
  if (status === 'WARNING') return { type: 'yellow', text: '⚡ Rapid Burn' };
  return { type: 'green', text: '🟢 Sustainable' };
});

const barColorPrimary = computed(() => {
  const p = primaryUsed.value;
  if (p >= 80) return 'var(--accent-red)';
  if (p >= 60) return 'var(--accent-yellow)';
  if (isAntigravity.value) return 'var(--accent-purple, #a855f7)';
  return 'var(--accent-blue)';
});
</script>

<template>
  <div class="rate-limit-card card">
    <div class="card-header">
      <div class="header-title">
        <h3>{{ isAntigravity ? '🌌 Antigravity Quota & Rate Limit Pacing' : '⚡ Real-Time Rate Limit & Quota Pacing' }}</h3>
        <span class="plan-tag" :class="{ 'plan-tag-antigravity': isAntigravity }">{{ planType }}</span>
      </div>
      <div class="pacing-badge-wrap">
        <span :class="['badge', `badge-${pacingStatusBadge.type}`]">
          {{ pacingStatusBadge.text }}
        </span>
        <Tooltip 
          title="Rate-Limit Pacing Velocity" 
          :text="isAntigravity 
            ? 'Monitors Antigravity turn consumption rate (tokens/minute) and quota sustainability across active threads.'
            : 'Monitors your consumption rate (tokens/minute) against the 5-hour reset window to prevent unexpected lockouts.'" 
          why-it-matters="Hitting 100% blocks your agent from answering until older usage rolls off the window."
        />
      </div>
    </div>

    <div class="meters-grid">
      <!-- 5-Hour Rolling Limit -->
      <div class="meter-block">
        <div class="meter-labels">
          <div class="meter-title-wrap">
            <span class="meter-label">{{ !quotaAvailable ? 'Live Provider Quota' : (isAntigravity ? '5-Hour Rate Limit Window (Gemini Flash/Pro)' : '5-Hour Rate Limit Window') }}</span>
            <Tooltip 
              title="5-Hour Rolling Window" 
              :text="isAntigravity 
                ? 'Antigravity primary usage quota. Tracks total tokens consumed over the last continuous 5 hours.'
                : 'Codex primary usage quota. Tracks total tokens consumed over the last continuous 5 hours.'" 
              why-it-matters="When this hits 100%, requests will be rejected until the timer rolls forward."
            />
          </div>
          <span v-if="quotaAvailable" class="meter-value mono" :style="{ color: barColorPrimary }">
            {{ primaryUsed }}% Used
          </span>
          <span v-else class="meter-value mono text-muted">Unavailable</span>
        </div>
        <div v-if="quotaAvailable" class="progress-track">
          <div 
            class="progress-fill" 
            :style="{ width: `${primaryUsed}%`, backgroundColor: barColorPrimary }"
          ></div>
        </div>
        <div v-else class="quota-unavailable">Transcript logs do not contain provider quota balances or reset times.</div>
        <div class="meter-footer">
          <span class="countdown-text">
            ⏳ {{ quotaAvailable ? `Resets in ${resetTimeFormatted}` : 'No reset timestamp available' }}
          </span>
          <span class="velocity-text mono">
            🔥 ~{{ (pacingForecast?.burnRatePerMin || 0).toLocaleString() }} local tok/min
          </span>
        </div>
      </div>

      <!-- Weekly Rolling Limit -->
      <div v-if="quotaAvailable" class="meter-block">
        <div class="meter-labels">
          <div class="meter-title-wrap">
            <span class="meter-label">{{ isAntigravity ? 'Weekly Rolling Quota' : 'Weekly Rolling Limit' }}</span>
            <Tooltip 
              title="Weekly Quota" 
              :text="isAntigravity 
                ? 'Antigravity weekly usage limit across all active threads.'
                : 'Your overall rolling 7-day usage limit across all active threads.'" 
              why-it-matters="Ensures weekly consumption stays within plan limits."
            />
          </div>
          <span class="meter-value mono text-muted">
            {{ secondaryUsed }}% Used
          </span>
        </div>
        <div class="progress-track">
          <div 
            class="progress-fill fill-secondary" 
            :style="{ width: `${secondaryUsed}%` }"
          ></div>
        </div>
        <div class="meter-footer">
          <span class="countdown-text text-dim">
            📅 Rolling 7-Day Window
          </span>
          <span class="status-summary text-dim">
            Normal Pace
          </span>
        </div>
      </div>
    </div>

    <!-- Live Pacing Recommendation Banner -->
    <div v-if="pacingForecast?.advice" class="pacing-advice-banner" :class="{ 'banner-antigravity': isAntigravity }">
      <span class="advice-icon">{{ isAntigravity ? '🌌' : '💡' }}</span>
      <span class="advice-text">
        <strong>Pacing Advisor:</strong> {{ pacingForecast.advice }}
      </span>
    </div>
  </div>
</template>

<style scoped>
.rate-limit-card {
  margin-bottom: 24px;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.header-title {
  display: flex;
  align-items: center;
  gap: 12px;
}

.header-title h3 {
  font-size: 1.1rem;
}

.plan-tag {
  font-size: 0.7rem;
  font-weight: 700;
  background: rgba(168, 85, 247, 0.15);
  color: var(--accent-purple);
  padding: 3px 8px;
  border-radius: 6px;
  border: 1px solid rgba(168, 85, 247, 0.3);
}

.meters-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 24px;
  margin-bottom: 16px;
}

@media (max-width: 768px) {
  .meters-grid {
    grid-template-columns: 1fr;
  }
}

.meter-block {
  background-color: var(--bg-input);
  padding: 16px 20px;
  border-radius: 12px;
  border: 1px solid var(--border-color);
}

.meter-labels {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}

.meter-title-wrap {
  display: flex;
  align-items: center;
}

.meter-label {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--text-muted);
}

.meter-value {
  font-size: 1.05rem;
  font-weight: 700;
}

.progress-track {
  height: 10px;
  background-color: #1e293b;
  border-radius: 9999px;
  overflow: hidden;
  margin-bottom: 10px;
}

.progress-fill {
  height: 100%;
  border-radius: 9999px;
  transition: width 0.4s ease, background-color 0.4s;
}

.fill-secondary {
  background-color: var(--accent-purple);
}

.meter-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.78rem;
  color: var(--text-muted);
}

.pacing-advice-banner {
  display: flex;
  align-items: center;
  gap: 10px;
  background-color: rgba(56, 189, 248, 0.08);
  border: 1px solid rgba(56, 189, 248, 0.2);
  padding: 12px 16px;
  border-radius: 10px;
  font-size: 0.85rem;
}

.quota-unavailable {
  min-height: 10px;
  padding: 10px 12px;
  border: 1px dashed rgba(168, 85, 247, 0.45);
  border-radius: 6px;
  color: var(--text-muted);
  font-size: 0.78rem;
}

.banner-antigravity {
  background-color: rgba(168, 85, 247, 0.08);
  border-color: rgba(168, 85, 247, 0.25);
}

.plan-tag-antigravity {
  background: rgba(168, 85, 247, 0.2);
  color: #c084fc;
  border-color: rgba(168, 85, 247, 0.4);
}

.advice-icon {
  font-size: 1.1rem;
}

.advice-text {
  color: var(--text-main);
}
</style>
