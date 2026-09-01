<script setup>
import { ref } from 'vue';
import Tooltip from './common/Tooltip.vue';
import { useActionSelector } from '../composables/useActionSelector.js';

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

defineEmits(['close']);

const { isApplying, feedbackMessage, feedbackType, applyAction } = useActionSelector();

const skillName = ref('verify-slice');
const trigger = ref('$verify-slice');
const instructions = ref(`# Verify Slice Skill

Run compact automated checks and git status with minimal noise:

\`\`\`bash
pnpm test -- --bail 1 --silent
pnpm lint --quiet
git status --short
\`\`\`

Summarize only failing assertions or uncommitted files.`);

async function handleCreate() {
  const action = {
    systemId: 3,
    payload: {
      skillName: skillName.value,
      trigger: trigger.value,
      instructions: instructions.value
    }
  };
  await applyAction(action, props.activeWorkspace);
}
</script>

<template>
  <div v-if="isOpen" class="modal-overlay" @click="$emit('close')">
    <div class="modal-card" @click.stop>
      <div class="modal-head">
        <div class="head-info">
          <h3>📦 Project Skill Generator</h3>
          <span class="sub-text">Package repeated multi-turn workflows into a single 400-token prompt preset</span>
        </div>
        <button class="close-btn" @click="$emit('close')">✕</button>
      </div>

      <div class="skill-gen-body">
        <div class="benefit-box">
          <span>💡 <strong>Progressive Disclosure:</strong> Skills stored in <code>.agents/skills/</code> are only loaded when triggered with <code>{{ trigger }}</code>, preventing unnecessary baseline prompt bloat.</span>
        </div>

        <div class="form-grid">
          <div class="form-group">
            <label>Skill Name (Folder Name):</label>
            <input v-model="skillName" class="form-input mono" placeholder="e.g. verify-slice" />
          </div>

          <div class="form-group">
            <label>Trigger Mention:</label>
            <input v-model="trigger" class="form-input mono" placeholder="e.g. $verify-slice" />
          </div>
        </div>

        <div class="form-group" style="margin-top: 14px;">
          <label>Workflow Instructions (`SKILL.md`):</label>
          <textarea v-model="instructions" class="form-textarea mono" rows="7"></textarea>
        </div>

        <div v-if="feedbackMessage" :class="['feedback-bar', `feedback-${feedbackType}`]">
          {{ feedbackMessage }}
        </div>

        <div class="modal-footer">
          <button class="btn btn-primary" :disabled="isApplying" @click="handleCreate">
            <span>🚀</span> Create Skill in {{ activeWorkspace }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.modal-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 16px;
  border-bottom: 1px solid var(--border-color);
  padding-bottom: 14px;
}

.head-info h3 {
  font-size: 1.15rem;
}

.sub-text {
  font-size: 0.78rem;
  color: var(--text-dim);
}

.close-btn {
  background: none;
  border: none;
  color: var(--text-dim);
  font-size: 1.3rem;
  cursor: pointer;
}

.benefit-box {
  background-color: rgba(56, 189, 248, 0.08);
  border: 1px solid rgba(56, 189, 248, 0.2);
  padding: 10px 14px;
  border-radius: 8px;
  font-size: 0.8rem;
  margin-bottom: 16px;
}

.form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
}

.form-group label {
  display: block;
  font-size: 0.78rem;
  font-weight: 600;
  color: var(--text-muted);
  margin-bottom: 6px;
}

.form-input, .form-textarea {
  width: 100%;
  background-color: var(--bg-input);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  color: var(--text-main);
  padding: 10px;
  font-size: 0.82rem;
  outline: none;
}

.modal-footer {
  margin-top: 16px;
  display: flex;
  justify-content: flex-end;
}

.feedback-bar {
  padding: 10px 14px;
  border-radius: 8px;
  margin-top: 14px;
  font-size: 0.82rem;
}

.feedback-success {
  background-color: rgba(34, 197, 94, 0.15);
  color: var(--accent-green);
}

.feedback-error {
  background-color: rgba(239, 68, 68, 0.15);
  color: var(--accent-red);
}
</style>
