import fs from 'fs';
import path from 'path';
import os from 'os';

const BRAIN_DIR = path.join(os.homedir(), '.gemini', 'antigravity', 'brain');
const fileCache = new Map();

/**
 * Estimates token count from character and word lengths
 */
function estimateTokens(str = '') {
  if (!str) return 0;
  const len = str.length;
  const words = str.trim().split(/\s+/).length;
  return Math.max(Math.round((words * 1.3) + (len / 16)), Math.round(len / 4));
}

/**
 * Formats a clean tool argument preview
 */
function formatToolArg(input) {
  if (!input) return '';
  if (typeof input === 'string') return input.substring(0, 100);
  if (typeof input === 'object') {
    return input.cmd || input.command || input.AbsolutePath || input.Pattern || JSON.stringify(input).substring(0, 100);
  }
  return String(input).substring(0, 100);
}

/**
 * Finds all Antigravity transcript logs
 */
export function findAntigravitySessions() {
  const results = [];
  if (!fs.existsSync(BRAIN_DIR)) return results;

  try {
    const entries = fs.readdirSync(BRAIN_DIR, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory() && entry.name !== 'tempmediaStorage') {
        const logPath = path.join(BRAIN_DIR, entry.name, '.system_generated', 'logs', 'transcript.jsonl');
        if (fs.existsSync(logPath)) {
          results.push({
            sessionId: entry.name,
            logPath
          });
        }
      }
    }
  } catch (err) {
    console.error('Failed to read Antigravity brain directory:', err);
  }
  return results;
}

/**
 * Parses a single Antigravity transcript.jsonl file into normalized session format
 */
