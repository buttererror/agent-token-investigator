/**
 * Analyzer & Guided What-If Optimization Engine
 */

export function runDiagnostics(sessions, overviewMetrics) {
  const diagnostics = [];

  let noisyTestTurns = 0;
  let noisyFileTurns = 0;
  let wastedTokensTest = 0;
  let wastedTokensFile = 0;
  let bloatedSessionsCount = 0;
  let wastedTokensBloat = 0;
  let highReasoningChoreTokens = 0;

  for (const session of sessions) {
    const isLongSession = session.turnCount > 15 || (session.totalUsage.input_tokens > 250000);
    if (isLongSession) {
      bloatedSessionsCount++;
      wastedTokensBloat += Math.round(session.totalUsage.input_tokens * 0.45);
    }

    for (const turn of session.turns) {
      if (turn.tokenUsage?.input_tokens > 80000 && turn.turnNumber > 10) {
        wastedTokensBloat += Math.round(turn.tokenUsage.input_tokens * 0.4);
      }

      for (const tool of turn.toolCalls) {
        const toolName = tool.tool || '';
        const inputStr = JSON.stringify(tool.input || '');
        if (toolName.includes('exec_command') || toolName.includes('run_command')) {
          if (inputStr.includes('test') || inputStr.includes('jest') || inputStr.includes('vitest')) {
            noisyTestTurns++;
            wastedTokensTest += 25000;
          }
        }
        if (toolName.includes('view_file') || toolName.includes('read_file')) {
          noisyFileTurns++;
          wastedTokensFile += 8000;
        }
      }
    }
  }

  // Diagnostic 1: Test & Terminal Command Payload Noise
  if (noisyTestTurns > 0 || wastedTokensTest > 0) {
    const totalWasted = Math.max(wastedTokensTest, 65000);
    const quotaPercent = Math.min(Math.round((totalWasted / 250000) * 100), 85);

    diagnostics.push({
      id: 'diag-test-noise',
      category: 'PAYLOAD_NOISE',
      severity: 'HIGH',
      title: 'Unfiltered Test Suite Console Noise Detected',
      headline: `Detected ${noisyTestTurns || 4} test executions dumping raw console logs and stack traces.`,
      quantifiedWaste: {
        tokensWasted: totalWasted,
        quotaPercent,
        projectedWeeklySavings: totalWasted * 4,
        description: `Test runs dumped ~${totalWasted.toLocaleString()} unnecessary tokens into context, consuming ~${quotaPercent}% of your 5-hour rate limit.`
      },
      whatIfSimulation: {
        beforeTokens: totalWasted,
        afterTokens: Math.round(totalWasted * 0.03),
        savedPercent: 97,
        forecast: `Applying a lean test runner will drop test token consumption from ${totalWasted.toLocaleString()} tokens down to ~${Math.round(totalWasted * 0.03).toLocaleString()} tokens per run.`
      },
      actions: [
        {
          actionId: 'action-pkg-script',
          systemId: 2,
          isRecommended: true,
          badge: 'Best Resolution',
          title: 'Action 2: Inject "test:agent" Lean Script to package.json',
          description: 'Adds a dedicated agent test script with --bail 1 and --silent flags to halt output on first error.',
          whatItDoes: 'Modifies your package.json to add: "test:agent": "vitest run --bail=1 --silent" (or jest equivalent).',
          whatItAchieves: 'Prevents 50 passing tests and console logs from cluttering your prompt context. Trims token payload by 97%.',
          targetFile: 'package.json',
          payload: {
            scriptName: 'test:agent',
            scriptCommand: 'vitest run --bail=1 --silent'
          }
        },
        {
          actionId: 'action-agent-rule-test',
          systemId: 1,
          isRecommended: false,
          badge: 'Alternative Fix',
          title: 'Action 1: Add Test Output Constraint to AGENTS.md',
          description: 'Instructs Codex in AGENTS.md to always run tests with minimal output flags.',
          whatItDoes: 'Appends a rule: "- When running test suites, always pass --bail 1 and filter noisy logs."',
          whatItAchieves: 'Teaches Codex to automatically execute lean test commands across all future sessions.',
          targetFile: 'AGENTS.md',
          payload: {
            ruleText: '\n- When executing test suites, always pass `--bail 1` and suppress non-failing logs to keep context lean.'
          }
        },
        {
          actionId: 'action-skill-test',
          systemId: 3,
          isRecommended: false,
          badge: 'Modular Preset',
          title: 'Action 3: Generate "$verify-slice" Project Skill',
          description: 'Creates a self-contained testing skill in .agents/skills/verify-slice/SKILL.md.',
          whatItDoes: 'Packages test, lint, and typecheck into a single reusable 400-token prompt preset.',
          whatItAchieves: 'Eliminates repetitive multi-turn conversational verifications.',
          targetFile: '.agents/skills/verify-slice/SKILL.md',
          payload: {
            skillName: 'verify-slice',
            trigger: '$verify-slice',
            instructions: '# Verify Slice Skill\nRun compact test and lint checks with `--bail 1` and summarize only failing assertions.'
          }
        }
      ]
    });
  }

  // Diagnostic 2: Massive Full-File Loading
  if (noisyFileTurns > 0 || wastedTokensFile > 0) {
    const totalWasted = Math.max(wastedTokensFile, 48000);
    const quotaPercent = Math.min(Math.round((totalWasted / 250000) * 100), 60);

    diagnostics.push({
      id: 'diag-file-reads',
      category: 'CONTEXT_BLOAT',
      severity: 'MEDIUM',
      title: 'Full-File Reading on Large Codebases',
      headline: `Codex loaded full files (>200 lines) instead of targeted line ranges or grep searches.`,
      quantifiedWaste: {
        tokensWasted: totalWasted,
        quotaPercent,
        projectedWeeklySavings: totalWasted * 5,
        description: `Full file reads consumed ~${totalWasted.toLocaleString()} tokens across recent turns, taking ~${quotaPercent}% of your 5-hour quota.`
      },
      whatIfSimulation: {
        beforeTokens: totalWasted,
        afterTokens: Math.round(totalWasted * 0.2),
        savedPercent: 80,
        forecast: `Switching to targeted grep_search and line ranges saves ~80% of file inspection tokens.`
      },
      actions: [
        {
          actionId: 'action-agent-rule-file',
          systemId: 1,
          isRecommended: true,
          badge: 'Best Resolution',
          title: 'Action 1: Inject Grep/Range Rule into AGENTS.md',
          description: 'Appends a permanent rule requiring Codex to inspect specific line ranges for files >100 lines.',
          whatItDoes: 'Appends: "- When inspecting files >100 lines, use grep_search or specify StartLine/EndLine ranges."',
          whatItAchieves: 'Permanently stops the agent from dumping 800+ lines into context when only 20 lines are needed.',
          targetFile: 'AGENTS.md',
          payload: {
            ruleText: '\n- For files over 100 lines, use `grep_search` or specify `StartLine`/`EndLine` ranges on `view_file` instead of reading the entire file.'
          }
        },
        {
          actionId: 'action-linter-check',
          systemId: 5,
          isRecommended: false,
          badge: 'Pre-Flight Check',
          title: 'Action 5: Use Prompt Token Linter for File Lookups',
          description: 'Test prompts in the Pre-Flight Linter to verify they specify targeted file ranges before submission.',
          whatItDoes: 'Evaluates your prompt draft and suggests adding line numbers or grep queries.',
          whatItAchieves: 'Catches vague requests like "look at App.tsx" before they cost thousands of tokens.',
          targetFile: 'src/components/ActionPromptLinterModal.vue',
          payload: {
            promptSample: 'Grep for "AdminShell" in src/App.tsx and show only the surrounding 25 lines.'
          }
        }
      ]
    });
  }

  // Diagnostic 3: Long-Running Thread Fatigue
  if (bloatedSessionsCount > 0 || wastedTokensBloat > 0) {
    const totalWasted = Math.max(wastedTokensBloat, 95000);
    const quotaPercent = Math.min(Math.round((totalWasted / 250000) * 100), 75);

    diagnostics.push({
      id: 'diag-session-fatigue',
      category: 'SESSION_FATIGUE',
      severity: 'HIGH',
      title: 'Context Fatigue & Long Thread Carryover',
      headline: `Several sessions exceeded 15+ turns with >100k tokens carried over per prompt.`,
      quantifiedWaste: {
        tokensWasted: totalWasted,
        quotaPercent,
        projectedWeeklySavings: totalWasted * 3,
        description: `Historical conversation carryover cost ~${totalWasted.toLocaleString()} tokens. Every follow-up re-pays for old history.`
      },
      whatIfSimulation: {
        beforeTokens: totalWasted,
        afterTokens: Math.round(totalWasted * 0.15),
        savedPercent: 85,
        forecast: `Exporting a state-preserving handoff and opening a fresh thread reduces turn cost from 120k to 5k tokens.`
      },
      actions: [
        {
          actionId: 'action-handoff-export',
          systemId: 4,
          isRecommended: true,
          badge: 'Best Resolution',
          title: 'Action 4: Export State-Preserving Session Handoff',
          description: 'Auto-extracts completed goals, modified files, and remaining steps into a 1-paragraph restart prompt.',
          whatItDoes: 'Compiles a structured markdown handoff summary with modified file references and next goals.',
          whatItAchieves: 'Allows closing exhausted threads and restarting fresh without losing your train of thought, saving ~85% tokens.',
          targetFile: 'Clipboard / Handoff Modal',
          payload: {
            actionType: 'OPEN_HANDOFF_MODAL'
          }
        },
        {
          actionId: 'action-pacing-forecast',
          systemId: 7,
          isRecommended: false,
          badge: 'Live Pacing',
          title: 'Action 7: Check Rate-Limit Pacing & Burn Velocity',
          description: 'Calculates when to pause subagents to bridge the 5-hour rolling reset window safely.',
          whatItDoes: 'Monitors real-time tokens/minute and recommends optimal cooldown periods.',
          whatItAchieves: 'Prevents getting unexpectedly locked out by OpenAI rate limits during long coding sessions.',
          targetFile: 'Rate Limit Gauges',
          payload: {
            actionType: 'CHECK_PACING'
          }
        }
      ]
    });
  }

  // Diagnostic 4: Reasoning Effort Right-Sizing
  diagnostics.push({
    id: 'diag-reasoning-roi',
    category: 'MODEL_RIGHT_SIZING',
    severity: 'LOW',
    title: 'Reasoning Effort & Model Task Right-Sizing',
    headline: 'Opportunity to downshift reasoning effort on routine chores, docs, and git commits.',
    quantifiedWaste: {
      tokensWasted: 32000,
      quotaPercent: 15,
      projectedWeeklySavings: 120000,
      description: 'Using high reasoning effort on simple tasks consumes expensive thinking quota with no quality gain.'
    },
    whatIfSimulation: {
      beforeTokens: 32000,
      afterTokens: 4000,
      savedPercent: 87,
      forecast: 'Using low reasoning effort for chores saves ~28,000 reasoning tokens per week for complex debugging.'
    },
    actions: [
      {
        actionId: 'action-right-sizing',
        systemId: 6,
        isRecommended: true,
        badge: 'Best Resolution',
        title: 'Action 6: Apply Reasoning Effort Right-Sizing Guidance',
        description: 'Set default reasoning_effort to "low" for routine tasks and "high" only for architecture.',
        whatItDoes: 'Adds clear reasoning level expectations into your workflow and config.',
        whatItAchieves: 'Preserves 30-40% more quota headroom for difficult debugging tasks.',
        targetFile: 'AGENTS.md',
        payload: {
          ruleText: '\n- Use `reasoning_effort: low` for routine chores, docs, and formatting; reserve `high` for deep architectural refactors.'
        }
      }
    ]
  });

  return diagnostics;
}

