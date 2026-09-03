import { ref } from 'vue';

export function usePromptLinter() {
  const draftPrompt = ref('');
  const targetAgent = ref('codex');
  const sessionContext = ref(null);
  const lintResult = ref(null);
  const isLinting = ref(false);
  let debounceTimer = null;

  async function performEvaluation(text, agent = targetAgent.value, sessionCtx = sessionContext.value) {
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
        body: JSON.stringify({ 
          prompt: text, 
          targetAgent: agent,
          sessionContext: sessionCtx
        })
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

  function evaluatePrompt(text, agent = targetAgent.value, sessionCtx = sessionContext.value, delay = 250) {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }

    if (!text || !text.trim()) {
      lintResult.value = null;
      isLinting.value = false;
      return;
    }

    debounceTimer = setTimeout(() => {
      performEvaluation(text, agent, sessionCtx);
    }, delay);
  }

  function evaluatePromptImmediate(text, agent = targetAgent.value, sessionCtx = sessionContext.value) {
    if (debounceTimer) clearTimeout(debounceTimer);
    performEvaluation(text, agent, sessionCtx);
  }

  function setTargetAgent(agent) {
    targetAgent.value = agent;
    if (draftPrompt.value) {
      evaluatePromptImmediate(draftPrompt.value, agent, sessionContext.value);
    }
  }

  function setSessionContext(ctx) {
    sessionContext.value = ctx;
    if (draftPrompt.value) {
      evaluatePromptImmediate(draftPrompt.value, targetAgent.value, ctx);
    }
  }

  return {
    draftPrompt,
    targetAgent,
    sessionContext,
    lintResult,
    isLinting,
    evaluatePrompt,
    evaluatePromptImmediate,
    setTargetAgent,
    setSessionContext
  };
}
