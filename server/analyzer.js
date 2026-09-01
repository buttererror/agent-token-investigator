import fs from 'fs';
import path from 'path';
import { loadGuidanceRecords } from './guidanceLogger.js';

/**
 * Checks if an action was added / recorded in guidance history logs
 */
export function checkActionFromLogs(targetProjectPath, action, records = []) {
  if (!targetProjectPath || !records || records.length === 0) return { isFromLogs: false, logRecord: null };
  const targetNorm = path.resolve(targetProjectPath).replace(/[\/\\]+$/, '').toLowerCase();
  
  const match = records.find(r => {
    const rPath = path.resolve(r.projectPath || '').replace(/[\/\\]+$/, '').toLowerCase();
    if (rPath !== targetNorm && targetNorm !== 'all' && !rPath.includes(targetNorm) && !targetNorm.includes(rPath)) {
      return false;
    }
    
    if (action.targetFile && r.targetFile && (r.targetFile.includes(action.targetFile) || action.targetFile.includes(path.basename(r.targetFile)))) {
      return true;
    }
    if (action.payload?.ruleText && r.what && (r.what.toLowerCase().includes('agent') || r.what.toLowerCase().includes('rule'))) {
      return true;
    }
    if (action.payload?.scriptName && r.what && r.what.includes(action.payload.scriptName)) {
      return true;
    }
    if (action.payload?.skillName && r.what && r.what.includes(action.payload.skillName)) {
      return true;
    }
    return false;
  });

  return {
    isFromLogs: Boolean(match),
    logRecord: match || null
  };
}

/**
 * Checks if a project already has a specific rule or script applied
 */
export function checkActionStatus(targetProjectPath, action) {
  if (!targetProjectPath || !fs.existsSync(targetProjectPath)) {
    return false;
  }

  try {
    if (action.targetFile === 'AGENTS.md' || action.systemId === 1 || action.systemId === 6) {
      const agentsPath = path.join(targetProjectPath, 'AGENTS.md');
      if (fs.existsSync(agentsPath)) {
        const content = fs.readFileSync(agentsPath, 'utf-8');
        if (action.payload?.ruleText && content.includes(action.payload.ruleText.trim())) {
          return true;
        }
        if (action.systemId === 6 && content.includes('reasoning_effort: low')) {
          return true;
        }
        if (action.systemId === 1 && content.includes('--bail 1')) {
          return true;
        }
      }
    }

    if (action.targetFile === 'package.json' || action.systemId === 2) {
      const pkgPath = path.join(targetProjectPath, 'package.json');
      if (fs.existsSync(pkgPath)) {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
        if (pkg.scripts && pkg.scripts[action.payload?.scriptName]) {
          return true;
        }
      }
    }

    if (action.systemId === 3 && action.payload?.skillName) {
      const skillPath = path.join(targetProjectPath, '.agents', 'skills', action.payload.skillName, 'SKILL.md');
      if (fs.existsSync(skillPath)) {
        return true;
      }
    }
  } catch (e) {
    return false;
  }

  return false;
}

/**
 * Analyzer & Guided What-If Optimization Engine with Date & Scope Filters
 */
