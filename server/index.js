import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { getAllSessions, getOverviewMetrics, getLatestRateLimitSnapshot, parseSessionFile } from './parser.js';
import { runDiagnostics, calculatePacingForecast } from './analyzer.js';
import { applyAgentsRule, applyPackageScript, createProjectSkill, undoAction } from './actionApplier.js';
import { compileSessionHandoff } from './handoffCompiler.js';
import { lintPrompt } from './promptLinterEngine.js';
import { runVerificationBenchmark } from './benchmarkEngine.js';
import { logGuidanceChange, getGuidanceRecordsForProject, getTrackedProjects } from './guidanceLogger.js';
import { generateTurnIssueReport, generateRecommendationIssueReport, generatePacingIssueReport, listTokenIssues, readTokenIssue, deleteTokenIssue, saveTokenIssue } from './tokenIssueGenerator.js';
import { addCustomProject, removeCustomProject, browseDirectory, inspectDirectory } from './customProjects.js';
import { getSessionTimestamp, getTimeRangeBoundary } from '../src/utils/timeUtils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3333;

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// CORS for Vite dev server
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// 1. Overview metrics
app.get('/api/overview', async (req, res) => {
  try {
    const { agent, workspace, timeRange } = req.query;
    let sessions = await getAllSessions();
    if (agent && agent !== 'all') {
      sessions = sessions.filter(s => (s.agentType || 'codex') === agent);
    }
    if (workspace && workspace !== 'all') {
      const target = workspace.toLowerCase().replace(/[\/\\]+$/, '');
      sessions = sessions.filter(s => {
        const cwd = (s.meta?.cwd || '').toLowerCase().replace(/[\/\\]+$/, '');
        return cwd.startsWith(target) || target.startsWith(cwd);
      });
    }
    if (timeRange && timeRange !== 'all') {
      const boundary = getTimeRangeBoundary(timeRange);
      sessions = sessions.filter(s => {
        const sTime = getSessionTimestamp(s);
        return sTime >= boundary.startTime && sTime <= boundary.endTime;
      });
    }
    const overview = await getOverviewMetrics(sessions);
    res.json(overview);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2. All sessions list
app.get('/api/sessions', async (req, res) => {
  try {
    const sessions = await getAllSessions();
    res.json(sessions);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3. Single session details
app.get('/api/sessions/:id', async (req, res) => {
  try {
    const sessions = await getAllSessions();
    const session = sessions.find(s => s.sessionId === req.params.id || s.meta.id === req.params.id);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }
    res.json(session);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 4. Guided diagnostics with What-If simulation and date/scope filtering
app.get('/api/diagnostics', async (req, res) => {
  try {
    const { date, startHour, sessionId, agent, workspace, targetProjectPath = process.cwd() } = req.query;
    const scope = req.query.scope || req.query.timeRange || 'all';
    let sessions = await getAllSessions();
    if (agent && agent !== 'all') {
      sessions = sessions.filter(s => (s.agentType || 'codex') === agent);
    }
    if (workspace && workspace !== 'all') {
      const target = workspace.toLowerCase().replace(/[\/\\]+$/, '');
      sessions = sessions.filter(s => {
        const cwd = (s.meta?.cwd || '').toLowerCase().replace(/[\/\\]+$/, '');
        return cwd.startsWith(target) || target.startsWith(cwd);
      });
    }
    const overview = await getOverviewMetrics(sessions);
    const result = runDiagnostics(sessions, overview, { scope, date, startHour, sessionId }, targetProjectPath);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// 5. Action 7: Pacing & burn-rate forecast
app.get('/api/pacing-forecast', async (req, res) => {
  try {
    const { agent, workspace } = req.query;
    let sessions = await getAllSessions();
    if (agent && agent !== 'all') {
      sessions = sessions.filter(s => (s.agentType || 'codex') === agent);
    }
    if (workspace && workspace !== 'all') {
      const target = workspace.toLowerCase().replace(/[\/\\]+$/, '');
      sessions = sessions.filter(s => {
        const cwd = (s.meta?.cwd || '').toLowerCase().replace(/[\/\\]+$/, '');
        return cwd.startsWith(target) || target.startsWith(cwd);
      });
    }
    // getOverviewMetrics supplies a Codex-shaped fallback for generic metrics.
    // Pacing must use only a provider snapshot that was actually ingested.
    const rateLimitSnapshot = getLatestRateLimitSnapshot(sessions);
    const forecast = calculatePacingForecast(rateLimitSnapshot, sessions);
    res.json(forecast);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// 6. Action 4: Session handoff compiler
app.get('/api/generate-handoff/:id', async (req, res) => {
  try {
    const sessions = await getAllSessions();
    const session = sessions.find(s => s.sessionId === req.params.id || s.meta.id === req.params.id);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }
    const handoff = compileSessionHandoff(session);
    res.json(handoff);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 7. Action 5: Prompt linter
app.post('/api/lint-prompt', (req, res) => {
  try {
    const { prompt, targetAgent = 'codex' } = req.body;
    if (!prompt) {
      return res.status(400).json({ error: 'Prompt text is required' });
    }
    const result = lintPrompt(prompt, targetAgent);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 8. Live Verification Benchmark (Sequential vs. Skill)
app.get('/api/run-benchmark', (req, res) => {
  try {
    const { targetProjectPath = process.cwd(), contextSize = 174500 } = req.query;
    const results = runVerificationBenchmark(targetProjectPath, parseInt(contextSize, 10) || 174500);
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 9. Action 1: Apply rule to AGENTS.md
app.post('/api/apply-agents-rule', (req, res) => {
  try {
    const { targetProjectPath = process.cwd(), ruleText, what, why, how, author } = req.body;
    const result = applyAgentsRule(targetProjectPath, ruleText, { what, why, how, author });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 9. Action 2: Apply script to package.json
app.post('/api/apply-package-script', (req, res) => {
  try {
    const { targetProjectPath = process.cwd(), scriptName, scriptCommand, what, why, how, author } = req.body;
    const result = applyPackageScript(targetProjectPath, scriptName, scriptCommand, { what, why, how, author });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 10. Action 3: Create project skill
app.post('/api/create-skill', (req, res) => {
  try {
    const { targetProjectPath = process.cwd(), skillName, trigger, instructions, what, why, how, author } = req.body;
    const result = createProjectSkill(targetProjectPath, skillName, trigger, instructions, { what, why, how, author });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 11. Guidance Changelog & Records API
app.get('/api/guidance-records', (req, res) => {
  try {
    const { projectPath = 'all' } = req.query;
    const records = getGuidanceRecordsForProject(projectPath);
    res.json(records);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/guidance-records', (req, res) => {
  try {
    const { projectPath, actionType = 'MANUAL_GUIDANCE_EDIT', what, why, how, targetFile, author, diff } = req.body;
    if (!what || !why || !how) {
      return res.status(400).json({ error: 'what, why, and how are required fields for guidance records' });
    }
    const record = logGuidanceChange({
      projectPath,
      actionType,
      what,
      why,
      how,
      targetFile,
      author,
      diff
    });
    res.json(record);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 12. Tracked Projects Selector API
app.get('/api/projects', async (req, res) => {
  try {
    const projects = await getTrackedProjects();
    res.json(projects);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/projects', (req, res) => {
  try {
    const { path: dirPath, name } = req.body;
    if (!dirPath) {
      return res.status(400).json({ error: 'Directory path is required' });
    }
    const project = addCustomProject(dirPath, name);
    res.json(project);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/projects', (req, res) => {
  try {
    const { path: dirPath } = req.body;
    if (!dirPath) {
      return res.status(400).json({ error: 'Directory path is required' });
    }
    const result = removeCustomProject(dirPath);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/browse-directory', (req, res) => {
  try {
    const { path: dirPath } = req.query;
    const result = browseDirectory(dirPath);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/inspect-directory', (req, res) => {
  try {
    const { path: dirPath } = req.query;
    if (!dirPath) {
      return res.status(400).json({ error: 'Directory path is required' });
    }
    const result = inspectDirectory(dirPath);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 13. Undo / Rollback
app.post('/api/undo-action', (req, res) => {
  try {
    const { backupId } = req.body;
    const result = undoAction(backupId);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 14. Token Consumption Issues Generator API
app.post('/api/generate-turn-issue', (req, res) => {
  try {
    const { projectPath, session, turn } = req.body;
    if (!session || !turn) {
      return res.status(400).json({ error: 'session and turn are required to generate issue report' });
    }
    const result = generateTurnIssueReport({ projectPath, session, turn });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/recommendations/generate-issue', (req, res) => {
  try {
    const { projectPath, diagnostic, action, mode = 'save' } = req.body;
    if (!diagnostic) {
      return res.status(400).json({ error: 'diagnostic is required to generate recommendation issue doc' });
    }
    const result = generateRecommendationIssueReport({ projectPath, diagnostic, action, mode });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/pacing/generate-issue', async (req, res) => {
  try {
    const { projectPath, agent, workspace } = req.body;
    if (!projectPath || projectPath === 'all') {
      return res.status(400).json({ error: 'Select a workspace before generating a provider usage incident.' });
    }
    let sessions = await getAllSessions();
    if (agent && agent !== 'all') sessions = sessions.filter((session) => (session.agentType || 'codex') === agent);
    if (workspace && workspace !== 'all') {
      const target = workspace.toLowerCase().replace(/[\/\\]+$/, '');
      sessions = sessions.filter((session) => {
        const cwd = (session.meta?.cwd || '').toLowerCase().replace(/[\/\\]+$/, '');
        return cwd.startsWith(target) || target.startsWith(cwd);
      });
    }
    const forecast = calculatePacingForecast(getLatestRateLimitSnapshot(sessions), sessions);
    const result = generatePacingIssueReport({ projectPath, forecast });
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/token-issues', (req, res) => {
  try {
    const { projectPath = process.cwd() } = req.query;
    const issues = listTokenIssues(projectPath);
    res.json(issues);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/token-issues/read', (req, res) => {
  try {
    const { projectPath = process.cwd(), fileName } = req.query;
    if (!fileName) return res.status(400).json({ error: 'fileName is required' });
    const content = readTokenIssue(projectPath, fileName);
    res.json({ content });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/token-issues', (req, res) => {
  try {
    const { projectPath = process.cwd(), fileName } = req.body;
    if (!fileName) return res.status(400).json({ error: 'fileName is required' });
    const success = deleteTokenIssue(projectPath, fileName);
    res.json({ success });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/token-issues/save', (req, res) => {
  try {
    const { projectPath = process.cwd(), fileName, content } = req.body;
    if (!fileName) return res.status(400).json({ error: 'fileName is required' });
    if (content === undefined) return res.status(400).json({ error: 'content is required' });
    const success = saveTokenIssue(projectPath, fileName, content);
    res.json({ success });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// 12. Educational Glossary
app.get('/api/glossary', (req, res) => {
  res.json([
    {
      term: 'Input Tokens',
      category: 'Accounting',
      description: 'The number of tokens the model reads to process your request. Includes your prompt text, active system & AGENTS.md rules, conversation history, and tool outputs.',
      whyItMatters: 'In long conversations, older history is re-sent with every message, causing input token costs to grow quadratically.',
      tip: 'Keep conversations bounded (under 20 turns) or export clean handoffs to reset input tokens.'
    },
    {
      term: 'Cached Input Tokens',
      category: 'Accounting',
      description: 'Tokens in your input prompt that OpenAI servers have previously processed and stored in fast memory cache.',
      whyItMatters: 'Cached tokens cost 50% to 80% less and process significantly faster than fresh input tokens.',
      tip: 'Keep static instructions in AGENTS.md or project-local skills with stable prefixes to maximize cache hit rates.'
    },
    {
      term: 'Reasoning Tokens',
      category: 'Accounting',
      description: 'Tokens generated internally by reasoning models (such as o3-mini or Gemini Flash 3.7) during their deliberate thinking phase before acting.',
      whyItMatters: 'Essential for hard architectural logic, but consumes heavy quota if used on simple git chores or formatting.',
      tip: 'Set reasoning_effort: low for routine chores, documentation, and small edits.'
    },
    {
      term: 'Output Tokens',
      category: 'Accounting',
      description: 'The actual response text, explanations, and code edits generated by the model for your request.',
      whyItMatters: 'Directly impacts generation latency. Clear and constrained prompts produce concise output.',
      tip: 'Ask for specific file diffs rather than full-file code dumps.'
    },
    {
      term: '5-Hour Rolling Limit',
      category: 'Rate Limits',
      description: 'The primary rate-limiting window enforced by OpenAI Codex (e.g. max token consumption within a continuous 5-hour window).',
      whyItMatters: 'Hitting 100% blocks your agent from making further queries until older usage rolls off the window.',
      tip: 'Use the Pacing Forecast in the top banner to pace subagents when approaching 80% capacity.'
    },
    {
      term: 'Payload Noise',
      category: 'Optimization',
      description: 'Unfiltered tool results (like full test suite passing logs, 50-page stack traces, or entire 1,000-line files) dumped into prompt context.',
      whyItMatters: 'A single verbose test run can dump 40,000 useless tokens into context, permanently inflating all subsequent turns in that thread.',
      tip: 'Use the `--bail 1` flag on tests and specify line ranges (`StartLine`/`EndLine`) when viewing files.'
    },
    {
      term: 'Progressive Disclosure',
      category: 'Architecture',
      description: 'An architectural pattern where only concise metadata/summaries are presented initially, with full details loaded only on explicit demand.',
      whyItMatters: 'Prevents loading every rule and document into every prompt, keeping baseline context tiny.',
      tip: 'Package specialized workflows into `.agents/skills/`; allow automatic invocation only for narrow, broadly safe skills with clear triggers.'
    }
  ]);
});

// Serve frontend dist
const distPath = path.join(__dirname, '..', 'dist');
app.use(express.static(distPath));
app.get('*', (req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`⚡ Agent Token Tracker API running on http://localhost:${PORT}`);
  // Background pre-warm sessions cache for instant initial page load
  getAllSessions().then(s => {
    console.log(`⚡ Pre-warmed ${s.length} sessions in cache`);
  }).catch(err => {
    console.error('Session cache warm-up error:', err.message);
  });
});
