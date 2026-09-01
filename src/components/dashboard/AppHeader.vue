<script setup>
import { ref, onMounted, onUnmounted } from 'vue';

const props = defineProps({
  currentView: {
    type: String,
    default: 'overview'
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
  'change-view',
  'change-agent',
  'change-workspace',
  'change-time-range',
  'toggle-refresh',
  'open-guide',
  'open-linter',
  'open-benchmark',
  'open-guidance-records',
  'open-issues'
]);

const isToolsOpen = ref(false);
const toolsMenuRef = ref(null);

function handleClickOutside(e) {
  if (toolsMenuRef.value && !toolsMenuRef.value.contains(e.target)) {
    isToolsOpen.value = false;
  }
}

onMounted(() => {
  document.addEventListener('click', handleClickOutside);
});

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside);
});

function selectView(view) {
  emit('change-view', view);
}

function onAgentChange(e) {
  emit('change-agent', e.target.value);
}

function onWorkspaceChange(e) {
  emit('change-workspace', e.target.value);
}

function onTimeRangeChange(e) {
  emit('change-time-range', e.target.value);
}
</script>

<template>
  <header class="app-header">
    <div class="header-main-row">
      <!-- Brand & View Navigation -->
      <div class="header-brand-nav">
        <div class="brand" @click="selectView('overview')" role="button" tabindex="0">
          <svg class="brand-logo" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M4 18L9 8L15 20L20 11L24 18" stroke="#2dcaf5" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          <span class="brand-title">Agent Token Tracker</span>
        </div>

        <nav class="view-nav" aria-label="Primary navigation">
          <button 
            :class="['nav-item', { active: currentView === 'overview' }]"
            :aria-current="currentView === 'overview' ? 'page' : undefined"
            @click="selectView('overview')"
          >
            Overview
          </button>
          <button 
            :class="['nav-item', { active: currentView === 'sessions' }]"
            :aria-current="currentView === 'sessions' ? 'page' : undefined"
            @click="selectView('sessions')"
          >
            Sessions
          </button>
          <button 
            :class="['nav-item', { active: currentView === 'analytics' }]"
            :aria-current="currentView === 'analytics' ? 'page' : undefined"
            @click="selectView('analytics')"
          >
            Analytics
          </button>
        </nav>
      </div>

      <!-- Scope Controls & Status -->
      <div class="header-controls">
        <!-- Agent Switcher Dropdown -->
        <div class="scope-dropdown-wrap">
          <label class="sr-only" for="agent-select">Active Agent</label>
          <div class="scope-select-pill">
            <svg class="pill-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M5 4L2 8L5 12M11 4L14 8L11 12" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            <select 
              id="agent-select"
              :value="activeAgent" 
              class="scope-select"
              @change="onAgentChange"
            >
              <option value="codex">Codex</option>
              <option value="antigravity">Antigravity</option>
            </select>
          </div>
        </div>

        <!-- Project Selector Dropdown -->
        <div class="scope-dropdown-wrap">
          <label class="sr-only" for="project-select">Project Scope</label>
          <div class="scope-select-pill">
            <svg class="pill-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M2 4.5A1.5 1.5 0 0 1 3.5 3h3.086a1.5 1.5 0 0 1 1.06.44l1.414 1.414a1.5 1.5 0 0 0 1.06.44H12.5A1.5 1.5 0 0 1 14 6.793V11.5a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 2 11.5v-7z" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            <select 
              id="project-select"
              :value="activeWorkspace" 
              class="scope-select project-select"
              @change="onWorkspaceChange"
            >
              <option value="all">All projects</option>
              <option 
                v-for="p in projects" 
                :key="p.path" 
                :value="p.path"
              >
                {{ p.name }} {{ p.sessionCount ? `(${p.sessionCount})` : '' }}
              </option>
              <option 
                v-if="activeWorkspace !== 'all' && !projects.some(p => p.path === activeWorkspace)" 
                :value="activeWorkspace"
              >
                {{ activeWorkspace }}
              </option>
            </select>
          </div>
        </div>

        <!-- Time Range Selector Dropdown -->
        <div class="scope-dropdown-wrap">
          <label class="sr-only" for="timerange-select">Time Range</label>
          <div class="scope-select-pill">
            <svg class="pill-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
              <rect x="2.5" y="3.5" width="11" height="10" rx="1.5"/>
              <path d="M5 2v2M11 2v2M2.5 6.5h11"/>
            </svg>
            <select 
              id="timerange-select"
              :value="activeTimeRange" 
              class="scope-select"
              @change="onTimeRangeChange"
            >
              <option value="7d">Last 7 days</option>
              <option value="24h">Last 24 hours</option>
              <option value="today">Today</option>
              <option value="5h">Last 5 hours</option>
              <option value="30d">Last 30 days</option>
              <option value="all">All time</option>
            </select>
          </div>
        </div>

        <!-- Live Sync Status -->
        <div class="sync-status" @click="$emit('toggle-refresh')" role="button" tabindex="0" :title="isAutoRefresh ? 'Live sync is active. Click to pause.' : 'Live sync is paused. Click to resume.'">
          <span :class="['sync-dot', { active: isAutoRefresh }]"></span>
          <div class="sync-text-group">
            <span class="sync-label">{{ isAutoRefresh ? 'Live sync' : 'Sync paused' }}</span>
            <span class="sync-sub">Updated just now</span>
          </div>
        </div>

        <!-- Tools Dropdown Menu -->
        <div class="tools-menu-wrap" ref="toolsMenuRef">
          <button 
            class="tools-btn"
            :class="{ active: isToolsOpen }"
            @click.stop="isToolsOpen = !isToolsOpen"
            aria-label="Secondary tools menu"
            aria-haspopup="true"
            :aria-expanded="isToolsOpen"
          >
            <svg class="tools-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M9.5 2.5a2.121 2.121 0 0 1 3 3L5.5 12.5 2 13.5l1-3.5 6.5-6.5z" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            <span class="tools-text">Tools</span>
            <span v-if="issuesCount + recordsCount > 0" class="tools-badge">{{ issuesCount + recordsCount }}</span>
            <svg class="chevron-icon" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M3 4.5l3 3 3-3" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>

          <!-- Dropdown items -->
          <div v-if="isToolsOpen" class="tools-dropdown" role="menu">
            <button 
              class="tools-item" 
              role="menuitem"
              @click="isToolsOpen = false; $emit('open-issues')"
            >
              <span class="item-icon">📋</span>
              <span class="item-title">Generated Issues</span>
              <span v-if="issuesCount > 0" class="item-count">{{ issuesCount }}</span>
            </button>

            <button 
              class="tools-item" 
              role="menuitem"
              @click="isToolsOpen = false; $emit('open-guidance-records')"
            >
              <span class="item-icon">📜</span>
              <span class="item-title">Guidance Log</span>
              <span v-if="recordsCount > 0" class="item-count">{{ recordsCount }}</span>
            </button>

            <button 
              class="tools-item" 
              role="menuitem"
              @click="isToolsOpen = false; $emit('open-benchmark')"
            >
              <span class="item-icon">⚡</span>
              <span class="item-title">Live Benchmark</span>
            </button>

            <button 
              class="tools-item" 
              role="menuitem"
              @click="isToolsOpen = false; $emit('open-linter')"
            >
              <span class="item-icon">🔍</span>
              <span class="item-title">Prompt Linter</span>
            </button>

            <button 
              class="tools-item" 
              role="menuitem"
              @click="isToolsOpen = false; $emit('open-guide')"
            >
              <span class="item-icon">📖</span>
              <span class="item-title">Guide & Glossary</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  </header>
