<script setup>
import { ref, computed } from 'vue';

const props = defineProps({
  draft: {
    type: Object,
    required: true
  },
  projectPath: {
    type: String,
    required: true
  }
});

const emit = defineEmits(['close', 'issue-saved']);

const activeTab = ref('markdown'); // 'markdown' | 'prompt'
const isEditing = ref(false);
const editedContent = ref(props.draft.content || '');
const isSaving = ref(false);
const isSaved = ref(false);
const copiedType = ref(null); // 'prompt' | 'markdown'
const errorMessage = ref('');
const successMessage = ref('');

const currentContent = computed(() => editedContent.value);

function copyPrompt() {
  const prompt = props.draft.agentPrompt || '';
  navigator.clipboard.writeText(prompt);
  copiedType.value = 'prompt';
  setTimeout(() => { copiedType.value = null; }, 2000);
}

function copyMarkdown() {
  navigator.clipboard.writeText(currentContent.value);
  copiedType.value = 'markdown';
  setTimeout(() => { copiedType.value = null; }, 2000);
}

async function saveIssue() {
  isSaving.value = true;
  errorMessage.value = '';
  successMessage.value = '';

  try {
    const res = await fetch('/api/token-issues/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        projectPath: props.projectPath,
        fileName: props.draft.fileName,
        content: currentContent.value
      })
    });

    if (res.ok) {
      isSaved.value = true;
      const relPath = props.draft.relativePath || `docs/tokens-consumptions/issues/${props.draft.fileName}`;
      successMessage.value = `Successfully persisted issue to ${relPath}`;
      emit('issue-saved', {
        fileName: props.draft.fileName,
        relativePath: relPath,
        content: currentContent.value
      });
    } else {
      const err = await res.json();
      errorMessage.value = err.error || 'Failed to save issue document';
    }
  } catch (err) {
    errorMessage.value = err.message || 'Network error saving issue';
  } finally {
    isSaving.value = false;
  }
}
</script>

