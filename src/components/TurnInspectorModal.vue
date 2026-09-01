<script setup>
import { ref, computed } from 'vue';
import Tooltip from './common/Tooltip.vue';
import { useActionSelector } from '../composables/useActionSelector.js';

const props = defineProps({
  session: {
    type: Object,
    required: true
  },
  activeWorkspace: {
    type: String,
    default: '/home/ellol/solutions/clinic-platform'
  }
});

const emit = defineEmits(['close', 'export-handoff', 'guidance-updated']);

const { isApplying, applyAction, undoLastAction } = useActionSelector();

const showBestPractices = ref(false);
const appliedTurnActions = ref({});
const activeNoteTurn = ref(null);
const turnNoteWhat = ref('');
const turnNoteWhy = ref('');
const turnNoteHow = ref('');
const turnNoteTarget = ref('AGENTS.md');
const isSubmittingTurnNote = ref(false);

const cacheRate = computed(() => {
  const inp = props.session?.totalUsage?.input_tokens || 0;
  const cached = props.session?.totalUsage?.cached_input_tokens || 0;
  if (!inp) return 0;
  return Math.round((cached / inp) * 100);
});

function getTurnActions(turn) {
  const actions = [];
  const inp = turn.tokenUsage?.input_tokens || 0;
  const cached = turn.tokenUsage?.cached_input_tokens || 0;
  const fresh = Math.max(inp - cached, 0);
  const think = turn.tokenUsage?.reasoning_output_tokens || 0;
  const toolCount = turn.toolCalls?.length || 0;
  const hasTests = turn.toolCalls?.some(tc => {
    const s = JSON.stringify(tc || '').toLowerCase();
    return s.includes('test') || s.includes('vitest') || s.includes('jest');
  });

  // Action: Test suppression
  if (hasTests) {
    actions.push({
      id: `test-script-${turn.turnNumber}`,
      type: 'script',
      title: '📦 Inject "test:agent" Lean Script',
      badge: 'Test Optimization',
      targetFile: 'package.json',
      whatItDoes: 'Adds "test:agent": "vitest run --bail=1 --silent" to package.json to suppress verbose console dumps.',
      whatItAchieves: `Eliminate test noise observed in Turn #${turn.turnNumber} and cut prompt payload by ~95%.`,
      payload: {
        scriptName: 'test:agent',
        scriptCommand: 'vitest run --bail=1 --silent'
      }
    });
  }

  // Action: File inspection constraints / Line ranges
  if (fresh > 20000 || toolCount >= 4) {
    actions.push({
      id: `rule-slice-${turn.turnNumber}`,
      type: 'rule',
      title: '📜 Inject Line Range Slices Rule to AGENTS.md',
      badge: 'Context Slicing',
      targetFile: 'AGENTS.md',
      whatItDoes: 'Adds rule: "- Practice progressive disclosure: read targeted line ranges (StartLine/EndLine) rather than entire files."',
      whatItAchieves: `Prevent ${fresh.toLocaleString()} un-cached token spikes seen in Turn #${turn.turnNumber}.`,
      payload: {
        ruleText: '\n- Practice progressive disclosure: always inspect targeted line ranges (`StartLine`/`EndLine`) rather than reading entire files into prompt context.'
      }
    });
  }

  // Action: Skill generation for dense tool workflows
  if (toolCount >= 4) {
    actions.push({
      id: `skill-workflow-${turn.turnNumber}`,
      type: 'skill',
      title: `🧩 Package Turn #${turn.turnNumber} into Project Skill`,
      badge: 'Modular Skill',
      targetFile: '.agents/skills/turn-workflow/SKILL.md',
      whatItDoes: 'Generates a reusable progressive disclosure skill in .agents/skills/ to run this multi-step verification in 1 trigger.',
      whatItAchieves: `Encapsulates the ${toolCount} tool invocations from Turn #${turn.turnNumber} into a bounded skill.`,
      payload: {
        skillName: `verify-turn-${turn.turnNumber}`,
        trigger: `$verify-turn-${turn.turnNumber}`,
        instructions: `# Turn #${turn.turnNumber} Verification Skill\nExecute focused checks with minimal output payload:\n` +
          (turn.toolCalls || []).slice(0, 3).map(t => `- ${t.tool}: ${formatToolArg(t.input)}`).join('\n')
      }
    });
  }

  // Action: Reasoning optimization
  if (think > 1200) {
    actions.push({
      id: `rule-reasoning-${turn.turnNumber}`,
      type: 'rule',
      title: '🧠 Set "reasoning_effort: low" in AGENTS.md',
      badge: 'Reasoning Effort',
      targetFile: 'AGENTS.md',
      whatItDoes: 'Adds convention to AGENTS.md to set reasoning_effort: low for routine file edits and chores.',
      whatItAchieves: `Save thinking quota (Turn #${turn.turnNumber} used ${think.toLocaleString()} reasoning tokens).`,
      payload: {
        ruleText: '\n- Set `reasoning_effort: low` for routine code edits, documentation, and chores; reserve `high` reasoning only for difficult algorithms.'
      }
    });
  }

  // Fallback generic guidance rule if none matched
  if (actions.length === 0) {
    actions.push({
      id: `rule-general-${turn.turnNumber}`,
      type: 'rule',
      title: '📜 Add Turn Best Practice Rule to AGENTS.md',
      badge: 'Efficiency Convention',
      targetFile: 'AGENTS.md',
      whatItDoes: 'Incorporate turn boundaries and progressive disclosure into AGENTS.md.',
      whatItAchieves: `Keep future sessions aligned with Turn #${turn.turnNumber} standards.`,
      payload: {
        ruleText: '\n- Keep conversation turns single-objective and concise to maximize prompt cache hit rates.'
      }
    });
  }

  return actions;
}

