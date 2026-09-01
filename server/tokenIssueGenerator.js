import fs from 'fs';
import path from 'path';
import { logGuidanceChange } from './guidanceLogger.js';

/**
 * Normalizes project directory path
 */
function normalizeDir(p) {
  if (!p) return process.cwd();
  return path.resolve(p).replace(/[\/\\]+$/, '');
}

/**
 * Ensures the target issue directory exists inside the tracked project
 */
export function getIssueDirectory(projectPath) {
  const root = normalizeDir(projectPath);
  const dir = path.join(root, 'docs', 'tokens-consumptions', 'issues');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

/**
 * Formats a clean tool argument preview
 */
function formatToolSummary(toolCalls = []) {
  if (!toolCalls || toolCalls.length === 0) return 'No tool invocations recorded in this turn.';
  return toolCalls.map((t, i) => {
    let inputPreview = '';
    if (typeof t.input === 'string') inputPreview = t.input.substring(0, 120);
    else if (typeof t.input === 'object' && t.input) {
      inputPreview = t.input.cmd || t.input.command || t.input.AbsolutePath || t.input.Pattern || JSON.stringify(t.input).substring(0, 120);
    }
    return `${i + 1}. \`${t.tool}\`: \`${inputPreview}\``;
  }).join('\n');
}

/**
 * Returns the safeguards that already exist in the target project so a work
 * order does not instruct an agent to add the same configuration again.
 */
function inspectProjectControls(projectPath) {
  const root = normalizeDir(projectPath);
  const agentsPath = path.join(root, 'AGENTS.md');
  const packagePath = path.join(root, 'package.json');
  const agentsContent = fs.existsSync(agentsPath) ? fs.readFileSync(agentsPath, 'utf8') : '';
  let scripts = {};

  if (fs.existsSync(packagePath)) {
    try {
      scripts = JSON.parse(fs.readFileSync(packagePath, 'utf8')).scripts || {};
    } catch {
      // A malformed package file is a separate project issue; keep the work
      // order useful instead of failing generation.
    }
  }

  const quietTestScript = Object.entries(scripts).find(([, command]) => {
    const text = String(command);
    return /--bail(?:\s+|=)1/.test(text) && text.includes('--silent');
  });

  return {
    hasProgressiveDisclosureRule: /progressive disclosure/i.test(agentsContent),
    hasTestRunner: Object.keys(scripts).some((name) => name === 'test' || name.startsWith('test:')),
    quietTestScript: quietTestScript ? quietTestScript[0] : null
  };
}

function isQuietTestInvocation(toolCall, quietTestScript) {
  const input = toolCall?.input;
  const text = (typeof input === 'string' ? input : String(input?.cmd || input?.command || '')).toLowerCase();
  const hasQuietFlags = text.includes('--silent') && /--bail(?:\s+|=)1/.test(text);
  return hasQuietFlags || Boolean(quietTestScript && text.includes(quietTestScript.toLowerCase()));
}

function isTestCommandInvocation(toolCall) {
  if (!/(?:exec_command|run_command|\bexec\b)/i.test(String(toolCall?.tool || ''))) return false;
  const input = toolCall?.input;
  const command = typeof input === 'string' ? input : String(input?.cmd || input?.command || '');
  return /(?:^|[;&|]\s*)(?:(?:pnpm|npm|yarn|bun)\b[^\n]*\b(?:test(?::[\w-]+)?|jest|vitest|mocha|ava)\b|(?:jest|vitest|mocha|ava|pytest)\b)/i.test(command);
}

function isUnboundedFileRead(toolCall) {
  const name = String(toolCall?.tool || '');
  if (!/(?:view_file|read_file)/i.test(name)) return false;
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

/**
 * Generates an Autonomous Agent Work Order / Issue Doc for a specific turn
 */
export function generateTurnIssueReport({ projectPath, session, turn }) {
  const targetDir = getIssueDirectory(projectPath);
  const sessionId = session?.sessionId || session?.meta?.id || 'session';
  const sessionShort = sessionId.substring(0, 8);
  const turnNum = turn?.turnNumber || 1;
  const fileName = `issue-turn-${turnNum}-${sessionShort}.md`;
  const filePath = path.join(targetDir, fileName);

  const inp = turn.tokenUsage?.input_tokens || 0;
  const cached = turn.tokenUsage?.cached_input_tokens || 0;
  const fresh = Math.max(inp - cached, 0);
  const out = turn.tokenUsage?.output_tokens || 0;
  const think = turn.tokenUsage?.reasoning_output_tokens || 0;
  const total = inp + out;
  const cacheHitRate = inp > 0 ? Math.round((cached / inp) * 100) : 0;
  const projectControls = inspectProjectControls(projectPath);

  // Identify core problem categories
  const testToolCalls = turn.toolCalls?.filter(isTestCommandInvocation) || [];
  const hasNoisyTests = testToolCalls.length > 0 && testToolCalls.some(
    (toolCall) => !isQuietTestInvocation(toolCall, projectControls.quietTestScript)
  );
  const hasUnboundedRead = turn.toolCalls?.some(isUnboundedFileRead) || false;
  const hasHighThinking = think > 1200;
  const hasRoutineHighThinking = hasHighThinking && isLikelyRoutineTurn(turn, hasNoisyTests, hasUnboundedRead);
  const hasManyTools = (turn.toolCalls?.length || 0) >= 4;

  let problemHeadline = 'Uncached Context Inflation & File Noise';
  let problemDetails = `Turn #${turnNum} injected ${fresh.toLocaleString()} fresh un-cached tokens into prompt history.`;
  let projectedSavingsTokens = Math.round(fresh * 0.85);
  let recommendedAction = 'Inject progressive disclosure rules into AGENTS.md';
  let badExample = 'Running unconstrained file reads or unbounded searches without line ranges.';
  let goodExample = 'Using grep_search with StartLine/EndLine slices or targeted symbol inspection.';
  let resolutionRules = `- Practice progressive disclosure: always inspect targeted line ranges (StartLine/EndLine) rather than reading entire files into prompt context.`;
  let targetFiles = '[AGENTS.md](AGENTS.md)';
  let verificationCommand = projectControls.hasTestRunner
    ? 'npm run test:agent || npm test -- --bail 1 --silent'
    : 'npm run build';
  let skillProposal = '';

  if (hasNoisyTests) {
    problemHeadline = 'Unfiltered Test Suite Console Noise';
    problemDetails = `Executed test commands without bail or silent flags, dumping raw passing logs and stack traces (~${inp.toLocaleString()} tokens).`;
    projectedSavingsTokens = Math.round(inp * 0.95);
    recommendedAction = projectControls.quietTestScript
      ? `Use the existing ${projectControls.quietTestScript} quiet test script`
      : 'Add a quiet test runner script in package.json and instruct agent in AGENTS.md';
    badExample = '```bash\npnpm test\n# Dumps dozens of passing test logs into prompt context\n```';
    goodExample = '```bash\npnpm test -- --bail 1 --silent\n# Halts on first error, output payload < 400 tokens\n```';
    targetFiles = projectControls.quietTestScript
      ? '[AGENTS.md](AGENTS.md)'
      : '[AGENTS.md](AGENTS.md) and [package.json](package.json)';
    resolutionRules = projectControls.quietTestScript
      ? `- Use \`npm run ${projectControls.quietTestScript}\` for test verification instead of invoking the full suite directly.\n- Keep \`--bail 1\` and \`--silent\` when a direct runner command is necessary.`
      : `- When executing test suites, always pass \`--bail 1\` and \`--silent\` to keep context lean.\n- Add a \`test:agent\` script only by adapting the project's existing test runner; do not assume Vitest is installed.`;
    verificationCommand = projectControls.quietTestScript
      ? `npm run ${projectControls.quietTestScript}`
      : projectControls.hasTestRunner
        ? 'npm test -- --bail 1 --silent'
        : 'npm run build';
  } else if (hasUnboundedRead) {
    problemHeadline = 'Unbounded File Read Request';
    problemDetails = `Requested a file read without line-range metadata. The telemetry cannot prove the file size, so this work order targets the missing bound rather than claiming a full-file read.`;
    projectedSavingsTokens = Math.round(fresh * 0.9);
    recommendedAction = projectControls.hasProgressiveDisclosureRule
      ? 'Apply the existing progressive-disclosure rule during the next investigation'
      : 'Enforce progressive disclosure with StartLine/EndLine in AGENTS.md';
    badExample = '```bash\nview_file /path/to/LargeFile.js\n# Reads entire 800+ lines into context\n```';
    goodExample = '```bash\ngrep_search query: "targetSymbol" + view_file StartLine: 40 EndLine: 85\n# Reads only 45 relevant lines\n```';
    resolutionRules = projectControls.hasProgressiveDisclosureRule
      ? `- The project already requires progressive disclosure. Apply that existing rule by searching for the target symbol before reading a narrow line range.\n- Do not duplicate the rule in \`AGENTS.md\`; record the observed workflow correction in the handoff instead.`
      : `- Practice progressive disclosure: always inspect targeted line ranges (\`StartLine\`/\`EndLine\`) rather than reading entire files into prompt context.\n- Never read files over 200 lines in full when making localized edits.`;
  } else if (hasRoutineHighThinking) {
    problemHeadline = 'High Reasoning on a Likely Routine Task';
    problemDetails = `Turn #${turnNum} used ${think.toLocaleString()} reasoning tokens while its request and tool footprint match a likely routine task. Confirm that the work is not complex before lowering reasoning effort.`;
    projectedSavingsTokens = Math.round(think * 0.88);
    recommendedAction = 'Use low reasoning effort for this routine task; retain higher effort for complex debugging or design.';
    badExample = 'Running a documentation, status, or formatting task with high reasoning effort by default.';
    goodExample = 'Use low reasoning effort for routine work; raise it only when the task requires non-trivial investigation or design.';
    resolutionRules = `- Use \`reasoning_effort: low\` for this kind of routine task after confirming it does not need deeper investigation.\n- Do not lower reasoning effort for complex debugging, ambiguous incidents, or architecture decisions.`;
    targetFiles = '[AGENTS.md](AGENTS.md)';
  } else if (hasManyTools) {
    problemHeadline = 'Dense Multi-Step Tool Execution Carryover';
    problemDetails = `Executed ${turn.toolCalls.length} distinct tool calls in a single conversational turn, inflating turn payload.`;
    projectedSavingsTokens = Math.round(inp * 0.6);
    recommendedAction = 'Review the proposed skill below; create it only if this workflow recurs and can be generalized safely.';
    badExample = 'Prompting multi-phase architectural chores across sequential tool calls in a single unbounded turn.';
    goodExample = 'Packaging the verification sequence into a modular `.agents/skills/verify-slice/SKILL.md` skill.';
    resolutionRules = `- Package repetitive multi-turn test/lint workflows into modular \`.agents/skills/\`.\n- Allow automatic invocation only for narrow, broadly safe skills with a clear trigger; keep broad or specialized skills explicit-only.`;
    targetFiles = 'the relevant workflow under [.agents/skills/](.agents/skills/)';
    skillProposal = buildSkillProposal(turn);
  }

  const agentPrompt = `Please inspect and resolve the token inefficiency documented in @docs/tokens-consumptions/issues/${fileName}. Verify the listed project controls first, implement only the smallest missing correction, and do not duplicate an existing rule or script.`;

  const markdownContent = `# 📋 Agent Work Order: Token Inefficiency Resolution
> **Issue ID**: \`ISSUE-TURN-${turnNum}-${sessionShort}\`  
> **Status**: \`ACTIONABLE / PENDING AGENT TAKEOVER\`  
> **Target Workspace**: \`${normalizeDir(projectPath)}\`  
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
| **Session ID** | \`${sessionId}\` | Trajectory file: \`${session?.filePath || ''}\` |
| **Thread Goal** | **${session?.threadName || 'Untitled Session'}** | User conversation topic |
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

- **Recommended Action**: ${recommendedAction}

### 🔍 User Request in this Turn:
> *${turn.userPrompt ? String(turn.userPrompt).replace(/\n/g, ' ') : 'No user prompt recorded.'}*

### 🔧 Tool Invocations Observed (${turn.toolCalls?.length || 0}):
${formatToolSummary(turn.toolCalls)}

---

## 3. Projected Impact & Waste

- **Estimated Token Waste**: **~${projectedSavingsTokens.toLocaleString()} tokens**
- **5-Hour Rate Limit Quota Reclaimed**: **~${Math.min(Math.round((projectedSavingsTokens / 250000) * 100), 75)}% of rolling budget**
- **Financial Cost Saved**: **~$${((projectedSavingsTokens / 1000000) * 2.50).toFixed(3)} / session run**

---

## 4. Autonomous Agent Step-by-Step Resolution Plan

When an agent takes over this task, execute these exact steps:

1. **Step 1: Inspect the Relevant Project Controls**:
   - Inspect ${targetFiles} using line slices.

2. **Step 2: Apply Optimization Rule**:
   - Apply the following convention only if it is not already enforced by the project:
\`\`\`markdown
${resolutionRules}
\`\`\`

3. **Step 3: Verification**:
   - Run the narrowest available validation command:
\`\`\`bash
${verificationCommand}
\`\`\`

---

${skillProposal ? `---\n\n${skillProposal}\n\n` : ''}## ${skillProposal ? '6' : '5'}. Concrete Code Examples

### ❌ Inefficient Pattern (Observed in Turn #${turnNum}):
${badExample}

### ✅ Lean & Cached Pattern (Expected Standard):
${goodExample}
`;

  fs.writeFileSync(filePath, markdownContent, 'utf8');

  // Automatically record this in guidance changelog
  const record = logGuidanceChange({
    projectPath,
    actionType: 'GENERATE_TOKEN_ISSUE',
    what: `Generated Agent Work Order for Turn #${turnNum} (${fileName})`,
    why: `Turn #${turnNum} consumed ${inp.toLocaleString()} tokens with ${fresh.toLocaleString()} fresh un-cached payload.`,
    how: `Created structured handoff document in docs/tokens-consumptions/issues/${fileName}`,
    targetFile: filePath,
    author: `Agent Token Tracker (Turn #${turnNum})`,
    diff: `+ docs/tokens-consumptions/issues/${fileName}`
  });

  return {
    success: true,
    fileName,
    filePath,
    relativePath: path.join('docs', 'tokens-consumptions', 'issues', fileName),
    content: markdownContent,
    agentPrompt,
    guidanceRecord: record,
    savings: projectedSavingsTokens
  };
}

/**
 * Generates an Agent Work Order from an Optimizer Recommendation
 */
export function generateRecommendationIssueReport({ projectPath, diagnostic, action }) {
  const targetDir = getIssueDirectory(projectPath);
  const diagId = diagnostic?.id || 'diag';
  const timeStr = Date.now().toString().slice(-6);
  const fileName = `issue-rec-${diagId}-${timeStr}.md`;
  const filePath = path.join(targetDir, fileName);

  const headline = diagnostic?.headline || 'Token Inefficiency Pattern';
  const category = diagnostic?.category || 'General Context Bloat';
  const measuredImpact = diagnostic?.measuredImpact || null;
  const targetFile = action?.targetFile || 'AGENTS.md';

  const agentPrompt = `Please resolve the optimization issue in @docs/tokens-consumptions/issues/${fileName}. Implement the required configuration changes to ${targetFile} and verify with silent test runs.`;

  const markdownContent = `# 📋 Agent Work Order: Optimization Recommendation
> **Issue ID**: \`ISSUE-REC-${diagId}-${timeStr}\`  
> **Status**: \`ACTIONABLE / PENDING AGENT TAKEOVER\`  
> **Category**: \`${category}\`  
> **Target Workspace**: \`${normalizeDir(projectPath)}\`  
> **Created Date**: ${new Date().toISOString().split('T')[0]}  

---

## 🤖 Handoff Directive for the Project AI Agent

\`\`\`markdown
${agentPrompt}
\`\`\`

---

## 1. Problem Diagnosis

### 🚨 **${headline}**
${measuredImpact?.description || diagnostic?.description || ''}

- **Observed Signal**: **${measuredImpact ? `${measuredImpact.label}: ${measuredImpact.tokens.toLocaleString()} tokens` : 'No token quantity available'}**
- **Savings Claim**: Not estimated; validate with comparable before-and-after telemetry.
- **Target File to Update**: [\`${targetFile}\`](${targetFile})
- **Recommended Action**: **${action?.title || 'Apply Optimization Fix'}**

---

## 2. Autonomous Agent Execution Plan

1. **Step 1: Inspect Target File**:
   - Inspect [${targetFile}](${targetFile}) with progressive disclosure.

2. **Step 2: Apply Resolution**:
   - Apply the following change to \`${targetFile}\`:
\`\`\`
${action?.customPayload?.ruleText || action?.diffPreview || '// Configure lean token optimization standard'}
\`\`\`

3. **Step 3: Verification**:
   - Ensure the repository builds and linters pass with minimal output.
`;

  fs.writeFileSync(filePath, markdownContent, 'utf8');

  const record = logGuidanceChange({
    projectPath,
    actionType: 'GENERATE_TOKEN_ISSUE',
    what: `Generated Agent Work Order from Recommendation (${fileName})`,
    why: headline,
    how: `Created structured handoff document in docs/tokens-consumptions/issues/${fileName}`,
    targetFile: filePath,
    author: `Guided Optimizer`,
    diff: `+ docs/tokens-consumptions/issues/${fileName}`
  });

  return {
    success: true,
    fileName,
    filePath,
    relativePath: path.join('docs', 'tokens-consumptions', 'issues', fileName),
    content: markdownContent,
    agentPrompt,
    guidanceRecord: record,
    measuredTokens: measuredImpact?.tokens ?? null
  };
}

/**
 * Lists all generated issue reports in the project with metadata
 */
export function listTokenIssues(projectPath) {
  const targetDir = getIssueDirectory(projectPath);
  if (!fs.existsSync(targetDir)) return [];

  const files = fs.readdirSync(targetDir).filter(f => f.endsWith('.md') && (f.startsWith('issue-turn-') || f.startsWith('issue-rec-')));
  return files.map(file => {
    const fullPath = path.join(targetDir, file);
    const stat = fs.statSync(fullPath);
    let title = file;
    let agentPrompt = '';
    try {
      const content = fs.readFileSync(fullPath, 'utf8');
      const titleMatch = content.match(/# (?:📋 )?(.*)/);
      if (titleMatch) title = titleMatch[1].trim();
      const promptMatch = content.match(/```markdown\n(Please inspect and resolve[\s\S]*?|Please resolve the optimization[\s\S]*?)\n```/);
      if (promptMatch) agentPrompt = promptMatch[1].trim();
    } catch {}

    return {
      fileName: file,
      filePath: fullPath,
      relativePath: path.join('docs', 'tokens-consumptions', 'issues', file),
      title,
      agentPrompt: agentPrompt || `Please resolve @docs/tokens-consumptions/issues/${file}`,
      size: stat.size,
      updatedAt: stat.mtime.toISOString()
    };
  });
}

/**
 * Reads the full content of a specific issue doc
 */
export function readTokenIssue(projectPath, fileName) {
  const targetDir = getIssueDirectory(projectPath);
  const fullPath = path.join(targetDir, fileName);
  if (!fs.existsSync(fullPath)) {
    throw new Error(`Issue document ${fileName} not found`);
  }
  return fs.readFileSync(fullPath, 'utf8');
}

/**
 * Deletes a resolved issue document
 */
export function deleteTokenIssue(projectPath, fileName) {
  const targetDir = getIssueDirectory(projectPath);
  const fullPath = path.join(targetDir, fileName);
  if (fs.existsSync(fullPath)) {
    fs.unlinkSync(fullPath);
    return true;
  }
  return false;
}

/**
 * Saves/updates edited content of a specific issue doc
 */
export function saveTokenIssue(projectPath, fileName, content) {
  const targetDir = getIssueDirectory(projectPath);
  const fullPath = path.join(targetDir, fileName);
  fs.writeFileSync(fullPath, content, 'utf8');
  return true;
}
