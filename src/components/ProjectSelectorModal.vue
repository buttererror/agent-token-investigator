<script setup>
import { ref, onMounted, watch } from 'vue';
import Tooltip from './common/Tooltip.vue';

const props = defineProps({
  activeWorkspace: {
    type: String,
    required: true
  },
  projects: {
    type: Array,
    default: () => []
  }
});

const emit = defineEmits(['close', 'project-selected', 'project-added', 'project-removed']);

const activeTab = ref('browse'); // 'browse' | 'manual' | 'manage'
const currentBrowsePath = ref('');
const browseData = ref({
  currentPath: '',
  parentPath: null,
  homePath: '',
  items: []
});
const isBrowsing = ref(false);
const browseError = ref('');

// Manual input state
const manualPath = ref('');
const customName = ref('');
const isInspecting = ref(false);
const inspectResult = ref(null);
const isAdding = ref(false);
const actionError = ref('');
const actionSuccess = ref('');

// Load directory in file browser
async function fetchDirectory(targetPath = '') {
  isBrowsing.value = true;
  browseError.value = '';
  try {
    const url = targetPath ? `/api/browse-directory?path=${encodeURIComponent(targetPath)}` : '/api/browse-directory';
    const res = await fetch(url);
    if (!res.ok) throw new Error('Failed to browse directory');
    const data = await res.json();
    browseData.value = data;
    currentBrowsePath.value = data.currentPath;
  } catch (err) {
    browseError.value = err.message;
  } finally {
    isBrowsing.value = false;
  }
}

// Inspect manual path
async function inspectManualPath() {
  if (!manualPath.value.trim()) {
    inspectResult.value = null;
    return;
  }
  isInspecting.value = true;
  actionError.value = '';
  try {
    const res = await fetch(`/api/inspect-directory?path=${encodeURIComponent(manualPath.value.trim())}`);
    if (res.ok) {
      inspectResult.value = await res.json();
      if (!customName.value && inspectResult.value?.name) {
        customName.value = inspectResult.value.name;
      }
    } else {
      const err = await res.json();
      inspectResult.value = { exists: false, error: err.error || 'Directory not found' };
    }
  } catch (err) {
    inspectResult.value = { exists: false, error: err.message };
  } finally {
    isInspecting.value = false;
  }
}

let debounceTimer = null;
watch(manualPath, () => {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    inspectManualPath();
  }, 350);
});

// Add project and select
async function handleAddProject(pathToAdd, nameToUse) {
  isAdding.value = true;
  actionError.value = '';
  actionSuccess.value = '';
  try {
    const res = await fetch('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        path: pathToAdd,
        name: nameToUse
      })
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to add project');
    }
    const saved = await res.json();
    actionSuccess.value = `Added and switched scope to "${saved.name}"`;
    emit('project-added', saved);
    setTimeout(() => {
      emit('close');
    }, 600);
  } catch (err) {
    actionError.value = err.message;
  } finally {
    isAdding.value = false;
  }
}

// Remove custom project
async function handleRemoveProject(pathToRemove) {
  if (!confirm(`Remove "${pathToRemove}" from tracked project list?`)) return;
  try {
    const res = await fetch('/api/projects', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: pathToRemove })
    });
    if (res.ok) {
      emit('project-removed', pathToRemove);
    }
  } catch (err) {
    actionError.value = err.message;
  }
}

function selectExistingProject(projPath) {
  emit('project-selected', projPath);
  emit('close');
}

onMounted(() => {
  // Start browsing from props.activeWorkspace or user home
  const initialPath = (props.activeWorkspace && props.activeWorkspace !== 'all') 
    ? props.activeWorkspace 
    : '';
  fetchDirectory(initialPath);
});
</script>

