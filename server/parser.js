import fs from 'fs';
import path from 'path';
import os from 'os';
import readline from 'readline';

const CODEX_DIR = path.join(os.homedir(), '.codex');
const SESSIONS_DIR = path.join(CODEX_DIR, 'sessions');
const INDEX_FILE = path.join(CODEX_DIR, 'session_index.jsonl');

/**
 * Reads session_index.jsonl to map session_id to thread_name
 */
export async function getSessionIndex() {
  const indexMap = new Map();
  if (!fs.existsSync(INDEX_FILE)) {
    return indexMap;
  }

  const fileStream = fs.createReadStream(INDEX_FILE);
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

  for await (const line of rl) {
    if (!line.trim()) continue;
    try {
      const data = JSON.parse(line);
      if (data.id) {
        indexMap.set(data.id, {
          id: data.id,
          threadName: data.thread_name || 'Untitled Thread',
          updatedAt: data.updated_at
        });
      }
    } catch (e) {
      // ignore malformed lines
    }
  }
  return indexMap;
}

/**
 * Finds all rollout jsonl files recursively
 */
export function findSessionFiles(dir = SESSIONS_DIR) {
  const results = [];
  if (!fs.existsSync(dir)) return results;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findSessionFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.jsonl') && entry.name.startsWith('rollout-')) {
      results.push(fullPath);
    }
  }
  return results;
}

/**
 * Parses a single session JSONL file with full turn-by-turn breakdown
 */
export async function parseSessionFile(filePath) {
  const fileStream = fs.createReadStream(filePath);
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

  let sessionMeta = null;
  let latestRateLimits = null;
  let latestTotalUsage = null;
  const turns = [];
  let currentTurn = null;
  let turnCounter = 0;

  for await (const line of rl) {
    if (!line.trim()) continue;
    let entry;
    try {
      entry = JSON.parse(line);
    } catch (e) {
      continue;
    }

    const { type, payload, timestamp } = entry;

    if (type === 'session_meta' && payload) {
      sessionMeta = {
        sessionId: payload.session_id || payload.id,
        id: payload.id,
        parentThreadId: payload.parent_thread_id,
        cwd: payload.cwd || '',
        model: payload.thread_settings?.model || payload.originator || 'codex',
        reasoningEffort: payload.reasoning_effort || 'default',
        timestamp: timestamp || payload.timestamp,
        git: payload.git || null
      };
    }

    if (type === 'event_msg' && payload) {
      if (payload.type === 'thread_settings_applied' && payload.thread_settings) {
        if (sessionMeta) {
          sessionMeta.model = payload.thread_settings.model || sessionMeta.model;
          sessionMeta.reasoningEffort = payload.thread_settings.reasoning_effort || sessionMeta.reasoningEffort;
        }
      }

      if (payload.type === 'task_started') {
        turnCounter++;
        currentTurn = {
          turnNumber: turnCounter,
          turnId: payload.turn_id,
          startedAt: timestamp,
          completedAt: null,
          durationMs: 0,
          userPrompt: '',
          assistantMessage: '',
          toolCalls: [],
          tokenUsage: null,
          noiseSpikes: []
        };
        turns.push(currentTurn);
      }

      if (payload.type === 'token_count') {
        if (payload.info?.total_token_usage) {
          latestTotalUsage = { ...payload.info.total_token_usage };
        }
        if (payload.rate_limits) {
          latestRateLimits = {
            ...payload.rate_limits,
            timestamp
          };
        }
        if (currentTurn && payload.info?.last_token_usage) {
          currentTurn.tokenUsage = { ...payload.info.last_token_usage };
        }
      }

      if (payload.type === 'task_complete' && currentTurn) {
        currentTurn.completedAt = timestamp;
        currentTurn.durationMs = payload.duration_ms || 0;
        if (payload.last_agent_message && !currentTurn.assistantMessage) {
          currentTurn.assistantMessage = typeof payload.last_agent_message === 'string' 
            ? payload.last_agent_message 
            : JSON.stringify(payload.last_agent_message);
        }
      }
    }

    if (type === 'response_item' && payload) {
      if (payload.type === 'message') {
        if (payload.role === 'user' && currentTurn && !currentTurn.userPrompt) {
          const texts = (payload.content || [])
            .filter(c => c.type === 'input_text')
            .map(c => c.text)
            .join('\n');
          // Truncate giant instructions header if present
          currentTurn.userPrompt = texts.length > 500 ? texts.substring(0, 500) + '...' : texts;
        }
        if (payload.role === 'assistant' && currentTurn) {
          const texts = (payload.content || [])
            .filter(c => c.type === 'output_text')
            .map(c => c.text)
            .join('\n');
          currentTurn.assistantMessage = texts;
        }
      }

      if (payload.type === 'tool_call' || payload.type === 'custom_tool_call') {
        if (currentTurn) {
          currentTurn.toolCalls.push({
            tool: payload.name || payload.tool,
            input: payload.input || payload.arguments || payload.args,
            outputTokens: payload.output_tokens || 0
          });
        }
      }
    }
  }

  // Detect noise spikes across turns
  for (const turn of turns) {
    if (turn.tokenUsage) {
      const freshInput = (turn.tokenUsage.input_tokens || 0) - (turn.tokenUsage.cached_input_tokens || 0);
      if (freshInput > 35000) {
        turn.noiseSpikes.push({
          type: 'UNCACHED_INPUT_SPIKE',
          severity: 'high',
          message: `Uncached input payload: ${freshInput.toLocaleString()} fresh tokens (Total: ${turn.tokenUsage.input_tokens.toLocaleString()})`,
          tokens: freshInput
        });
      }
      if (turn.tokenUsage.output_tokens > 4000) {
        turn.noiseSpikes.push({
          type: 'HEAVY_OUTPUT',
          severity: 'medium',
          message: `Large model output: ${turn.tokenUsage.output_tokens.toLocaleString()} tokens`,
          tokens: turn.tokenUsage.output_tokens
        });
      }
    }
  }

  const stat = fs.statSync(filePath);
  const sessionId = sessionMeta?.sessionId || path.basename(filePath).replace('.jsonl', '');

  return {
    filePath,
    fileSize: stat.size,
    sessionId,
    meta: sessionMeta || {
      sessionId,
      id: sessionId,
      cwd: '',
      model: 'codex',
      reasoningEffort: 'default',
      timestamp: stat.mtime.toISOString()
    },
    totalUsage: latestTotalUsage || {
      input_tokens: 0,
      cached_input_tokens: 0,
      output_tokens: 0,
      reasoning_output_tokens: 0,
      total_tokens: 0
    },
    rateLimits: latestRateLimits,
    turnCount: turns.length,
    turns
  };
}

