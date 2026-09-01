import { ref } from 'vue';

export function usePromptLinter() {
  const draftPrompt = ref('');
  const lintResult = ref(null);
  const isLinting = ref(false);

  async function evaluatePrompt(text) {
    if (!text || !text.trim()) {
      lintResult.value = null;
      return;
    }

    isLinting.value = true;
    try {
      const res = await fetch('/api/lint-prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: text })
      });
      if (res.ok) {
        lintResult.value = await res.json();
      }
    } catch (e) {
      // ignore
    } finally {
      isLinting.value = false;
    }
  }

  return {
    draftPrompt,
    lintResult,
    isLinting,
    evaluatePrompt
  };
}
