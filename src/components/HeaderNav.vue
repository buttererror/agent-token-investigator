<script setup>
import Tooltip from './common/Tooltip.vue';

defineProps({
  activeWorkspace: {
    type: String,
    required: true
  },
  isAutoRefresh: {
    type: Boolean,
    required: true
  }
});

defineEmits(['toggle-refresh', 'open-guide', 'open-linter']);
</script>

<template>
  <header class="header-nav card">
    <div class="header-left">
      <div class="brand">
        <div class="brand-icon">⚡</div>
        <div class="brand-text">
          <h1>Agent Token Tracker</h1>
          <span class="brand-sub">Codex Optimization Advisor</span>
        </div>
      </div>
      <div class="workspace-pill">
        <span class="pill-label">Workspace:</span>
        <span class="pill-path mono">{{ activeWorkspace }}</span>
        <Tooltip 
          title="Active Monorepo" 
          text="Actions applied (such as AGENTS.md rules or package.json scripts) will be safely written to this target repository." 
        />
      </div>
    </div>

    <div class="header-right">
      <button 
        class="btn btn-secondary btn-sm"
        @click="$emit('open-linter')"
      >
        <span>🔍</span> Prompt Linter
      </button>

      <button 
        class="btn btn-secondary btn-sm"
        @click="$emit('open-guide')"
      >
        <span>📖</span> Guide & Glossary
      </button>

      <button 
        :class="['btn', 'btn-sm', isAutoRefresh ? 'btn-success' : 'btn-secondary']"
        @click="$emit('toggle-refresh')"
      >
        <span :class="['refresh-dot', { active: isAutoRefresh }]"></span>
        {{ isAutoRefresh ? 'Live Sync: ON' : 'Live Sync: OFF' }}
      </button>
    </div>
  </header>
</template>

<style scoped>
.header-nav {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
  padding: 16px 24px;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 24px;
  flex-wrap: wrap;
}

.brand {
  display: flex;
  align-items: center;
  gap: 12px;
}

.brand-icon {
  font-size: 1.6rem;
  background: rgba(56, 189, 248, 0.15);
  width: 44px;
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 12px;
  border: 1px solid rgba(56, 189, 248, 0.3);
}

.brand-text h1 {
  font-size: 1.25rem;
  font-weight: 800;
  line-height: 1.2;
}

.brand-sub {
  font-size: 0.75rem;
  color: var(--text-dim);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.workspace-pill {
  display: flex;
  align-items: center;
  background-color: var(--bg-input);
  border: 1px solid var(--border-color);
  padding: 6px 14px;
  border-radius: 9999px;
  font-size: 0.8rem;
}

.pill-label {
  color: var(--text-dim);
  margin-right: 6px;
}

.pill-path {
  color: var(--accent-blue);
  font-weight: 500;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.refresh-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background-color: currentColor;
}

.refresh-dot.active {
  animation: pulse 2s infinite;
}

@keyframes pulse {
  0% { opacity: 1; }
  50% { opacity: 0.3; }
  100% { opacity: 1; }
}

@media (max-width: 900px) {
  .header-nav {
    flex-direction: column;
    align-items: flex-start;
    gap: 16px;
  }
}
</style>
