<script setup>
const props = defineProps({
  sessions: {
    type: Array,
    default: () => []
  }
});

const emit = defineEmits(['inspect-session', 'view-all-sessions']);

function formatTokens(val) {
  if (val === undefined || val === null || isNaN(val)) return '—';
  if (val >= 1000000) return `${(val / 1000000).toFixed(1)}M`;
  if (val >= 1000) return `${(val / 1000).toFixed(1)}k`;
  return val.toLocaleString();
}

function handleRowClick(session) {
  emit('inspect-session', session);
}
</script>

<template>
  <div class="attention-sessions-card">
    <div class="card-header-row">
      <h3 class="card-top-label">SESSIONS NEEDING ATTENTION</h3>
    </div>

    <!-- Table of Attention Sessions -->
    <div v-if="sessions.length > 0" class="table-wrap">
      <table class="attention-table">
        <thead>
          <tr>
            <th class="col-session">SESSION</th>
            <th class="col-fresh">FRESH INPUT</th>
            <th class="col-cache">CACHE REUSE</th>
            <th class="col-reason">REASON</th>
            <th class="col-action"><span class="sr-only">Inspect</span></th>
          </tr>
        </thead>
        <tbody>
          <tr 
            v-for="s in sessions" 
            :key="s.sessionId"
            class="session-row"
            @click="handleRowClick(s)"
            tabindex="0"
            role="button"
            @keydown.enter="handleRowClick(s)"
          >
            <!-- Session Name & Icon -->
            <td class="col-session">
              <div class="session-name-group">
                <div class="session-icon-box">
                  <svg v-if="s.attentionReason?.includes('test')" class="row-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
                    <rect x="2" y="2.5" width="12" height="11" rx="2"/>
                    <path d="M4 6l2.5 2L4 10M8 10h4"/>
                  </svg>
                  <svg v-else-if="s.attentionReason?.includes('file')" class="row-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
                    <path d="M9 2H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V5l-3-3z"/>
                    <path d="M9 2v3h3"/>
                  </svg>
                  <svg v-else class="row-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
                    <path d="M8 1.5l6 3.5v6.5l-6 3.5-6-3.5v-6.5l6-3.5z"/>
                    <path d="M8 1.5v13.5M2 5l6 3.5 6-3.5"/>
                  </svg>
                </div>
                <div class="session-title-wrap">
                  <span class="session-title">{{ s.threadName || 'Session ' + s.sessionId.substring(0, 8) }}</span>
                </div>
              </div>
            </td>

            <!-- Fresh Input -->
            <td class="col-fresh mono">
              {{ formatTokens(s.freshInput) }}
            </td>

            <!-- Cache Reuse -->
            <td class="col-cache mono">
              {{ s.cacheReuse !== undefined ? `${s.cacheReuse}%` : '—' }}
            </td>

            <!-- Reason -->
            <td class="col-reason">
              <span class="reason-text">{{ s.attentionReason || 'High input context' }}</span>
            </td>

            <!-- Chevron Action -->
            <td class="col-action">
              <svg class="chevron-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M6 3.5L10.5 8 6 12.5" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Empty State -->
    <div v-else class="empty-sessions">
      <span class="empty-icon">✓</span>
      <p class="empty-text">No recorded sessions currently require attention in this scope.</p>
    </div>

    <!-- Footer Disclaimer -->
    <div class="table-footer-disclaimer">
      All usage metrics are locally observed telemetry. Provider quota status is sourced from the API.
    </div>
  </div>
</template>

<style scoped>
.attention-sessions-card {
  background: var(--dashboard-surface);
  border: 1px solid var(--dashboard-border);
  border-radius: var(--dashboard-radius);
  padding: 24px;
}

.card-header-row {
  margin-bottom: 16px;
}

.card-top-label {
  font-size: 0.72rem;
  font-weight: 700;
  color: var(--dashboard-text-muted);
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.table-wrap {
  width: 100%;
  overflow-x: auto;
}

.attention-table {
  width: 100%;
  border-collapse: collapse;
  text-align: left;
}

.attention-table th {
  font-size: 0.7rem;
  font-weight: 700;
  color: var(--dashboard-text-muted);
  letter-spacing: 0.06em;
  text-transform: uppercase;
  padding: 10px 14px;
  border-bottom: 1px solid var(--dashboard-border);
}

.attention-table td {
  padding: 14px;
  border-bottom: 1px solid rgba(42, 58, 80, 0.5);
  font-size: 0.88rem;
  color: var(--dashboard-text);
  vertical-align: middle;
}

.session-row {
  cursor: pointer;
  transition: background 0.15s ease;
}

.session-row:hover {
  background: rgba(255, 255, 255, 0.03);
}

.session-name-group {
  display: flex;
  align-items: center;
  gap: 12px;
}

.session-icon-box {
  width: 32px;
  height: 32px;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid var(--dashboard-border);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  color: var(--dashboard-text-muted);
}

.row-icon {
  width: 16px;
  height: 16px;
}

.session-title {
  font-weight: 600;
  color: var(--dashboard-text);
  display: block;
}

.col-session {
  min-width: 240px;
}

.col-fresh {
  min-width: 110px;
  color: var(--dashboard-text-muted);
}

.col-cache {
  min-width: 110px;
  color: var(--dashboard-text-muted);
}

.col-reason {
  min-width: 180px;
  color: var(--dashboard-text-muted);
}

.reason-text {
  font-size: 0.84rem;
}

.col-action {
  width: 40px;
  text-align: right;
}

.chevron-icon {
  width: 14px;
  height: 14px;
  color: var(--dashboard-text-muted);
  transition: transform 0.15s, color 0.15s;
}

.session-row:hover .chevron-icon {
  color: var(--dashboard-cyan);
  transform: translateX(2px);
}

.empty-sessions {
  padding: 32px;
  text-align: center;
  color: var(--dashboard-text-muted);
}

.empty-icon {
  font-size: 1.5rem;
  color: var(--dashboard-green);
  display: block;
  margin-bottom: 6px;
}

.empty-text {
  font-size: 0.88rem;
}

.table-footer-disclaimer {
  margin-top: 18px;
  font-size: 0.74rem;
  color: var(--dashboard-text-dim);
  line-height: 1.4;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

@media (max-width: 768px) {
  .attention-sessions-card {
    padding: 16px;
  }
  
  .col-fresh, .col-cache {
    font-size: 0.78rem;
  }
}
</style>
