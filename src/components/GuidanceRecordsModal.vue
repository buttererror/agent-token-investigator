<script setup>
import { ref, computed } from 'vue';
import Tooltip from './common/Tooltip.vue';

const props = defineProps({
  isOpen: {
    type: Boolean,
    default: false
  },
  activeWorkspace: {
    type: String,
    required: true
  },
  projects: {
    type: Array,
    default: () => []
  },
  records: {
    type: Array,
    default: () => []
  },
  isLoading: {
    type: Boolean,
    default: false
  }
});

const emit = defineEmits(['close', 'select-project', 'add-record', 'rollback']);

const filterProject = ref(props.activeWorkspace || 'all');
const isAddingRecord = ref(false);
const newWhat = ref('');
const newWhy = ref('');
const newHow = ref('');
const newTargetFile = ref('AGENTS.md');
const newAuthor = ref('Pair Programming Agent');
const formError = ref('');

const filteredRecords = computed(() => {
  if (!filterProject.value || filterProject.value === 'all') {
    return props.records;
  }
  return props.records.filter(r => r.projectPath === filterProject.value);
});

const stats = computed(() => {
  const list = filteredRecords.value;
  return {
    total: list.length,
    rules: list.filter(r => r.actionType === 'APPLY_AGENTS_RULE' || r.targetFile?.includes('AGENTS')).length,
    scripts: list.filter(r => r.actionType === 'APPLY_PACKAGE_SCRIPT' || r.targetFile?.includes('package.json')).length,
    skills: list.filter(r => r.actionType === 'CREATE_PROJECT_SKILL' || r.targetFile?.includes('skill')).length
  };
});

function handleProjectChange(e) {
  const path = e.target.value;
  filterProject.value = path;
  emit('select-project', path);
}

function handleSaveCustomRecord() {
  if (!newWhat.value.trim() || !newWhy.value.trim() || !newHow.value.trim()) {
    formError.value = 'Please provide What, Why, and How to document this guidance change.';
    return;
  }

  formError.value = '';
  emit('add-record', {
    projectPath: filterProject.value !== 'all' ? filterProject.value : props.activeWorkspace,
    actionType: 'MANUAL_GUIDANCE_EDIT',
    what: newWhat.value.trim(),
    why: newWhy.value.trim(),
    how: newHow.value.trim(),
    targetFile: newTargetFile.value.trim(),
    author: newAuthor.value.trim() || 'Pair Programming Agent'
  });

  newWhat.value = '';
  newWhy.value = '';
  newHow.value = '';
  isAddingRecord.value = false;
}

function formatDate(isoStr) {
  if (!isoStr) return 'Recent';
  const d = new Date(isoStr);
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}
</script>