async function handleApplyTurnAction(turn, action) {
  const key = `${turn.turnNumber}-${action.id}`;
  appliedTurnActions.value[key] = { status: 'applying' };

  try {
    const what = `${action.title} (from Turn #${turn.turnNumber})`;
    const why = `Observed in Turn #${turn.turnNumber} of session ${props.session?.sessionId?.substring(0, 8) || 'session'}: ${action.whatItAchieves}`;
    const how = action.whatItDoes;
    const author = `Session Inspector (Turn #${turn.turnNumber})`;

    const result = await applyAction(
      {
        ...action,
        title: what,
        description: action.whatItDoes,
        whatItAchieves: why,
        whatItDoes: how
      },
      props.activeWorkspace,
      action.payload
    );

    appliedTurnActions.value[key] = {
      status: 'success',
      backupId: result.backup?.backupId || null,
      message: result.message || 'Action applied and recorded in Guidance Log!'
    };

    emit('guidance-updated');
  } catch (err) {
    appliedTurnActions.value[key] = {
      status: 'error',
      message: err.message || 'Failed to apply action'
    };
  }
}

async function handleUndoTurnAction(turn, action, backupId) {
  const key = `${turn.turnNumber}-${action.id}`;
  if (!backupId) return;

  try {
    await undoLastAction(backupId);
    delete appliedTurnActions.value[key];
    emit('guidance-updated');
  } catch (e) {
    // ignore
  }
}

function openTurnNote(turn) {
  activeNoteTurn.value = turn.turnNumber;
  turnNoteWhat.value = `Optimized workflow from Turn #${turn.turnNumber}`;
  turnNoteWhy.value = `Turn #${turn.turnNumber} in session ${props.session?.sessionId?.substring(0, 8)} used ${turn.tokenUsage?.input_tokens?.toLocaleString() || 0} tokens with ${turn.toolCalls?.length || 0} tool calls.`;
  turnNoteHow.value = `Updated ${turnNoteTarget.value} to enforce bounded inspection and minimal payload noise.`;
}

async function saveTurnNote(turn) {
  if (!turnNoteWhat.value.trim() || !turnNoteWhy.value.trim() || !turnNoteHow.value.trim()) return;
  isSubmittingTurnNote.value = true;

  try {
    const res = await fetch('/api/guidance-records', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        projectPath: props.activeWorkspace,
        actionType: 'MANUAL_GUIDANCE_EDIT',
        what: turnNoteWhat.value.trim(),
        why: turnNoteWhy.value.trim(),
        how: turnNoteHow.value.trim(),
        targetFile: turnNoteTarget.value.trim(),
        author: `Session Inspector (Turn #${turn.turnNumber})`
      })
    });

    if (res.ok) {
      activeNoteTurn.value = null;
      emit('guidance-updated');
    }
  } catch (e) {
    // ignore
  } finally {
    isSubmittingTurnNote.value = false;
  }
}

const generatedIssues = ref({});
const isGeneratingAllIssues = ref(false);
const allIssuesGeneratedMessage = ref('');

async function handleGenerateTurnIssue(turn) {
  generatedIssues.value[turn.turnNumber] = { status: 'generating' };
  try {
    const res = await fetch('/api/generate-turn-issue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        projectPath: props.activeWorkspace,
        session: {
          sessionId: props.session?.sessionId,
          threadName: props.session?.threadName,
          filePath: props.session?.filePath,
          meta: props.session?.meta
        },
        turn
      })
    });
    if (res.ok) {
      const data = await res.json();
      generatedIssues.value[turn.turnNumber] = {
        status: 'success',
        fileName: data.fileName,
        relativePath: data.relativePath,
        savings: data.savings
      };
      emit('guidance-updated');
    } else {
      generatedIssues.value[turn.turnNumber] = { status: 'error' };
    }
  } catch (e) {
    generatedIssues.value[turn.turnNumber] = { status: 'error' };
  }
}

async function handleGenerateAllIssues() {
  isGeneratingAllIssues.value = true;
  try {
    const turnsToGenerate = (props.session?.turns || []).filter(t => 
      (t.noiseSpikes?.length > 0) || 
      ((t.tokenUsage?.input_tokens - t.tokenUsage?.cached_input_tokens) > 15000) ||
      (t.toolCalls?.length >= 3)
    );

    for (const turn of turnsToGenerate) {
      await handleGenerateTurnIssue(turn);
    }
    allIssuesGeneratedMessage.value = `Generated ${turnsToGenerate.length} issue report(s) in docs/token-consumption/issues/`;
    setTimeout(() => { allIssuesGeneratedMessage.value = ''; }, 4000);
  } finally {
    isGeneratingAllIssues.value = false;
  }
}

