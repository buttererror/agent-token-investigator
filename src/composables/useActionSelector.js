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
      const payload = customPayload || action.payload;
      let res;

      if (action.systemId === 1) {
        // Action 1: AGENTS.md Rule
        res = await fetch('/api/apply-agents-rule', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            targetProjectPath,
            ruleText: payload.ruleText
          })
        });
      } else if (action.systemId === 2) {
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
      } else if (action.systemId === 3) {
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
      feedbackMessage.value = err.message;
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
