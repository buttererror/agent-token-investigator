import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { getAllSessions, getOverviewMetrics, parseSessionFile } from './parser.js';
import { runDiagnostics, calculatePacingForecast } from './analyzer.js';
import { applyAgentsRule, applyPackageScript, createProjectSkill, undoAction } from './actionApplier.js';
import { compileSessionHandoff } from './handoffCompiler.js';
import { lintPrompt } from './promptLinterEngine.js';
import { runVerificationBenchmark } from './benchmarkEngine.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3333;

app.use(express.json());

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
    const overview = await getOverviewMetrics();
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
    const { scope = 'all', date, sessionId, targetProjectPath = '/home/ellol/solutions/clinic-platform' } = req.query;
    const sessions = await getAllSessions();
    const overview = await getOverviewMetrics(sessions);
    const result = runDiagnostics(sessions, overview, { scope, date, sessionId }, targetProjectPath);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 5. Action 7: Pacing & burn-rate forecast
app.get('/api/pacing-forecast', async (req, res) => {
  try {
    const sessions = await getAllSessions();
    const overview = await getOverviewMetrics(sessions);
    const forecast = calculatePacingForecast(overview.latestRateLimit, sessions);
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
    const { prompt } = req.body;
    if (!prompt) {
      return res.status(400).json({ error: 'Prompt text is required' });
    }
    const result = lintPrompt(prompt);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 8. Live Verification Benchmark (Sequential vs. Skill)
app.get('/api/run-benchmark', (req, res) => {
  try {
    const { targetProjectPath = '/home/ellol/solutions/clinic-platform', contextSize = 174500 } = req.query;
    const results = runVerificationBenchmark(targetProjectPath, parseInt(contextSize, 10) || 174500);
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 9. Action 1: Apply rule to AGENTS.md
app.post('/api/apply-agents-rule', (req, res) => {
  try {
    const { targetProjectPath = '/home/ellol/solutions/clinic-platform', ruleText } = req.body;
    const result = applyAgentsRule(targetProjectPath, ruleText);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 9. Action 2: Apply script to package.json
app.post('/api/apply-package-script', (req, res) => {
  try {
    const { targetProjectPath = '/home/ellol/solutions/clinic-platform', scriptName, scriptCommand } = req.body;
    const result = applyPackageScript(targetProjectPath, scriptName, scriptCommand);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 10. Action 3: Create project skill
app.post('/api/create-skill', (req, res) => {
  try {
    const { targetProjectPath = '/home/ellol/solutions/clinic-platform', skillName, trigger, instructions } = req.body;
    const result = createProjectSkill(targetProjectPath, skillName, trigger, instructions);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 11. Undo / Rollback
app.post('/api/undo-action', (req, res) => {
  try {
    const { backupId } = req.body;
    const result = undoAction(backupId);
    res.json(result);
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
      tip: 'Package specialized workflows into `.agents/skills/` with `allow_implicit_invocation: false`.'
    }
  ]);
});

// Serve frontend dist in production
const distPath = path.join(__dirname, '..', 'dist');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  app.get('*', (req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`⚡ Agent Token Tracker API running on http://localhost:${PORT}`);
  // Background pre-warm sessions cache for instant initial page load
  getAllSessions().then(s => {
    console.log(`⚡ Pre-warmed ${s.length} sessions in cache`);
  }).catch(err => {
    console.error('Session cache warm-up error:', err.message);
  });
});
