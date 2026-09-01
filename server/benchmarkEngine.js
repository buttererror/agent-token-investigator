import { execSync } from 'child_process';
import path from 'path';

/**
 * Estimates tokens from raw text (using standard 1 token ≈ 4 chars / 0.75 words)
 */
export function estimateTokens(text) {
  if (!text) return 0;
  // Word & character heuristic closely matching cl100k_base
  const words = text.trim().split(/\s+/).length;
  const chars = text.length;
  return Math.max(Math.round((words * 1.3) + (chars / 16)), Math.round(chars / 4));
}

/**
 * Benchmarks Option A (5 Sequential Commands) vs Option B (1 Packaged Lean Command)
 */
export function runVerificationBenchmark(targetProjectPath = process.cwd(), contextSize = 170000) {
  const cwd = targetProjectPath;

  // --- OPTION A: 5 Sequential Separate Commands ---
  const commandsA = [
    { name: 'Full Test Suite', cmd: 'pnpm --filter admin test' },
    { name: 'Lint Check', cmd: 'pnpm --filter admin lint || true' },
    { name: 'Build Check', cmd: 'pnpm --filter admin build || true' },
    { name: 'Git Status', cmd: 'git status' },
    { name: 'Git Diff', cmd: 'git diff --stat' }
  ];

  const resultsA = [];
  let totalOutputTokensA = 0;
  const startTimeA = Date.now();

  for (const step of commandsA) {
    let output = '';
    const stepStart = Date.now();
    try {
      output = execSync(step.cmd, { cwd, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 30000 });
    } catch (err) {
      output = (err.stdout || '') + '\n' + (err.stderr || '');
    }
    const durationMs = Date.now() - stepStart;
    const tokens = estimateTokens(output);
    totalOutputTokensA += tokens;
    resultsA.push({
      name: step.name,
      cmd: step.cmd,
      outputSnippet: output.substring(0, 150),
      outputTokens: tokens,
      durationMs
    });
  }
  const totalDurationA = Date.now() - startTimeA;

  // In an agent loop, each tool call re-sends the cumulative context!
  // Turn 1 sends C, Turn 2 sends C + out1, Turn 3 sends C + out1 + out2, etc.
  let totalCumulativeContextA = 0;
  let runningOutputA = 0;
  for (const step of resultsA) {
    totalCumulativeContextA += (contextSize + runningOutputA);
    runningOutputA += step.outputTokens;
  }
  totalCumulativeContextA += (contextSize + runningOutputA); // Final response

  // --- OPTION B: 1 Packaged Lean Script ($verify-slice) ---
  const cmdB = 'pnpm --filter admin test -- --bail 1 --silent && git status --short';
  const startTimeB = Date.now();
  let outputB = '';
  try {
    outputB = execSync(cmdB, { cwd, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 30000 });
  } catch (err) {
    outputB = (err.stdout || '') + '\n' + (err.stderr || '');
  }
  const totalDurationB = Date.now() - startTimeB;
  const outputTokensB = estimateTokens(outputB);

  // Packaged skill only does 2 round-trips: Call tool (C) + Return final summary (C + output)
  const totalCumulativeContextB = (contextSize) + (contextSize + outputTokensB);

  const tokensSaved = Math.max(totalCumulativeContextA - totalCumulativeContextB, 0);
  const percentageSaved = Math.round((tokensSaved / totalCumulativeContextA) * 100);

  return {
    targetProjectPath,
    assumedContextSize: contextSize,
    optionA: {
      title: 'Option A: 5 Sequential Separate Tool Calls',
      roundTrips: commandsA.length + 1,
      totalOutputTokens: totalOutputTokensA,
      totalCumulativeContext: totalCumulativeContextA,
      durationMs: totalDurationA,
      steps: resultsA
    },
    optionB: {
      title: 'Option B: 1 Packaged Lean Skill ($verify-slice)',
      command: cmdB,
      roundTrips: 2,
      totalOutputTokens: outputTokensB,
      totalCumulativeContext: totalCumulativeContextB,
      durationMs: totalDurationB,
      outputSnippet: outputB.substring(0, 200)
    },
    comparison: {
      tokensSaved,
      percentageSaved,
      roundTripsSaved: (commandsA.length + 1) - 2,
      verdict: `Option B cuts token consumption by ${percentageSaved}% (saves ~${tokensSaved.toLocaleString()} tokens per verification cycle) while running in ${totalDurationB}ms.`
    }
  };
}
