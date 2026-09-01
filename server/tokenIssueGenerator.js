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
  if (!toolCalls || toolCalls.length === 0) return 'No tool invocations in this turn.';
  return toolCalls.map((t, i) => {
    let inputPreview = '';
    if (typeof t.input === 'string') inputPreview = t.input.substring(0, 120);
    else if (typeof t.input === 'object' && t.input) {
      inputPreview = t.input.cmd || t.input.command || t.input.AbsolutePath || JSON.stringify(t.input).substring(0, 120);
    }
    return `${i + 1}. \`${t.tool}\`: \`${inputPreview}\``;
  }).join('\n');
}

/**
 * Generates structured Markdown issue report for a specific session turn
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

  let problemHeadline = 'Uncached Context Inflation';
  let problemDetails = `Turn #${turnNum} injected ${fresh.toLocaleString()} fresh un-cached tokens into prompt history.`;
  let projectedSavingsTokens = Math.round(fresh * 0.85);
  let badExample = 'Running unconstrained file reads or full test executions without bail flags.';
  let goodExample = 'Using grep_search with StartLine/EndLine or executing test:agent with --bail 1 --silent.';

  if (hasTests) {
    problemHeadline = 'Unfiltered Test Suite Console Noise';
    problemDetails = `Executed test commands without bail or silent flags, dumping raw passing logs and stack traces (~${inp.toLocaleString()} tokens).`;
    projectedSavingsTokens = Math.round(inp * 0.95);
    badExample = '```bash\npnpm test\n# Dumps 50 passing test logs into prompt context\n```';
    goodExample = '```bash\npnpm --filter @scope test -- --bail 1 --silent\n# Halts on first error, output payload < 400 tokens\n```';
  } else if (hasFileSpike) {
    problemHeadline = 'Full-File Reading Instead of Targeted Line Slices';
    problemDetails = `Loaded entire file contents into prompt context rather than using progressive disclosure with line ranges.`;
    projectedSavingsTokens = Math.round(fresh * 0.9);
    badExample = '```bash\nview_file /path/to/LargeComponent.tsx\n# Reads all 600 lines\n```';
    goodExample = '```bash\ngrep_search query: "targetFunction" + view_file StartLine: 45 EndLine: 90\n# Reads only 45 relevant lines\n```';
  } else if (hasManyTools) {
    problemHeadline = 'Dense Multi-Step Tool Execution Carryover';
    problemDetails = `Executed ${turn.toolCalls.length} distinct tool calls in a single conversational turn, inflating turn payload.`;
    projectedSavingsTokens = Math.round(inp * 0.6);
    badExample = 'Prompting multi-phase architectural chores in a single unbounded turn.';
    goodExample = 'Packaging the multi-step verification sequence into a modular `.agents/skills/` preset.';
  }

  const markdownContent = `# Token Inefficiency Issue: Turn #${turnNum} in Session \\\`${sessionShort}\\\`

> **Issue ID**: \\\`ISSUE-TURN-${turnNum}-${sessionShort}\\\`  
> **Status**: \\\`OPEN / ACTIONABLE\\\`  
> **Target Workspace**: \\\`${normalizeDir(projectPath)}\\\`  
> **Generated Date**: ${new Date().toISOString().split('T')[0]}  

---

## 1. Session & Turn Reference

| Attribute | Value |
| :--- | :--- |
| **Session ID** | [\\\`${sessionId}\\\`](file://${session?.filePath || ''}) |
| **Thread Name** | **${session?.threadName || 'Untitled Session'}** |
| **Turn Number** | **Turn #${turnNum}** |
| **Timestamp** | \\\`${turn.startedAt || new Date().toISOString()}\\\` |
| **Total Turn Tokens** | **${total.toLocaleString()} tokens** |
| **Fresh Uncached Input** | **${fresh.toLocaleString()} tokens** |
| **Cached Input Tokens** | **${cached.toLocaleString()} tokens (${cacheHitRate}% hit rate)** |
| **Reasoning (Thinking)** | **${think.toLocaleString()} tokens** |
| **Model Output** | **${out.toLocaleString()} tokens** |

---

## 2. The Problem

### 🚨 **${problemHeadline}**
${problemDetails}

### 🔍 User Request in this Turn:
> *${turn.userPrompt ? String(turn.userPrompt).replace(/\n/g, ' ') : 'No user prompt recorded.'}*

### 🔧 Tool Invocations Observed (${turn.toolCalls?.length || 0}):
${formatToolSummary(turn.toolCalls)}

---

## 3. What Can Be Saved

- **Estimated Token Waste in this Turn**: **~${projectedSavingsTokens.toLocaleString()} tokens**
- **Projected 5-Hour Rate Limit Savings**: **~${Math.min(Math.round((projectedSavingsTokens / 250000) * 100), 75)}% of rolling quota**
- **Estimated Financial Savings**: **$${((projectedSavingsTokens / 1000000) * 2.50).toFixed(3)} per occurrence**

---

## 4. Actionable Suggestions for AI Agents

When an AI agent picks up this issue, execute the following optimization steps:

1. **Enforce Progressive Disclosure in AGENTS.md**:
   - Instruct agents to search for symbols first using grep_search or find_by_name before viewing files.
   - Always supply StartLine and EndLine when viewing files.

2. **Configure Lean Verification Scripts**:
   - Add a dedicated silent test runner script with --bail 1 and --silent flags in package.json.

3. **Bound Conversation Turns**:
   - When turn count exceeds 15 turns or fresh input exceeds 25,000 tokens, compile a structured session handoff prompt and initiate a clean thread.

---

## 5. Concrete Examples (Bad vs. Good)

### ❌ Inefficient Pattern (Observed in Turn #${turnNum}):
${badExample}

### ✅ Lean & Cached Pattern (Recommended):
${goodExample}

---

## 6. Quick Automated Resolution

To resolve this token consumption issue, apply the matching action from the **Guided Optimizer** or inject the following rule into [AGENTS.md](AGENTS.md):

\`\`\`markdown
## Token Optimization Rules
- When executing test suites, always pass \`--bail 1\` and suppress non-failing logs to keep context lean.
- Practice progressive disclosure: always inspect targeted line ranges (\`StartLine\`/\`EndLine\`) rather than reading entire files into prompt context.
\`\`\`
`;

  fs.writeFileSync(filePath, markdownContent, 'utf8');

  // Automatically record this in guidance changelog
  const record = logGuidanceChange({
    projectPath,
    actionType: 'GENERATE_TOKEN_ISSUE',
    what: `Generated token issue report for Turn #${turnNum} (${fileName})`,
    why: `Turn #${turnNum} in session ${sessionShort} consumed ${inp.toLocaleString()} tokens with ${fresh.toLocaleString()} fresh un-cached payload.`,
    how: `Created structured diagnostic report in docs/tokens-consumptions/issues/${fileName}`,
    targetFile: filePath,
    author: `Token Diagnostic Engine (Turn #${turnNum})`,
    diff: `+ docs/tokens-consumptions/issues/${fileName}`
  });

  return {
    success: true,
    fileName,
    filePath,
    relativePath: path.join('docs', 'tokens-consumptions', 'issues', fileName),
    content: markdownContent,
    guidanceRecord: record,
    savings: projectedSavingsTokens
  };
}

/**
 * Lists all generated issue reports in the project
 */
export function listTokenIssues(projectPath) {
  const targetDir = getIssueDirectory(projectPath);
  if (!fs.existsSync(targetDir)) return [];

  const files = fs.readdirSync(targetDir).filter(f => f.endsWith('.md') && f.startsWith('issue-turn-'));
  return files.map(file => {
    const fullPath = path.join(targetDir, file);
    const stat = fs.statSync(fullPath);
    return {
      fileName: file,
      filePath: fullPath,
      relativePath: path.join('docs', 'tokens-consumptions', 'issues', file),
      size: stat.size,
      updatedAt: stat.mtime.toISOString()
    };
  });
}
