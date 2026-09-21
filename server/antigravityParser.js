import fs from 'fs';
import path from 'path';
import os from 'os';

const fileCache = new Map();

/**
 * Detects current runtime operating system environment (Windows, WSL, Linux, or macOS)
 */
export function detectEnvironment() {
  if (process.platform === 'win32') return 'windows';
  if (process.platform === 'linux') {
    const isWsl = (os.release && os.release().toLowerCase().includes('microsoft')) ||
      Boolean(process.env.WSL_DISTRO_NAME || process.env.WSL_INTEROP);
    if (isWsl) return 'wsl';
    try {
      if (fs.existsSync('/proc/version') && fs.readFileSync('/proc/version', 'utf8').toLowerCase().includes('microsoft')) {
        return 'wsl';
      }
    } catch {}
    return 'linux';
  }
  if (process.platform === 'darwin') return 'macos';
  return 'unknown';
}

/**
 * Dynamically resolves the Antigravity session brain directory across Windows, WSL, and Linux
 */
export function getAntigravityBrainDir() {
  if (process.env.ANTIGRAVITY_BRAIN_DIR && fs.existsSync(process.env.ANTIGRAVITY_BRAIN_DIR)) {
    return process.env.ANTIGRAVITY_BRAIN_DIR;
  }

  const env = detectEnvironment();
  const candidates = [];

  if (env === 'windows') {
    candidates.push(path.join(os.homedir(), '.gemini', 'antigravity', 'brain'));
    if (process.env.USERPROFILE) {
      candidates.push(path.join(process.env.USERPROFILE, '.gemini', 'antigravity', 'brain'));
    }
  } else if (env === 'wsl') {
    // 1. Check mounted Windows host user folders under /mnt/c/Users
    try {
      if (fs.existsSync('/mnt/c/Users')) {
        const winUsers = fs.readdirSync('/mnt/c/Users');
        for (const user of winUsers) {
          if (['Public', 'Default', 'All Users', 'Default User'].includes(user)) continue;
          candidates.push(path.join('/mnt/c/Users', user, '.gemini', 'antigravity', 'brain'));
        }
      }
    } catch {}

    // 2. Fallback to local WSL home in case Antigravity CLI ran natively in Linux
    candidates.push(path.join(os.homedir(), '.gemini', 'antigravity', 'brain'));
  } else {
    // Pure Linux or macOS
    candidates.push(path.join(os.homedir(), '.gemini', 'antigravity', 'brain'));
  }

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return path.join(os.homedir(), '.gemini', 'antigravity', 'brain');
}

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
  const brainDir = getAntigravityBrainDir();
  if (!brainDir || !fs.existsSync(brainDir)) return results;

  try {
    const entries = fs.readdirSync(brainDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory() && entry.name !== 'tempmediaStorage') {
        const logPath = path.join(brainDir, entry.name, '.system_generated', 'logs', 'transcript.jsonl');
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

        const modelMatch = stepContent.match(/Model Selection\` from (?:None|[\w\s\.\(\)\-]+) to ([\w\s\.\(\)\-]+)\./);
        if (modelMatch) modelName = modelMatch[1].trim();

        // Extract workspace from user information / workspace mapping if present
        const wsMatch = stepContent.match(/(?:format \[URI\] -> \[CorpusName\]:|active workspaces?)[^\r\n]*\r?\n\s*([^\r\n]+?)\s*->\s*([^\r\n]+)/i);
        if (wsMatch) {
          const rawUri = wsMatch[1].trim();
          const cleanUri = typeof rawUri === 'string' ? rawUri.replace(/^"|"$/g, '').trim().replace(/\\\\/g, '\\') : '';
          if (cleanUri && !cleanUri.toLowerCase().includes('.gemini') && !cleanUri.toLowerCase().includes('antigravity')) {
            detectedCwd = cleanUri;
          }
        }

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
          noiseSpikes: [],
          model: modelName
        };
      } else if (currentRawTurn) {
        if (step.tool_calls && Array.isArray(step.tool_calls)) {
          for (const tc of step.tool_calls) {
            currentRawTurn.toolCalls.push({
              tool: tc.name,
              input: tc.args
            });

            // Extract cwd heuristics from tool args (ignore internal brain/gemini paths)
            if (tc.args) {
              const cleanArg = (v) => typeof v === 'string' ? v.replace(/^"|"$/g, '').trim().replace(/\\\\/g, '\\') : '';
              const isNotInternal = (p) => {
                if (!p || p.length < 3) return false;
                const lower = p.toLowerCase();
                return !lower.includes('.gemini') && !lower.includes('antigravity');
              };

              const dirCandidates = [
                tc.args.Cwd,
                tc.args.SearchDirectory,
                tc.args.DirectoryPath,
                tc.args.SearchPath
              ];
              for (const cand of dirCandidates) {
                const cleaned = cleanArg(cand);
                if (isNotInternal(cleaned)) {
                  detectedCwd = cleaned;
                  break;
                }
              }

              if (!detectedCwd) {
                const fileCandidates = [tc.args.AbsolutePath, tc.args.TargetFile];
                for (const cand of fileCandidates) {
                  const cleaned = cleanArg(cand);
                  if (isNotInternal(cleaned)) {
                    detectedCwd = path.dirname(cleaned);
                    break;
                  }
                }
              }
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
        model: rt.model || modelName,
        agentType: 'antigravity',
        agentLabel: 'Antigravity',
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
      // Transcript logs contain activity, not provider quota snapshots. Never
      // manufacture percentages, reset times, or plan limits from estimates.
      latestRateLimit: null,
      rateLimits: null,
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