const sessionVerdict = computed(() => {
  const turns = props.session?.turnCount || 0;
  const rate = cacheRate.value;
  const hasSpikes = props.session?.turns?.some(t => t.noiseSpikes?.length > 0);

  if (turns <= 5 && rate >= 75) {
    return {
      type: 'green',
      badge: '🟢 Highly Efficient Task',
      headline: `Executed in ${turns} concise turn(s) with ${rate}% prompt cache hit rate.`,
      actionAdvice: 'No action needed! This session was executed cleanly with high token efficiency.'
    };
  }
  if (turns > 15) {
    return {
      type: 'yellow',
      badge: '🟡 Context Carryover Warning',
      headline: `This conversation reached ${turns} turns, re-sending heavy conversation history on every message.`,
      actionAdvice: 'Recommended: Click "Export Handoff Prompt" to cleanly restart in a fresh window, cutting input token costs by ~85%.'
    };
  }
  if (hasSpikes) {
    return {
      type: 'red',
      badge: '🔴 Uncached Payload Spike',
      headline: 'One or more turns in this session injected large un-cached data or verbose command output into context.',
      actionAdvice: 'Review the highlighted turns below to identify which command or file read caused the spike.'
    };
  }
  return {
    type: 'green',
    badge: '🟢 Standard Healthy Session',
    headline: `Ran for ${turns} turns with ${rate}% cache efficiency.`,
    actionAdvice: 'Operating normally within standard efficiency thresholds.'
  };
});

function getTurnEfficiency(turn) {
  if (!turn.tokenUsage) {
    return {
      score: 100,
      badgeType: 'green',
      label: '🟢 Efficient',
      summary: 'Lean turn without heavy token footprint.'
    };
  }

  const inp = turn.tokenUsage.input_tokens || 0;
  const cached = turn.tokenUsage.cached_input_tokens || 0;
  const out = turn.tokenUsage.output_tokens || 0;
  const fresh = Math.max(inp - cached, 0);
  const cachePct = inp > 0 ? Math.round((cached / inp) * 100) : 0;

  if (fresh > 35000 || out > 4000) {
    return {
      score: 45,
      badgeType: 'red',
      label: '🔴 Inefficient Payload',
      cachePct,
      fresh,
      summary: fresh > 35000 ? `High uncached fresh input (${fresh.toLocaleString()} tokens)` : `Large model output (${out.toLocaleString()} tokens)`
    };
  }

  if (cachePct >= 85) {
    return {
      score: 95,
      badgeType: 'green',
      label: `🟢 ${cachePct}% Cached`,
      cachePct,
      fresh,
      summary: `High prompt cache reuse (${cached.toLocaleString()} tokens cached, only ${fresh.toLocaleString()} fresh).`
    };
  }

  if (cachePct >= 50) {
    return {
      score: 75,
      badgeType: 'yellow',
      label: `🟡 ${cachePct}% Cached`,
      cachePct,
      fresh,
      summary: `Moderate cache hit (${fresh.toLocaleString()} fresh tokens added).`
    };
  }

  return {
    score: 60,
    badgeType: 'yellow',
    label: '🟡 Low Cache Hit',
    cachePct,
    fresh,
    summary: `Cold prompt input with minimal cache reuse.`
  };
}

function getTurnImprovementSuggestion(turn) {
  if (!turn.tokenUsage) {
    return {
      type: 'optimal',
      tip: '🟢 Optimal turn execution! No heavy token footprint or waste detected.'
    };
  }

  const inp = turn.tokenUsage.input_tokens || 0;
  const cached = turn.tokenUsage.cached_input_tokens || 0;
  const out = turn.tokenUsage.output_tokens || 0;
  const think = turn.tokenUsage.reasoning_output_tokens || 0;
  const fresh = Math.max(inp - cached, 0);
  const toolCount = turn.toolCalls?.length || 0;
  const cachePct = inp > 0 ? Math.round((cached / inp) * 100) : 0;

  const suggestions = [];

  // 1. Dense tool sequence
  if (toolCount >= 6) {
    suggestions.push(`Executed ${toolCount} tool commands in one turn. Split multi-step workflows into smaller atomic turns or package into a reusable skill.`);
  }

  // 2. High fresh input
  if (fresh > 30000) {
    suggestions.push(`Introduced ${fresh.toLocaleString()} un-cached tokens. Use targeted line ranges (StartLine/EndLine) and grep searches instead of full file reads.`);
  } else if (cachePct < 70 && inp > 25000) {
    suggestions.push(`Cache hit was only ${cachePct}%. Keep system instructions in AGENTS.md rather than editing prompt headers to preserve prefix caching.`);
  }

  // 3. Large model output
  if (out > 3000) {
    suggestions.push(`Generated ${out.toLocaleString()} output tokens. Prompt for concise diffs or focused function changes rather than full file replacements.`);
  }

  // 4. High reasoning effort on light tasks
  if (think > 1200 && toolCount <= 2) {
    suggestions.push(`Deliberated with ${think.toLocaleString()} reasoning tokens. For routine tasks, set "reasoning_effort: low" to save quota.`);
  }

  if (suggestions.length === 0) {
    return {
      type: 'optimal',
      tip: '🟢 Highly efficient turn! Reused 90%+ cached context with compact tool outputs. No improvements needed.'
    };
  }

  return {
    type: 'actionable',
    tip: suggestions.join(' • ')
  };
}

