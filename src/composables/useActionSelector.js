import { ref } from 'vue';

export function useActionSelector() {
  const isApplying = ref(false);
  const feedbackMessage = ref('');
  const feedbackType = ref('success');
  const appliedBackups = ref([]);

  async function applyAction(action, targetProjectPath, customPayload = null) {
    isApplying.value = true;
    feedbackMessage.value = '';

    try {
      const payload = customPayload || action.payload || {};
      let res;

      if (payload.ruleText || action.targetFile === 'AGENTS.md' || action.systemId === 1 || action.systemId === 6) {
        // Action 1 or 6: AGENTS.md Rule
        res = await fetch('/api/apply-agents-rule', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            targetProjectPath,
            ruleText: payload.ruleText
          })
        });
      } else if (payload.scriptName || action.targetFile === 'package.json' || action.systemId === 2) {
        // Action 2: package.json script
        res = await fetch('/api/apply-package-script', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            targetProjectPath,
            scriptName: payload.scriptName,
            scriptCommand: payload.scriptCommand
          })
        });
      } else if (payload.skillName || action.systemId === 3) {
        // Action 3: Project skill
        res = await fetch('/api/create-skill', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            targetProjectPath,
            skillName: payload.skillName,
            trigger: payload.trigger,
            instructions: payload.instructions
          })
        });
      } else {
        throw new Error(`Unsupported action type or missing payload for "${action.title || action.actionId}"`);
      }

      if (!res) {
        throw new Error('No server response received for action.');
      }

      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Failed to apply action');

      if (result.backup) {
        appliedBackups.value.unshift(result.backup);
      }

      feedbackType.value = 'success';
      feedbackMessage.value = result.message || 'Action successfully applied to project!';
      return result;
    } catch (err) {
      feedbackType.value = 'error';
      feedbackMessage.value = err.message || 'An error occurred while applying action.';
      throw err;
    } finally {
      isApplying.value = false;
    }
  }

  async function undoLastAction(backupId) {
    try {
      const res = await fetch('/api/undo-action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ backupId })
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Failed to undo action');

      appliedBackups.value = appliedBackups.value.filter(b => b.backupId !== backupId);
      feedbackType.value = 'success';
      feedbackMessage.value = result.message || 'Successfully rolled back file modification.';
      return result;
    } catch (err) {
      feedbackType.value = 'error';
      feedbackMessage.value = err.message;
    }
  }

  return {
    isApplying,
    feedbackMessage,
    feedbackType,
    appliedBackups,
    applyAction,
    undoLastAction
  };
}
