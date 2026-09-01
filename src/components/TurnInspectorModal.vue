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
    default: 'all'
  }
});

const emit = defineEmits(['close', 'export-handoff', 'guidance-updated']);

function isNoisyTestInvocation(toolCall) {
  const input = toolCall?.input;
  const command = typeof input === 'string' ? input : String(input?.cmd || input?.command || '');
  const isTestCommand = /(?:^|[;&|]\s*)(?:(?:pnpm|npm|yarn|bun)\b[^\n]*\b(?:test(?::[\w-]+)?|jest|vitest|mocha|ava)\b|(?:jest|vitest|mocha|ava|pytest)\b)/i.test(command);
  return /(?:exec_command|run_command|\bexec\b)/i.test(String(toolCall?.tool || ''))
    && isTestCommand
    && !(/--silent/.test(command) && /--bail(?:\s+|=)1\b/.test(command));
}

function hasUnboundedFileRead(toolCall) {
  if (!/(?:view_file|read_file)/i.test(String(toolCall?.tool || ''))) return false;
  const input = toolCall?.input;
  if (typeof input === 'string') return !/\b(?:start_?line|end_?line|fromLine|toLine)\b/i.test(input);
  if (!input || typeof input !== 'object') return true;
  const keys = Object.keys(input).map((key) => key.toLowerCase());
  return !keys.some((key) => ['startline', 'endline', 'start_line', 'end_line', 'fromline', 'toline'].includes(key));
}

function isLikelyRoutineTurn(turn, hasNoisyTests, hasUnboundedRead) {
  const prompt = `${turn?.userPrompt || ''} ${turn?.assistantMessage || ''}`;
  return !hasNoisyTests && !hasUnboundedRead && (turn?.toolCalls?.length || 0) <= 2
    && /\b(?:docs?|documentation|format(?:ting)?|rename|typo|read|review|status|list)\b/i.test(prompt);
}

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

const reportableTurnCount = computed(() => {
  return (props.session?.turns || []).filter(shouldOfferIssueReport).length;
});

