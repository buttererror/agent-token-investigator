import fs from 'fs';
import path from 'path';
import os from 'os';
import readline from 'readline';
import { getAllAntigravitySessions } from './antigravityParser.js';
import {
  calculateTurnQuotaImpact,
  calculateSessionQuotaImpact,
  enrichSessionsWithQuota
} from './quotaCalculator.js';

const CODEX_DIR = path.join(os.homedir(), '.codex');
const SESSIONS_DIR = path.join(CODEX_DIR, 'sessions');
const INDEX_FILE = path.join(CODEX_DIR, 'session_index.jsonl');

// File-level memory cache: filePath -> { mtimeMs, session }
const fileCache = new Map();
let lastIndexCache = null;
let lastIndexMtime = 0;

let inFlightAllSessionsPromise = null;
let lastSessionsCache = null;
let lastSessionsCacheTime = 0;
const SESSIONS_CACHE_TTL_MS = 3000;

function sumTurnUsage(turns) {
  const fields = ['input_tokens', 'cached_input_tokens', 'output_tokens', 'reasoning_output_tokens', 'total_tokens'];
  const totals = Object.fromEntries(fields.map((field) => [field, 0]));
  let hasMeasuredTurnUsage = false;

  for (const turn of turns) {
    if (!turn.tokenUsage) continue;
    hasMeasuredTurnUsage = true;
    for (const field of fields) {
      totals[field] += turn.tokenUsage[field] || 0;
    }
  }

  return hasMeasuredTurnUsage ? totals : null;
}

/**
 * Reads session_index.jsonl to map session_id to thread_name (cached by mtime)
 */