<template>
  <div class="modal-overlay" @click="$emit('close')">
    <div class="modal-card" @click.stop>
      <!-- Modal Head -->
      <div class="modal-head">
        <div class="head-info">
          <h3>📁 Select Local Project from Computer</h3>
          <span class="text-dim text-xs">
            Browse your filesystem or enter a path to add and monitor any repository in Agent Token Tracker.
          </span>
        </div>
        <button class="close-btn" @click="$emit('close')">✕</button>
      </div>

      <!-- Navigation Tabs -->
      <div class="tabs-bar">
        <button 
          :class="['tab-btn', { active: activeTab === 'browse' }]"
          @click="activeTab = 'browse'"
        >
          <span>📂</span> Directory Explorer
        </button>
        <button 
          :class="['tab-btn', { active: activeTab === 'manual' }]"
          @click="activeTab = 'manual'"
        >
          <span>✏️</span> Enter Absolute Path
        </button>
        <button 
          :class="['tab-btn', { active: activeTab === 'manage' }]"
          @click="activeTab = 'manage'"
        >
          <span>⚙️</span> Tracked Projects ({{ projects.length }})
        </button>
      </div>

      <!-- Status Alerts -->
      <div v-if="actionSuccess" class="alert-box alert-success">
        ✅ {{ actionSuccess }}
      </div>
      <div v-if="actionError" class="alert-box alert-error">
        ❌ {{ actionError }}
      </div>

      <!-- TAB 1: Directory Explorer -->
      <div v-if="activeTab === 'browse'" class="tab-content">
        <!-- Explorer Header Bar -->
        <div class="explorer-bar card">
          <div class="path-navigation">
            <button 
              v-if="browseData.parentPath" 
              class="btn-nav btn-sm"
              :disabled="isBrowsing"
              @click="fetchDirectory(browseData.parentPath)"
              title="Go Up One Directory"
            >
              ⬆️ Up
            </button>
            <button 
              class="btn-nav btn-sm"
              :disabled="isBrowsing"
              @click="fetchDirectory(browseData.homePath)"
              title="Go to User Home"
            >
              🏠 Home
            </button>
            <span class="current-path-pill mono" :title="currentBrowsePath">
              {{ currentBrowsePath }}
            </span>
          </div>

          <div class="explorer-actions">
            <button 
              class="btn btn-primary btn-sm"
              :disabled="isAdding || isBrowsing"
              @click="handleAddProject(currentBrowsePath)"
            >
              <span>✅</span> Select This Folder
            </button>
          </div>
        </div>

        <!-- Directory List -->
        <div class="dir-list-container">
          <div v-if="isBrowsing" class="loading-state">
            <span class="spinner">⏳</span> Scanning folders in {{ currentBrowsePath }}...
          </div>
          <div v-else-if="browseError" class="error-state">
            ⚠️ {{ browseError }}
          </div>
          <div v-else-if="browseData.items.length === 0" class="empty-state text-dim">
            No accessible subdirectories found in this folder. Click <strong>"Select This Folder"</strong> above to track this directory.
          </div>
          <div v-else class="dir-grid">
            <div 
              v-for="item in browseData.items" 
              :key="item.path"
              :class="['dir-item-card', { 'is-project': item.isProject }]"
            >
              <div class="dir-item-info" @click="fetchDirectory(item.path)">
                <div class="dir-name-row">
                  <span class="dir-icon">{{ item.isProject ? '📦' : '📁' }}</span>
                  <span class="dir-name mono">{{ item.name }}</span>
                </div>
                <div class="dir-badges">
                  <span v-if="item.hasPkg" class="badge-tag node">Node</span>
                  <span v-if="item.hasGit" class="badge-tag git">Git</span>
                  <span v-if="item.hasAgents" class="badge-tag agents">AGENTS.md</span>
                </div>
              </div>

              <div class="dir-item-actions">
                <button 
                  class="btn-open-folder"
                  @click="fetchDirectory(item.path)"
                  title="Open folder to explore inside"
                >
                  Open ➔
                </button>
                <button 
                  class="btn-select-folder"
                  :disabled="isAdding"
                  @click="handleAddProject(item.path, item.name)"
                  title="Select this folder as project"
                >
                  Select
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- TAB 2: Enter Absolute Path -->
      <div v-if="activeTab === 'manual'" class="tab-content">
        <div class="manual-form card">
          <div class="form-group">
            <label class="form-lbl">
              Directory Path on Computer:
              <Tooltip 
                title="Absolute Directory Path" 
                text="Provide the full local filesystem path to your project (e.g. ~/projects/my-new-app or /workspace/my-app)." 
              />
            </label>
            <input 
              v-model="manualPath"
              type="text" 
              placeholder="/path/to/my-project"
              class="input-mono"
            />
          </div>

          <div class="form-group">
            <label class="form-lbl">Custom Display Name (Optional):</label>
            <input 
              v-model="customName"
              type="text" 
              placeholder="e.g. My Next.js Service"
              class="input-mono"
            />
          </div>

          <!-- Inspection Feedback -->
          <div v-if="isInspecting" class="inspect-feedback text-dim text-xs">
            ⏳ Inspecting path on computer...
          </div>
          <div v-else-if="inspectResult" class="inspect-box">
            <div v-if="inspectResult.exists" class="inspect-success">
              <div class="inspect-title">
                <span>✅ Valid Directory Found</span>
                <span class="mono text-dim text-xs">{{ inspectResult.path }}</span>
              </div>
              <div class="inspect-tags">
                <span v-if="inspectResult.isNode" class="badge-tag node">Node.js</span>
                <span v-if="inspectResult.isGit" class="badge-tag git">Git Repository</span>
                <span v-if="inspectResult.hasAgentsMd" class="badge-tag agents">AGENTS.md</span>
                <span v-if="inspectResult.isPython" class="badge-tag python">Python</span>
                <span v-if="inspectResult.isRust" class="badge-tag rust">Rust</span>
                <span v-if="inspectResult.isGo" class="badge-tag go">Go</span>
              </div>
              <p v-if="inspectResult.description" class="text-dim text-xs inspect-desc">
                {{ inspectResult.description }}
              </p>
            </div>
            <div v-else class="inspect-error">
              ⚠️ {{ inspectResult.error }}
            </div>
          </div>

          <div class="form-actions">
            <button 
              class="btn btn-primary"
              :disabled="isAdding || !inspectResult?.exists"
              @click="handleAddProject(inspectResult?.path || manualPath, customName)"
            >
              <span>➕</span> {{ isAdding ? 'Adding Project...' : 'Add to Selector & Switch Scope' }}
            </button>
          </div>
        </div>
      </div>

      <!-- TAB 3: Tracked Projects Management -->
      <div v-if="activeTab === 'manage'" class="tab-content">
        <div class="project-manage-list">
          <div 
            v-for="p in projects" 
            :key="p.path"
            :class="['project-manage-card', { 'is-active': activeWorkspace === p.path }]"
          >
            <div class="proj-main-info">
              <div class="proj-title-row">
                <span class="proj-name">{{ p.name }}</span>
                <span v-if="activeWorkspace === p.path" class="badge-current">Active Scope</span>
                <span v-if="p.isDefault" class="badge-tag">Default</span>
                <span v-if="p.isCustom" class="badge-tag node">User Added</span>
              </div>
              <span class="proj-path mono text-dim text-xs">{{ p.path }}</span>
              <p v-if="p.description" class="proj-desc text-dim text-xs">{{ p.description }}</p>
            </div>

            <div class="proj-actions">
              <button 
                v-if="activeWorkspace !== p.path"
                class="btn btn-secondary btn-sm"
                @click="selectExistingProject(p.path)"
              >
                Switch Scope
              </button>
              <button 
                v-if="p.isCustom"
                class="btn-trash"
                @click="handleRemoveProject(p.path)"
                title="Remove from tracked list"
              >
                🗑️
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  background-color: rgba(5, 7, 15, 0.82);
  backdrop-filter: blur(6px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  padding: 20px;
}

