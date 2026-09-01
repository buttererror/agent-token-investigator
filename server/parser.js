import fs from 'fs';
import path from 'path';
import os from 'os';
import readline from 'readline';

const CODEX_DIR = path.join(os.homedir(), '.codex');
const SESSIONS_DIR = path.join(CODEX_DIR, 'sessions');
const INDEX_FILE = path.join(CODEX_DIR, 'session_index.jsonl');

// File-level memory cache: filePath -> { mtimeMs, session }
const fileCache = new Map();
let lastIndexCache = null;
let lastIndexMtime = 0;

/**
 * Reads session_index.jsonl to map session_id to thread_name (cached by mtime)
 */
export async function getSessionIndex() {
  if (!fs.existsSync(INDEX_FILE)) {
    return new Map();
  }

  try {
    const stat = fs.statSync(INDEX_FILE);
    if (lastIndexCache && stat.mtimeMs === lastIndexMtime) {
      return lastIndexCache;
    }

    const indexMap = new Map();
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

    lastIndexCache = indexMap;
    lastIndexMtime = stat.mtimeMs;
    return indexMap;
  } catch (e) {
    return lastIndexCache || new Map();
  }
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
 * Parses a single session JSONL file with full turn-by-turn breakdown (with mtime caching)
 */
export async function parseSessionFile(filePath) {
  const stat = fs.statSync(filePath);
  const cached = fileCache.get(filePath);
  if (cached && cached.mtimeMs === stat.mtimeMs) {
    return cached.session;
  }

  const fileStream = fs.createReadStream(filePath);
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

  let sessionMeta = null;
  let latestRateLimits = null;
  let latestTotalUsage = null;
  const turns = [];
  let currentTurn = null;

  for await (const line of rl) {
    if (!line.trim()) continue;
    let entry;
    try {
      entry = JSON.parse(line);
    } catch (e) {
      continue;
    }

    const { type, payload } = entry;

    if (type === 'session_meta' && payload) {
      sessionMeta = {
        sessionId: payload.id,
        id: payload.id,
        cwd: payload.cwd || '',
        model: payload.model_provider || 'codex',
        reasoningEffort: payload.reasoning_effort || 'default',
        timestamp: payload.timestamp || entry.timestamp
      };
    }

    if (type === 'turn_context') {
      currentTurn = {
        turnNumber: turns.length + 1,
        turnId: payload?.turn_id || turns.length + 1,
        startedAt: entry.timestamp,
        userPrompt: '',
        assistantMessage: '',
        toolCalls: [],
        tokenUsage: null,
        rateLimits: null,
        noiseSpikes: []
      };
      turns.push(currentTurn);
    }

    if (type === 'event_msg' && payload) {
      if (payload.type === 'token_count') {
        const info = payload.info || {};
        if (info.total_token_usage) {
          latestTotalUsage = info.total_token_usage;
        }
        if (info.last_token_usage && currentTurn) {
          currentTurn.tokenUsage = info.last_token_usage;
        }
        if (payload.rate_limits) {
          latestRateLimits = payload.rate_limits;
          if (currentTurn) {
            currentTurn.rateLimits = payload.rate_limits;
          }
        }
      }

      if (payload.type === 'agent_state' && currentTurn) {
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

  const sessionId = sessionMeta?.sessionId || path.basename(filePath).replace('.jsonl', '');
  const parsedSession = {
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

  fileCache.set(filePath, {
    mtimeMs: stat.mtimeMs,
    session: parsedSession
  });

  return parsedSession;
}

/**
 * Ingests all sessions concurrently with fast mtime caching
 */
export async function getAllSessions() {
  const [indexMap, sessionFiles] = await Promise.all([
    getSessionIndex(),
    Promise.resolve(findSessionFiles())
  ]);

  const sessionPromises = sessionFiles.map(async (file) => {
    try {
      const session = await parseSessionFile(file);
      const indexEntry = indexMap.get(session.sessionId) || indexMap.get(session.meta.id);
      return {
        ...session,
        threadName: indexEntry?.threadName || 'Codex Task ' + session.sessionId.substring(0, 8),
        updatedAt: indexEntry?.updatedAt || session.meta.timestamp
      };
    } catch (e) {
      return null;
    }
  });

  const resolved = await Promise.all(sessionPromises);
  const sessions = resolved.filter(Boolean);

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
