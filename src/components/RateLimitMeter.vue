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
  }
});

const primaryUsed = computed(() => {
  return props.rateLimits?.primary?.used_percent ?? 0;
});

const secondaryUsed = computed(() => {
  return props.rateLimits?.secondary?.used_percent ?? 0;
});

const planType = computed(() => {
  return (props.rateLimits?.plan_type || 'Plus').toUpperCase();
});

const resetTimeFormatted = computed(() => {
  const mins = props.pacingForecast?.minutesUntilReset ?? 0;
  const hours = Math.floor(mins / 60);
  const remainingMins = mins % 60;
  if (hours > 0) return `${hours}h ${remainingMins}m`;
  return `${remainingMins}m`;
});

const pacingStatusBadge = computed(() => {
  const status = props.pacingForecast?.status;
  if (status === 'CRITICAL') return { type: 'red', text: '⚠️ High Risk' };
  if (status === 'WARNING') return { type: 'yellow', text: '⚡ Rapid Burn' };
  return { type: 'green', text: '🟢 Sustainable' };
});

const barColorPrimary = computed(() => {
  const p = primaryUsed.value;
  if (p >= 80) return 'var(--accent-red)';
  if (p >= 60) return 'var(--accent-yellow)';
  return 'var(--accent-blue)';
});
</script>

<template>
  <div class="rate-limit-card card">
    <div class="card-header">
      <div class="header-title">
        <h3>⚡ Real-Time Rate Limit & Quota Pacing</h3>
        <span class="plan-tag">{{ planType }} PLAN</span>
      </div>
      <div class="pacing-badge-wrap">
        <span :class="['badge', `badge-${pacingStatusBadge.type}`]">
          {{ pacingStatusBadge.text }}
        </span>
        <Tooltip 
          title="Rate-Limit Pacing Velocity" 
          text="Monitors your consumption rate (tokens/minute) against the 5-hour reset window to prevent unexpected lockouts." 
          why-it-matters="Hitting 100% blocks your agent from answering until older usage rolls off the window."
        />
      </div>
    </div>

    <div class="meters-grid">
      <!-- 5-Hour Rolling Limit -->
      <div class="meter-block">
        <div class="meter-labels">
          <div class="meter-title-wrap">
            <span class="meter-label">5-Hour Rate Limit Window</span>
            <Tooltip 
              title="5-Hour Rolling Window" 
              text="OpenAI's primary usage quota. Tracks total tokens consumed over the last continuous 5 hours." 
              why-it-matters="When this hits 100%, requests will be rejected until the timer rolls forward."
            />
          </div>
          <span class="meter-value mono" :style="{ color: barColorPrimary }">
            {{ primaryUsed }}% Used
          </span>
        </div>
        <div class="progress-track">
          <div 
            class="progress-fill" 
            :style="{ width: `${primaryUsed}%`, backgroundColor: barColorPrimary }"
          ></div>
        </div>
        <div class="meter-footer">
          <span class="countdown-text">
            ⏳ Resets in <strong class="mono">{{ resetTimeFormatted }}</strong>
          </span>
          <span class="velocity-text mono">
            🔥 {{ (pacingForecast?.burnRatePerMin || 0).toLocaleString() }} tok/min
          </span>
        </div>
      </div>

      <!-- Weekly Rolling Limit -->
      <div class="meter-block">
        <div class="meter-labels">
          <div class="meter-title-wrap">
            <span class="meter-label">Weekly Rolling Limit</span>
            <Tooltip 
              title="Weekly Quota" 
              text="Your overall rolling 7-day usage limit across all active threads." 
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
    <div v-if="pacingForecast?.advice" class="pacing-advice-banner">
      <span class="advice-icon">💡</span>
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

.advice-icon {
  font-size: 1.1rem;
}

.advice-text {
  color: var(--text-main);
}
</style>
