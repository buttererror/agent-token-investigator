<script setup>
import { computed } from 'vue';
import { getSessionTimestamp, getTimeRangeBoundary } from '../../utils/timeUtils.js';

const props = defineProps({
  sessions: {
    type: Array,
    default: () => []
  },
  activeTimeRange: {
    type: String,
    default: '7d'
  },
  rateLimits: {
    type: Object,
    default: () => ({})
  },
  pacingForecast: {
    type: Object,
    default: () => ({})
  }
});

const title = computed(() => {
  if (props.activeTimeRange === '5h') return 'OBSERVED TOKEN ACTIVITY (LAST 5 HOURS)';
  if (props.activeTimeRange === 'today') return 'OBSERVED TOKEN ACTIVITY (TODAY)';
  if (props.activeTimeRange === '24h') return 'OBSERVED TOKEN ACTIVITY (LAST 24 HOURS)';
  if (props.activeTimeRange === '30d') return 'OBSERVED TOKEN ACTIVITY (LAST 30 DAYS)';
  if (props.activeTimeRange === 'all') return 'OBSERVED TOKEN ACTIVITY (ALL RECORDED SESSIONS)';
  return 'OBSERVED TOKEN ACTIVITY (LAST 7 DAYS)';
});

// Calculate Buckets
const trendData = computed(() => {
  const boundary = getTimeRangeBoundary(props.activeTimeRange);
  let startMs = boundary.startTime;
  const endMs = boundary.endTime === Number.MAX_SAFE_INTEGER ? Date.now() : boundary.endTime;

  if (!startMs || props.activeTimeRange === 'all') {
    // For 'all', find the earliest session
    let earliest = endMs - 30 * 24 * 60 * 60 * 1000;
    for (const session of props.sessions) {
      const ts = getSessionTimestamp(session);
      if (ts > 0 && ts < earliest) earliest = ts;
    }
    startMs = earliest;
  }

  const rangeMs = endMs - startMs;
  
  let bucketSizeMs;
  let formatLabel;
  
  // Decide bucket size
  if (props.activeTimeRange === '5h' || props.activeTimeRange === '24h' || props.activeTimeRange === 'today') {
    bucketSizeMs = 60 * 60 * 1000; // Hourly
    formatLabel = (d) => d.toLocaleTimeString('en-US', { hour: 'numeric' });
  } else if (props.activeTimeRange === 'all' && rangeMs > 30 * 24 * 60 * 60 * 1000) {
    bucketSizeMs = 7 * 24 * 60 * 60 * 1000; // Weekly
    formatLabel = (d) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } else {
    bucketSizeMs = 24 * 60 * 60 * 1000; // Daily
    formatLabel = (d) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  // Create empty buckets
  const buckets = [];
  let currentStart = startMs;
  while (currentStart < endMs) {
    buckets.push({
      start: currentStart,
      end: currentStart + bucketSizeMs,
      label: formatLabel(new Date(currentStart)),
      freshInput: 0,
      cachedInput: 0
    });
    currentStart += bucketSizeMs;
  }
  
  // Aggregate sessions
  for (const session of props.sessions) {
    const timestamp = getSessionTimestamp(session);
    if (timestamp >= startMs) {
      const bIndex = buckets.findIndex(b => timestamp >= b.start && timestamp < b.end);
      if (bIndex !== -1) {
        const inputTokens = session.totalUsage?.input_tokens || 0;
        const cachedTokens = session.totalUsage?.cached_input_tokens || 0;
        const freshTokens = Math.max(0, inputTokens - cachedTokens);
        
        buckets[bIndex].freshInput += freshTokens;
        buckets[bIndex].cachedInput += cachedTokens;
      }
    }
  }
  
  // For display, we can cap the number of buckets to something reasonable if it's too long
  return buckets;
});

const maxValue = computed(() => {
  let max = 100;
  for (const b of trendData.value) {
    const total = b.freshInput + b.cachedInput;
    if (total > max) max = total;
  }
  return max;
});

function formatTokenCount(t) {
  if (t >= 1000000) return (t / 1000000).toFixed(1) + 'M';
  if (t >= 1000) return (t / 1000).toFixed(0) + 'k';
  return t.toString();
}

const yAxisLabels = computed(() => {
  const m = maxValue.value;
  return [
    formatTokenCount(m),
    formatTokenCount(m * 0.75),
    formatTokenCount(m * 0.5),
    formatTokenCount(m * 0.25),
    '0'
  ];
});

// SVG Chart calculation
const chartWidth = 540;
const chartHeight = 110;
const paddingX = 20;
const paddingTop = 10;
const paddingBottom = 20;

const pointsSvg = computed(() => {
  const data = trendData.value;
  if (!data.length) return [];

  const availableWidth = chartWidth - paddingX * 2;
  const availableHeight = chartHeight - paddingTop - paddingBottom;
  const max = maxValue.value;

  return data.map((d, index) => {
    const x = paddingX + (index / Math.max(1, data.length - 1)) * availableWidth;
    const yFresh = paddingTop + availableHeight * (1 - (d.freshInput + d.cachedInput) / max); // Total height
    const yCached = paddingTop + availableHeight * (1 - d.cachedInput / max);
    return { ...d, x, yFresh, yCached };
  });
});

const pathDFresh = computed(() => {
  const pts = pointsSvg.value;
  if (!pts.length) return '';
  let d = `M ${pts[0].x} ${pts[0].yFresh}`;
  for (let i = 1; i < pts.length; i++) {
    d += ` L ${pts[i].x} ${pts[i].yFresh}`;
  }
  return d;
});

const areaDFresh = computed(() => {
  const pts = pointsSvg.value;
  if (!pts.length) return '';
  const baseline = chartHeight - paddingBottom;
  let d = pathDFresh.value;
  d += ` L ${pts[pts.length - 1].x} ${baseline} L ${pts[0].x} ${baseline} Z`;
  return d;
});
</script>

<template>
  <div class="usage-trend-card">
    <div class="card-header-row">
      <span class="card-top-label">{{ title }}</span>
    </div>
    <div class="subtitle-note">Local telemetry · Not a provider quota conversion</div>

    <div class="chart-container">
      <!-- Y-Axis Labels -->
      <div class="y-axis">
        <span v-for="(lbl, idx) in yAxisLabels" :key="idx">{{ lbl }}</span>
      </div>

      <!-- SVG Chart -->
      <div class="svg-wrap">
        <svg :viewBox="`0 0 ${chartWidth} ${chartHeight}`" preserveAspectRatio="none" class="trend-svg">
          <defs>
            <linearGradient id="cyanAreaGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="#2dcaf5" stop-opacity="0.32" />
              <stop offset="100%" stop-color="#2dcaf5" stop-opacity="0.0" />
            </linearGradient>
          </defs>

          <!-- Area -->
          <path 
            v-if="areaDFresh"
            :d="areaDFresh" 
            fill="url(#cyanAreaGradient)" 
          />
          
          <!-- Line -->
          <path 
            v-if="pathDFresh"
            :d="pathDFresh" 
            fill="none" 
            stroke="#2dcaf5" 
            stroke-width="2" 
            stroke-linecap="round"
            stroke-linejoin="round"
          />

          <!-- Data Points (only show if they have data or if the dataset is small) -->
          <circle 
            v-for="(pt, idx) in pointsSvg" 
            :key="'pt-'+idx"
            :cx="pt.x" 
            :cy="pt.yFresh" 
            :r="pt.freshInput + pt.cachedInput > 0 ? 3 : 1" 
            fill="#0f172a" 
            stroke="#2dcaf5" 
            stroke-width="1.5"
          />
        </svg>

        <!-- X-Axis Labels (HTML overlay) -->
        <div class="x-axis-labels">
          <span 
            v-for="(pt, i) in pointsSvg.filter((_, idx, arr) => arr.length <= 14 ? true : idx % Math.ceil(arr.length / 7) === 0)" 
            :key="'xl-'+i" 
            class="x-label"
            :style="{ left: `${(pt.x / chartWidth) * 100}%` }"
          >
            {{ pt.label }}
          </span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.usage-trend-card {
  background: var(--dashboard-surface);
  border: 1px solid var(--dashboard-border);
  border-radius: var(--dashboard-radius);
  padding: 20px 24px;
  display: flex;
  flex-direction: column;
  height: 100%;
  box-sizing: border-box;
}

.card-header-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.card-top-label {
  font-size: 0.72rem;
  font-weight: 700;
  color: var(--dashboard-text-muted);
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.limit-legend {
  font-size: 0.72rem;
  color: var(--dashboard-text-muted);
  position: relative;
  padding-left: 12px;
}

.limit-legend::before {
  content: '';
  position: absolute;
  left: 0;
  top: 50%;
  width: 8px;
  height: 1px;
  background: #64748b;
  border-top: 1px dashed #64748b;
}

.chart-container {
  display: flex;
  align-items: stretch;
  gap: 8px;
  flex: 1;
  position: relative;
  min-height: 100px;
}

.y-axis {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  font-size: 0.65rem;
  color: var(--dashboard-text-muted);
  font-family: var(--font-mono);
  padding-bottom: 16px;
  user-select: none;
  min-width: 32px;
}

.svg-wrap {
  flex: 1;
  position: relative;
  width: 100%;
}

.trend-svg {
  width: 100%;
  height: 100%;
  overflow: visible;
}

.latest-val-badge {
  position: absolute;
  background: var(--dashboard-cyan);
  color: #07101d;
  font-size: 0.72rem;
  font-weight: 800;
  font-family: var(--font-mono);
  padding: 2px 8px;
  border-radius: 6px;
  box-shadow: 0 2px 10px rgba(45, 202, 245, 0.5);
  pointer-events: none;
  transform: translateX(50%);
  white-space: nowrap;
}

.x-axis {
  display: flex;
  justify-content: space-between;
  padding: 4px 20px 0 40px;
  font-size: 0.7rem;
  color: var(--dashboard-text-muted);
  user-select: none;
}

@media (max-width: 600px) {
  .usage-trend-card {
    padding: 16px;
  }
  
  .x-axis {
    padding-left: 32px;
    font-size: 0.62rem;
  }
  
  .x-axis span:nth-child(even) {
    display: none;
  }
}

.subtitle-note {
  font-size: 0.75rem;
  color: var(--dashboard-text-muted);
  margin-top: -16px;
  margin-bottom: 20px;
}

</style>