function formatToolArg(input) {
  if (!input) return '';
  if (typeof input === 'string') return input.substring(0, 80);
  if (typeof input === 'object') {
    if (input.cmd) return String(input.cmd).substring(0, 80);
    if (input.AbsolutePath) return String(input.AbsolutePath);
    if (input.command) return String(input.command).substring(0, 80);
    return JSON.stringify(input).substring(0, 80);
  }
  return String(input).substring(0, 80);
}
</script>

<template>
  <div class="modal-overlay" @click="$emit('close')">
    <div class="modal-card" @click.stop>
      <div class="modal-head">
        <div class="head-info">
          <h3>🔍 Turn-by-Turn Session Inspector</h3>
          <span class="session-name-lg">{{ session?.threadName || 'Session Details' }}</span>
          <span class="session-path mono text-dim text-xs">{{ session?.meta?.cwd || '' }} • {{ session?.sessionId }}</span>
        </div>
        <div class="head-actions">
          <button 
            class="btn btn-secondary btn-sm"
            :disabled="isGeneratingAllIssues"
            @click="handleGenerateAllIssues"
            title="Generate structured issue reports in docs/token-consumption/issues/ for all heavy turns"
          >
            <span>📑</span> {{ isGeneratingAllIssues ? 'Generating Issues...' : 'Generate docs/ Issues' }}
          </button>
          <button 
            class="btn btn-primary btn-sm"
            @click="$emit('export-handoff', session)"
          >
            <span>📋</span> Export Handoff Prompt
          </button>
          <button class="close-btn" @click="$emit('close')">✕</button>
        </div>
      </div>

      <!-- Quick Session Stats Bar -->
      <div class="stats-summary-bar">
        <div class="summary-item">
          <span class="lbl">Total Turns:</span>
          <span class="val mono">{{ session?.turnCount || 0 }}</span>
        </div>
        <div class="summary-item">
          <span class="lbl">Total Tokens:</span>
          <span class="val mono">{{ (session?.totalUsage?.total_tokens || 0).toLocaleString() }}</span>
        </div>
        <div class="summary-item">
          <span class="lbl">Cache Hit Rate:</span>
          <span class="val mono text-green">{{ cacheRate }}%</span>
        </div>
        <div class="summary-item">
          <span class="lbl">Reasoning (Thinking):</span>
          <span class="val mono text-purple">{{ (session?.totalUsage?.reasoning_output_tokens || 0).toLocaleString() }}</span>
        </div>
      </div>

      <!-- Session Verdict & What-to-Do Banner -->
      <div :class="['verdict-card', `verdict-${sessionVerdict.type}`]">
        <div class="verdict-top">
          <span class="verdict-badge">{{ sessionVerdict.badge }}</span>
          <span class="verdict-headline">{{ sessionVerdict.headline }}</span>
        </div>
        <div class="verdict-action">
          <strong>💡 Takeaway:</strong> {{ sessionVerdict.actionAdvice }}
        </div>
      </div>

      <!-- In-Session Turn Efficiency Best Practices Guide (Collapsible) -->
      <div class="practices-guide card">
        <div class="practices-head" @click="showBestPractices = !showBestPractices">
          <div class="practices-title">
            <span>💡</span>
            <strong>How to Maximize Turn Efficiency Inside One Active Session</strong>
          </div>
          <button class="toggle-btn mono">
            {{ showBestPractices ? '▲ Hide Guide' : '▼ View 4 In-Session Strategies' }}
          </button>
        </div>

        <div v-if="showBestPractices" class="practices-body">
          <div class="strategy-grid">
            <!-- Strat 1 -->
            <div class="strat-item">
              <div class="strat-title">
                <span class="strat-num">1</span>
                <strong>Scope Tool Invocations (Targeted Test Runs)</strong>
              </div>
              <p class="strat-desc">
                Never run full monorepo test suites in chat. Filter directly to your active feature and bail immediately on failure.
              </p>
              <div class="example-box">
                <div class="ex-bad">
                  <span class="ex-lbl text-red">❌ Noisy (Dumps 35k tokens):</span>
                  <code>pnpm test</code>
                </div>
                <div class="ex-good">
                  <span class="ex-lbl text-green">✅ Lean (Under 400 tokens):</span>
                  <code>pnpm --filter @clinic/admin test -- PatientsPage.test.tsx --bail 1 --silent</code>
                </div>
              </div>
            </div>

            <!-- Strat 2 -->
            <div class="strat-item">
              <div class="strat-title">
                <span class="strat-num">2</span>
                <strong>Target File Slices Instead of Full File Reads</strong>
              </div>
              <p class="strat-desc">
                Instruct the agent to search for symbols or specify line ranges rather than loading entire components into context.
              </p>
              <div class="example-box">
                <div class="ex-bad">
                  <span class="ex-lbl text-red">❌ Noisy (Reads 450 lines):</span>
                  <code>view_file apps/admin/src/features/patients/PatientsPage.tsx</code>
                </div>
                <div class="ex-good">
                  <span class="ex-lbl text-green">✅ Lean (Reads 45 lines):</span>
                  <code>grep_search query: "handlePatientSubmit" + view_file StartLine: 40 EndLine: 85</code>
                </div>
              </div>
            </div>

            <!-- Strat 3 -->
            <div class="strat-item">
              <div class="strat-title">
                <span class="strat-num">3</span>
                <strong>Single-Objective Atomic Turns</strong>
              </div>
              <p class="strat-desc">
                Ask for one concrete vertical slice per turn. Broad prompts trigger 15+ tool calls in one turn, creating massive un-cached turn bloat.
              </p>
              <div class="example-box">
                <div class="ex-bad">
                  <span class="ex-lbl text-red">❌ Bloated Multi-Task Prompt:</span>
                  <div class="ex-text">"Fix patient creation, create NestJS DTOs, update Prisma schema, and test the UI."</div>
                </div>
                <div class="ex-good">
                  <span class="ex-lbl text-green">✅ Lean Atomic Turn:</span>
                  <div class="ex-text">"Add the phone validation regex in `apps/api/src/patients/dto/create-patient.dto.ts` and verify with unit tests."</div>
                </div>
              </div>
            </div>

            <!-- Strat 4 -->
            <div class="strat-item">
              <div class="strat-title">
                <span class="strat-num">4</span>
                <strong>Preserve Prompt Prefixes with AGENTS.md & Skills</strong>
              </div>
              <p class="strat-desc">
                OpenAI caches prompts from top to bottom. Keeping rules in <code>AGENTS.md</code> or <code>.agents/skills/</code> guarantees 90%+ cache hit rate on all follow-up turns.
              </p>
              <div class="example-box">
                <div class="ex-bad">
                  <span class="ex-lbl text-red">❌ Cache Busted:</span>
                  <div class="ex-text">Typing 30 lines of coding preferences into chat on every prompt.</div>
                </div>
                <div class="ex-good">
                  <span class="ex-lbl text-green">✅ 95% Cache Reuse:</span>
                  <div class="ex-text">Rules stored permanently in <code>AGENTS.md</code> + invoking <code>$verify-slice</code> skill.</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Turns Timeline -->
      <div class="turns-timeline">
        <div 
          v-for="turn in (session?.turns || [])" 
          :key="turn.turnNumber"
          :class="['turn-box', { 'has-spike': turn.noiseSpikes?.length > 0 }]"
        >
          <div class="turn-top">
            <div class="turn-index-group">
              <span class="turn-badge mono">Turn #{{ turn.turnNumber }}</span>
              <span class="turn-time mono text-dim">{{ (turn.startedAt || '').slice(11, 19) }}</span>
              <span v-if="turn.durationMs" class="turn-dur mono text-dim">({{ (turn.durationMs / 1000).toFixed(1) }}s)</span>
            </div>

            <!-- Per Turn Efficiency Score Badge -->
            <div class="turn-efficiency-group">
              <span :class="['badge', `badge-${getTurnEfficiency(turn).badgeType}`]">
                {{ getTurnEfficiency(turn).label }}
              </span>

              <!-- Per Turn Token Breakdown -->
              <div v-if="turn.tokenUsage" class="turn-tokens-pill mono">
                <span title="Total Input">In: {{ (turn.tokenUsage.input_tokens || 0).toLocaleString() }}</span>
                <span class="sep">•</span>
                <span class="text-green" title="Cached Tokens">Cache: {{ (turn.tokenUsage.cached_input_tokens || 0).toLocaleString() }}</span>
                <span class="sep">•</span>
                <span class="text-purple" title="Reasoning Tokens">Think: {{ (turn.tokenUsage.reasoning_output_tokens || 0).toLocaleString() }}</span>
                <span class="sep">•</span>
                <span title="Output Tokens">Out: {{ (turn.tokenUsage.output_tokens || 0).toLocaleString() }}</span>
              </div>
            </div>
          </div>

          <!-- Turn Efficiency Diagnosis -->
          <div class="turn-diagnosis-text text-dim">
            <span>⚡ <strong>Turn Footprint:</strong> {{ getTurnEfficiency(turn).summary }}</span>
          </div>

          <!-- Per-Turn Improvement Suggestion -->
          <div :class="['turn-suggestion-box', `sug-${getTurnImprovementSuggestion(turn).type}`]">
            <span class="sug-icon">💡</span>
            <span class="sug-text"><strong>Improvement Suggestion:</strong> {{ getTurnImprovementSuggestion(turn).tip }}</span>
          </div>

          <!-- Noise Spikes Alert (if any) -->
          <div v-if="turn.noiseSpikes?.length > 0" class="spike-alert">
            <span v-for="(spike, i) in turn.noiseSpikes" :key="i" class="spike-item">
              🚨 <strong>{{ spike.type }}:</strong> {{ spike.message }}
            </span>
          </div>

          <!-- User Prompt Section -->
          <div v-if="turn.userPrompt" class="prompt-section">
            <div class="section-label">User Request:</div>
            <div class="prompt-bubble mono">{{ turn.userPrompt }}</div>
          </div>

          <!-- Tool Calls Section -->
          <div v-if="turn.toolCalls?.length > 0" class="tools-section">
            <div class="section-label">Tool Invocations ({{ turn.toolCalls.length }}):</div>
            <div class="tools-list">
              <div v-for="(tc, i) in turn.toolCalls" :key="i" class="tool-pill mono">
                <span class="tool-name">🔧 {{ tc.tool }}</span>
                <span class="tool-arg">{{ formatToolArg(tc.input) }}</span>
              </div>
            </div>
          </div>

          <!-- Assistant Message Preview -->
          <div v-if="turn.assistantMessage" class="assistant-section">
            <div class="section-label">Assistant Response:</div>
            <div class="assistant-preview mono">{{ String(turn.assistantMessage).substring(0, 240) }}...</div>
          </div>

          <!-- In-Turn Actions & Guidance Logger Section -->
          <div class="turn-actions-card">
            <div class="turn-actions-header">
              <span class="turn-actions-title">⚡ Turn #{{ turn.turnNumber }} Actions & Guidance:</span>
              <button 
                class="btn-text-sm"
                @click="activeNoteTurn === turn.turnNumber ? activeNoteTurn = null : openTurnNote(turn)"
              >
                {{ activeNoteTurn === turn.turnNumber ? '✕ Cancel Note' : '📝 Document Turn Guidance' }}
              </button>
            </div>

            <!-- Action Pills Grid -->
            <div class="turn-actions-list">
              <div 
                v-for="act in getTurnActions(turn)" 
                :key="act.id" 
                class="turn-action-row"
              >
                <button
                  :disabled="isApplying || appliedTurnActions[`${turn.turnNumber}-${act.id}`]?.status === 'applying'"
                  :class="['btn-turn-action', { 'is-applied': appliedTurnActions[`${turn.turnNumber}-${act.id}`]?.status === 'success' }]"
                  @click="handleApplyTurnAction(turn, act)"
                  :title="act.whatItDoes"
                >
                  <span class="btn-action-badge">{{ act.badge }}</span>
                  <span class="btn-action-text">{{ act.title }}</span>
                  <span v-if="appliedTurnActions[`${turn.turnNumber}-${act.id}`]?.status === 'applying'" class="spinner-inline">⏳ Applying...</span>
                  <span v-else-if="appliedTurnActions[`${turn.turnNumber}-${act.id}`]?.status === 'success'" class="text-green">✅ Applied</span>
                </button>

                <!-- Feedback & Undo button -->
                <div v-if="appliedTurnActions[`${turn.turnNumber}-${act.id}`]?.status === 'success'" class="action-feedback-pill">
                  <span class="feedback-text text-green">Logged in Guidance Changelog</span>
                  <button 
                    v-if="appliedTurnActions[`${turn.turnNumber}-${act.id}`]?.backupId"
                    class="btn-undo-link"
                    @click="handleUndoTurnAction(turn, act, appliedTurnActions[`${turn.turnNumber}-${act.id}`].backupId)"
                  >
                    ↩️ Undo
                  </button>
                </div>
              </div>

              <!-- Action: Generate Structured Issue in docs/token-consumption/issues/ -->
              <div class="turn-action-row">
                <button
                  :disabled="generatedIssues[turn.turnNumber]?.status === 'generating'"
                  :class="['btn-turn-action', { 'is-applied': generatedIssues[turn.turnNumber]?.status === 'success' }]"
                  @click="handleGenerateTurnIssue(turn)"
                  title="Generate a structured markdown issue report inside docs/token-consumption/issues/ with context and examples for an AI agent"
                >
                  <span class="btn-action-badge">Docs Issue</span>
                  <span class="btn-action-text">📄 Generate Issue Report in docs/</span>
                  <span v-if="generatedIssues[turn.turnNumber]?.status === 'generating'" class="spinner-inline">⏳ Writing .md...</span>
                  <span v-else-if="generatedIssues[turn.turnNumber]?.status === 'success'" class="text-green">✅ Saved Issue</span>
                </button>

                <!-- Feedback for generated issue -->
                <div v-if="generatedIssues[turn.turnNumber]?.status === 'success'" class="action-feedback-pill">
                  <span class="feedback-text text-green">
                    📄 {{ generatedIssues[turn.turnNumber].relativePath }}
                    <span v-if="generatedIssues[turn.turnNumber].savings" class="text-dim"> (~{{ generatedIssues[turn.turnNumber].savings.toLocaleString() }} tokens savings)</span>
                  </span>
                </div>
              </div>
            </div>

            <!-- In-Turn Custom Guidance Note Form -->
            <div v-if="activeNoteTurn === turn.turnNumber" class="turn-note-form card">
              <div class="note-form-head">
                <strong>📝 Record Guidance Change from Turn #{{ turn.turnNumber }}</strong>
                <span class="text-xs text-dim">Project: {{ activeWorkspace }}</span>
              </div>
              <div class="note-inputs">
                <input v-model="turnNoteWhat" class="note-input" placeholder="What changed..." />
                <textarea v-model="turnNoteWhy" rows="2" class="note-input" placeholder="Why (reason / turn payload)..."></textarea>
                <textarea v-model="turnNoteHow" rows="2" class="note-input mono" placeholder="How (script, rule, mechanism)..."></textarea>
              </div>
              <div class="note-actions">
                <button class="btn btn-secondary btn-sm" @click="activeNoteTurn = null">Cancel</button>
                <button class="btn btn-primary btn-sm" :disabled="isSubmittingTurnNote" @click="saveTurnNote(turn)">
                  {{ isSubmittingTurnNote ? 'Saving...' : 'Save to Guidance Changelog' }}
                </button>
              </div>
            </div>
          </div>
        </div>

        <div v-if="!session?.turns || session.turns.length === 0" class="empty-state">
          No turn details recorded for this session.
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.modal-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 16px;
  border-bottom: 1px solid var(--border-color);
  padding-bottom: 16px;
}