.modal-card {
  background-color: #0b0f19;
  border: 1px solid var(--border-color);
  border-radius: 14px;
  width: 820px;
  max-width: 95vw;
  max-height: 88vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 20px 40px rgba(0,0,0,0.8);
  overflow: hidden;
}

.modal-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  padding: 18px 22px;
  border-bottom: 1px solid var(--border-color);
  background: #0d1322;
}

.modal-head h3 {
  margin: 0 0 4px 0;
  font-size: 1.15rem;
  color: var(--text-main);
}

.close-btn {
  background: none;
  border: none;
  color: var(--text-dim);
  font-size: 1.3rem;
  cursor: pointer;
}

.close-btn:hover {
  color: var(--text-main);
}

/* Tabs */
.tabs-bar {
  display: flex;
  gap: 4px;
  padding: 10px 20px 0 20px;
  background: #0d1322;
  border-bottom: 1px solid var(--border-color);
}

.tab-btn {
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  color: var(--text-dim);
  padding: 8px 14px;
  font-size: 0.82rem;
  font-weight: 600;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  transition: all 0.15s ease;
}

.tab-btn:hover {
  color: var(--text-main);
}

.tab-btn.active {
  color: var(--accent-blue);
  border-bottom-color: var(--accent-blue);
}

/* Tab Content */
.tab-content {
  padding: 20px;
  overflow-y: auto;
  flex: 1;
}

/* Explorer Bar */
.explorer-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 14px;
  background: var(--bg-input);
  border-radius: 8px;
  margin-bottom: 14px;
  gap: 12px;
  flex-wrap: wrap;
}

.path-navigation {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  overflow: hidden;
}

.btn-nav {
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid var(--border-color);
  color: var(--text-main);
  padding: 4px 10px;
  border-radius: 6px;
  font-size: 0.76rem;
  cursor: pointer;
}

.btn-nav:hover:not(:disabled) {
  background: rgba(56, 189, 248, 0.15);
  border-color: var(--accent-blue);
}

.current-path-pill {
  font-size: 0.78rem;
  color: var(--accent-blue);
  background: rgba(0,0,0,0.3);
  padding: 4px 10px;
  border-radius: 6px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 380px;
}

/* Directory Grid */
.dir-list-container {
  min-height: 260px;
  max-height: 380px;
  overflow-y: auto;
}

.dir-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 10px;
}

.dir-item-card {
  background: var(--bg-input);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 8px;
  transition: all 0.15s ease;
}

.dir-item-card:hover {
  border-color: rgba(56, 189, 248, 0.4);
  background: rgba(56, 189, 248, 0.04);
}