function getTurnActions(turn) {
  const actions = [];
  const inp = turn.tokenUsage?.input_tokens || 0;
  const cached = turn.tokenUsage?.cached_input_tokens || 0;
  const fresh = Math.max(inp - cached, 0);
  const think = turn.tokenUsage?.reasoning_output_tokens || 0;
  const hasNoisyTests = turn.toolCalls?.some(isNoisyTestInvocation);
  const hasUnboundedRead = turn.toolCalls?.some(hasUnboundedFileRead);
  const hasRoutineHighThinking = think > 1200 && isLikelyRoutineTurn(turn, hasNoisyTests, hasUnboundedRead);

  // Action: Test suppression
  if (hasNoisyTests) {
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
  if (hasUnboundedRead) {
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

  // Action: Reasoning optimization
  if (hasRoutineHighThinking) {
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

  return actions;
}

function isActionableTurn(turn) {
  return getTurnActions(turn).length > 0;
}

function hasDenseWorkflow(turn) {
  return (turn?.toolCalls?.length || 0) >= 4;
}

function shouldOfferIssueReport(turn) {
  return isActionableTurn(turn) || hasDenseWorkflow(turn);
}

function buildSkillProposal(turn) {
  const tools = [...new Set((turn?.toolCalls || []).map((tool) => tool.tool).filter(Boolean))].slice(0, 6);
  const intent = String(turn?.userPrompt || 'the observed workflow').replace(/\s+/g, ' ').trim().slice(0, 160);
  const name = `workflow-turn-${turn?.turnNumber || 1}`;

  return `## 5. Proposed Reusable Skill (Review Before Creating)

This is a description for review, not a request to create a skill automatically.

- **Suggested name**: \`${name}\`
- **Suggested trigger**: \`$${name}\`
- **Description**: Reusable workflow for “${intent || 'the observed workflow'}” using ${tools.length ? tools.map((tool) => `\`${tool}\``).join(', ') : 'the observed tool sequence'}.
- **Create it only when**: the same workflow recurs across multiple sessions and its steps can be stated without copying turn-specific paths, commands, or temporary context.
- **Before creating it**: replace this proposal with a narrow purpose, stable inputs, and the smallest safe validation sequence.`;
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

// Issue Preview & Selective Copy Modal State
const isPreviewModalOpen = ref(false);
const isPreviewEditingDoc = ref(false);
const previewItems = ref([]); // [{ turnNumber, headline, turn, fileName, agentPrompt, content, savings, selected, isEdited }]
const activePreviewIndex = ref(0);
const previewCopiedType = ref(null);
const isSavingPreviewDocs = ref(false);
const previewToastMsg = ref('');

function generateDocForTurn(turn) {
  const sessionId = props.session?.sessionId || props.session?.meta?.id || 'session';
  const sessionShort = sessionId.substring(0, 8);
  const turnNum = turn?.turnNumber || 1;
  const fileName = `issue-turn-${turnNum}-${sessionShort}.md`;

  const inp = turn.tokenUsage?.input_tokens || 0;
  const cached = turn.tokenUsage?.cached_input_tokens || 0;
  const fresh = Math.max(inp - cached, 0);
  const out = turn.tokenUsage?.output_tokens || 0;
  const think = turn.tokenUsage?.reasoning_output_tokens || 0;
  const total = inp + out;
  const cacheHitRate = inp > 0 ? Math.round((cached / inp) * 100) : 0;

  const hasNoisyTests = turn.toolCalls?.some(isNoisyTestInvocation);
  const hasUnboundedRead = turn.toolCalls?.some(hasUnboundedFileRead);
  const hasRoutineHighThinking = think > 1200 && isLikelyRoutineTurn(turn, hasNoisyTests, hasUnboundedRead);
  const hasManyTools = (turn.toolCalls?.length || 0) >= 4;

  let problemHeadline = 'Uncached Context Inflation & File Noise';
  let problemDetails = `Turn #${turnNum} injected ${fresh.toLocaleString()} fresh un-cached tokens into prompt history.`;
  let projectedSavingsTokens = Math.round(fresh * 0.85);
  let badExample = 'Running unconstrained file reads or unbounded searches without line ranges.';
  let goodExample = 'Using grep_search with StartLine/EndLine slices or targeted symbol inspection.';
  let resolutionRules = `- Practice progressive disclosure: always inspect targeted line ranges (StartLine/EndLine) rather than reading entire files into prompt context.`;
  let skillProposal = '';

  if (hasNoisyTests) {
    problemHeadline = 'Unfiltered Test Suite Console Noise';
    problemDetails = `Executed test commands without bail or silent flags, dumping raw passing logs and stack traces (~${inp.toLocaleString()} tokens).`;
    projectedSavingsTokens = Math.round(inp * 0.95);
    badExample = '```bash\npnpm test\n# Dumps dozens of passing test logs into prompt context\n```';
    goodExample = '```bash\npnpm test -- --bail 1 --silent\n# Halts on first error, output payload < 400 tokens\n```';
    resolutionRules = `- When executing test suites, always pass \`--bail 1\` and \`--silent\` to keep context lean.\n- Add \`"test:agent": "vitest run --bail 1 --silent"\` to \`package.json\`.`;
  } else if (hasUnboundedRead) {
    problemHeadline = 'Unbounded File Read Request';
    problemDetails = `Requested a file read without line-range metadata. The telemetry cannot prove the file size, so this work order targets the missing bound rather than claiming a full-file read.`;
    projectedSavingsTokens = Math.round(fresh * 0.9);
    badExample = '```bash\nview_file /path/to/LargeFile.js\n# Reads entire 800+ lines into context\n```';
    goodExample = '```bash\ngrep_search query: "targetSymbol" + view_file StartLine: 40 EndLine: 85\n# Reads only 45 relevant lines\n```';
    resolutionRules = `- Practice progressive disclosure: always inspect targeted line ranges (\`StartLine\`/\`EndLine\`) rather than reading entire files into prompt context.\n- Never read files over 200 lines in full when making localized edits.`;
  } else if (hasRoutineHighThinking) {
    problemHeadline = 'High Reasoning on a Likely Routine Task';
    problemDetails = `Turn #${turnNum} used ${think.toLocaleString()} reasoning tokens while its request and tool footprint match a likely routine task. Confirm that the work is not complex before lowering reasoning effort.`;
    projectedSavingsTokens = Math.round(think * 0.88);
    badExample = 'Running a documentation, status, or formatting task with high reasoning effort by default.';
    goodExample = 'Use low reasoning effort for routine work; raise it only when the task requires non-trivial investigation or design.';
    resolutionRules = `- Use \`reasoning_effort: low\` for this kind of routine task after confirming it does not need deeper investigation.\n- Do not lower reasoning effort for complex debugging, ambiguous incidents, or architecture decisions.`;
  } else if (hasManyTools) {
    problemHeadline = 'Dense Multi-Step Tool Execution Carryover';
    problemDetails = `Executed ${turn.toolCalls.length} distinct tool calls in a single conversational turn, inflating turn payload.`;
    projectedSavingsTokens = Math.round(inp * 0.6);
    badExample = 'Prompting multi-phase architectural chores across sequential tool calls in a single unbounded turn.';
    goodExample = 'Packaging the verification sequence into a modular `.agents/skills/verify-slice/SKILL.md` skill.';
    resolutionRules = `- Package repetitive multi-turn test/lint workflows into modular \`.agents/skills/\`.\n- Allow automatic invocation only for narrow, broadly safe skills with a clear trigger; keep broad or specialized skills explicit-only.`;
    skillProposal = buildSkillProposal(turn);
  }

  const agentPrompt = `Please inspect and resolve the token inefficiency documented in @docs/tokens-consumptions/issues/${fileName}. Apply the recommended rules to AGENTS.md or package.json, verify with silent flags, and ensure all changes preserve documentation integrity.`;

  const toolSummary = (!turn.toolCalls || turn.toolCalls.length === 0) 
    ? 'No tool invocations recorded in this turn.'
    : turn.toolCalls.map((t, i) => {
        let inputPreview = '';
        if (typeof t.input === 'string') inputPreview = t.input.substring(0, 120);
        else if (typeof t.input === 'object' && t.input) {
          inputPreview = t.input.cmd || t.input.command || t.input.AbsolutePath || t.input.Pattern || JSON.stringify(t.input).substring(0, 120);
        }
        return `${i + 1}. \`${t.tool}\`: \`${inputPreview}\``;
      }).join('\n');

  const markdownContent = `# 📋 Agent Work Order: Token Inefficiency Resolution
> **Issue ID**: \`ISSUE-TURN-${turnNum}-${sessionShort}\`  
> **Status**: \`ACTIONABLE / PENDING AGENT TAKEOVER\`  
> **Target Workspace**: \`${props.activeWorkspace || ''}\`  
> **Created Date**: ${new Date().toISOString().split('T')[0]}  
> **Author**: Agent Token Tracker Diagnostic Engine  

---

## 🤖 Handoff Directive for the Project AI Agent

\`\`\`markdown
${agentPrompt}
\`\`\`

---

## 1. Session Telemetry & Context

| Metric | Recorded Value | Evaluation |
| :--- | :--- | :--- |
| **Session ID** | \`${sessionId}\` | Trajectory file: \`${props.session?.filePath || ''}\` |
| **Thread Goal** | **${props.session?.threadName || 'Untitled Session'}** | User conversation topic |
| **Turn Number** | **Turn #${turnNum}** | Step where spike occurred |
| **Total Turn Context** | **${total.toLocaleString()} tokens** | High context accumulation |
| **Fresh Uncached Payload** | **${fresh.toLocaleString()} tokens** | 🚨 **Spike Source** |
| **Cached Context** | **${cached.toLocaleString()} tokens (${cacheHitRate}%)** | Cache retention |
| **Reasoning Tokens** | **${think.toLocaleString()} tokens** | Model deliberation |
| **Model Response Output** | **${out.toLocaleString()} tokens** | Output payload |

---

## 2. Root Cause Analysis

### 🚨 Problem: **${problemHeadline}**
${problemDetails}

### 🔍 User Request in this Turn:
> *${turn.userPrompt ? String(turn.userPrompt).replace(/\n/g, ' ') : 'No user prompt recorded.'}*

### 🔧 Tool Invocations Observed (${turn.toolCalls?.length || 0}):
${(turn.toolCalls || []).map((t, i) => `${i + 1}. \`${t.tool}\`: \`${typeof t.input === 'string' ? t.input.substring(0, 80) : JSON.stringify(t.input || '').substring(0, 80)}\``).join('\n') || 'None'}