.head-info h3 {
  font-size: 1.15rem;
}

.session-name-lg {
  font-size: 1rem;
  font-weight: 700;
  color: var(--accent-blue);
  display: block;
}

.head-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.close-btn {
  background: none;
  border: none;
  color: var(--text-dim);
  font-size: 1.3rem;
  cursor: pointer;
}

.stats-summary-bar {
  display: flex;
  gap: 20px;
  background-color: var(--bg-input);
  padding: 12px 18px;
  border-radius: 10px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}

.summary-item {
  display: flex;
  gap: 6px;
  font-size: 0.82rem;
}

.summary-item .lbl {
  color: var(--text-dim);
}

.verdict-card {
  padding: 14px 18px;
  border-radius: 10px;
  margin-bottom: 16px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.verdict-green {
  background-color: rgba(34, 197, 94, 0.1);
  border: 1px solid rgba(34, 197, 94, 0.3);
}

.verdict-yellow {
  background-color: rgba(234, 179, 8, 0.1);
  border: 1px solid rgba(234, 179, 8, 0.3);
}

.verdict-red {
  background-color: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.3);
}

.verdict-top {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.verdict-badge {
  font-weight: 700;
  font-size: 0.85rem;
}

.verdict-headline {
  font-size: 0.85rem;
  color: var(--text-main);
}

.verdict-action {
  font-size: 0.82rem;
  color: var(--text-muted);
}

/* Practices Guide Card */
.practices-guide {
  background-color: rgba(56, 189, 248, 0.05);
  border: 1px solid rgba(56, 189, 248, 0.2);
  border-radius: 10px;
  margin-bottom: 20px;
  overflow: hidden;
}

.practices-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  cursor: pointer;
  background-color: rgba(56, 189, 248, 0.08);
}