export async function parseAntigravitySessionFile(sessionId, logPath) {
  try {
    const stat = await fs.promises.stat(logPath);
    const cached = fileCache.get(logPath);
    if (cached && cached.mtimeMs === stat.mtimeMs) {
      return cached.session;
    }

    const content = await fs.promises.readFile(logPath, 'utf-8');
    const lines = content.split('\n');

    let threadName = 'Antigravity Session';
    let detectedCwd = '';
    let modelName = 'Gemini 3.7 Flash';
    let firstTimestamp = stat.birthtime?.toISOString() || new Date(stat.mtimeMs).toISOString();
    let lastTimestamp = new Date(stat.mtimeMs).toISOString();

    const rawTurns = [];
    let currentRawTurn = null;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      let step;
      try {
        step = JSON.parse(line);
      } catch (e) {
        continue;
      }

      if (step.created_at) {
        lastTimestamp = step.created_at;
      }

      if (step.type === 'USER_INPUT') {
        if (currentRawTurn) rawTurns.push(currentRawTurn);

        let userPrompt = '';
        const stepContent = step.content || '';
        const match = stepContent.match(/<USER_REQUEST>([\s\S]*?)<\/USER_REQUEST>/);
        if (match) {
          userPrompt = match[1].trim();
        } else {
          userPrompt = stepContent.replace(/<[\s\S]*?>/g, '').trim().substring(0, 160) || 'User Request';
        }

        const modelMatch = stepContent.match(/Model Selection\` from None to ([\w\s\.\(\)\-]+)\./);
        if (modelMatch) modelName = modelMatch[1].trim();

        const cwdMatch = stepContent.match(/->\s*([\/a-zA-Z0-9_\-\.]+)/);
        if (cwdMatch && !detectedCwd) detectedCwd = cwdMatch[1].trim();

        if (userPrompt && (threadName === 'Antigravity Session' || threadName === 'Untitled Session')) {
          threadName = userPrompt.split('\n')[0].substring(0, 60);
        }

        currentRawTurn = {
          turnNumber: rawTurns.length + 1,
          startedAt: step.created_at || new Date().toISOString(),
          userPrompt,
          promptChars: stepContent.length,
          toolCalls: [],
          assistantMessage: '',
          outputChars: 0,
          toolOutputChars: 0,
          noiseSpikes: []
        };
      } else if (currentRawTurn) {
        if (step.tool_calls && Array.isArray(step.tool_calls)) {
          for (const tc of step.tool_calls) {
            currentRawTurn.toolCalls.push({
              tool: tc.name,
              input: tc.args
            });

            // Extract cwd heuristics from tool args
            if (tc.args) {
              const cleanArg = (v) => typeof v === 'string' ? v.replace(/^"|"$/g, '').trim() : '';
              if (tc.args.SearchDirectory && !detectedCwd) detectedCwd = cleanArg(tc.args.SearchDirectory);
              if (tc.args.Cwd && !detectedCwd) detectedCwd = cleanArg(tc.args.Cwd);
              if (tc.args.AbsolutePath && !detectedCwd) detectedCwd = path.dirname(cleanArg(tc.args.AbsolutePath));
            }
          }
        }

        if (step.type === 'PLANNER_RESPONSE' && step.content) {
          if (!currentRawTurn.assistantMessage) {
            currentRawTurn.assistantMessage = step.content;
          }
          currentRawTurn.outputChars += step.content.length;
        } else if (step.type === 'GENERIC' && step.content) {
          currentRawTurn.toolOutputChars += step.content.length;
          // Noise spike detection on massive command/file output
          if (step.content.length > 25000) {
            currentRawTurn.noiseSpikes.push({
              type: 'LARGE_TOOL_OUTPUT',
              message: `Tool result emitted ${(step.content.length / 1000).toFixed(1)}k chars (~${estimateTokens(step.content).toLocaleString()} tokens)`
            });
          }
        }
      }
    }
    if (currentRawTurn) rawTurns.push(currentRawTurn);

    if (!detectedCwd) {
      detectedCwd = process.cwd();
    }

    // Compute cumulative token progression
    const BASE_SYSTEM_TOKENS = 6800; // Gemini Agent Instructions, Tools, Skills & Rules
    let accumulatedContextTokens = BASE_SYSTEM_TOKENS;
    let totalSessionInput = 0;
    let totalSessionCached = 0;
    let totalSessionOutput = 0;
    let totalSessionReasoning = 0;

    const turns = rawTurns.map((rt, idx) => {
      const promptTokens = estimateTokens(rt.userPrompt) + Math.round(rt.promptChars / 8);
      const toolOutputTokens = estimateTokens(rt.toolOutputChars ? ' '.repeat(rt.toolOutputChars) : '');
      const outputTokens = Math.max(estimateTokens(rt.assistantMessage) + (rt.toolCalls.length * 40), 50);
      
      const isReasoningModel = modelName.toLowerCase().includes('low') || modelName.toLowerCase().includes('medium') || modelName.toLowerCase().includes('high') || modelName.toLowerCase().includes('flash') || modelName.toLowerCase().includes('pro');
      const reasoningTokens = isReasoningModel ? Math.round(outputTokens * 1.5) : 0;

      const cachedTokens = idx === 0 ? Math.round(BASE_SYSTEM_TOKENS * 0.85) : accumulatedContextTokens;
      const freshInputTokens = promptTokens + toolOutputTokens;
      const totalInputTokens = cachedTokens + freshInputTokens;

      accumulatedContextTokens += freshInputTokens + outputTokens + reasoningTokens;

      totalSessionInput += totalInputTokens;
      totalSessionCached += cachedTokens;
      totalSessionOutput += outputTokens;
      totalSessionReasoning += reasoningTokens;

      // Spike checks
      if (freshInputTokens > 15000 && !rt.noiseSpikes.some(s => s.type === 'HEAVY_INPUT')) {
        rt.noiseSpikes.push({
          type: 'HEAVY_INPUT',
          message: `Introduced ${freshInputTokens.toLocaleString()} fresh un-cached tokens in one step.`
        });
      }

      return {
        turnNumber: rt.turnNumber,
        startedAt: rt.startedAt,
        userPrompt: rt.userPrompt,
        assistantMessage: rt.assistantMessage,
        toolCalls: rt.toolCalls,
        noiseSpikes: rt.noiseSpikes,
        durationMs: 2500,
        tokenUsage: {
          input_tokens: totalInputTokens,
          cached_input_tokens: cachedTokens,
          reasoning_output_tokens: reasoningTokens,
          output_tokens: outputTokens,
          total_tokens: totalInputTokens + outputTokens + reasoningTokens
        }
      };
    });

    const totalUsage = {
      input_tokens: totalSessionInput,
      cached_input_tokens: totalSessionCached,
      reasoning_output_tokens: totalSessionReasoning,
      output_tokens: totalSessionOutput,
      total_tokens: totalSessionInput + totalSessionOutput + totalSessionReasoning
    };

    const session = {
      sessionId,
      threadName: threadName || `Session ${sessionId.substring(0, 8)}`,
      updatedAt: lastTimestamp,
      createdAt: firstTimestamp,
      filePath: logPath,
      turnCount: turns.length,
      agentType: 'antigravity',
      agentIcon: '🌌',
      agentLabel: 'Antigravity',
      meta: {
        id: sessionId,
        sessionId,
        cwd: detectedCwd,
        model: modelName,
        agentType: 'antigravity',
        reasoningEffort: modelName.includes('Low') ? 'low' : (modelName.includes('High') ? 'high' : 'medium'),
        timestamp: lastTimestamp
      },
      latestRateLimit: {
        rollingUsage5h: 0.18, // Normal healthy baseline
        rolling5hCap: 250000,
        secondsUntil5hReset: 4200
      },
      totalUsage,
      turns
    };

    fileCache.set(logPath, { mtimeMs: stat.mtimeMs, session });
    return session;
  } catch (err) {
    console.error(`Error parsing Antigravity session ${sessionId}:`, err);
    return null;
  }
}

/**
 * Loads all Antigravity sessions
 */
export async function getAllAntigravitySessions() {
  const sessionList = findAntigravitySessions();
  const parsed = await Promise.all(
    sessionList.map(s => parseAntigravitySessionFile(s.sessionId, s.logPath))
  );
  return parsed.filter(Boolean);
}