</template>

<style scoped>
.app-header {
  margin-bottom: 24px;
  background: transparent;
}

.header-main-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
}

.header-brand-nav {
  display: flex;
  align-items: center;
  gap: 32px;
}

.brand {
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
  user-select: none;
}

.brand-logo {
  width: 26px;
  height: 26px;
}

.brand-title {
  font-size: 1.15rem;
  font-weight: 700;
  color: var(--dashboard-text);
  letter-spacing: -0.01em;
  white-space: nowrap;
}

.view-nav {
  display: flex;
  align-items: center;
  gap: 24px;
}

.nav-item {
  background: transparent;
  border: none;
  color: var(--dashboard-text-muted);
  font-size: 0.92rem;
  font-weight: 600;
  cursor: pointer;
  padding: 6px 0;
  position: relative;
  transition: color 0.15s ease;
}

.nav-item:hover {
  color: var(--dashboard-text);
}

.nav-item.active {
  color: var(--dashboard-cyan);
  font-weight: 700;
}

.nav-item.active::after {
  content: '';
  position: absolute;
  bottom: -2px;
  left: 0;
  right: 0;
  height: 2px;
  background: var(--dashboard-cyan);
  border-radius: 2px;
}

.header-controls {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.scope-select-pill {
  display: inline-flex;
  align-items: center;
  background: var(--dashboard-surface);
  border: 1px solid var(--dashboard-border);
  border-radius: 8px;
  padding: 6px 10px;
  gap: 6px;
  transition: border-color 0.15s;
}

.scope-select-pill:hover,
.scope-select-pill:focus-within {
  border-color: rgba(45, 202, 245, 0.4);
}

.pill-icon {
  width: 14px;
  height: 14px;
  color: var(--dashboard-cyan);
  flex-shrink: 0;
}

.scope-select {
  background: transparent;
  border: none;
  color: var(--dashboard-text);
  font-size: 0.82rem;
  font-weight: 600;
  outline: none;
  cursor: pointer;
  appearance: none;
  padding-right: 18px;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' fill='none'%3E%3Cpath d='m1 1 4 4 4-4' stroke='%239aa8bb' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right center;
}

.project-select {
  max-width: 160px;
  text-overflow: ellipsis;
  overflow: hidden;
  white-space: nowrap;
}

.scope-select option {
  background: var(--dashboard-surface-raised);
  color: var(--dashboard-text);
}

.sync-status {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 8px;
  border-radius: 6px;
  cursor: pointer;
  user-select: none;
}

.sync-status:hover {
  background: rgba(255, 255, 255, 0.03);
}

.sync-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--dashboard-green);
  box-shadow: 0 0 8px rgba(96, 229, 111, 0.6);
}