.practices-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.85rem;
  color: var(--accent-blue);
}

.toggle-btn {
  background: none;
  border: none;
  color: var(--text-muted);
  font-size: 0.75rem;
  cursor: pointer;
}

.practices-body {
  padding: 16px;
}

.strategy-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
}

@media (max-width: 768px) {
  .strategy-grid {
    grid-template-columns: 1fr;
  }
}

.strat-item {
  background-color: var(--bg-input);
  border: 1px solid var(--border-color);
  padding: 12px;
  border-radius: 8px;
}

.strat-title {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 6px;
  font-size: 0.82rem;
  color: var(--text-main);
}

.strat-num {
  background: var(--accent-blue);
  color: #0b0f19;
  font-weight: 800;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 0.7rem;
}

.strat-desc {
  font-size: 0.78rem;
  color: var(--text-muted);
  line-height: 1.4;
}

.strat-desc code {
  background-color: #0b0f19;
  padding: 2px 4px;
  border-radius: 4px;
  color: var(--accent-yellow);
}

.example-box {
  margin-top: 10px;
  background-color: #0b0f19;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.ex-bad, .ex-good {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.ex-lbl {
  font-size: 0.7rem;
  font-weight: 700;
  text-transform: uppercase;
}

.example-box code {
  font-size: 0.72rem;
  background-color: var(--bg-input);
  padding: 4px 8px;
  border-radius: 4px;
  color: var(--text-main);
  word-break: break-all;
  border: 1px solid rgba(255,255,255,0.06);
}

