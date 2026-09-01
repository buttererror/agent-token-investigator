/**
 * Pre-Flight Prompt Token Linter Engine
 * Evaluates draft prompts for token-expansion risks and produces lean rewrites.
 */

export function lintPrompt(promptText) {
  if (!promptText || !promptText.trim()) {
    return {
      riskLevel: 'LOW',
      score: 100,
      estimatedOriginalTokens: 500,
      estimatedOptimizedTokens: 500,
      warnings: [],
      optimizedPrompt: '',
      tips: ['Enter a prompt to analyze its token expansion risk.']
    };
  }

  const text = promptText.toLowerCase();
  const warnings = [];
  const tips = [];
  let riskScore = 100;
  let estimatedTokens = 800;
  let optimized = promptText;

  // Pattern 1: Broad file exploration
  if (text.includes('all files') || text.includes('check all') || text.includes('search whole') || text.includes('every file')) {
    riskScore -= 35;
    estimatedTokens += 35000;
    warnings.push({
      type: 'BROAD_FILE_SCAN',
      severity: 'HIGH',
      message: 'Asking the agent to scan "all files" will trigger 20+ file reads, easily adding 30k+ tokens to context.'
    });
    tips.push('Scope the search to a specific directory (e.g. `src/features/auth/`) or use targeted keywords.');
    optimized = optimized.replace(/all files/gi, 'relevant files in the target feature folder');
  }

  // Pattern 2: Full file reading
  if (text.includes('read the whole') || text.includes('show me the full file') || text.includes('read entirely')) {
    riskScore -= 25;
    estimatedTokens += 15000;
    warnings.push({
      type: 'FULL_FILE_READ',
      severity: 'MEDIUM',
      message: 'Requesting entire files can dump 1,000+ lines into context when only a 30-line function is needed.'
    });
    tips.push('Request specific function/component names or ask the agent to use `grep_search` and `StartLine`/`EndLine`.');
    optimized = optimized.replace(/the full file/gi, 'the relevant function or line range');
  }

  // Pattern 3: Unfiltered test runs
  if (text.includes('run all tests') || text.includes('run test suite') || text.includes('pnpm test') || text.includes('npm test')) {
    if (!text.includes('--bail') && !text.includes('bail 1') && !text.includes('silent')) {
      riskScore -= 30;
      estimatedTokens += 25000;
      warnings.push({
        type: 'UNFILTERED_TEST_OUTPUT',
        severity: 'HIGH',
        message: 'Running unfiltered tests will dump passing console logs and lengthy stack traces into context.'
      });
      tips.push('Specify `--bail 1` or `--silent` to halt immediately on first error and suppress noisy logs.');
      optimized = optimized.replace(/pnpm test/gi, 'pnpm test -- --bail 1 --silent');
      optimized = optimized.replace(/npm test/gi, 'npm test -- --bail 1 --silent');
      if (!optimized.includes('--bail')) {
        optimized += ' (run with --bail 1 to keep output minimal)';
      }
    }
  }

  // Pattern 4: Giant git log / diff
  if (text.includes('git log') && !text.includes('-n') && !text.includes('--oneline')) {
    riskScore -= 15;
    estimatedTokens += 8000;
    warnings.push({
      type: 'UNBOUNDED_GIT_LOG',
      severity: 'LOW',
      message: 'Unbounded `git log` dumps pages of commit history.'
    });
    tips.push('Use `git log -n 5 --oneline` or `git status --short`.');
    optimized = optimized.replace(/git log/gi, 'git log -n 5 --oneline');
  }

  let riskLevel = 'LOW';
  if (riskScore < 50) riskLevel = 'HIGH';
  else if (riskScore < 80) riskLevel = 'MEDIUM';

  const estimatedOptimizedTokens = Math.max(Math.round(estimatedTokens * 0.12), 450);

  return {
    riskLevel,
    riskScore: Math.max(riskScore, 10),
    estimatedOriginalTokens: estimatedTokens,
    estimatedOptimizedTokens,
    tokensSaved: estimatedTokens - estimatedOptimizedTokens,
    warnings,
    optimizedPrompt: optimized !== promptText ? optimized : promptText,
    tips
  };
}
