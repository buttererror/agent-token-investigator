<script setup>
import { ref, onMounted, watch } from 'vue';
import Tooltip from './common/Tooltip.vue';

const props = defineProps({
  isOpen: {
    type: Boolean,
    required: true
  },
  activeWorkspace: {
    type: String,
    required: true
  }
});

const emit = defineEmits(['close', 'issues-updated']);

const issues = ref([]);
const isLoading = ref(false);
const error = ref(null);
const selectedIssue = ref(null);
const viewingContent = ref('');
const editableContent = ref('');
const isEditingDoc = ref(false);
const isSavingDoc = ref(false);
const saveSuccessMsg = ref('');
const isContentLoading = ref(false);
const copiedId = ref(null);

async function fetchIssues() {
  if (!props.isOpen) return;
  isLoading.value = true;
  error.value = null;
  try {
    const res = await fetch(`/api/token-issues?projectPath=${encodeURIComponent(props.activeWorkspace)}`);
    if (res.ok) {
      issues.value = await res.json();
      emit('issues-updated', issues.value.length);
    } else {
      const err = await res.json();
      error.value = err.error || 'Failed to load issue docs';
    }
  } catch (e) {
    error.value = e.message;
  } finally {
    isLoading.value = false;
  }
}

async function viewIssue(issue) {
  selectedIssue.value = issue;
  isContentLoading.value = true;
  viewingContent.value = '';
  editableContent.value = '';
  isEditingDoc.value = false;
  saveSuccessMsg.value = '';
  try {
    const res = await fetch(`/api/token-issues/read?projectPath=${encodeURIComponent(props.activeWorkspace)}&fileName=${encodeURIComponent(issue.fileName)}`);
    if (res.ok) {
      const data = await res.json();
      viewingContent.value = data.content;
      editableContent.value = data.content;
    }
  } catch (e) {
    viewingContent.value = `Failed to load issue content: ${e.message}`;
    editableContent.value = viewingContent.value;
  } finally {
    isContentLoading.value = false;
  }
}

async function saveDocChanges() {
  if (!selectedIssue.value) return;
  isSavingDoc.value = true;
  saveSuccessMsg.value = '';
  try {
    const res = await fetch('/api/token-issues/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        projectPath: props.activeWorkspace,
        fileName: selectedIssue.value.fileName,
        content: editableContent.value
      })
    });
    if (res.ok) {
      viewingContent.value = editableContent.value;
      saveSuccessMsg.value = 'Changes saved successfully!';
      setTimeout(() => { saveSuccessMsg.value = ''; }, 3000);
      await fetchIssues();
    } else {
      const data = await res.json();
      alert(`Failed to save: ${data.error || 'Unknown error'}`);
    }
  } catch (e) {
    alert(`Failed to save: ${e.message}`);
  } finally {
    isSavingDoc.value = false;
  }
}

async function deleteIssue(issue) {
  if (!confirm(`Delete ${issue.fileName}?`)) return;
  try {
    const res = await fetch('/api/token-issues', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        projectPath: props.activeWorkspace,
        fileName: issue.fileName
      })
    });
    if (res.ok) {
      if (selectedIssue.value?.fileName === issue.fileName) {
        selectedIssue.value = null;
        viewingContent.value = '';
        editableContent.value = '';
      }
      await fetchIssues();
    }
  } catch (e) {
    alert(`Failed to delete issue: ${e.message}`);
  }
}

function copyPrompt(issue) {
  const promptText = issue.agentPrompt || `Please inspect and resolve @docs/tokens-consumptions/issues/${issue.fileName}`;
  navigator.clipboard.writeText(promptText);
  copiedId.value = issue.fileName;
  setTimeout(() => {
    copiedId.value = null;
  }, 2000);
}

function copyContent() {
  const textToCopy = isEditingDoc.value ? editableContent.value : viewingContent.value;
  if (!textToCopy) return;
  navigator.clipboard.writeText(textToCopy);
  copiedId.value = 'full_content';
  setTimeout(() => {
    copiedId.value = null;
  }, 2000);
}


watch(() => props.isOpen, (open) => {
  if (open) {
    selectedIssue.value = null;
    viewingContent.value = '';
    fetchIssues();
  }
});