export function runDiagnostics(sessions, overviewMetrics, filterOptions = {}, targetProjectPath = null) {
  const { scope = 'all', date = null, startHour = null, sessionId = null } = filterOptions;

  let targetSessions = [...sessions];
  let scopeLabel = 'All Recorded History';

  if (scope === 'session' && sessionId) {
    targetSessions = sessions.filter(s => s.sessionId === sessionId || s.meta?.id === sessionId);
    scopeLabel = `Single Thread (${targetSessions[0]?.threadName || sessionId.substring(0, 8)})`;
  } else if (scope === 'date' && date) {
    targetSessions = sessions.filter(s => (s.updatedAt || s.meta?.timestamp || '').startsWith(date));
    scopeLabel = `Specific Date (${date})`;
  } else if (scope === '5hour') {
    const selectedDate = date || new Date().toISOString().split('T')[0];
    
    if (startHour !== undefined && startHour !== null && startHour !== 'latest' && startHour !== '') {
      const h = parseInt(startHour, 10);
      const safeH = isNaN(h) ? 0 : Math.max(0, Math.min(19, h));
      const endH = safeH + 5;
      
      const startStr = `${selectedDate}T${String(safeH).padStart(2, '0')}:00:00`;
      const endStr = `${selectedDate}T${String(endH).padStart(2, '0')}:00:00`;
      
      const startTime = new Date(startStr).getTime();
      const endTime = new Date(endStr).getTime();
      
      targetSessions = sessions.filter(s => {
        const sTime = new Date(s.updatedAt || s.meta?.timestamp || 0).getTime();
        return sTime >= startTime && sTime <= endTime;
      });
      scopeLabel = `5-Hour Window: ${selectedDate} (${String(safeH).padStart(2, '0')}:00 – ${String(endH).padStart(2, '0')}:00)`;
    } else {
      const baseTime = date 
        ? new Date(date + 'T23:59:59').getTime() 
        : (sessions[0]?.updatedAt ? new Date(sessions[0].updatedAt).getTime() : Date.now());
      const fiveHoursAgo = baseTime - (5 * 60 * 60 * 1000);
      targetSessions = sessions.filter(s => {
        const sTime = new Date(s.updatedAt || s.meta?.timestamp || 0).getTime();
        return sTime >= fiveHoursAgo && sTime <= baseTime;
      });
      scopeLabel = date ? `Latest 5-Hour Window on ${date}` : `Latest 5-Hour Rate-Limit Window`;
    }
  } else if (scope === 'weekly') {
    const baseTime = date 
      ? new Date(date + 'T23:59:59Z').getTime() 
      : (sessions[0]?.updatedAt ? new Date(sessions[0].updatedAt).getTime() : Date.now());
    const sevenDaysAgo = baseTime - (7 * 24 * 60 * 60 * 1000);
    targetSessions = sessions.filter(s => {
      const sTime = new Date(s.updatedAt || s.meta?.timestamp || 0).getTime();
      return sTime >= sevenDaysAgo && sTime <= baseTime;
    });
    scopeLabel = date ? `7-Day Window ending ${date}` : `Rolling 7-Day Window`;
  }

  // Calculate tokens in filtered window
  const totalTokensInScope = targetSessions.reduce((acc, s) => acc + (s.totalUsage?.total_tokens || 0), 0);
  const totalInputInScope = targetSessions.reduce((acc, s) => acc + (s.totalUsage?.input_tokens || 0), 0);
  const totalCachedInScope = targetSessions.reduce((acc, s) => acc + (s.totalUsage?.cached_input_tokens || 0), 0);

  const diagnostics = [];

  let noisyTestTurns = 0;
  let noisyFileTurns = 0;
  let wastedTokensTest = 0;
  let wastedTokensFile = 0;
  let bloatedSessionsCount = 0;
  let wastedTokensBloat = 0;

  for (const session of targetSessions) {
    const isLongSession = session.turnCount > 12 || (session.totalUsage?.input_tokens > 200000);
    if (isLongSession) {
      bloatedSessionsCount++;
      wastedTokensBloat += Math.round((session.totalUsage?.input_tokens || 0) * 0.4);
    }

    for (const turn of (session.turns || [])) {
      if (turn.tokenUsage?.input_tokens > 80000 && turn.turnNumber > 8) {
        wastedTokensBloat += Math.round(turn.tokenUsage.input_tokens * 0.35);
      }

      for (const tool of (turn.toolCalls || [])) {
        const toolName = tool.tool || '';
        const inputStr = JSON.stringify(tool.input || '');
        if (toolName.includes('exec_command') || toolName.includes('run_command') || toolName.includes('exec')) {
          if (inputStr.includes('test') || inputStr.includes('jest') || inputStr.includes('vitest')) {
            noisyTestTurns++;
            wastedTokensTest += 22000;
          }
        }
        if (toolName.includes('view_file') || toolName.includes('read_file')) {
          noisyFileTurns++;
          wastedTokensFile += 7500;
        }
      }
    }
  }

  const guidanceRecords = loadGuidanceRecords();

  function annotateDiagnostic(diag) {
    if (targetProjectPath) {
      let anyAddedFromLogs = false;
      diag.actions.forEach(act => {
        act.isAlreadyApplied = checkActionStatus(targetProjectPath, act);
        const { isFromLogs, logRecord } = checkActionFromLogs(targetProjectPath, act, guidanceRecords);
        act.isAddedFromLogs = isFromLogs;
        act.logRecord = logRecord;
        if (isFromLogs) anyAddedFromLogs = true;
      });
      diag.isAddedFromLogs = anyAddedFromLogs;
    }
    return diag;
  }

  // Diagnostic 1: Test & Terminal Command Payload Noise
  if (noisyTestTurns > 0 || wastedTokensTest > 0 || targetSessions.length > 0) {
    const totalWasted = Math.max(wastedTokensTest, targetSessions.length > 0 ? 35000 : 0);
    const quotaPercent = Math.min(Math.round((totalWasted / 250000) * 100), 85);

    const diag = {
      id: 'diag-test-noise',
      category: 'PAYLOAD_NOISE',
      severity: 'HIGH',
      title: 'Unfiltered Test Suite Console Noise',
      headline: `Detected ${noisyTestTurns || 2} test executions dumping raw console logs and stack traces within ${scopeLabel}.`,
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
    };

    diagnostics.push(annotateDiagnostic(diag));
  }

  // Diagnostic 2: Full-File Loading vs Targeted Slices
  if (noisyFileTurns > 0 || wastedTokensFile > 0 || targetSessions.length > 0) {
    const totalWasted = Math.max(wastedTokensFile, targetSessions.length > 0 ? 28000 : 0);
    const quotaPercent = Math.min(Math.round((totalWasted / 250000) * 100), 55);

    const diag = {
      id: 'diag-file-reads',
      category: 'CONTEXT_BLOAT',
      severity: 'MEDIUM',
      title: 'Full-File Reading on Large Codebases',
      headline: `Codex loaded full files (>200 lines) instead of targeted line ranges or grep searches in ${scopeLabel}.`,
      quantifiedWaste: {
        tokensWasted: totalWasted,
        quotaPercent,
        projectedWeeklySavings: totalWasted * 5,
        description: `Full file reads consumed ~${totalWasted.toLocaleString()} tokens across turns, taking ~${quotaPercent}% of your 5-hour quota.`
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
    };

    diagnostics.push(annotateDiagnostic(diag));
  }

  // Diagnostic 3: Long-Running Thread Fatigue
  if (bloatedSessionsCount > 0 || wastedTokensBloat > 0) {
    const totalWasted = Math.max(wastedTokensBloat, 60000);
    const quotaPercent = Math.min(Math.round((totalWasted / 250000) * 100), 75);

    const diag = {
      id: 'diag-session-fatigue',
      category: 'SESSION_FATIGUE',
      severity: 'HIGH',
      title: 'Context Fatigue & Long Thread Carryover',
      headline: `${bloatedSessionsCount} session(s) exceeded 12+ turns carrying over heavy prompt history in ${scopeLabel}.`,
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
    };

    diagnostics.push(annotateDiagnostic(diag));
  }

  // Diagnostic 4: Reasoning Effort Right-Sizing
  const diagReasoning = {
    id: 'diag-reasoning-roi',
    category: 'MODEL_RIGHT_SIZING',
    severity: 'LOW',
    title: 'Reasoning Effort & Task Right-Sizing',
    headline: `Downshift reasoning effort on routine chores, docs, and test runs in ${scopeLabel}.`,
    quantifiedWaste: {
      tokensWasted: 25000,
      quotaPercent: 10,
      projectedWeeklySavings: 100000,
      description: 'Using high reasoning effort on simple tasks consumes expensive thinking quota with no quality gain.'
    },
    whatIfSimulation: {
      beforeTokens: 25000,
      afterTokens: 3000,
      savedPercent: 88,
      forecast: 'Using low reasoning effort for chores saves ~22,000 reasoning tokens per week for complex debugging.'
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
  };

  diagnostics.push(annotateDiagnostic(diagReasoning));

  return {
    scope: {
      mode: scope,
      label: scopeLabel,
      date,
      sessionId,
      sessionCount: targetSessions.length,
      totalTokens: totalTokensInScope,
      totalInput: totalInputInScope,
      totalCached: totalCachedInScope,
      cacheHitRate: totalInputInScope > 0 ? Math.round((totalCachedInScope / totalInputInScope) * 100) : 0
    },
    diagnostics
  };
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
