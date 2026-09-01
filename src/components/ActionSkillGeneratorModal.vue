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

const emit = defineEmits(['close', 'skill-created']);

const { isApplying, feedbackMessage, feedbackType, applyAction } = useActionSelector();

const skillName = ref('verify-slice');
const trigger = ref('$verify-slice');
const instructions = ref(`Run compact automated checks and git status with minimal noise:

\`\`\`bash
pnpm test -- --bail 1 --silent
pnpm lint --quiet
git status --short
\`\`\`

Summarize only failing assertions or uncommitted files.`);

const isSuccess = ref(false);

async function handleCreate() {
  const action = {
    systemId: 3,
    targetFile: `.agents/skills/${skillName.value}/SKILL.md`,
    payload: {
      skillName: skillName.value,
      trigger: trigger.value,
      instructions: instructions.value
    }
  };
  
  try {
    await applyAction(action, props.activeWorkspace);
    isSuccess.value = true;
    emit('skill-created');
  } catch (err) {
    isSuccess.value = false;
  }
}
</script>

<template>
  <div v-if="isOpen" class="modal-overlay" @click="$emit('close')">
    <div class="modal-card skill-modal" @click.stop>
      <div class="modal-head">
        <div class="head-info">
          <h3>📦 Project Skill Generator</h3>
          <span class="sub-text">Package repeated multi-turn workflows into a single prompt preset</span>
        </div>
        <button class="close-btn" @click="$emit('close')">✕</button>
      </div>

      <div class="skill-gen-body">
        <div class="benefit-box">
          <span>💡 <strong>Progressive Disclosure:</strong> Skills stored in <code>.agents/skills/</code> are only loaded when triggered with <code>{{ trigger }}</code>, keeping baseline token cost at zero until invoked.</span>
        </div>

        <div class="form-grid">
          <div class="form-group">
            <label>Skill Folder Name:</label>
            <input v-model="skillName" class="form-input mono" placeholder="e.g. verify-slice" />
          </div>

          <div class="form-group">
            <label>Trigger Mention:</label>
            <input v-model="trigger" class="form-input mono" placeholder="e.g. $verify-slice" />
          </div>
        </div>

        <div class="form-group" style="margin-top: 14px;">
          <label>Workflow Instructions (`SKILL.md`):</label>
          <textarea v-model="instructions" class="form-textarea mono" rows="8"></textarea>
        </div>

        <div v-if="feedbackMessage" :class="['feedback-bar', `feedback-${feedbackType}`]">
          <span>{{ feedbackMessage }}</span>
        </div>

        <div class="modal-footer">
          <button class="btn btn-secondary" @click="$emit('close')">
            {{ isSuccess ? 'Done' : 'Cancel' }}
          </button>
          <button class="btn btn-primary" :disabled="isApplying" @click="handleCreate">
            <span>🚀</span> {{ isApplying ? 'Generating...' : (isSuccess ? 'Re-Generate Skill' : 'Create Skill in ' + activeWorkspace.split('/').pop()) }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.skill-modal {
  max-width: 650px;
}

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
  margin-top: 18px;
  display: flex;
  justify-content: flex-end;
  gap: 10px;
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
  border: 1px solid rgba(34, 197, 94, 0.3);
}

.feedback-error {
  background-color: rgba(239, 68, 68, 0.15);
  color: var(--accent-red);
  border: 1px solid rgba(239, 68, 68, 0.3);
}
</style>