<template>
  <div class="modal-overlay" @click="$emit('close')">
    <div class="modal-card modal-lg issue-preview-modal" @click.stop role="dialog" aria-modal="true" aria-labelledby="modalTitle">
      <!-- Modal Header -->
      <div class="modal-head">
        <div class="head-info">
          <div class="head-title-row">
            <h3 id="modalTitle">📑 Implementation Issue Preview</h3>
            <span :class="['status-badge', isSaved ? 'badge-saved' : 'badge-draft']">
              {{ isSaved ? '✓ Saved to disk' : 'Draft · Not saved' }}
            </span>
          </div>
          <span class="sub-text">
            Destination: <code class="mono-path">{{ draft.relativePath || `docs/tokens-consumptions/issues/${draft.fileName}` }}</code>
          </span>
        </div>
        <div class="head-actions">
          <button class="close-btn" aria-label="Close modal" @click="$emit('close')">✕</button>
        </div>
      </div>

      <!-- Toast / Error Messages -->
      <div v-if="errorMessage" class="error-banner" role="alert">
        <span>⚠️ {{ errorMessage }}</span>
      </div>
      <div v-if="successMessage" class="success-banner" role="status">
        <span>✅ {{ successMessage }}</span>
      </div>

      <!-- Tab Bar & Controls -->
      <div class="preview-controls-bar">
        <div class="tab-group" role="tablist">
          <button 
            :class="['tab-btn', { active: activeTab === 'markdown' }]"
            role="tab"
            :aria-selected="activeTab === 'markdown'"
            @click="activeTab = 'markdown'"
          >
            📄 Issue Markdown
          </button>
          <button 
            :class="['tab-btn', { active: activeTab === 'prompt' }]"
            role="tab"
            :aria-selected="activeTab === 'prompt'"
            @click="activeTab = 'prompt'"
          >
            🤖 Agent Prompt
          </button>
        </div>

        <div class="mode-toggle-group" v-if="activeTab === 'markdown'">
          <button 
            :class="['mode-btn', { active: !isEditing }]"
            @click="isEditing = false"
          >
            👁️ Preview
          </button>
          <button 
            :class="['mode-btn', { active: isEditing }]"
            @click="isEditing = true"
          >
            ✏️ Edit Doc
          </button>
        </div>
      </div>

      <!-- Modal Body -->
      <div class="modal-body">
        <!-- Markdown View -->
        <div v-if="activeTab === 'markdown'" class="tab-pane">
          <div v-if="isEditing" class="editor-wrap">
            <textarea 
              v-model="editedContent" 
              class="markdown-editor" 
              rows="18"
              aria-label="Edit Markdown content"
              placeholder="Enter markdown work order content..."
            ></textarea>
          </div>
          <div v-else class="markdown-preview-box">
            <pre class="raw-markdown-content">{{ currentContent }}</pre>
          </div>
        </div>

        <!-- Prompt View -->
        <div v-else-if="activeTab === 'prompt'" class="tab-pane">
          <div class="prompt-box">
            <div class="prompt-header">
              <span class="prompt-label">Handoff Directive for Autonomous Agent</span>
            </div>
            <pre class="prompt-content">{{ draft.agentPrompt }}</pre>
          </div>
        </div>
      </div>

      <!-- Modal Footer Actions -->
      <div class="modal-footer">
        <button class="btn btn-secondary" @click="$emit('close')">
          Cancel
        </button>

        <div class="footer-action-group">
          <button class="btn btn-secondary" @click="copyPrompt">
            <span>📋</span> {{ copiedType === 'prompt' ? 'Prompt Copied!' : 'Copy Prompt' }}
          </button>
          <button class="btn btn-secondary" @click="copyMarkdown">
            <span>📄</span> {{ copiedType === 'markdown' ? 'Markdown Copied!' : 'Copy Markdown' }}
          </button>
          <button 
            class="btn btn-primary"
            :disabled="isSaving"
            @click="saveIssue"
          >
            <span>💾</span> {{ isSaving ? 'Saving...' : (isSaved ? 'Save Again' : 'Save Issue Document') }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.issue-preview-modal {
  max-width: 820px;
  width: 95%;
  max-height: 88vh;
  display: flex;
  flex-direction: column;
  background: var(--dashboard-surface, #131722);
  border: 1px solid var(--dashboard-border, #1e2640);
  border-radius: var(--dashboard-radius, 12px);
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.5);
  overflow: hidden;
}

.modal-head {
  padding: 16px 20px;
  border-bottom: 1px solid var(--dashboard-border, #1e2640);
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
}

.head-title-row {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.head-info h3 {
  margin: 0;
  font-size: 1.15rem;
  font-weight: 700;
  color: var(--dashboard-text, #f1f5f9);
}

.status-badge {
  font-size: 0.72rem;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 6px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.badge-draft {
  background: rgba(245, 179, 1, 0.15);
  color: var(--dashboard-amber, #f5b301);
  border: 1px solid rgba(245, 179, 1, 0.35);
}

.badge-saved {
  background: rgba(16, 185, 129, 0.15);
  color: var(--dashboard-green, #10b981);
  border: 1px solid rgba(16, 185, 129, 0.35);
}

.sub-text {
  font-size: 0.8rem;
  color: var(--dashboard-text-muted, #94a3b8);
  margin-top: 4px;
  display: block;
}

.mono-path {
  font-family: var(--font-mono, monospace);
  background: rgba(0, 0, 0, 0.3);
  padding: 2px 6px;
  border-radius: 4px;
  color: var(--dashboard-cyan, #2dcaf5);
}

.close-btn {
  background: transparent;
  border: none;
  color: var(--dashboard-text-muted, #94a3b8);
  font-size: 1.25rem;
  cursor: pointer;
  padding: 4px;
  line-height: 1;
  border-radius: 4px;
}

.close-btn:hover {
  color: #fff;
  background: rgba(255, 255, 255, 0.08);
}

.error-banner {
  padding: 10px 20px;
  background: rgba(239, 68, 68, 0.15);
  border-bottom: 1px solid rgba(239, 68, 68, 0.3);
  color: var(--dashboard-red, #ef4444);
  font-size: 0.85rem;
}

.success-banner {
  padding: 10px 20px;
  background: rgba(16, 185, 129, 0.15);
  border-bottom: 1px solid rgba(16, 185, 129, 0.3);
  color: var(--dashboard-green, #10b981);
  font-size: 0.85rem;
}

.preview-controls-bar {
  padding: 10px 20px;
  background: rgba(0, 0, 0, 0.2);
  border-bottom: 1px solid var(--dashboard-border, #1e2640);
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.tab-group {
  display: flex;
  gap: 6px;
}

.tab-btn {
  background: transparent;
  border: 1px solid transparent;
  padding: 6px 12px;
  border-radius: 6px;
  font-size: 0.85rem;
  color: var(--dashboard-text-muted, #94a3b8);
  cursor: pointer;
  font-weight: 600;
  transition: all 0.15s ease;
}

.tab-btn:hover {
  color: #fff;
  background: rgba(255, 255, 255, 0.05);
}

.tab-btn.active {
  background: rgba(45, 202, 245, 0.15);
  color: var(--dashboard-cyan, #2dcaf5);
  border-color: rgba(45, 202, 245, 0.35);
}

.mode-toggle-group {
  display: flex;
  background: rgba(0, 0, 0, 0.3);
  padding: 3px;
  border-radius: 6px;
  border: 1px solid var(--dashboard-border, #1e2640);
}

.mode-btn {
  background: transparent;
  border: none;
  padding: 4px 10px;
  border-radius: 4px;
  font-size: 0.78rem;
  color: var(--dashboard-text-muted, #94a3b8);
  cursor: pointer;
  font-weight: 600;
}

.mode-btn.active {
  background: var(--dashboard-cyan, #2dcaf5);
  color: #0f172a;
}

.modal-body {
  flex: 1;
  overflow-y: auto;
  padding: 16px 20px;
  min-height: 280px;
}

.editor-wrap {
  height: 100%;
}

.markdown-editor {
  width: 100%;
  height: 380px;
  box-sizing: border-box;
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid var(--dashboard-border, #1e2640);
  border-radius: 8px;
  padding: 14px;
  color: var(--dashboard-text, #f1f5f9);
  font-family: var(--font-mono, monospace);
  font-size: 0.85rem;
  line-height: 1.5;
  resize: vertical;
}

.markdown-editor:focus {
  outline: none;
  border-color: var(--dashboard-cyan, #2dcaf5);
}

.markdown-preview-box {
  background: rgba(0, 0, 0, 0.25);
  border: 1px solid var(--dashboard-border, #1e2640);
  border-radius: 8px;
  padding: 16px;
  max-height: 400px;
  overflow-y: auto;
}

.raw-markdown-content {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  font-family: var(--font-mono, monospace);
  font-size: 0.83rem;
  line-height: 1.55;
  color: var(--dashboard-text, #e2e8f0);
}

.prompt-box {
  background: rgba(0, 0, 0, 0.25);
  border: 1px solid var(--dashboard-border, #1e2640);
  border-radius: 8px;
  overflow: hidden;
}

.prompt-header {
  padding: 10px 14px;
  background: rgba(0, 0, 0, 0.3);
  border-bottom: 1px solid var(--dashboard-border, #1e2640);
}

.prompt-label {
  font-size: 0.75rem;
  font-weight: 700;
  text-transform: uppercase;
  color: var(--dashboard-cyan, #2dcaf5);
  letter-spacing: 0.05em;
}

.prompt-content {
  padding: 16px;
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  font-family: var(--font-mono, monospace);
  font-size: 0.88rem;
  line-height: 1.5;
  color: #fff;
}

.modal-footer {
  padding: 14px 20px;
  border-top: 1px solid var(--dashboard-border, #1e2640);
  background: rgba(0, 0, 0, 0.2);
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.footer-action-group {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  border-radius: 6px;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
  border: 1px solid transparent;
  transition: all 0.15s ease;
}

.btn-primary {
  background: var(--dashboard-cyan, #2dcaf5);
  color: #0f172a;
}

.btn-primary:hover:not(:disabled) {
  opacity: 0.9;
  transform: translateY(-1px);
}

.btn-secondary {
  background: rgba(255, 255, 255, 0.05);
  border-color: var(--dashboard-border, #1e2640);
  color: var(--dashboard-text, #f1f5f9);
}

.btn-secondary:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

@media (max-width: 600px) {
  .issue-preview-modal {
    width: 98%;
    max-height: 94vh;
  }
  
  .preview-controls-bar {
    flex-direction: column;
    align-items: flex-start;
  }
  
  .modal-footer {
    flex-direction: column;
    align-items: stretch;
  }
  
  .footer-action-group {
    flex-direction: column;
  }
  
  .btn {
    width: 100%;
    justify-content: center;
  }
}
</style>