watch(() => props.activeWorkspace, () => {
  if (props.isOpen) {
    fetchIssues();
  }
});

onMounted(() => {
  if (props.isOpen) fetchIssues();
});
</script>

<template>
  <div v-if="isOpen" class="modal-overlay" @click="$emit('close')">
    <div class="modal-card modal-lg" @click.stop>
      <div class="modal-head">
        <div class="head-info">
          <h3>📋 Agent Issue Handoff Manager</h3>
          <span class="sub-text">
            Hand off token diagnostics and context to the project's AI agent via <code>docs/tokens-consumptions/issues/</code>
          </span>
        </div>
        <div class="head-actions">
          <button class="btn btn-secondary btn-sm" @click="fetchIssues" :disabled="isLoading">
            <span>🔄</span> Refresh
          </button>
          <button class="btn-close" @click="$emit('close')">✕</button>
        </div>
      </div>

      <div class="modal-body">
        <div class="issues-layout">
          <!-- Left: Issues List -->
          <div class="issues-sidebar">
            <div class="sidebar-header">
              <span class="count-text">
                <strong>{{ issues.length }}</strong> Issue Documents Found
              </span>
              <Tooltip 
                title="Agent Issue Handoffs"
                text="These Markdown documents in docs/tokens-consumptions/issues/ contain structured telemetry, problem diagnoses, and actionable instructions for autonomous AI agents (Codex, Antigravity, Claude Code) to pick up and solve."
              />
            </div>

            <div v-if="isLoading" class="loading-state">
              <span>⏳ Loading project issues...</span>
            </div>

            <div v-else-if="error" class="error-state">
              <span>❌ {{ error }}</span>
            </div>

            <div v-else-if="issues.length === 0" class="empty-state">
              <div class="empty-icon">✨</div>
              <h4>No Token Issues in Project</h4>
              <p>
                When heavy turns occur in a session or you find recommendations in Guided Optimizer, generate an Issue Doc to hand off the task directly to an agent.
              </p>
            </div>

            <div v-else class="issues-list">
              <div 
                v-for="issue in issues" 
                :key="issue.fileName"
                :class="['issue-item', { active: selectedIssue?.fileName === issue.fileName }]"
                @click="viewIssue(issue)"
              >
                <div class="issue-item-header">
                  <span class="issue-badge">Work Order</span>
                  <span class="issue-date mono">{{ issue.updatedAt?.slice(0, 10) }}</span>
                </div>
                <div class="issue-title">{{ issue.title || issue.fileName }}</div>
                <div class="issue-file mono text-dim">{{ issue.relativePath }}</div>
                
                <div class="issue-actions-row">
                  <button 
                    class="btn-copy-prompt" 
                    @click.stop="copyPrompt(issue)"
                    :title="'Copy agent prompt for ' + issue.fileName"
                  >
                    <span>📋</span> {{ copiedId === issue.fileName ? 'Copied Prompt!' : 'Copy Agent Prompt' }}
                  </button>
                  <button 
                    class="btn-delete-issue"
                    @click.stop="deleteIssue(issue)"
                    title="Delete this issue doc"
                  >
                    🗑️
                  </button>
                </div>
              </div>
            </div>
          </div>

          <!-- Right: Issue Preview & Agent Handoff -->
          <div class="issue-preview-pane">
            <div v-if="selectedIssue" class="preview-container">
              <div class="preview-header">
                <div class="preview-title-box">
                  <h4>{{ selectedIssue.title }}</h4>
                  <span class="preview-path mono text-dim">{{ selectedIssue.relativePath }}</span>
                </div>
                <div class="preview-controls">
                  <div class="mode-toggle-group">
                    <button 
                      :class="['btn', 'btn-xs', !isEditingDoc ? 'btn-primary' : 'btn-secondary']"
                      @click="isEditingDoc = false"
                    >
                      👁️ Preview
                    </button>
                    <button 
                      :class="['btn', 'btn-xs', isEditingDoc ? 'btn-primary' : 'btn-secondary']"
                      @click="isEditingDoc = true"
                    >
                      ✏️ Edit Doc
                    </button>
                  </div>
                  <button 
                    v-if="isEditingDoc"
                    class="btn btn-save btn-sm" 
                    :disabled="isSavingDoc"
                    @click="saveDocChanges"
                  >
                    <span>💾</span> {{ isSavingDoc ? 'Saving...' : 'Save Changes' }}
                  </button>
                  <button class="btn btn-primary btn-sm" @click="copyPrompt(selectedIssue)">
                    <span>🤖</span> {{ copiedId === selectedIssue.fileName ? 'Prompt Copied!' : 'Copy Agent Prompt' }}
                  </button>
                  <button class="btn btn-secondary btn-sm" @click="copyContent">
                    <span>📄</span> {{ copiedId === 'full_content' ? 'Copied Full Doc!' : (isEditingDoc ? 'Copy Edited Markdown' : 'Copy Markdown') }}
                  </button>
                </div>
              </div>

              <div v-if="saveSuccessMsg" class="save-toast-banner">
                <span>✅ {{ saveSuccessMsg }}</span>
              </div>

              <!-- Ready-to-use Prompt Banner -->
              <div class="agent-prompt-banner card">
                <div class="prompt-banner-head">
                  <span class="agent-icon">🤖</span>
                  <strong>Copy-Paste Prompt for Project Agent:</strong>
                </div>
                <div class="prompt-box mono">
                  {{ selectedIssue.agentPrompt }}
                </div>
              </div>

              <!-- Markdown Viewer / Editor -->
              <div class="markdown-viewer">
                <div v-if="isContentLoading" class="viewer-loading">
                  ⏳ Reading markdown content...
                </div>
                <div v-else-if="isEditingDoc" class="editor-container">
                  <div class="editor-meta-bar">
                    <span class="text-xs text-dim">Editing <code>{{ selectedIssue.fileName }}</code> directly. Edits will be copied or saved to <code>docs/tokens-consumptions/issues/</code>.</span>
                  </div>
                  <textarea 
                    v-model="editableContent" 
                    class="markdown-editor-input mono"
                    placeholder="Enter or modify markdown documentation..."
                    rows="20"
                    spellcheck="false"
                  ></textarea>
                </div>
                <pre v-else class="markdown-raw">{{ viewingContent }}</pre>
              </div>
            </div>

            <div v-else class="preview-placeholder">
              <div class="placeholder-icon">📑</div>
              <h4>Select an Issue Document</h4>
              <p>
                Click on any work order from the list on the left to inspect its root-cause telemetry and copy the agent kickoff prompt.
              </p>
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
  background-color: rgba(0, 0, 0, 0.75);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 999;
  padding: 20px;
}