<template>
  <div v-if="isOpen" class="modal-overlay" @click.self="$emit('close')">
    <div class="modal-card card">
      <!-- Modal Header -->
      <div class="modal-header">
        <div class="header-title-group">
          <div class="title-icon">📜</div>
          <div>
            <h3>Project Guidance Changelog & Audit Trail</h3>
            <span class="sub-text">Chronological history of what changed, why, and how across tracked projects</span>
          </div>
        </div>
        <button class="close-btn" @click="$emit('close')">✕</button>
      </div>

      <!-- Filter Bar with Project Selector -->
      <div class="project-selector-bar">
        <div class="selector-left">
          <label class="selector-label">🎯 Tracked Project Scope:</label>
          <select 
            :value="filterProject" 
            class="project-dropdown mono"
            @change="handleProjectChange"
          >
            <option value="all">🌐 All Tracked Projects</option>
            <option 
              v-for="p in projects" 
              :key="p.path" 
              :value="p.path"
            >
              {{ p.name }} ({{ p.path }})
            </option>
          </select>
        </div>

        <button 
          class="btn btn-secondary btn-sm"
          @click="isAddingRecord = !isAddingRecord"
        >
          <span>{{ isAddingRecord ? '✕ Cancel' : '➕ Record Guidance Change' }}</span>
        </button>
      </div>

      <!-- Quick Summary Stats -->
      <div class="stats-row">
        <div class="stat-pill">
          <span class="stat-num text-blue">{{ stats.total }}</span>
          <span class="stat-lbl">Total Records</span>
        </div>
        <div class="stat-pill">
          <span class="stat-num text-green">{{ stats.rules }}</span>
          <span class="stat-lbl">AGENTS.md Rules</span>
        </div>
        <div class="stat-pill">
          <span class="stat-num text-purple">{{ stats.scripts }}</span>
          <span class="stat-lbl">Package Scripts</span>
        </div>
        <div class="stat-pill">
          <span class="stat-num text-yellow">{{ stats.skills }}</span>
          <span class="stat-lbl">Project Skills</span>
        </div>
      </div>

      <!-- Manual Record Creation Form -->
      <div v-if="isAddingRecord" class="add-record-form card">
        <h4 class="form-title">📝 Record New Guidance Decision</h4>
        <p class="form-desc">Document architectural or operational changes made from guidance for this project.</p>

        <div class="form-grid">
          <div class="form-group">
            <label>🎯 What Changed:</label>
            <input 
              v-model="newWhat" 
              type="text" 
              placeholder="e.g., Added --bail 1 rule to AGENTS.md" 
              class="form-input"
            />
          </div>

          <div class="form-group">
            <label>📁 Target File / Component:</label>
            <input 
              v-model="newTargetFile" 
              type="text" 
              placeholder="e.g., AGENTS.md or package.json" 
              class="form-input mono"
            />
          </div>

          <div class="form-group full-width">
            <label>💡 Why (Rationale / Trigger):</label>
            <textarea 
              v-model="newWhy" 
              rows="2" 
              placeholder="e.g., Test runs were dumping 35k unfiltered tokens into context, exhausting the 5-hour rolling limit."
              class="form-input"
            ></textarea>
          </div>

          <div class="form-group full-width">
            <label>🛠️ How (Mechanism / Configuration):</label>
            <textarea 
              v-model="newHow" 
              rows="2" 
              placeholder="e.g., Injected rule into AGENTS.md instructing agents to run 'pnpm test:agent' with silent flag."
              class="form-input mono"
            ></textarea>
          </div>

          <div class="form-group">
            <label>👤 Author / Agent Role:</label>
            <input 
              v-model="newAuthor" 
              type="text" 
              placeholder="e.g., Testing & Verification Agent" 
              class="form-input"
            />
          </div>
        </div>

        <div v-if="formError" class="form-error">{{ formError }}</div>

        <div class="form-actions">
          <button class="btn btn-secondary btn-sm" @click="isAddingRecord = false">Cancel</button>
          <button class="btn btn-primary btn-sm" @click="handleSaveCustomRecord">Save Guidance Record</button>
        </div>
      </div>

      <!-- Chronological Records List -->
      <div class="records-container">
        <div v-if="isLoading" class="loading-state">
          <div class="spinner-sm"></div>
          <span>Loading project guidance records...</span>
        </div>

        <div v-else-if="filteredRecords.length === 0" class="empty-records">
          <div class="empty-icon">📂</div>
          <h4>No guidance records found for this scope</h4>
          <p>When recommendations are applied from the Guided Optimizer or manually documented, their What, Why, and How records will appear here.</p>
        </div>

        <div v-else class="records-timeline">
          <div 
            v-for="rec in filteredRecords" 
            :key="rec.id" 
            class="record-item card"
          >
            <div class="record-head">
              <div class="record-title-wrap">
                <span :class="['action-badge', getBadgeClass(rec.actionType)]">
                  {{ getActionBadge(rec.actionType) }}
                </span>
                <h4 class="record-what">{{ rec.what }}</h4>
              </div>
              <div class="record-meta">
                <span class="project-tag mono">{{ rec.projectName }}</span>
                <span class="time-tag mono">{{ formatDate(rec.timestamp) }}</span>
              </div>
            </div>

            <!-- What / Why / How Structured Grid -->
            <div class="wwh-grid">
              <div class="wwh-block wwh-why">
                <span class="wwh-label">💡 WHY:</span>
                <p class="wwh-content">{{ rec.why }}</p>
              </div>

              <div class="wwh-block wwh-how">
                <span class="wwh-label">🛠️ HOW:</span>
                <pre class="wwh-code mono">{{ rec.how }}</pre>
              </div>
            </div>

            <!-- Footer Details -->
            <div class="record-footer">
              <div class="footer-details">
                <span v-if="rec.targetFile" class="file-link mono">
                  📄 {{ rec.targetFile }}
                </span>
                <span class="author-tag">
                  👤 {{ rec.author || 'Guided Optimizer' }}
                </span>
              </div>

              <div v-if="rec.backupId" class="rollback-wrap">
                <button 
                  class="btn-rollback btn-sm"
                  @click="$emit('rollback', rec.backupId)"
                  title="Restore original file state from atomic backup"
                >
                  ↩️ Undo / Rollback
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
export default {
  methods: {
    getActionBadge(type) {
      if (type === 'APPLY_AGENTS_RULE') return 'AGENTS.md Rule';
      if (type === 'APPLY_PACKAGE_SCRIPT') return 'Package Script';
      if (type === 'CREATE_PROJECT_SKILL') return 'Project Skill';
      return 'Guidance Decision';
    },
    getBadgeClass(type) {
      if (type === 'APPLY_AGENTS_RULE') return 'badge-rule';
      if (type === 'APPLY_PACKAGE_SCRIPT') return 'badge-script';
      if (type === 'CREATE_PROJECT_SKILL') return 'badge-skill';
      return 'badge-manual';
    }
  }
};
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  background-color: rgba(11, 15, 25, 0.85);
  backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 24px;
}