---

## 3. Projected Impact & Waste

- **Potentially reducible observed tokens**: **~${projectedSavingsTokens.toLocaleString()} tokens (unvalidated estimate)**
- **Provider quota impact**: **Not directly measurable from transcript telemetry**
- **Financial impact**: **Not calculated; model-specific billing and provider quota accounting are unavailable in transcript telemetry**

---

## 4. Autonomous Agent Step-by-Step Resolution Plan

When an agent takes over this task, execute these exact steps:

1. **Step 1: Inspect Target Configuration Files**:
   - Inspect [AGENTS.md](AGENTS.md) and [package.json](package.json) using line slices.

2. **Step 2: Apply Optimization Rule**:
   - Add the following convention to [AGENTS.md](AGENTS.md) under a \`## Token Optimization Rules\` section:
\`\`\`markdown
${resolutionRules}
\`\`\`

3. **Step 3: Verification**:
   - Run the project test suite using silent flags to verify no regressions:
\`\`\`bash
npm run test:agent || npm test -- --bail 1 --silent
\`\`\`

---

${skillProposal ? `---\n\n${skillProposal}\n\n` : ''}## ${skillProposal ? '6' : '5'}. Concrete Code Examples

### ❌ Inefficient Pattern (Observed in Turn #${turnNum}):
${badExample}

### ✅ Lean & Cached Pattern (Expected Standard):
${goodExample}
`;

  return {
    turnNumber: turnNum,
    turn,
    headline: problemHeadline,
    fileName,
    agentPrompt,
    content: markdownContent,
    savings: projectedSavingsTokens,
    selected: true
  };
}