.ex-text {
  font-size: 0.75rem;
  color: var(--text-muted);
  background-color: var(--bg-input);
  padding: 4px 8px;
  border-radius: 4px;
  line-height: 1.3;
}

/* Turns Timeline */
.turns-timeline {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.turn-box {
  background-color: var(--bg-input);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 14px;
}

.turn-box.has-spike {
  border-color: rgba(239, 68, 68, 0.4);
  background-color: rgba(239, 68, 68, 0.02);
}

.turn-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6px;
  flex-wrap: wrap;
  gap: 8px;
}

.turn-index-group {
  display: flex;
  align-items: center;
  gap: 8px;
}

.turn-badge {
  background: rgba(56, 189, 248, 0.15);
  color: var(--accent-blue);
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 0.75rem;
  font-weight: 700;
}

.turn-time, .turn-dur {
  font-size: 0.72rem;
}

.turn-efficiency-group {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.turn-tokens-pill {
  font-size: 0.72rem;
  background-color: #1e293b;
  padding: 3px 8px;
  border-radius: 6px;
  display: flex;
  gap: 6px;
}

.turn-diagnosis-text {
  font-size: 0.75rem;
  margin-bottom: 6px;
  padding: 4px 8px;
  background-color: rgba(0,0,0,0.2);
  border-radius: 6px;
}

.turn-suggestion-box {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 8px 12px;
  border-radius: 6px;
  font-size: 0.76rem;
  margin-bottom: 10px;
  line-height: 1.4;
}

.sug-optimal {
  background-color: rgba(34, 197, 94, 0.08);
  border: 1px solid rgba(34, 197, 94, 0.2);
  color: var(--accent-green);
}

.sug-actionable {
  background-color: rgba(234, 179, 8, 0.08);
  border: 1px solid rgba(234, 179, 8, 0.25);
  color: #fef08a;
}

.sug-icon {
  font-size: 0.85rem;
}

.sep {
  color: var(--text-dim);
}

.spike-alert {
  background-color: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.3);
  padding: 8px 12px;
  border-radius: 6px;
  font-size: 0.78rem;
  color: var(--accent-red);
  margin-bottom: 10px;
}

