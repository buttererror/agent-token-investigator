<script setup>
import Tooltip from './common/Tooltip.vue';

const props = defineProps({
  activeWorkspace: {
    type: String,
    required: true
  },
  activeAgent: {
    type: String,
    default: 'all'
  },
  projects: {
    type: Array,
    default: () => []
  },
  recordsCount: {
    type: Number,
    default: 0
  },
  issuesCount: {
    type: Number,
    default: 0
  },
  isAutoRefresh: {
    type: Boolean,
    required: true
  }
});

const emit = defineEmits([
  'toggle-refresh',
  'open-guide',
  'open-linter',
  'open-benchmark',
  'open-guidance-records',
  'open-project-selector',
  'open-issues',
  'change-workspace',
  'change-agent'
]);

function onSelectProject(e) {
  const val = e.target.value;
  if (val === '__add_project__') {
    emit('open-project-selector');
    e.target.value = props.activeWorkspace;
    return;
  }
  emit('change-workspace', val);
}
</script>

<template>
  <header class="header-nav card">
    <div class="header-left">
      <div class="brand">
        <div class="brand-icon">⚡</div>
        <div class="brand-text">
          <h1>Agent Token Tracker</h1>
          <span class="brand-sub">Multi-Agent Optimization Advisor</span>
        </div>
      </div>

      <!-- Agent Switcher Segmented Control -->
      <div class="agent-switch-group">
        <button 
          :class="['agent-tab-btn', { active: activeAgent === 'all' }]"
          @click="$emit('change-agent', 'all')"
          title="Show sessions from all AI agents"
        >
          <span>⚡</span> All
        </button>
        <button 
          :class="['agent-tab-btn', { active: activeAgent === 'codex' }]"
          @click="$emit('change-agent', 'codex')"
          title="Filter to Codex CLI sessions"
        >
          <span>🤖</span> Codex
        </button>
        <button 
          :class="['agent-tab-btn', { active: activeAgent === 'antigravity' }]"
          @click="$emit('change-agent', 'antigravity')"
          title="Filter to Antigravity sessions"
        >
          <span>🌌</span> Antigravity
        </button>
      </div>

      <!-- Project Selector Pill -->
      <div class="workspace-pill">
        <span class="pill-label">Scope:</span>
        <select 
          :value="activeWorkspace" 
          class="project-select-inline mono"
          @change="onSelectProject"
        >
          <option value="all">🌐 All Projects (All Sessions)</option>
          <option 
            v-for="p in projects" 
            :key="p.path" 
            :value="p.path"
          >
            📁 {{ p.name }} {{ p.sessionCount ? `(${p.sessionCount} sessions)` : '' }}
          </option>
          <option v-if="activeWorkspace !== 'all' && !projects.some(p => p.path === activeWorkspace)" :value="activeWorkspace">
            📁 {{ activeWorkspace }}
          </option>
          <option value="__add_project__">➕ Add / Browse Local Project...</option>
        </select>
        <button 
          class="btn-add-project-icon" 
          @click="$emit('open-project-selector')"
          title="Browse computer to select and add a local project"
        >
          📁+
        </button>
        <Tooltip 
          title="Tracked Project Scope" 
          text="Filters metrics, sessions, recommendations, and token issues to the selected repository. Click '📁+' to browse and add any folder from your computer." 
        />
      </div>
    </div>

    <div class="header-right">
      <button 
        class="btn btn-secondary btn-sm"
        @click="$emit('open-issues')"
        title="View and copy generated agent work orders in docs/tokens-consumptions/issues/"
      >
        <span>📋</span> Issues (docs/)
        <span v-if="issuesCount > 0" class="mini-count-badge badge-accent">{{ issuesCount }}</span>
      </button>

      <button 
        class="btn btn-secondary btn-sm"
        @click="$emit('open-guidance-records')"
      >
        <span>📜</span> Guidance Log
        <span v-if="recordsCount > 0" class="mini-count-badge">{{ recordsCount }}</span>
      </button>

      <button 
        class="btn btn-secondary btn-sm"
        @click="$emit('open-benchmark')"
      >
        <span>⚡</span> Live Benchmark
      </button>

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

.agent-switch-group {
  display: flex;
  background: var(--bg-input);
  border: 1px solid var(--border-color);
  border-radius: 9999px;
  padding: 3px;
  gap: 2px;
}

.agent-tab-btn {
  background: transparent;
  border: none;
  color: var(--text-dim);
  font-size: 0.76rem;
  font-weight: 600;
  padding: 3px 10px;
  border-radius: 9999px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  transition: all 0.15s ease;
}

.agent-tab-btn:hover {
  color: var(--text-main);
}

.agent-tab-btn.active {
  background: var(--accent-blue);
  color: #090d16;
  font-weight: 700;
  box-shadow: 0 2px 8px rgba(56, 189, 248, 0.3);
}

.workspace-pill {
  display: flex;
  align-items: center;
  background-color: var(--bg-input);
  border: 1px solid var(--border-color);
  padding: 4px 12px;
  border-radius: 9999px;
  font-size: 0.8rem;
}

.pill-label {
  color: var(--text-dim);
  margin-right: 6px;
}

.project-select-inline {
  background: transparent;
  border: none;
  color: var(--accent-blue);
  font-size: 0.82rem;
  font-weight: 600;
  outline: none;
  cursor: pointer;
  max-width: 280px;
}

.project-select-inline option {
  background: var(--bg-card);
  color: var(--text-main);
}

.btn-add-project-icon {
  background: rgba(56, 189, 248, 0.15);
  border: 1px solid rgba(56, 189, 248, 0.3);
  color: var(--accent-blue);
  font-size: 0.72rem;
  font-weight: 700;
  cursor: pointer;
  padding: 1px 6px;
  border-radius: 4px;
  margin-left: 6px;
  transition: all 0.15s ease;
}

.btn-add-project-icon:hover {
  background: rgba(56, 189, 248, 0.3);
  transform: scale(1.05);
}

.mini-count-badge {
  background: var(--accent-blue);
  color: #0b0f19;
  font-size: 0.7rem;
  font-weight: 800;
  padding: 1px 6px;
  border-radius: 9999px;
  margin-left: 4px;
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

.mini-count-badge {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  color: var(--text-dim);
  font-size: 0.68rem;
  font-weight: 700;
  padding: 1px 6px;
  border-radius: 9999px;
}

.mini-count-badge.badge-accent {
  background: rgba(168, 85, 247, 0.2);
  border-color: rgba(168, 85, 247, 0.4);
  color: var(--accent-purple);
}

@media (max-width: 900px) {
  .header-nav {
    flex-direction: column;
    align-items: flex-start;
    gap: 16px;
  }
}
</style>