function openSingleTurnPreview(turn) {
  if (!shouldOfferIssueReport(turn)) return;
  const item = generateDocForTurn(turn);
  previewItems.value = [item];
  activePreviewIndex.value = 0;
  isPreviewEditingDoc.value = false;
  isPreviewModalOpen.value = true;
  previewToastMsg.value = '';
}

function openAllTurnsPreview() {
  const allTurns = props.session?.turns || [];
  const candidates = allTurns.filter(shouldOfferIssueReport);
  if (candidates.length === 0) return;

  previewItems.value = candidates.map(t => generateDocForTurn(t));
  activePreviewIndex.value = 0;
  isPreviewEditingDoc.value = false;
  isPreviewModalOpen.value = true;
  previewToastMsg.value = '';
}

function toggleSelectAll(select) {
  previewItems.value.forEach(item => {
    item.selected = select;
  });
}

const selectedPreviewCount = computed(() => {
  return previewItems.value.filter(i => i.selected).length;
});

const currentPreviewItem = computed(() => {
  return previewItems.value[activePreviewIndex.value] || null;
});

function copyActiveItemPrompt() {
  const item = currentPreviewItem.value;
  if (!item) return;
  navigator.clipboard.writeText(item.agentPrompt);
  previewCopiedType.value = 'active_prompt';
  setTimeout(() => { previewCopiedType.value = null; }, 2000);
}

function copyActiveItemDoc() {
  const item = currentPreviewItem.value;
  if (!item) return;
  navigator.clipboard.writeText(item.content);
  previewCopiedType.value = 'active_doc';
  setTimeout(() => { previewCopiedType.value = null; }, 2000);
}

function copySelectedPrompts() {
  const selected = previewItems.value.filter(i => i.selected);
  if (selected.length === 0) return;
  const combined = selected.map(i => i.agentPrompt).join('\n\n');
  navigator.clipboard.writeText(combined);
  previewCopiedType.value = 'selected_prompts';
  setTimeout(() => { previewCopiedType.value = null; }, 2000);
}

function copySelectedDocs() {
  const selected = previewItems.value.filter(i => i.selected);
  if (selected.length === 0) return;
  const combined = selected.map(i => i.content).join('\n\n---\n\n');
  navigator.clipboard.writeText(combined);
  previewCopiedType.value = 'selected_docs';
  setTimeout(() => { previewCopiedType.value = null; }, 2000);
}

async function saveActiveItemDocToDisk() {
  const item = currentPreviewItem.value;
  if (!item) return;
  isSavingPreviewDocs.value = true;
  previewToastMsg.value = '';
  try {
    const res = await fetch('/api/token-issues/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        projectPath: props.activeWorkspace,
        fileName: item.fileName,
        content: item.content
      })
    });
    if (res.ok) {
      generatedIssues.value[item.turnNumber] = {
        status: 'success',
        fileName: item.fileName,
        relativePath: `docs/tokens-consumptions/issues/${item.fileName}`,
        savings: item.savings
      };
      previewToastMsg.value = `Successfully saved ${item.fileName} to docs/tokens-consumptions/issues/`;
      emit('guidance-updated');
      setTimeout(() => { previewToastMsg.value = ''; }, 4000);
    } else {
      const data = await res.json();
      alert(`Failed to save: ${data.error || 'Unknown error'}`);
    }
  } catch (e) {
    alert(`Failed to save: ${e.message}`);
  } finally {
    isSavingPreviewDocs.value = false;
  }
}