.section-label {
  font-size: 0.7rem;
  font-weight: 700;
  text-transform: uppercase;
  color: var(--text-dim);
  margin-bottom: 4px;
}

.prompt-bubble {
  background-color: #1e293b;
  padding: 10px 12px;
  border-radius: 8px;
  font-size: 0.8rem;
  color: var(--text-main);
  margin-bottom: 10px;
  white-space: pre-wrap;
}

.tools-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 10px;
}

.tool-pill {
  background-color: #0b0f19;
  border: 1px solid var(--border-color);
  padding: 6px 10px;
  border-radius: 6px;
  font-size: 0.75rem;
  display: flex;
  gap: 8px;
  align-items: center;
}

.tool-name {
  color: var(--accent-yellow);
  font-weight: 600;
}

.tool-arg {
  color: var(--text-muted);
}

.assistant-preview {
  font-size: 0.78rem;
  color: var(--text-muted);
  background-color: rgba(0,0,0,0.2);
  padding: 8px 10px;
  border-radius: 6px;
}

.empty-state {
  text-align: center;
  color: var(--text-dim);
  padding: 40px 0;
  font-size: 0.9rem;
}

.text-xs { font-size: 0.72rem; }
.text-green { color: var(--accent-green); }
.text-purple { color: var(--accent-purple); }

/* In-Turn Actions & Guidance Logger */
.turn-actions-card {
  margin-top: 12px;
  background: rgba(14, 20, 36, 0.6);
  border: 1px solid var(--border-color);
  border-radius: 10px;
  padding: 12px;
}

.turn-actions-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}

.turn-actions-title {
  font-size: 0.78rem;
  font-weight: 700;
  color: var(--accent-blue);
  letter-spacing: 0.02em;
}

.btn-text-sm {
  background: transparent;
  border: none;
  color: var(--accent-blue);
  font-size: 0.74rem;
  font-weight: 600;
  cursor: pointer;
  padding: 2px 6px;
  border-radius: 4px;
}

.btn-text-sm:hover {
  background: rgba(56, 189, 248, 0.15);
}

.turn-actions-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.turn-action-row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.btn-turn-action {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  color: var(--text-main);
  padding: 6px 12px;
  border-radius: 8px;
  font-size: 0.76rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-turn-action:hover:not(:disabled) {
  border-color: var(--accent-blue);
  background: rgba(56, 189, 248, 0.08);
  transform: translateY(-1px);
}

.btn-turn-action:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn-turn-action.is-applied {
  border-color: rgba(34, 197, 94, 0.4);
  background: rgba(34, 197, 94, 0.08);
}

.btn-action-badge {
  font-size: 0.68rem;
  padding: 1px 6px;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.08);
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.action-feedback-pill {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 0.74rem;
  background: rgba(34, 197, 94, 0.1);
  padding: 4px 10px;
  border-radius: 6px;
  border: 1px solid rgba(34, 197, 94, 0.25);
}

.btn-undo-link {
  background: transparent;
  border: none;
  color: var(--accent-red);
  font-size: 0.72rem;
  font-weight: 700;
  cursor: pointer;
}

.btn-undo-link:hover {
  text-decoration: underline;
}

.turn-note-form {
  margin-top: 10px;
  padding: 12px;
  background: rgba(11, 15, 25, 0.9);
  border: 1px dashed var(--accent-blue);
}

.note-form-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
  font-size: 0.8rem;
}

.note-inputs {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.note-input {
  width: 100%;
  background: var(--bg-input);
  border: 1px solid var(--border-color);
  color: var(--text-main);
  padding: 6px 10px;
  border-radius: 6px;
  font-size: 0.78rem;
  outline: none;
}

.note-input:focus {
  border-color: var(--accent-blue);
}

.note-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 10px;
}
</style>