.dir-item-card.is-project {
  border-color: rgba(34, 197, 94, 0.3);
  background: rgba(34, 197, 94, 0.02);
}

.dir-item-info {
  cursor: pointer;
}

.dir-name-row {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 4px;
}

.dir-icon {
  font-size: 1rem;
}

.dir-name {
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--text-main);
  word-break: break-all;
}

.dir-badges {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
}

.badge-tag {
  font-size: 0.65rem;
  padding: 1px 5px;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.08);
  color: var(--text-muted);
}

.badge-tag.node {
  background: rgba(34, 197, 94, 0.15);
  color: var(--accent-green);
}

.badge-tag.git {
  background: rgba(234, 88, 12, 0.15);
  color: #fb923c;
}

.badge-tag.agents {
  background: rgba(168, 85, 247, 0.15);
  color: var(--accent-purple);
}

.badge-tag.python {
  background: rgba(56, 189, 248, 0.15);
  color: var(--accent-blue);
}

.dir-item-actions {
  display: flex;
  justify-content: space-between;
  gap: 6px;
  border-top: 1px solid rgba(255, 255, 255, 0.05);
  padding-top: 6px;
}

.btn-open-folder {
  background: transparent;
  border: none;
  color: var(--text-dim);
  font-size: 0.72rem;
  cursor: pointer;
  padding: 2px 6px;
  border-radius: 4px;
}

.btn-open-folder:hover {
  color: var(--accent-blue);
  background: rgba(56, 189, 248, 0.1);
}

.btn-select-folder {
  background: rgba(34, 197, 94, 0.15);
  border: 1px solid rgba(34, 197, 94, 0.3);
  color: var(--accent-green);
  font-size: 0.72rem;
  font-weight: 600;
  cursor: pointer;
  padding: 2px 8px;
  border-radius: 4px;
}

.btn-select-folder:hover:not(:disabled) {
  background: rgba(34, 197, 94, 0.25);
}

/* Manual Form */
.manual-form {
  padding: 16px;
  background: var(--bg-input);
  border-radius: 10px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.form-lbl {
  font-size: 0.78rem;
  font-weight: 600;
  color: var(--text-muted);
  display: flex;
  align-items: center;
}

.input-mono {
  background: #090d16;
  border: 1px solid var(--border-color);
  color: var(--text-main);
  padding: 8px 12px;
  border-radius: 6px;
  font-family: inherit;
  font-size: 0.82rem;
  outline: none;
}

.input-mono:focus {
  border-color: var(--accent-blue);
}

.inspect-box {
  padding: 10px 14px;
  border-radius: 8px;
  background: rgba(0,0,0,0.3);
  border: 1px solid var(--border-color);
}

.inspect-success .inspect-title {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6px;
  font-size: 0.82rem;
  font-weight: 600;
}

.inspect-tags {
  display: flex;
  gap: 6px;
  margin-bottom: 4px;
}

.inspect-desc {
  margin: 0;
}

.inspect-error {
  color: var(--accent-red);
  font-size: 0.78rem;
}

.form-actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 8px;
}

/* Manage List */
.project-manage-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.project-manage-card {
  background: var(--bg-input);
  border: 1px solid var(--border-color);
  border-radius: 10px;
  padding: 12px 16px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 14px;
}

.project-manage-card.is-active {
  border-color: var(--accent-blue);
  background: rgba(56, 189, 248, 0.04);
}

.proj-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}

.proj-name {
  font-size: 0.9rem;
  font-weight: 700;
  color: var(--text-main);
}

.badge-current {
  font-size: 0.68rem;
  background: rgba(56, 189, 248, 0.2);
  color: var(--accent-blue);
  padding: 1px 6px;
  border-radius: 4px;
  font-weight: 600;
}

.proj-desc {
  margin: 2px 0 0 0;
}

.proj-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.btn-trash {
  background: transparent;
  border: none;
  font-size: 0.9rem;
  cursor: pointer;
  padding: 4px 6px;
  border-radius: 4px;
}

.btn-trash:hover {
  background: rgba(239, 68, 68, 0.15);
}

/* Alert Boxes */
.alert-box {
  padding: 10px 16px;
  border-radius: 8px;
  font-size: 0.8rem;
  margin: 10px 20px 0 20px;
}

.alert-success {
  background: rgba(34, 197, 94, 0.15);
  border: 1px solid rgba(34, 197, 94, 0.3);
  color: var(--accent-green);
}

.alert-error {
  background: rgba(239, 68, 68, 0.15);
  border: 1px solid rgba(239, 68, 68, 0.3);
  color: var(--accent-red);
}

.loading-state, .empty-state, .error-state {
  text-align: center;
  padding: 40px 20px;
  font-size: 0.82rem;
}
</style>
