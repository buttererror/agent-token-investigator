import { ref } from 'vue';

export function usePromptLinter() {
  const draftPrompt = ref('');
  const targetAgent = ref('codex');
  const lintResult = ref(null);
  const isLinting = ref(false);
  let debounceTimer = null;

  async function performEvaluation(text, agent = targetAgent.value) {
    if (!text || !text.trim()) {
      lintResult.value = null;
      isLinting.value = false;
      return;
    }

    isLinting.value = true;
    try {
      const res = await fetch('/api/lint-prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: text, targetAgent: agent })
      });
      if (res.ok) {
        lintResult.value = await res.json();
      }
    } catch (e) {
      // ignore network errors
    } finally {
      isLinting.value = false;
    }
  }

  function evaluatePrompt(text, agent = targetAgent.value, delay = 250) {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }

    if (!text || !text.trim()) {
      lintResult.value = null;
      isLinting.value = false;
      return;
    }

    debounceTimer = setTimeout(() => {
      performEvaluation(text, agent);
    }, delay);
  }

  function evaluatePromptImmediate(text, agent = targetAgent.value) {
    if (debounceTimer) clearTimeout(debounceTimer);
    performEvaluation(text, agent);
  }

  function setTargetAgent(agent) {
    targetAgent.value = agent;
    if (draftPrompt.value) {
      evaluatePromptImmediate(draftPrompt.value, agent);
    }
  }

  return {
    draftPrompt,
    targetAgent,
    lintResult,
    isLinting,
    evaluatePrompt,
    evaluatePromptImmediate,
    setTargetAgent
  };
}
