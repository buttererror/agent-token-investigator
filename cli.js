#!/usr/bin/env node

import { getOverviewMetrics, getAllSessions } from './server/parser.js';
import { runDiagnostics, calculatePacingForecast } from './server/analyzer.js';

async function main() {
  console.log('\n' + '='.repeat(70));
  console.log('  ⚡ AGENT TOKEN TRACKER & OPTIMIZATION ADVISOR (CLI)');
  console.log('='.repeat(70));

  try {
    const overview = await getOverviewMetrics();
    const sessions = await getAllSessions();
    const forecast = calculatePacingForecast(overview.latestRateLimit, sessions);
    const diagnostics = runDiagnostics(sessions, overview);

    const primary = overview.latestRateLimit?.primary || {};
    const usedPercent = primary.used_percent || 0;
    const resetsInMinutes = forecast.minutesUntilReset;

    console.log('\n📊 LIVE RATE LIMIT & QUOTA STATUS:');
    console.log(`  • 5-Hour Window:  [${'█'.repeat(Math.round(usedPercent / 5))}${'░'.repeat(20 - Math.round(usedPercent / 5))}] ${usedPercent}% Used`);
    console.log(`  • Reset In:       ${resetsInMinutes} minutes`);
    console.log(`  • Burn Velocity:  ${forecast.burnRatePerMin.toLocaleString()} tokens/min`);
    console.log(`  • Pacing Advice:  ${forecast.advice}`);

    console.log('\n📈 LIFETIME / CACHE EFFICIENCY:');
    console.log(`  • Total Sessions: ${overview.totalSessions}`);
    console.log(`  • Total Tokens:   ${overview.totalTokens.toLocaleString()}`);
    console.log(`  • Cache Hit Rate: ${overview.cacheHitRate}% (Saved ~$${overview.estimatedSavingsDollars})`);
    console.log(`  • Reasoning Toks: ${overview.totalReasoning.toLocaleString()}`);

    console.log('\n🔥 TOP EXPENSIVE SESSIONS:');
    console.log('  ' + 'Thread Name'.padEnd(35) + 'Turns'.padEnd(8) + 'Total Tokens'.padEnd(16) + 'Cache Hit');
    console.log('  ' + '-'.repeat(68));
    for (const s of sessions.slice(0, 5)) {
      const name = (s.threadName.length > 32 ? s.threadName.substring(0, 32) + '...' : s.threadName).padEnd(35);
      const turns = String(s.turnCount).padEnd(8);
      const toks = (s.totalUsage.total_tokens?.toLocaleString() || '0').padEnd(16);
      const cache = (s.totalUsage.input_tokens > 0 
        ? Math.round((s.totalUsage.cached_input_tokens / s.totalUsage.input_tokens) * 100) + '%' 
        : '0%');
      console.log(`  ${name}${turns}${toks}${cache}`);
    }

    console.log('\n🎯 TOP RECOMMENDED ACTION:');
    if (diagnostics.length > 0) {
      const topDiag = diagnostics[0];
      const rec = topDiag.actions.find(a => a.isRecommended) || topDiag.actions[0];
      console.log(`  • Issue:      ${topDiag.title}`);
      console.log(`  • Waste:      ${topDiag.quantifiedWaste.description}`);
      console.log(`  • Action:     ${rec.title}`);
      console.log(`  • Impact:     ${rec.whatItAchieves}`);
    } else {
      console.log('  • All sessions are operating cleanly with minimal noise.');
    }

    console.log('\n💡 Tip: Run `npm run dev` to open the full interactive Vue 3 dashboard at http://localhost:3333');
    console.log('='.repeat(70) + '\n');
  } catch (err) {
    console.error('Error running CLI:', err.message);
  }
}

main();