.modal-card.modal-lg {
  background-color: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 14px;
  width: 100%;
  max-width: 1100px;
  height: 85vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
  overflow: hidden;
}

.modal-head {
  padding: 16px 20px;
  border-bottom: 1px solid var(--border-color);
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: var(--bg-card-hover);
}

.head-info h3 {
  font-size: 1.2rem;
  font-weight: 700;
  color: var(--text-main);
  margin-bottom: 2px;
}

.sub-text {
  font-size: 0.78rem;
  color: var(--text-dim);
}

.sub-text code {
  color: var(--accent-blue);
}

.head-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.btn-close {
  background: transparent;
  border: none;
  font-size: 1.2rem;
  color: var(--text-dim);
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 6px;
}

.btn-close:hover {
  background: rgba(255,255,255,0.1);
  color: var(--text-main);
}

.modal-body {
  flex: 1;
  overflow: hidden;
  padding: 0;
}

.issues-layout {
  display: flex;
  height: 100%;
}

.issues-sidebar {
  width: 380px;
  border-right: 1px solid var(--border-color);
  display: flex;
  flex-direction: column;
  background: rgba(0, 0, 0, 0.2);
}

.sidebar-header {
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-color);
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.8rem;
}

.issues-list {
  flex: 1;
  overflow-y: auto;
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.issue-item {
  padding: 12px;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.15s ease;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.issue-item:hover {
  border-color: var(--accent-blue);
  background: var(--bg-card-hover);
}

.issue-item.active {
  border-color: var(--accent-blue);
  background: rgba(56, 189, 248, 0.08);
  box-shadow: 0 0 12px rgba(56, 189, 248, 0.15);
}

.issue-item-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.issue-badge {
  font-size: 0.65rem;
  font-weight: 700;
  text-transform: uppercase;
  background: rgba(168, 85, 247, 0.15);
  color: var(--accent-purple);
  padding: 2px 6px;
  border-radius: 4px;
}

.issue-date {
  font-size: 0.7rem;
  color: var(--text-dim);
}

.issue-title {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--text-main);
  line-height: 1.3;
}

.issue-file {
  font-size: 0.72rem;
}

.issue-actions-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 4px;
  padding-top: 6px;
  border-top: 1px solid rgba(255,255,255,0.05);
}