.modal-card {
  width: 100%;
  max-width: 960px;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  background-color: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 20px;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.7);
  overflow: hidden;
  padding: 0;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 24px;
  border-bottom: 1px solid var(--border-color);
  background: rgba(14, 20, 36, 0.6);
}

.header-title-group {
  display: flex;
  align-items: center;
  gap: 14px;
}

.title-icon {
  font-size: 1.6rem;
  width: 44px;
  height: 44px;
  background: rgba(56, 189, 248, 0.12);
  border: 1px solid rgba(56, 189, 248, 0.25);
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.sub-text {
  font-size: 0.8rem;
  color: var(--text-muted);
}

.close-btn {
  background: transparent;
  border: none;
  color: var(--text-muted);
  font-size: 1.2rem;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 6px;
}

.close-btn:hover {
  color: var(--text-main);
  background: rgba(255, 255, 255, 0.08);
}

.project-selector-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 14px 24px;
  background: var(--bg-input);
  border-bottom: 1px solid var(--border-color);
  flex-wrap: wrap;
  gap: 12px;
}

.selector-left {
  display: flex;
  align-items: center;
  gap: 10px;
}

.selector-label {
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--text-muted);
}

.project-dropdown {
  background: var(--bg-card);
  color: var(--accent-blue);
  border: 1px solid var(--border-color);
  padding: 6px 12px;
  border-radius: 8px;
  font-size: 0.82rem;
  cursor: pointer;
  outline: none;
}

.project-dropdown:focus {
  border-color: var(--accent-blue);
}

.stats-row {
  display: flex;
  gap: 12px;
  padding: 12px 24px;
  background: rgba(0, 0, 0, 0.2);
  border-bottom: 1px solid var(--border-color);
}

.stat-pill {
  display: flex;
  align-items: center;
  gap: 8px;
  background: var(--bg-card);
  padding: 6px 14px;
  border-radius: 9999px;
  border: 1px solid var(--border-color);
  font-size: 0.8rem;
}

.stat-num {
  font-weight: 800;
  font-family: var(--font-mono);
}

.stat-lbl {
  color: var(--text-muted);
}

.add-record-form {
  margin: 16px 24px;
  padding: 16px;
  background: rgba(14, 20, 36, 0.8);
  border: 1px dashed var(--accent-blue);
}

.form-title {
  font-size: 0.95rem;
  margin-bottom: 4px;
}

.form-desc {
  font-size: 0.78rem;
  color: var(--text-muted);
  margin-bottom: 14px;
}

.form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.full-width {
  grid-column: span 2;
}