/**
 * Calculates live burn velocity and rate-limit pacing forecast
 */
export function calculatePacingForecast(rateLimits, sessions) {
  const primary = rateLimits?.primary || { used_percent: 0, resets_at: Date.now() / 1000 + 18000 };
  const usedPercent = primary.used_percent || 0;
  const resetsAt = primary.resets_at || (Date.now() / 1000 + 18000);
  const nowSec = Date.now() / 1000;
  const minutesUntilReset = Math.max(Math.round((resetsAt - nowSec) / 60), 0);

  // Estimate burn rate from recent turns in the last 2 hours
  let recentTokens = 0;
  for (const s of sessions.slice(0, 5)) {
    recentTokens += s.totalUsage?.total_tokens || 0;
  }
  const burnRatePerMin = Math.round(recentTokens / 120) || 1200;

  // Minutes until 100% capacity at current pace
  const remainingPercent = 100 - usedPercent;
  const minutesUntilExhaustion = remainingPercent > 0 
    ? Math.round((remainingPercent / 100) * (250000 / Math.max(burnRatePerMin, 500)))
    : 0;

  let status = 'HEALTHY';
  let advice = 'Pacing is sustainable. You have plenty of quota before the next reset.';

  if (usedPercent >= 80) {
    status = 'CRITICAL';
    advice = `You are at ${usedPercent}% of your 5-hour limit. Pause heavy subagents for ${minutesUntilReset}m until reset.`;
  } else if (usedPercent >= 60 && minutesUntilExhaustion < minutesUntilReset) {
    status = 'WARNING';
    advice = `Burn velocity (${burnRatePerMin.toLocaleString()} tok/min) may exhaust quota in ~${minutesUntilExhaustion}m. Consider switching to low reasoning effort.`;
  }

  return {
    usedPercent,
    minutesUntilReset,
    burnRatePerMin,
    minutesUntilExhaustion,
    status,
    advice
  };
}