/**
 * Ingests all sessions and returns structured data
 */
export async function getAllSessions() {
  const indexMap = await getSessionIndex();
  const sessionFiles = findSessionFiles();

  const sessions = [];
  for (const file of sessionFiles) {
    try {
      const session = await parseSessionFile(file);
      const indexEntry = indexMap.get(session.sessionId) || indexMap.get(session.meta.id);
      session.threadName = indexEntry?.threadName || 'Codex Task ' + session.sessionId.substring(0, 8);
      session.updatedAt = indexEntry?.updatedAt || session.meta.timestamp;
      sessions.push(session);
    } catch (e) {
      // skip unreadable files
    }
  }

  // Sort by most recent
  sessions.sort((a, b) => new Date(b.updatedAt || b.meta.timestamp) - new Date(a.updatedAt || a.meta.timestamp));
  return sessions;
}

/**
 * Returns latest rate limit snapshot and aggregate metrics
 */
export async function getOverviewMetrics() {
  const sessions = await getAllSessions();

  let totalInput = 0;
  let totalCached = 0;
  let totalOutput = 0;
  let totalReasoning = 0;
  let totalTokens = 0;
  let latestRateLimit = null;

  for (const s of sessions) {
    totalInput += s.totalUsage.input_tokens || 0;
    totalCached += s.totalUsage.cached_input_tokens || 0;
    totalOutput += s.totalUsage.output_tokens || 0;
    totalReasoning += s.totalUsage.reasoning_output_tokens || 0;
    totalTokens += s.totalUsage.total_tokens || 0;

    if (s.rateLimits && !latestRateLimit) {
      latestRateLimit = s.rateLimits;
    }
  }

  const cacheHitRate = totalInput > 0 ? (totalCached / totalInput) * 100 : 0;
  // Estimated dollars saved assuming $2.50/M input vs $1.25/M cached
  const estimatedSavingsDollars = ((totalCached / 1000000) * 1.25).toFixed(2);

  return {
    totalSessions: sessions.length,
    totalTokens,
    totalInput,
    totalCached,
    totalOutput,
    totalReasoning,
    cacheHitRate: Math.round(cacheHitRate * 10) / 10,
    estimatedSavingsDollars,
    latestRateLimit: latestRateLimit || {
      primary: { used_percent: 0, window_minutes: 300, resets_at: Date.now() / 1000 + 18000 },
      secondary: { used_percent: 0, window_minutes: 10080, resets_at: Date.now() / 1000 + 604800 },
      plan_type: 'plus'
    }
  };
}