.form-group label {
  display: block;
  font-size: 0.76rem;
  font-weight: 600;
  color: var(--text-muted);
  margin-bottom: 4px;
}

.form-input {
  width: 100%;
  background: var(--bg-input);
  border: 1px solid var(--border-color);
  color: var(--text-main);
  padding: 8px 12px;
  border-radius: 8px;
  font-size: 0.82rem;
  outline: none;
}

.form-input:focus {
  border-color: var(--accent-blue);
}

.form-error {
  color: var(--accent-red);
  font-size: 0.8rem;
  margin-top: 8px;
}

.form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 14px;
}

.records-container {
  flex: 1;
  overflow-y: auto;
  padding: 20px 24px;
}

.records-timeline {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.record-item {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  padding: 18px;
  border-radius: 14px;
}

.record-item:hover {
  border-color: rgba(56, 189, 248, 0.35);
}

.record-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 12px;
  gap: 12px;
}

.record-title-wrap {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.action-badge {
  font-size: 0.72rem;
  font-weight: 700;
  text-transform: uppercase;
  padding: 3px 8px;
  border-radius: 6px;
  letter-spacing: 0.04em;
}

.badge-rule {
  background: rgba(34, 197, 94, 0.15);
  color: var(--accent-green);
  border: 1px solid rgba(34, 197, 94, 0.3);
}

.badge-script {
  background: rgba(168, 85, 247, 0.15);
  color: var(--accent-purple);
  border: 1px solid rgba(168, 85, 247, 0.3);
}

.badge-skill {
  background: rgba(234, 179, 8, 0.15);
  color: var(--accent-yellow);
  border: 1px solid rgba(234, 179, 8, 0.3);
}

.badge-manual {
  background: rgba(56, 189, 248, 0.15);
  color: var(--accent-blue);
  border: 1px solid rgba(56, 189, 248, 0.3);
}

.record-what {
  font-size: 0.95rem;
  font-weight: 700;
  color: var(--text-main);
}

.record-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.75rem;
}

.project-tag {
  background: var(--bg-input);
  color: var(--accent-blue);
  padding: 2px 8px;
  border-radius: 6px;
  border: 1px solid var(--border-color);
}

.time-tag {
  color: var(--text-dim);
}

.wwh-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  background: rgba(0, 0, 0, 0.25);
  padding: 14px;
  border-radius: 10px;
  margin-bottom: 12px;
}

.wwh-block {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.wwh-label {
  font-size: 0.72rem;
  font-weight: 800;
  color: var(--text-muted);
  letter-spacing: 0.05em;
}

.wwh-content {
  font-size: 0.82rem;
  color: var(--text-main);
  line-height: 1.4;
}

.wwh-code {
  font-size: 0.78rem;
  color: var(--accent-blue);
  background: rgba(14, 20, 36, 0.8);
  padding: 8px;
  border-radius: 6px;
  overflow-x: auto;
  white-space: pre-wrap;
  word-break: break-all;
}

.record-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.76rem;
  color: var(--text-dim);
}

.footer-details {
  display: flex;
  gap: 14px;
}

.file-link {
  color: var(--text-muted);
}

.btn-rollback {
  background: transparent;
  border: 1px solid rgba(239, 68, 68, 0.3);
  color: var(--accent-red);
  padding: 4px 10px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.74rem;
  transition: all 0.15s ease;
}

.btn-rollback:hover {
  background: rgba(239, 68, 68, 0.15);
}

.empty-records {
  text-align: center;
  padding: 48px 24px;
  color: var(--text-muted);
}

.empty-icon {
  font-size: 2.5rem;
  margin-bottom: 12px;
}

.loading-state {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 40px;
  color: var(--text-muted);
}

.spinner-sm {
  width: 20px;
  height: 20px;
  border: 2px solid rgba(56, 189, 248, 0.2);
  border-top-color: var(--accent-blue);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

@media (max-width: 768px) {
  .wwh-grid {
    grid-template-columns: 1fr;
  }
  .form-grid {
    grid-template-columns: 1fr;
  }
  .full-width {
    grid-column: span 1;
  }
}
</style>