.btn-copy-prompt {
  background: rgba(56, 189, 248, 0.1);
  border: 1px solid rgba(56, 189, 248, 0.3);
  color: var(--accent-blue);
  font-size: 0.72rem;
  font-weight: 600;
  padding: 4px 8px;
  border-radius: 6px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 4px;
}

.btn-copy-prompt:hover {
  background: var(--accent-blue);
  color: #090d16;
}

.btn-delete-issue {
  background: transparent;
  border: none;
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
  opacity: 0.6;
}

.btn-delete-issue:hover {
  opacity: 1;
  background: rgba(239, 68, 68, 0.2);
}

.issue-preview-pane {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--bg-card);
}

.preview-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 16px;
  gap: 12px;
  overflow: hidden;
}

.preview-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
}

.preview-title-box h4 {
  font-size: 1.1rem;
  font-weight: 700;
  color: var(--text-main);
  margin-bottom: 2px;
}

.preview-path {
  font-size: 0.75rem;
}

.preview-controls {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}

.mode-toggle-group {
  display: flex;
  background: var(--bg-hover);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  padding: 2px;
  gap: 2px;
}

.btn-xs {
  font-size: 0.72rem;
  padding: 3px 8px;
}

.btn-save {
  background: var(--accent-green);
  color: #090d16;
  font-weight: 600;
  border: none;
}

.btn-save:hover:not(:disabled) {
  opacity: 0.9;
  box-shadow: 0 0 10px rgba(16, 185, 129, 0.4);
}

.save-toast-banner {
  background: rgba(16, 185, 129, 0.15);
  border: 1px solid rgba(16, 185, 129, 0.4);
  color: var(--accent-green);
  font-size: 0.78rem;
  font-weight: 600;
  padding: 6px 12px;
  border-radius: 6px;
}

.editor-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  gap: 8px;
}

.editor-meta-bar {
  padding-bottom: 4px;
}

.markdown-editor-input {
  flex: 1;
  width: 100%;
  min-height: 280px;
  background: #090d16;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  padding: 12px;
  color: #e2e8f0;
  font-size: 0.82rem;
  line-height: 1.5;
  resize: vertical;
  outline: none;
  transition: border-color 0.2s;
}

.markdown-editor-input:focus {
  border-color: var(--accent-blue);
  box-shadow: 0 0 0 1px rgba(56, 189, 248, 0.25);
}

.agent-prompt-banner {
  background: rgba(16, 185, 129, 0.08);
  border: 1px solid rgba(16, 185, 129, 0.3);

  border-radius: 8px;
  padding: 10px 14px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.prompt-banner-head {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.78rem;
  color: var(--accent-green);
}

.prompt-box {
  background: rgba(0, 0, 0, 0.3);
  padding: 8px 12px;
  border-radius: 6px;
  font-size: 0.78rem;
  color: #f8fafc;
  line-height: 1.4;
  border: 1px dashed rgba(16, 185, 129, 0.4);
}

.markdown-viewer {
  flex: 1;
  overflow-y: auto;
  background: #090d16;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 16px;
}

.markdown-raw {
  white-space: pre-wrap;
  word-break: break-word;
  font-family: var(--font-mono, monospace);
  font-size: 0.8rem;
  line-height: 1.5;
  color: #cbd5e1;
  margin: 0;
}

.empty-state, .preview-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  text-align: center;
  padding: 40px;
  color: var(--text-dim);
}

.empty-icon, .placeholder-icon {
  font-size: 2.5rem;
  margin-bottom: 12px;
}

.empty-state h4, .preview-placeholder h4 {
  color: var(--text-main);
  margin-bottom: 6px;
}

.empty-state p, .preview-placeholder p {
  font-size: 0.8rem;
  line-height: 1.4;
  max-width: 360px;
}
</style>