export async function getSessionIndex() {
  if (!fs.existsSync(INDEX_FILE)) {
    return new Map();
  }

  try {
    const stat = await fs.promises.stat(INDEX_FILE);
    if (lastIndexCache && stat.mtimeMs === lastIndexMtime) {
      return lastIndexCache;
    }

    const indexMap = new Map();
    const content = await fs.promises.readFile(INDEX_FILE, 'utf8');
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
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
  const stat = await fs.promises.stat(filePath);
  const cached = fileCache.get(filePath);
  if (cached && cached.mtimeMs === stat.mtimeMs) {
    return cached.session;
  }

  const content = await fs.promises.readFile(filePath, 'utf8');
  const lines = content.split('\n');

  let sessionMeta = null;
  let latestRateLimits = null;
  let latestTotalUsage = null;
  const turns = [];
  let currentTurn = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
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
      const turnModel = payload?.model || payload?.collaboration_mode?.settings?.model || sessionMeta?.model || 'codex';
      currentTurn = {
        turnNumber: turns.length + 1,
        turnId: payload?.turn_id || turns.length + 1,
        startedAt: entry.timestamp,
        userPrompt: '',
        assistantMessage: '',
        toolCalls: [],
        tokenUsage: null,
        rateLimits: null,
        noiseSpikes: [],
        model: turnModel,
        agentType: 'codex',
        agentLabel: 'Codex'
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
          if (!currentTurn.tokenUsage) {
            currentTurn.tokenUsage = { ...info.last_token_usage };
          } else {
            const tokenFields = ['input_tokens', 'cached_input_tokens', 'cache_write_input_tokens', 'output_tokens', 'reasoning_output_tokens', 'total_tokens'];
            for (const field of tokenFields) {
              currentTurn.tokenUsage[field] = (currentTurn.tokenUsage[field] || 0) + (info.last_token_usage[field] || 0);
            }
          }
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

  const sessionModel = sessionMeta?.model || 'codex';
  for (const turn of turns) {
    if (!turn.model || turn.model === 'codex') {
      turn.model = sessionModel;
    }
    turn.agentType = 'codex';
    turn.agentLabel = 'Codex';
  }

  // Attach turn-level quota calculations
  const turnsWithQuota = turns.map((turn, index, arr) => {
    const prevTurn = index > 0 ? arr[index - 1] : null;
    const quotaImpact = calculateTurnQuotaImpact(turn, prevTurn, 0);
    return {
      ...turn,
      quotaImpact
    };
  });

  const sessionId = sessionMeta?.sessionId || path.basename(filePath).replace('.jsonl', '');
  // The timeline displays last_token_usage for each turn. Aggregate those same
  // measurements for the session card so its totals always reconcile with the
  // visible turns. latestTotalUsage is retained only for sessions with no
  // turn-level telemetry.
  const turnUsageTotal = sumTurnUsage(turnsWithQuota);
  const parsedSession = {
    filePath,
    fileSize: stat.size,
    sessionId,
    agentType: 'codex',
    agentIcon: '🤖',
    agentLabel: 'Codex',
    meta: {
      ...(sessionMeta || {
        sessionId,
        id: sessionId,
        cwd: '',
        model: 'codex',
        reasoningEffort: 'default',
        timestamp: stat.mtime.toISOString()
      }),
      agentType: 'codex'
    },
    totalUsage: turnUsageTotal || latestTotalUsage || {
      input_tokens: 0,
      cached_input_tokens: 0,
      output_tokens: 0,
      reasoning_output_tokens: 0,
      total_tokens: 0
    },
    rateLimits: latestRateLimits,
    quotaImpact: calculateSessionQuotaImpact({ turns: turnsWithQuota, rateLimits: latestRateLimits }),
    turnCount: turnsWithQuota.length,
    turns: turnsWithQuota
  };

  fileCache.set(filePath, {
    mtimeMs: stat.mtimeMs,
    session: parsedSession
  });

  return parsedSession;
}

/**
 * Ingests all sessions concurrently from Codex and Antigravity with fast mtime caching
 */
export async function getAllSessions(forceRefresh = false) {
  const now = Date.now();
  if (!forceRefresh && lastSessionsCache && (now - lastSessionsCacheTime < SESSIONS_CACHE_TTL_MS)) {
    return lastSessionsCache;
  }

  if (inFlightAllSessionsPromise) {
    return inFlightAllSessionsPromise;
  }

  inFlightAllSessionsPromise = (async () => {
    try {
      const [indexMap, sessionFiles, antigravitySessions] = await Promise.all([
        getSessionIndex(),
        Promise.resolve(findSessionFiles()),
        getAllAntigravitySessions().catch(() => [])
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

      const resolvedCodex = await Promise.all(sessionPromises);
      const codexSessions = resolvedCodex.filter(Boolean);

      const allSessions = [...codexSessions, ...antigravitySessions];
      allSessions.sort((a, b) => new Date(b.updatedAt || b.meta?.timestamp || 0) - new Date(a.updatedAt || a.meta?.timestamp || 0));

      const enrichedAllSessions = enrichSessionsWithQuota(allSessions);

      lastSessionsCache = enrichedAllSessions;
      lastSessionsCacheTime = Date.now();
      return enrichedAllSessions;
    } finally {
      inFlightAllSessionsPromise = null;
    }
  })();

  return inFlightAllSessionsPromise;
}

export { calculateTurnQuotaImpact, calculateSessionQuotaImpact, enrichSessionsWithQuota };

/** Return the newest provider-reported quota snapshot across all sessions. */
export function getLatestRateLimitSnapshot(sessions) {
  const turnSnapshots = (sessions || [])
    .flatMap((session) => (session.turns || [])
      .filter((turn) => turn.rateLimits && Number.isFinite(Date.parse(turn.startedAt)))
      .map((turn) => ({ snapshot: turn.rateLimits, timestamp: Date.parse(turn.startedAt) })));

  const sessionSnapshots = (sessions || [])
    .filter((session) => session.rateLimits && Number.isFinite(Date.parse(session.updatedAt || session.meta?.timestamp)))
    .map((session) => ({ snapshot: session.rateLimits, timestamp: Date.parse(session.updatedAt || session.meta?.timestamp) }));

  return [...turnSnapshots, ...sessionSnapshots]
    .sort((a, b) => b.timestamp - a.timestamp)[0] || null;
}

/**
 * Returns latest rate limit snapshot and aggregate metrics
 */
export async function getOverviewMetrics(preloadedSessions = null) {
  const sessions = preloadedSessions || await getAllSessions();

  let totalInput = 0;
  let totalCached = 0;
  let totalOutput = 0;
  let totalReasoning = 0;
  let totalTokens = 0;

  for (const s of sessions) {
    totalInput += s.totalUsage.input_tokens || 0;
    totalCached += s.totalUsage.cached_input_tokens || 0;
    totalOutput += s.totalUsage.output_tokens || 0;
    totalReasoning += s.totalUsage.reasoning_output_tokens || 0;
    totalTokens += s.totalUsage.total_tokens || 0;
  }

  const latestSnapshot = getLatestRateLimitSnapshot(sessions);

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
    latestRateLimit: latestSnapshot?.snapshot || null,
    latestRateLimitSnapshotAt: latestSnapshot?.timestamp || null
  };
}
