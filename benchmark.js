import { runVerificationBenchmark } from './server/benchmarkEngine.js';

const targetWorkspace = process.argv[2] || process.cwd();

console.log('\n======================================================================');
console.log('  ⚡ LIVE BENCHMARK: Sequential Tool Calls vs. Packaged Skill');
console.log(`  Testing Workspace: ${targetWorkspace}`);
console.log('======================================================================\n');

console.log('⏳ Running Option A (5 separate sequential commands)...');
console.log('⏳ Running Option B (1 packaged lean script)...\n');

const res = runVerificationBenchmark(targetWorkspace, 174500);

console.log('----------------------------------------------------------------------');
console.log('🔴 OPTION A: 5 Sequential Tool Calls');
console.log('----------------------------------------------------------------------');
res.optionA.steps.forEach((s, idx) => {
  console.log(`  Step ${idx + 1}: ${s.name.padEnd(20)} ➔ ${s.outputTokens.toLocaleString().padStart(6)} output tok (${s.durationMs}ms)`);
});
console.log(`  • API Round-Trips:      ${res.optionA.roundTrips}`);
console.log(`  • Raw Output Tokens:    ${res.optionA.totalOutputTokens.toLocaleString()}`);
console.log(`  • Total Tokens Sent:    ${res.optionA.totalCumulativeContext.toLocaleString()} tokens`);
console.log(`  • Total Execution Time: ${(res.optionA.durationMs / 1000).toFixed(2)}s`);

console.log('\n----------------------------------------------------------------------');
console.log('🟢 OPTION B: 1 Packaged Lean Skill ($verify-slice)');
console.log('----------------------------------------------------------------------');
console.log(`  Command: ${res.optionB.command}`);
console.log(`  • API Round-Trips:      ${res.optionB.roundTrips}`);
console.log(`  • Raw Output Tokens:    ${res.optionB.totalOutputTokens.toLocaleString()}`);
console.log(`  • Total Tokens Sent:    ${res.optionB.totalCumulativeContext.toLocaleString()} tokens`);
console.log(`  • Total Execution Time: ${(res.optionB.durationMs / 1000).toFixed(2)}s`);

console.log('\n======================================================================');
console.log('🏆 BENCHMARK COMPARISON VERDICT:');
console.log(`  • Tokens Saved:         🔥 ~${res.comparison.tokensSaved.toLocaleString()} tokens`);
console.log(`  • Reduction:            📉 -${res.comparison.percentageSaved}% Total Token Reduction`);
console.log(`  • Round-Trips Saved:    ⚡ ${res.comparison.roundTripsSaved} fewer API cycles`);
console.log(`  • Verdict:              ${res.comparison.verdict}`);
console.log('======================================================================\n');