async function saveSelectedDocsToDisk() {
  const selected = previewItems.value.filter(i => i.selected);
  if (selected.length === 0) return;
  isSavingPreviewDocs.value = true;
  previewToastMsg.value = '';
  try {
    let savedCount = 0;
    for (const item of selected) {
      // Save directly using backend endpoint
      const res = await fetch('/api/token-issues/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectPath: props.activeWorkspace,
          fileName: item.fileName,
          content: item.content
        })
      });
      if (res.ok) {
        generatedIssues.value[item.turnNumber] = {
          status: 'success',
          fileName: item.fileName,
          relativePath: `docs/tokens-consumptions/issues/${item.fileName}`,
          savings: item.savings
        };
        savedCount++;
      }
    }
    previewToastMsg.value = `Successfully saved ${savedCount} issue document(s) to docs/tokens-consumptions/issues/`;
    emit('guidance-updated');
    setTimeout(() => { previewToastMsg.value = ''; }, 4000);
  } catch (e) {
    alert(`Failed to save docs: ${e.message}`);
  } finally {
    isSavingPreviewDocs.value = false;
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
          <span class="session-path mono text-dim text-xs">{{ session?.meta?.cwd || '' }} • {{ session?.meta?.model || 'codex' }} • {{ session?.sessionId }}</span>
        </div>
        <div class="head-actions">
            <div v-if="reportableTurnCount > 0" class="action-btn-group">
            <button 
              class="btn btn-secondary btn-sm"
              @click="openAllTurnsPreview"
            >
              <span>📑</span> Preview & Select Docs Issues
            </button>
            <Tooltip
              placement="bottom"
              title="Batch Issue Report Generator & Preview"
              text="Scans this session and opens an interactive preview with individual checkboxes to inspect, edit, and choose which turn issue documents to copy or save to docs/tokens-consumptions/issues/."
              whyItMatters="Allows you to inspect and modify generated work orders before copying or saving them."
            />
          </div>
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
          <span class="lbl">
            Total Turns
            <Tooltip
              placement="bottom"
              title="Session Turns"
              text="The number of back-and-forth user/agent interaction cycles in this thread."
              whyItMatters="Longer threads (>15-20 turns) cause quadratic input token inflation as context history is re-sent."
            />:
          </span>
          <span class="val mono">{{ session?.turnCount || 0 }}</span>
        </div>
        <div class="summary-item">
          <span class="lbl">
            Total Tokens
            <Tooltip
              placement="bottom"
              title="Total Tokens"
              text="Sum of all input, cached, reasoning, and output tokens consumed across all turns in this session."
              whyItMatters="Represents the overall compute volume and cost footprint of this conversation."
            />:
          </span>
          <span class="val mono">{{ (session?.totalUsage?.total_tokens || 0).toLocaleString() }}</span>
        </div>
        <div class="summary-item">
          <span class="lbl">
            Cache Hit Rate
            <Tooltip
              placement="bottom"
              title="Prompt Cache Hit Rate"
              text="Percentage of input tokens served directly from prompt cache instead of being processed freshly."
              whyItMatters="A high cache rate (>75%) delivers lower latency and substantial cost savings on model pricing."
            />:
          </span>
          <span class="val mono text-green">{{ cacheRate }}%</span>
        </div>
        <div class="summary-item">
          <span class="lbl">
            Reasoning (Thinking)
            <Tooltip
              placement="bottom"
              title="Reasoning Tokens"
              text="Tokens spent on internal model deliberation before emitting output."
              whyItMatters="Reasoning tokens count toward output token quotas; use lower reasoning effort for routine chores."
            />:
          </span>
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
                <Tooltip 
                  placement="top"
                  title="Total Input Tokens (In)"
                  text="Total tokens sent to the model for this turn, including system instructions, workspace rules (AGENTS.md), full prior context history, and tool execution outputs."
                  whyItMatters="Input tokens accumulate across turns, making long threads costlier on every step."
                >
                  <span class="token-item-lbl" title="Total Input">In: {{ (turn.tokenUsage.input_tokens || 0).toLocaleString() }}</span>
                </Tooltip>
                <span class="sep">•</span>
                <Tooltip 
                  placement="top"
                  title="Cached Input Tokens (Cache)"
                  text="Portion of input tokens retrieved directly from prompt cache instead of being processed freshly."
                  whyItMatters="Cached tokens cost up to 75-90% less than fresh input tokens."
                >
                  <span class="token-item-lbl text-green" title="Cached Tokens">Cache: {{ (turn.tokenUsage.cached_input_tokens || 0).toLocaleString() }}</span>
                </Tooltip>
                <span class="sep">•</span>
                <Tooltip 
                  placement="top"
                  title="Reasoning Tokens (Think)"
                  text="Internal chain-of-thought tokens generated by the model before producing the final response."
                  whyItMatters="Counts against output quotas; use low reasoning effort for standard chores and file edits."
                >
                  <span class="token-item-lbl text-purple" title="Reasoning Tokens">Think: {{ (turn.tokenUsage.reasoning_output_tokens || 0).toLocaleString() }}</span>
                </Tooltip>
                <span class="sep">•</span>
                <Tooltip 
                  placement="top"
                  title="Output Tokens (Out)"
                  text="Tokens generated by the model in its response, including text explanations, code edits, and tool invocations."
                  whyItMatters="Output tokens are billed at higher rates; keep outputs lean with targeted file replacements."
                >
                  <span class="token-item-lbl" title="Output Tokens">Out: {{ (turn.tokenUsage.output_tokens || 0).toLocaleString() }}</span>
                </Tooltip>
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
          <div v-if="shouldOfferIssueReport(turn)" class="turn-actions-card">
            <div class="turn-actions-header">
              <span class="turn-actions-title">{{ isActionableTurn(turn) ? `⚡ Turn #${turn.turnNumber} Actions & Guidance:` : `🧩 Turn #${turn.turnNumber} Workflow Review:` }}</span>
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

              <!-- Action: Generate Structured Issue in docs/tokens-consumptions/issues/ -->
              <div class="turn-action-row">
                <div class="turn-issue-btn-wrap">
                  <button
                    :class="['btn-turn-action', { 'is-applied': generatedIssues[turn.turnNumber]?.status === 'success' }]"
                    @click="openSingleTurnPreview(turn)"
                  >
                    <span class="btn-action-badge">Docs Issue</span>
                    <span class="btn-action-text">{{ hasDenseWorkflow(turn) && !isActionableTurn(turn) ? '🧩 Preview Workflow Skill Proposal' : '📄 Preview & Generate Issue Report' }}</span>
                    <span v-if="generatedIssues[turn.turnNumber]?.status === 'success'" class="text-green">✅ Saved Issue</span>
                  </button>
                  <Tooltip
                    placement="top"
                    title="Preview & Generate Single Turn Issue"
                    text="Opens an editable issue report. Dense workflows include a skill proposal for review, but never create a skill automatically."
                    whyItMatters="Keeps one-off or turn-specific commands out of reusable skills while preserving a useful solution proposal."
                  />
                </div>


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

    <!-- Turn Issue Document Preview & Selective Copy Modal -->
    <div v-if="isPreviewModalOpen" class="modal-overlay sub-modal-overlay" @click="isPreviewModalOpen = false">
      <div class="modal-card modal-lg preview-submodal-card" @click.stop>
        <div class="modal-head">
          <div class="head-info">
            <h3>📑 Issue Document Preview & Selection</h3>
            <span class="sub-text">
              Inspect and edit work orders before copying prompts or persisting to <code>docs/tokens-consumptions/issues/</code>
            </span>
          </div>
          <div class="head-actions">
            <button class="close-btn" @click="isPreviewModalOpen = false">✕</button>
          </div>
        </div>

        <div class="modal-body preview-modal-body">
          <div v-if="previewToastMsg" class="preview-toast-banner">
            <span>✅ {{ previewToastMsg }}</span>
          </div>

          <div class="preview-layout">
            <!-- Left: Turn Selection List -->
            <div class="preview-sidebar">
              <div class="preview-sidebar-head">
                <div class="selection-status">
                  <strong>{{ selectedPreviewCount }}</strong> of {{ previewItems.length }} Selected
                </div>
                <div class="selection-controls" v-if="previewItems.length > 1">
                  <button class="btn-link-xs" @click="toggleSelectAll(true)">Select All</button>
                  <span class="sep">•</span>
                  <button class="btn-link-xs" @click="toggleSelectAll(false)">Deselect</button>
                </div>
              </div>

              <div class="preview-items-list">
                <div 
                  v-for="(item, idx) in previewItems" 
                  :key="item.fileName"
                  :class="['preview-turn-item', { active: activePreviewIndex === idx }]"
                  @click="activePreviewIndex = idx"
                >
                  <div class="preview-item-top">
                    <label class="checkbox-label" @click.stop>
                      <input type="checkbox" v-model="item.selected" />
                      <span class="turn-chip mono">Turn #{{ item.turnNumber }}</span>
                    </label>
                    <span class="savings-chip text-green" v-if="item.savings">
                      ~{{ item.savings.toLocaleString() }} tokens
                    </span>
                  </div>
                  <div class="preview-item-headline">{{ item.headline }}</div>
                  <div class="preview-item-file mono text-dim text-xs">{{ item.fileName }}</div>
                </div>
              </div>

              <!-- Batch Actions in Sidebar when multiple items -->
              <div class="sidebar-batch-actions" v-if="previewItems.length > 1">
                <button 
                  class="btn btn-primary btn-sm w-full"
                  :disabled="selectedPreviewCount === 0"
                  @click="copySelectedPrompts"
                >
                  <span>📋</span> {{ previewCopiedType === 'selected_prompts' ? 'Prompts Copied!' : `Copy Selected Prompts (${selectedPreviewCount})` }}
                </button>
                <button 
                  class="btn btn-secondary btn-sm w-full"
                  :disabled="selectedPreviewCount === 0"
                  @click="copySelectedDocs"
                >
                  <span>📄</span> {{ previewCopiedType === 'selected_docs' ? 'Docs Copied!' : `Copy Selected Markdown (${selectedPreviewCount})` }}
                </button>
                <button 
                  class="btn btn-save btn-sm w-full"
                  :disabled="selectedPreviewCount === 0 || isSavingPreviewDocs"
                  @click="saveSelectedDocsToDisk"
                >
                  <span>💾</span> {{ isSavingPreviewDocs ? 'Saving...' : `Save Selected to docs/ (${selectedPreviewCount})` }}
                </button>
              </div>
            </div>

            <!-- Right: Live Editable Preview Pane -->
            <div class="preview-content-pane">
              <div v-if="currentPreviewItem" class="preview-detail-box">
                <div class="pane-header">
                  <div class="pane-title-box">
                    <h4>Turn #{{ currentPreviewItem.turnNumber }}: {{ currentPreviewItem.headline }}</h4>
                    <span class="pane-path mono text-dim text-xs">docs/tokens-consumptions/issues/{{ currentPreviewItem.fileName }}</span>
                  </div>
                  <div class="pane-controls">
                    <div class="mode-toggle-group">
                      <button 
                        :class="['btn', 'btn-xs', !isPreviewEditingDoc ? 'btn-primary' : 'btn-secondary']"
                        @click="isPreviewEditingDoc = false"
                      >
                        👁️ Preview
                      </button>
                      <button 
                        :class="['btn', 'btn-xs', isPreviewEditingDoc ? 'btn-primary' : 'btn-secondary']"
                        @click="isPreviewEditingDoc = true"
                      >
                        ✏️ Edit Doc
                      </button>
                    </div>
                    <button 
                      class="btn btn-save btn-xs"
                      :disabled="isSavingPreviewDocs"
                      @click="saveActiveItemDocToDisk"
                      title="Save this single issue doc to disk"
                    >
                      <span>💾</span> Save This Doc
                    </button>
                    <button 
                      class="btn btn-primary btn-xs"
                      @click="copyActiveItemPrompt"
                    >
                      <span>🤖</span> {{ previewCopiedType === 'active_prompt' ? 'Copied!' : 'Copy Prompt' }}
                    </button>
                    <button 
                      class="btn btn-secondary btn-xs"
                      @click="copyActiveItemDoc"
                    >
                      <span>📄</span> {{ previewCopiedType === 'active_doc' ? 'Copied!' : (isPreviewEditingDoc ? 'Copy Edited Markdown' : 'Copy Markdown') }}
                    </button>
                  </div>
                </div>

                <!-- Agent Prompt Box -->
                <div class="agent-prompt-section card">
                  <div class="prompt-sec-head">
                    <span class="sec-lbl">🤖 Agent Directive / Kickoff Prompt:</span>
                  </div>
                  <textarea 
                    v-if="isPreviewEditingDoc"
                    v-model="currentPreviewItem.agentPrompt"
                    class="prompt-textarea mono"
                    rows="2"
                    placeholder="Edit agent prompt..."
                  ></textarea>
                  <div v-else class="prompt-display mono">
                    {{ currentPreviewItem.agentPrompt }}
                  </div>
                </div>

                <!-- Markdown Content Box -->
                <div class="markdown-preview-container">
                  <div class="md-header-bar">
                    <span class="text-xs text-dim" v-if="isPreviewEditingDoc">
                      ✏️ In-Place Editing: Modify the issue markdown below before copying or persisting.
                    </span>
                    <span class="text-xs text-dim" v-else>
                      👁️ Issue Document Preview: Switch to Edit Doc to make custom modifications.
                    </span>
                  </div>
                  <textarea 
                    v-if="isPreviewEditingDoc"
                    v-model="currentPreviewItem.content"
                    class="markdown-editor-input mono"
                    rows="18"
                    spellcheck="false"
                    placeholder="Issue document markdown content..."
                  ></textarea>
                  <pre v-else class="markdown-raw">{{ currentPreviewItem.content }}</pre>
                </div>
              </div>

              <div v-else class="preview-empty-detail">
                <p>No turn selected for preview.</p>
              </div>
            </div>
          </div>
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

.action-btn-group {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.turn-issue-btn-wrap {
  display: inline-flex;
  align-items: center;
  gap: 6px;
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
  align-items: center;
  gap: 6px;
}

.turn-tokens-pill :deep(.tooltip-container) {
  margin-left: 0;
}

.token-item-lbl {
  cursor: help;
  text-decoration: underline dotted rgba(255, 255, 255, 0.3);
  text-underline-offset: 3px;
  transition: all 0.15s ease;
}

.token-item-lbl:hover {
  filter: brightness(1.25);
  text-decoration-color: rgba(255, 255, 255, 0.7);
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

/* Sub-modal Preview & Selection Styles */
.sub-modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.75);
  backdrop-filter: blur(6px);
  z-index: 1050;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}

.preview-submodal-card {
  max-width: 1250px;
  width: 95vw;
  height: 90vh;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  overflow: hidden;
}

.preview-modal-body {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  padding: 16px 20px;
}

.preview-toast-banner {
  background: rgba(34, 197, 94, 0.15);
  border: 1px solid var(--accent-green);
  color: var(--accent-green);
  padding: 8px 14px;
  border-radius: 6px;
  font-size: 0.85rem;
  margin-bottom: 12px;
}

.preview-layout {
  flex: 1;
  display: grid;
  grid-template-columns: 320px 1fr;
  gap: 16px;
  overflow: hidden;
  height: 100%;
}

.preview-sidebar {
  display: flex;
  flex-direction: column;
  gap: 12px;
  border-right: 1px solid var(--border-color);
  padding-right: 16px;
  overflow: hidden;
}

.preview-sidebar-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.82rem;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--border-color);
}