.sync-dot.active {
  animation: pulse-green 2s infinite;
}

@keyframes pulse-green {
  0% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.4; transform: scale(0.85); }
  100% { opacity: 1; transform: scale(1); }
}

.sync-text-group {
  display: flex;
  flex-direction: column;
}

.sync-label {
  font-size: 0.76rem;
  font-weight: 600;
  color: var(--dashboard-text);
  line-height: 1.1;
}

.sync-sub {
  font-size: 0.68rem;
  color: var(--dashboard-text-muted);
  line-height: 1.1;
}

/* Tools Menu */
.tools-menu-wrap {
  position: relative;
}

.tools-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: var(--dashboard-surface);
  border: 1px solid var(--dashboard-border);
  border-radius: 8px;
  padding: 6px 12px;
  color: var(--dashboard-text-muted);
  font-size: 0.82rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;
}

.tools-btn:hover,
.tools-btn.active {
  border-color: rgba(45, 202, 245, 0.4);
  color: var(--dashboard-text);
}

.tools-icon {
  width: 14px;
  height: 14px;
}

.chevron-icon {
  width: 10px;
  height: 10px;
  color: var(--dashboard-text-muted);
}

.tools-badge {
  background: rgba(45, 202, 245, 0.2);
  color: var(--dashboard-cyan);
  font-size: 0.68rem;
  font-weight: 700;
  padding: 1px 5px;
  border-radius: 9999px;
}

.tools-dropdown {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  background: var(--dashboard-surface-raised);
  border: 1px solid var(--dashboard-border);
  border-radius: 10px;
  padding: 6px;
  min-width: 200px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
  z-index: 50;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.tools-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: transparent;
  border: none;
  border-radius: 6px;
  color: var(--dashboard-text);
  font-size: 0.82rem;
  font-weight: 500;
  text-align: left;
  cursor: pointer;
  transition: background 0.15s;
  width: 100%;
}

.tools-item:hover {
  background: rgba(255, 255, 255, 0.06);
  color: var(--dashboard-cyan);
}

.item-icon {
  font-size: 0.95rem;
}

.item-title {
  flex: 1;
}

.item-count {
  background: rgba(45, 202, 245, 0.2);
  color: var(--dashboard-cyan);
  font-size: 0.68rem;
  font-weight: 700;
  padding: 1px 6px;
  border-radius: 9999px;
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

@media (max-width: 900px) {
  .header-main-row {
    flex-direction: column;
    align-items: stretch;
    gap: 12px;
  }
  
  .header-brand-nav {
    justify-content: space-between;
  }
  
  .header-controls {
    justify-content: flex-start;
  }
  
  .project-select {
    max-width: 120px;
  }
}
</style>
