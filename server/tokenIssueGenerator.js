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

  // Identify core problem categories
  const hasTests = turn.toolCalls?.some(tc => JSON.stringify(tc || '').toLowerCase().includes('test'));
  const hasFileSpike = fresh > 25000;
  const hasHighThinking = think > 1200;
  const hasManyTools = (turn.toolCalls?.length || 0) >= 4;

  let problemHeadline = 'Uncached Context Inflation & File Noise';
  let problemDetails = `Turn #${turnNum} injected ${fresh.toLocaleString()} fresh un-cached tokens into prompt history.`;
  let projectedSavingsTokens = Math.round(fresh * 0.85);
  let recommendedAction = 'Inject progressive disclosure rules into AGENTS.md';
  let badExample = 'Running unconstrained file reads or unbounded searches without line ranges.';
  let goodExample = 'Using grep_search with StartLine/EndLine slices or targeted symbol inspection.';
  let resolutionRules = `- Practice progressive disclosure: always inspect targeted line ranges (StartLine/EndLine) rather than reading entire files into prompt context.`;

  if (hasTests) {
    problemHeadline = 'Unfiltered Test Suite Console Noise';
    problemDetails = `Executed test commands without bail or silent flags, dumping raw passing logs and stack traces (~${inp.toLocaleString()} tokens).`;
    projectedSavingsTokens = Math.round(inp * 0.95);
    recommendedAction = 'Add a quiet test runner script in package.json and instruct agent in AGENTS.md';
    badExample = '```bash\npnpm test\n# Dumps dozens of passing test logs into prompt context\n```';
    goodExample = '```bash\npnpm test -- --bail 1 --silent\n# Halts on first error, output payload < 400 tokens\n```';
    resolutionRules = `- When executing test suites, always pass \`--bail 1\` and \`--silent\` to keep context lean.\n- Add \`"test:agent": "vitest run --bail 1 --silent"\` to \`package.json\`.`;
  } else if (hasFileSpike) {
    problemHeadline = 'Full-File Reading Instead of Targeted Line Slices';
    problemDetails = `Loaded entire file contents into prompt context rather than using progressive disclosure with line ranges.`;
    projectedSavingsTokens = Math.round(fresh * 0.9);
    recommendedAction = 'Enforce progressive disclosure with StartLine/EndLine in AGENTS.md';
    badExample = '```bash\nview_file /path/to/LargeFile.js\n# Reads entire 800+ lines into context\n```';
    goodExample = '```bash\ngrep_search query: "targetSymbol" + view_file StartLine: 40 EndLine: 85\n# Reads only 45 relevant lines\n```';
    resolutionRules = `- Practice progressive disclosure: always inspect targeted line ranges (\`StartLine\`/\`EndLine\`) rather than reading entire files into prompt context.\n- Never read files over 200 lines in full when making localized edits.`;
  } else if (hasManyTools) {
    problemHeadline = 'Dense Multi-Step Tool Execution Carryover';
    problemDetails = `Executed ${turn.toolCalls.length} distinct tool calls in a single conversational turn, inflating turn payload.`;
    projectedSavingsTokens = Math.round(inp * 0.6);
    recommendedAction = 'Package multi-step verification into a reusable project skill in .agents/skills/';
    badExample = 'Prompting multi-phase architectural chores across sequential tool calls in a single unbounded turn.';
    goodExample = 'Packaging the verification sequence into a modular `.agents/skills/verify-slice/SKILL.md` skill.';
    resolutionRules = `- Package repetitive multi-turn test/lint workflows into modular \`.agents/skills/\` with \`allow_implicit_invocation: false\`.`;
  }

  const agentPrompt = `Please inspect and resolve the token inefficiency documented in @docs/tokens-consumptions/issues/${fileName}. Apply the recommended rules to AGENTS.md or package.json, verify with silent flags, and ensure all changes preserve documentation integrity.`;

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

## 5. Concrete Code Examples

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
  const savings = diagnostic?.wasteQuantification?.estimatedTokens || 25000;
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
${diagnostic?.description || ''}

- **Estimated Wasted Tokens**: **~${savings.toLocaleString()} tokens**
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
    savings
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