.selection-controls {
  display: flex;
  align-items: center;
  gap: 6px;
}

.btn-link-xs {
  background: transparent;
  border: none;
  color: var(--accent-blue);
  font-size: 0.75rem;
  cursor: pointer;
  padding: 0;
}

.btn-link-xs:hover {
  text-decoration: underline;
}

.preview-items-list {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.preview-turn-item {
  background: var(--bg-input);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 10px;
  cursor: pointer;
  transition: all 0.2s;
}

.preview-turn-item:hover {
  border-color: var(--accent-blue);
}

.preview-turn-item.active {
  border-color: var(--accent-blue);
  background: rgba(59, 130, 246, 0.08);
}

.preview-item-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 4px;
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
}

.turn-chip {
  font-weight: bold;
  font-size: 0.78rem;
}

.savings-chip {
  font-size: 0.72rem;
  font-weight: 600;
}

.preview-item-headline {
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--text-main);
  margin-bottom: 2px;
}

.sidebar-batch-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-top: 10px;
  border-top: 1px solid var(--border-color);
}

.preview-content-pane {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.preview-detail-box {
  display: flex;
  flex-direction: column;
  height: 100%;
  gap: 12px;
  overflow: hidden;
}

.pane-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.pane-title-box h4 {
  font-size: 0.95rem;
  margin: 0;
}

.pane-controls {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.agent-prompt-section {
  padding: 10px 12px;
  background: rgba(30, 41, 59, 0.6);
  border: 1px solid var(--border-color);
  border-radius: 8px;
}

.prompt-sec-head {
  font-size: 0.78rem;
  font-weight: 600;
  color: var(--accent-purple);
  margin-bottom: 6px;
}

.prompt-textarea {
  width: 100%;
  background: var(--bg-input);
  border: 1px solid var(--border-color);
  color: var(--text-main);
  padding: 8px;
  border-radius: 6px;
  font-size: 0.78rem;
  resize: vertical;
}

.prompt-display {
  font-size: 0.78rem;
  color: var(--text-main);
  background: var(--bg-input);
  padding: 8px 10px;
  border-radius: 6px;
  line-height: 1.4;
  user-select: all;
}

.markdown-preview-container {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--bg-input);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 12px;
}

.md-header-bar {
  margin-bottom: 8px;
}

.markdown-editor-input {
  flex: 1;
  width: 100%;
  height: 100%;
  background: transparent;
  border: none;
  color: var(--text-main);
  font-size: 0.8rem;
  line-height: 1.5;
  resize: none;
  outline: none;
  font-family: monospace;
}

.markdown-raw {
  flex: 1;
  overflow-y: auto;
  white-space: pre-wrap;
  font-size: 0.8rem;
  line-height: 1.5;
  color: var(--text-main);
  font-family: monospace;
  margin: 0;
}

.preview-empty-detail {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--text-dim);
}

.w-full {
  width: 100%;
}
</style>
