/**
 * Pre-Flight Prompt Token Linter Engine
 * Evaluates draft prompts for token-expansion risks and produces lean rewrites.
 * Supports agent-specific targeting for OpenAI Codex and Google Antigravity.
 */

export function lintPrompt(promptText, targetAgent = 'codex', sessionContext = null) {
  if (!promptText || !promptText.trim()) {
    const sessionTurnCount = sessionContext?.turnCount || 0;
    const accumulatedContextTokens = sessionContext?.accumulatedContextTokens || sessionContext?.totalTokens || 0;
    return {
      riskLevel: 'LOW',
      riskScore: 100,
      targetAgent,
      isClean: true,
      sessionContext: sessionContext ? {
        turnCount: sessionTurnCount,
        accumulatedContextTokens,
        nextTurnNumber: sessionTurnCount + 1,
        projectedSessionTotal: accumulatedContextTokens
      } : null,
      estimatedOriginalTokens: 500,
      estimatedOptimizedTokens: 500,
      tokensSaved: 0,
      warnings: [],
      ruleMatches: [],
      optimizedPrompt: '',
      tips: ['Enter a prompt to analyze its token expansion risk before submitting to your agent.']
    };
  }

  const text = promptText.toLowerCase().trim();
  const isAntigravity = targetAgent === 'antigravity';
  const warnings = [];
  const tips = [];
  const ruleMatches = [];
  let riskScore = 100;
  let estimatedTokens = 800;
  let optimized = promptText.trim();

  // Helper to record rule detection
  function addRule({ id, label, severity, penalty, tokens, warning, tip }) {
    riskScore -= penalty;
    estimatedTokens += tokens;
    warnings.push({
      type: id,
      severity,
      message: warning,
      category: label
    });
    ruleMatches.push({ id, label, severity });
    if (tip && !tips.includes(tip)) {
      tips.push(tip);
    }
  }

  // 1. Broad file exploration
  if (/(\ball files\b|\bcheck all\b|\bsearch whole\b|\bevery file\b|\blook through all\b)/i.test(text)) {
    addRule({
      id: 'BROAD_FILE_SCAN',
      label: 'Broad File Exploration',
      severity: 'HIGH',
      penalty: 30,
      tokens: 35000,
      warning: 'Asking the agent to scan "all files" will trigger 20+ file reads, easily injecting 30k+ tokens into context.',
      tip: 'Scope the search to a specific directory (e.g. `src/features/auth/`) or use targeted keyword grep.'
    });
    optimized = optimized.replace(/\ball files\b/gi, 'relevant files in the target feature directory');
    optimized = optimized.replace(/\bcheck all\b/gi, 'inspect targeted files');
    optimized = optimized.replace(/\bevery file\b/gi, 'the specific files');
  }

  // 2. Whole file reading
  if (/(\bread the whole\b|\bshow (?:me )?the full file\b|\bread entirely\b|\bdump the entire file\b|\bview full file\b)/i.test(text)) {
    addRule({
      id: 'FULL_FILE_READ',
      label: 'Whole File Read',
      severity: 'MEDIUM',
      penalty: 20,
      tokens: 15000,
      warning: 'Requesting entire files dumps hundreds of lines into context when only a specific function or block is needed.',
      tip: isAntigravity
        ? 'Request specific symbols or specify line ranges (`StartLine`/`EndLine`) for progressive disclosure.'
        : 'Request specific functions or use `grep_search` and targeted replacements.'
    });
    optimized = optimized.replace(/\bread the whole file\b/gi, 'inspect the relevant function and line range');
    optimized = optimized.replace(/\bthe full file\b/gi, 'the relevant section');
    optimized = optimized.replace(/\bread entirely\b/gi, 'read the targeted section');
  }

  // 3. Full directory tree dump
  if (/(\btree\b|\bls -r\b|\bfind \.\b|\bdir \/s\b|\blist all directories\b|\bshow project structure\b|\bprint directory tree\b)/i.test(text)) {
    addRule({
      id: 'FULL_DIRECTORY_DUMP',
      label: 'Directory Tree Dump',
      severity: 'HIGH',
      penalty: 25,
      tokens: 20000,
      warning: 'Commands like `tree` or recursive `find` dump thousands of paths, subdirectories, and build artifacts into context.',
      tip: 'Inspect only top-level directories or use targeted `find_by_name` with `MaxDepth` constraints.'
    });
    optimized = optimized.replace(/\btree\b/gi, 'ls -d */ (top-level directories only)');
    optimized = optimized.replace(/\bls -r\b/gi, 'ls');
    optimized = optimized.replace(/\bfind \.\b/gi, 'find . -maxdepth 2');
  }

  // 4. Unfiltered test runs
  if (/(\brun all tests\b|\brun test suite\b|\bpnpm test\b|\bnpm test\b|\byarn test\b|\bvitest\b|\bjest\b|\bpytest\b)/i.test(text)) {
    if (!text.includes('--bail') && !text.includes('bail 1') && !text.includes('--silent') && !text.includes('-q') && !text.includes('test:agent')) {
      addRule({
        id: 'UNFILTERED_TEST_OUTPUT',
        label: 'Noisy Test Output',
        severity: 'HIGH',
        penalty: 30,
        tokens: 25000,
        warning: 'Running test suites without bail or silent flags dumps passing assertion noise and lengthy logs into context.',
        tip: 'Always pass `--bail 1 --silent` (or use `"test:agent"`) to fail-fast and suppress console chatter.'
      });
      optimized = optimized.replace(/\bpnpm test\b/gi, 'pnpm test -- --bail 1 --silent');
      optimized = optimized.replace(/\bnpm test\b/gi, 'npm test -- --bail 1 --silent');
      optimized = optimized.replace(/\byarn test\b/gi, 'yarn test --bail 1 --silent');
      if (!optimized.includes('--bail') && !optimized.includes('silent')) {
        optimized += ' (run tests with --bail 1 --silent to keep context lean)';
      }
    }
  }

  // 5. Unbounded git logs
  if (/(\bgit log\b)/i.test(text) && !text.includes('-n') && !text.includes('--oneline') && !text.includes('-1') && !text.includes('-5')) {
    addRule({
      id: 'UNBOUNDED_GIT_LOG',
      label: 'Unbounded Git History',
      severity: 'LOW',
      penalty: 15,
      tokens: 8000,
      warning: 'Unbounded `git log` dumps pages of commit history, diffs, and hashes into context.',
      tip: 'Use `git log -n 5 --oneline` or `git status --short`.'
    });
    optimized = optimized.replace(/\bgit log\b/gi, 'git log -n 5 --oneline');
  }

  // 6. Routine task high reasoning
  const isRoutineTask = /(\brename\b|\btypo\b|\bformatting\b|\bformat\b|\bclean up\b|\bupdate readme\b|\bfix lint\b|\bsimple edit\b|\bbump version\b)/i.test(text);
  const requestsHighReasoning = /(\bthink (?:hard|deeply|thoroughly|carefully|maximum)\b|\bhigh reasoning\b|\bdeep reasoning\b|\bexhaustive deliberation\b)/i.test(text);

  if (isRoutineTask && requestsHighReasoning) {
    addRule({
      id: 'HIGH_REASONING_ROUTINE',
      label: 'Excessive Reasoning for Routine Task',
      severity: 'HIGH',
      penalty: 30,
      tokens: 18000,
      warning: 'Routine chores (renaming, typos, doc edits, formatting) do not require high reasoning and burn thousands of output tokens.',
      tip: 'Use `reasoning_effort: low` for routine chores and reserve high reasoning strictly for complex architectural algorithms.'
    });
    optimized = optimized.replace(/think (?:hard|deeply|thoroughly|carefully|maximum)/gi, 'use low reasoning effort');
    optimized = optimized.replace(/high reasoning/gi, 'low reasoning');
    optimized = optimized.replace(/deep reasoning/gi, 'low reasoning');
  } else if (isRoutineTask && !text.includes('low') && !text.includes('effort')) {
    addRule({
      id: 'ROUTINE_TASK_UNCONSTRAINED',
      label: 'Unbounded Reasoning on Routine Task',
      severity: 'LOW',
      penalty: 10,
      tokens: 4000,
      warning: 'This appears to be a routine chore. Specifying low reasoning effort prevents wasted output deliberation tokens.',
      tip: 'Add "(reasoning_effort: low)" to keep generation fast and low-cost.'
    });
    if (!optimized.toLowerCase().includes('reasoning')) {
      optimized += ' (reasoning_effort: low)';
    }
  }

  // 7. Full-file rewrite / overwrite anti-pattern
  if (/(\brewrite (?:the )?(?:whole|entire) file\b|\brewrite from scratch\b|\breplace (?:the )?(?:entire|whole) file\b|\bgive (?:me )?the complete code\b)/i.test(text)) {
    addRule({
      id: 'FULL_FILE_REWRITE',
      label: 'Whole File Overwrite',
      severity: 'HIGH',
      penalty: 25,
      tokens: 22000,
      warning: 'Asking the agent to rewrite entire files from scratch causes massive output generation and strips existing comments.',
      tip: 'Instruct the agent to make targeted surgical edits (`replace_file_content` / diff patches) to affected functions only.'
    });
    optimized = optimized.replace(/\brewrite (?:the )?(?:whole|entire) file(?: from scratch)?\b/gi, 'make targeted surgical replacements in the affected functions');
    optimized = optimized.replace(/\bgive (?:me )?the complete code\b/gi, 'provide only the modified code block');
  }

  // 8. Multi-task sprawl ("Kitchen-Sink Turn")
  const taskSplitRegex = /\s*\b(?:and also|and then also|after that please|and then afterwards|and also add|and also fix|and also rewrite|and then)\b\s*/i;
  const taskConjunctions = (text.match(/\b(?:and also|and then also|after that please|and then afterwards|and also add|and also fix|and also rewrite|and then)\b/gi) || []).length;
  if (taskConjunctions >= 2) {
    addRule({
      id: 'MULTI_TASK_SPRAWL',
      label: 'Multi-Task Sprawl',
      severity: 'HIGH',
      penalty: 55,
      tokens: 30000,
      warning: 'Chaining multiple large tasks in a single turn triggers long tool loops (>10 iterations) and breaks token prompt caching.',
      tip: 'Break large work into single-objective turns (under 15 turns per thread) to prevent quadratic context cost inflation.'
    });
    tips.push('Execute the primary objective first, verify it, then proceed to subsequent tasks in follow-up turns.');

    const parts = optimized.split(new RegExp(taskSplitRegex, 'gi')).map(p => p.trim().replace(/\.+$/, '')).filter(Boolean);
    if (parts.length > 1) {
      const primary = parts[0];
      const deferred = parts.slice(1).join(', ');
      optimized = `${primary}. (Stage 1: focus exclusively on this primary objective first; defer "${deferred}" to follow-up turns).`;
    }
  }

  // 9. Unscoped linter / compiler runs
  if (/(?:\beslint\s+\.|\bnpx eslint|\btsc\b|\bnpm run lint|\bpnpm lint)/i.test(text) && !text.includes('--quiet') && !text.includes('--fix') && !text.includes('src/')) {
    addRule({
      id: 'UNSCOPED_LINTER',
      label: 'Unscoped Linter Run',
      severity: 'LOW',
      penalty: 15,
      tokens: 6000,
      warning: 'Running linters across the entire workspace without quiet flags can dump hundreds of non-fatal warnings into context.',
      tip: 'Target specific modified files or append `--quiet` to report errors only.'
    });
    optimized = optimized.replace(/eslint\s+\./gi, 'eslint --quiet');
    optimized = optimized.replace(/npm run lint/gi, 'npm run lint -- --quiet');
  }

  // 10. Agent-Specific Optimizations
  if (isAntigravity) {
    if (text.includes('overnight') || text.includes('until it is complete') || text.includes('autonomous') || text.includes('keep going until')) {
      if (!text.includes('/goal')) {
        addRule({
          id: 'ANTIGRAVITY_SLASH_COMMAND',
          label: 'Antigravity Autonomous Command',
          severity: 'LOW',
          penalty: 5,
          tokens: 2000,
          warning: 'For long-running tasks, using the `/goal` slash command ensures thorough autonomous execution without context bloat.',
          tip: 'Prefix the instruction with `/goal` for multi-step autonomous tasks.'
        });
        if (!optimized.startsWith('/goal')) {
          optimized = `/goal ${optimized}`;
        }
      }
    }
  } else {
    if (text.includes('explain') && text.includes('code') && !text.includes('brief') && !text.includes('concise')) {
      tips.push('Codex tip: add "keep explanations concise and prioritize code diffs" to minimize billable output tokens.');
    }
  }

  // 11. Session Context Aware Rules
  const sessionTurnCount = sessionContext?.turnCount || 0;
  const accumulatedContextTokens = sessionContext?.accumulatedContextTokens || sessionContext?.totalTokens || 0;

  if (sessionTurnCount >= 15) {
    addRule({
      id: 'THREAD_DEPTH_INFLATION',
      label: 'High Thread Depth (Handoff Recommended)',
      severity: 'HIGH',
      penalty: 30,
      tokens: Math.round(accumulatedContextTokens * 0.35) || 15000,
      warning: `This session is at Turn #${sessionTurnCount}. Appending another turn re-transmits all ~${accumulatedContextTokens.toLocaleString()} historical tokens into context.`,
      tip: 'Consider triggering a State-Preserving Session Handoff (Action 4) to start a clean thread and preserve cache speed.'
    });
  }

  // Calculate final risk level & token projections
  let riskLevel = 'LOW';
  if (riskScore < 50) riskLevel = 'HIGH';
  else if (riskScore < 80) riskLevel = 'MEDIUM';

  const estimatedOptimizedTokens = Math.max(Math.round(estimatedTokens * 0.12), 400);
  const isClean = warnings.length === 0;
  const projectedSessionTotal = accumulatedContextTokens > 0 ? (accumulatedContextTokens + estimatedTokens) : null;

  return {
    riskLevel,
    riskScore: Math.max(riskScore, 10),
    targetAgent,
    isClean,
    sessionContext: sessionContext ? {
      turnCount: sessionTurnCount,
      accumulatedContextTokens,
      nextTurnNumber: sessionTurnCount + 1,
      projectedSessionTotal
    } : null,
    estimatedOriginalTokens: estimatedTokens,
    estimatedOptimizedTokens,
    tokensSaved: Math.max(estimatedTokens - estimatedOptimizedTokens, 0),
    warnings,
    ruleMatches,
    optimizedPrompt: optimized !== promptText ? optimized : promptText,
    tips
  };
}
