import fs from 'fs';
import path from 'path';
import { loadGuidanceRecords } from './guidanceLogger.js';
import { getSessionTimestamp, getTimeRangeBoundary } from '../src/utils/timeUtils.js';

const TEST_COMMAND_PATTERN = /(?:^|[;&|]\s*)(?:(?:pnpm|npm|yarn|bun)\b[^\n]*\b(?:test(?::[\w-]+)?|jest|vitest|mocha|ava)\b|(?:jest|vitest|mocha|ava|pytest)\b)/i;
const ROUTINE_TASK_PATTERN = /\b(?:docs?|documentation|format(?:ting)?|rename|typo|read|review|status|list)\b/i;

function normalizeRuleText(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[`*_]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function commandFromTool(tool) {
  const input = tool?.input;
  if (typeof input === 'string') return input;
  if (input && typeof input === 'object') return String(input.cmd || input.command || '');
  return '';
}

function hasLineRange(input) {
  if (!input) return false;
  if (typeof input === 'string') return /\b(?:start_?line|end_?line|fromLine|toLine)\b/i.test(input);
  if (typeof input !== 'object') return false;
  const keys = Object.keys(input).map((key) => key.toLowerCase());
  return keys.some((key) => ['startline', 'endline', 'start_line', 'end_line', 'fromline', 'toline'].includes(key));
}

export function isNoisyTestInvocation(tool) {
  const name = String(tool?.tool || '');
  if (!/(?:exec_command|run_command|\bexec\b)/i.test(name)) return false;
  const command = commandFromTool(tool);
  return TEST_COMMAND_PATTERN.test(command) && !(/--silent/.test(command) && /--bail(?:\s+|=)1\b/.test(command));
}

export function isUnboundedFileRead(tool) {
  return /(?:view_file|read_file)/i.test(String(tool?.tool || '')) && !hasLineRange(tool.input);
}

export function isLikelyRoutineTurn(turn) {
  const toolCount = turn?.toolCalls?.length || 0;
  const prompt = `${turn?.userPrompt || ''} ${turn?.assistantMessage || ''}`;
  return toolCount <= 2 && ROUTINE_TASK_PATTERN.test(prompt);
}

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
        if (action.payload?.ruleText && normalizeRuleText(content).includes(normalizeRuleText(action.payload.ruleText))) {
          return true;
        }
        if (action.systemId === 6 && content.includes('reasoning_effort: low')) {
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
  const { scope = 'all', date = null, startHour = null, sessionId = null, agent = 'all', workspace = 'all' } = filterOptions;

  let targetSessions = [...sessions];
  let scopeLabel = 'All Recorded History';

  if (scope === 'session' && sessionId) {
    targetSessions = sessions.filter(s => s.sessionId === sessionId || s.meta?.id === sessionId);
    scopeLabel = `Single Thread (${targetSessions[0]?.threadName || sessionId.substring(0, 8)})`;
  } else if (scope === 'date' && date) {
    targetSessions = sessions.filter(s => (s.updatedAt || s.meta?.timestamp || '').startsWith(date));
    scopeLabel = `Specific Date (${date})`;
  } else if ((scope === '5hour' || scope === '5h') && startHour !== undefined && startHour !== null && startHour !== 'latest' && startHour !== '') {
      const selectedDate = date || new Date().toISOString().split('T')[0];
      const h = parseInt(startHour, 10);
      const safeH = isNaN(h) ? 0 : Math.max(0, Math.min(19, h));
      const endH = safeH + 5;
      
      const startStr = `${selectedDate}T${String(safeH).padStart(2, '0')}:00:00`;
      const endStr = `${selectedDate}T${String(endH).padStart(2, '0')}:00:00`;
      
      const startTime = new Date(startStr).getTime();
      const endTime = new Date(endStr).getTime();
      
      targetSessions = sessions.filter(s => {
        const sTime = getSessionTimestamp(s);
        return sTime >= startTime && sTime <= endTime;
      });
      scopeLabel = `5-Hour Window: ${selectedDate} (${String(safeH).padStart(2, '0')}:00 – ${String(endH).padStart(2, '0')}:00)`;
  } else {
    const baseTime = date 
      ? new Date(date + 'T23:59:59').getTime() 
      : (sessions[0] ? getSessionTimestamp(sessions[0]) : Date.now());
    const boundary = getTimeRangeBoundary(scope, baseTime);
    targetSessions = sessions.filter(s => {
      const sTime = getSessionTimestamp(s);
      return sTime >= boundary.startTime && sTime <= boundary.endTime;
    });
    // Add date specifiers to label if needed
    if (date && scope === '5h') {
        scopeLabel = `Latest 5-Hour Window on ${date}`;
    } else if (date && (scope === 'weekly' || scope === '7d')) {
        scopeLabel = `7-Day Window ending ${date}`;
    } else if (date && scope === '30d') {
        scopeLabel = `30-Day Window ending ${date}`;
    } else {
        scopeLabel = boundary.scopeLabel;
    }
  }


  // Calculate tokens in filtered window
  const totalTokensInScope = targetSessions.reduce((acc, s) => acc + (s.totalUsage?.total_tokens || 0), 0);
  const totalInputInScope = targetSessions.reduce((acc, s) => acc + (s.totalUsage?.input_tokens || 0), 0);
  const totalCachedInScope = targetSessions.reduce((acc, s) => acc + (s.totalUsage?.cached_input_tokens || 0), 0);

  const diagnostics = [];

  let noisyTestTurns = 0;
  let noisyFileTurns = 0;
  let testAffectedInputTokens = 0;
  let fileAffectedInputTokens = 0;
  let routineHighReasoningTurns = 0;
  let routineHighReasoningTokens = 0;
  let bloatedSessionsCount = 0;
  let lateTurnInputTokens = 0;

  for (const session of targetSessions) {
    const isLongSession = session.turnCount > 12;
    if (isLongSession) {
      bloatedSessionsCount++;
    }

    for (const turn of (session.turns || [])) {
      const inputTokens = turn.tokenUsage?.input_tokens || 0;
      const noisyTests = (turn.toolCalls || []).filter(isNoisyTestInvocation);
      const unboundedReads = (turn.toolCalls || []).filter(isUnboundedFileRead);

      noisyTestTurns += noisyTests.length;
      noisyFileTurns += unboundedReads.length;
      if (noisyTests.length > 0) testAffectedInputTokens += inputTokens;
      if (unboundedReads.length > 0) fileAffectedInputTokens += inputTokens;
      if (turn.turnNumber > 12) {
        lateTurnInputTokens += inputTokens;
      }

      const reasoningTokens = turn.tokenUsage?.reasoning_output_tokens || 0;
      if (reasoningTokens > 1200 && isLikelyRoutineTurn(turn)) {
        routineHighReasoningTurns++;
        routineHighReasoningTokens += reasoningTokens;
      }
    }
  }

  function measuredImpact(label, tokens, description) {
    return {
      label,
      tokens,
      sharePercent: totalTokensInScope > 0 ? Math.round((tokens / totalTokensInScope) * 100) : null,
      description,
      validation: 'Token savings are not inferred from this signal. Compare matching before/after runs to measure the effect of a change.'
    };
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
  if (noisyTestTurns > 0) {
    const diag = {
      id: 'diag-test-noise',
      category: 'PAYLOAD_NOISE',
      severity: 'HIGH',
      title: 'Reduce noisy test output',
      headline: `Verbose test output is inflating input tokens without adding value. (${noisyTestTurns} test command(s) without --bail 1 and --silent within ${scopeLabel})`,
      affectedCount: noisyTestTurns,
      affectedUnit: 'test commands affected',
      measuredImpact: measuredImpact(
        'Input context in affected turns',
        testAffectedInputTokens,
        'These are all recorded input tokens in turns containing a test command without both quiet flags; telemetry does not isolate console output from other turn context.'
      ),
      actions: [
        {
          actionId: 'action-pkg-script',
          systemId: 2,
          isRecommended: true,
          badge: 'Best Resolution',
          title: 'Action 2: Inject "test:agent" Lean Script to package.json',
          description: 'Adds a dedicated agent test script with --bail 1 and --silent flags to halt output on first error.',
          whatItDoes: 'Modifies your package.json to add: "test:agent": "vitest run --bail=1 --silent" (or jest equivalent).',
          whatItAchieves: 'Keeps verification output focused. Confirm any token reduction with a comparable future run.',
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
      ]
    };

    diagnostics.push(annotateDiagnostic(diag));
  }

  // Diagnostic 2: Full-File Loading vs Targeted Slices
  if (noisyFileTurns > 0) {
    const diag = {
      id: 'diag-file-reads',
      category: 'CONTEXT_BLOAT',
      severity: 'MEDIUM',
      title: 'Limit unbounded file reads',
      headline: `Detected ${noisyFileTurns} file read request(s) without line-range metadata in ${scopeLabel}.`,
      affectedCount: noisyFileTurns,
      affectedUnit: 'unbounded file reads',
      measuredImpact: measuredImpact(
        'Input context in affected turns',
        fileAffectedInputTokens,
        'These are all recorded input tokens in turns containing an unbounded file-read request; telemetry does not expose the exact file output size.'
      ),
      actions: [
        {
          actionId: 'action-agent-rule-file',
          systemId: 1,
          isRecommended: true,
          badge: 'Best Resolution',
          title: 'Action 1: Inject Grep/Range Rule into AGENTS.md',
          description: 'Appends a permanent rule requiring Codex to inspect specific line ranges for files >100 lines.',
          whatItDoes: 'Appends: "- When inspecting files >100 lines, use grep_search or specify StartLine/EndLine ranges."',
          whatItAchieves: 'Makes future file requests bounded; verify the effect against a comparable later investigation.',
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
  if (bloatedSessionsCount > 0) {
    const diag = {
      id: 'diag-session-fatigue',
      category: 'SESSION_FATIGUE',
      severity: 'HIGH',
      title: 'Compact long-running thread context',
      headline: `${bloatedSessionsCount} session(s) exceeded 12+ turns carrying over heavy prompt history in ${scopeLabel}.`,
      affectedCount: bloatedSessionsCount,
      affectedUnit: 'long thread sessions',
      measuredImpact: measuredImpact(
        'Input context after turn 12',
        lateTurnInputTokens,
        'These are the recorded input tokens for turns after the session-length threshold, not a measured amount of avoidable waste.'
      ),
      actions: [
        {
          actionId: 'action-handoff-export',
          systemId: 4,
          isRecommended: true,
          badge: 'Best Resolution',
          title: 'Action 4: Export State-Preserving Session Handoff',
          description: 'Auto-extracts completed goals, modified files, and remaining steps into a 1-paragraph restart prompt.',
          whatItDoes: 'Compiles a structured markdown handoff summary with modified file references and next goals.',
          whatItAchieves: 'Creates a fresh starting point while preserving task state; measure subsequent input tokens to evaluate the effect.',
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
  if (routineHighReasoningTurns > 0) {
    const diagReasoning = {
    id: 'diag-reasoning-roi',
    category: 'MODEL_RIGHT_SIZING',
    severity: 'LOW',
    title: 'Right-size reasoning effort for routine tasks',
    headline: `Detected ${routineHighReasoningTurns} likely routine turn(s) with high reasoning-token use in ${scopeLabel}.`,
    affectedCount: routineHighReasoningTurns,
    affectedUnit: 'routine turns affected',
    measuredImpact: measuredImpact(
      'Reasoning tokens in likely routine turns',
      routineHighReasoningTokens,
      'These are directly recorded reasoning tokens. Whether they were avoidable depends on the actual task complexity.'
    ),
    actions: [
      {
        actionId: 'action-right-sizing',
        systemId: 6,
        isRecommended: true,
        badge: 'Best Resolution',
        title: 'Action 6: Apply Reasoning Effort Right-Sizing Guidance',
        description: 'Set default reasoning_effort to "low" for routine tasks and "high" only for architecture.',
        whatItDoes: 'Adds clear reasoning level expectations into your workflow and config.',
        whatItAchieves: 'Reserves higher reasoning effort for work that needs it; compare similar tasks before changing the default.',
        targetFile: 'AGENTS.md',
        payload: {
          ruleText: '\n- Use `reasoning_effort: low` for routine chores, docs, and formatting; reserve `high` for deep architectural refactors.'
        }
      }
    ]
    };

    diagnostics.push(annotateDiagnostic(diagReasoning));
  }

  return {
    appliedScope: { timeRange: scope, workspace, agent },
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
export function calculatePacingForecast(rateLimitSnapshot, sessions) {
  const rateLimits = rateLimitSnapshot?.snapshot || rateLimitSnapshot || null;
  const primary = rateLimits?.primary;
  const secondary = rateLimits?.secondary;
  const quotaAvailable = Boolean(
    (primary && Number.isFinite(primary.used_percent)) ||
    (secondary && Number.isFinite(secondary.used_percent))
  );
  const snapshotAt = Number.isFinite(rateLimitSnapshot?.timestamp) ? rateLimitSnapshot.timestamp : null;
  const snapshotAgeMinutes = snapshotAt === null ? null : Math.max(Math.round((Date.now() - snapshotAt) / 60000), 0);

  if (!quotaAvailable) {
    return {
      available: false,
      status: 'UNAVAILABLE',
      headline: 'Provider quota is unavailable',
      observedAt: snapshotAt ? new Date(snapshotAt).toISOString() : null,
      windows: [],
      advice: 'Live provider quota is unavailable in transcript logs.'
    };
  }

  const windows = [];
  if (primary && Number.isFinite(primary.used_percent)) {
    let resetsAtIso = null;
    if (Number.isFinite(primary.resets_at)) {
      const ms = primary.resets_at < 1e11 ? primary.resets_at * 1000 : primary.resets_at;
      resetsAtIso = new Date(ms).toISOString();
    }
    windows.push({
      id: 'primary',
      label: '5-hour limit',
      usedPercent: primary.used_percent,
      resetsAt: resetsAtIso
    });
  }

  if (secondary && Number.isFinite(secondary.used_percent)) {
    let resetsAtIso = null;
    if (Number.isFinite(secondary.resets_at)) {
      const ms = secondary.resets_at < 1e11 ? secondary.resets_at * 1000 : secondary.resets_at;
      resetsAtIso = new Date(ms).toISOString();
    }
    windows.push({
      id: 'secondary',
      label: 'Weekly rolling limit',
      usedPercent: secondary.used_percent,
      resetsAt: resetsAtIso
    });
  }

  const primaryPct = primary && Number.isFinite(primary.used_percent) ? primary.used_percent : 0;
  const secondaryPct = secondary && Number.isFinite(secondary.used_percent) ? secondary.used_percent : 0;
  const maxUsed = Math.max(primaryPct, secondaryPct);

  let status = 'SUSTAINABLE';
  let headline = 'Usage is sustainable';
  let advice = 'Provider usage is below the warning threshold.';

  if (maxUsed >= 80) {
    status = 'CRITICAL';
    headline = 'Usage is at high risk';
    advice = `Provider usage is ${maxUsed}%. Avoid starting additional heavy tasks until reset.`;
  } else if (maxUsed >= 60) {
    status = 'WARNING';
    headline = 'Usage is approaching the limit';
    advice = `Provider usage is ${maxUsed}%. Keep work focused and use low reasoning for routine tasks.`;
  }

  return {
    available: true,
    status,
    headline,
    observedAt: snapshotAt ? new Date(snapshotAt).toISOString() : null,
    snapshotAgeMinutes,
    windows,
    advice
  };
}