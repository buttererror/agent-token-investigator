import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { lintPrompt } from '../server/promptLinterEngine.js';

describe('Pre-Flight Prompt Linter Engine Tests', () => {
  test('returns 100 score and low risk for empty or clean scoped prompt', () => {
    const emptyResult = lintPrompt('');
    assert.equal(emptyResult.riskLevel, 'LOW');
    assert.equal(emptyResult.riskScore, 100);
    assert.equal(emptyResult.warnings.length, 0);

    const cleanResult = lintPrompt('Inspect function validateUser in src/auth.js and fix the null check', 'codex');
    assert.equal(cleanResult.riskLevel, 'LOW');
    assert.equal(cleanResult.riskScore, 100);
    assert.equal(cleanResult.warnings.length, 0);
  });

  test('Rule 1: detects broad file exploration and rewrites with scoped directory', () => {
    const res = lintPrompt('Search all files to find where users are authenticated');
    assert.ok(res.warnings.some(w => w.type === 'BROAD_FILE_SCAN'));
    assert.ok(res.riskScore <= 70);
    assert.ok(res.optimizedPrompt.includes('relevant files'));
  });

  test('Rule 2: detects full file read requests and advises progressive disclosure', () => {
    const res = lintPrompt('Read the whole file App.vue and explain its components', 'antigravity');
    assert.ok(res.warnings.some(w => w.type === 'FULL_FILE_READ'));
    assert.ok(res.tips.some(t => t.includes('StartLine')));
  });

  test('Rule 3: detects directory tree dumps like tree and ls -R', () => {
    const res = lintPrompt('Print the directory tree of this repository');
    assert.ok(res.warnings.some(w => w.type === 'FULL_DIRECTORY_DUMP'));
    assert.ok(res.optimizedPrompt.includes('top-level'));
  });

  test('Rule 4: detects unfiltered test runs and adds bail and silent flags', () => {
    const res = lintPrompt('Run all tests and show results', 'codex');
    assert.ok(res.warnings.some(w => w.type === 'UNFILTERED_TEST_OUTPUT'));
    assert.ok(res.optimizedPrompt.includes('--bail 1'));
    assert.ok(res.optimizedPrompt.includes('--silent'));
  });

  test('Rule 5: detects unbounded git log and adds count limit', () => {
    const res = lintPrompt('Check git log for the recent release');
    assert.ok(res.warnings.some(w => w.type === 'UNBOUNDED_GIT_LOG'));
    assert.ok(res.optimizedPrompt.includes('git log -n 5 --oneline'));
  });

  test('Rule 6: detects excessive reasoning on routine chores and recommends low effort', () => {
    const res = lintPrompt('Think deeply and exhaustively to rename the variable userName to userId', 'codex');
    assert.ok(res.warnings.some(w => w.type === 'HIGH_REASONING_ROUTINE'));
    assert.ok(res.optimizedPrompt.includes('low reasoning'));
  });

  test('Rule 7: detects whole file rewrite / overwrite requests', () => {
    const res = lintPrompt('Rewrite the whole file from scratch with the new authentication flow');
    assert.ok(res.warnings.some(w => w.type === 'FULL_FILE_REWRITE'));
    assert.ok(res.optimizedPrompt.includes('surgical'));
  });

  test('Rule 8: detects multi-task sprawl and suggests single-objective focus', () => {
    const res = lintPrompt('Fix the login bug and also rewrite the navbar and also add unit tests');
    assert.ok(res.warnings.some(w => w.type === 'MULTI_TASK_SPRAWL'));
    assert.equal(res.riskLevel, 'HIGH');
  });

  test('Rule 9: detects unscoped linter runs and appends quiet flag', () => {
    const res = lintPrompt('Run eslint . across the repository');
    assert.ok(res.warnings.some(w => w.type === 'UNSCOPED_LINTER'));
    assert.ok(res.optimizedPrompt.includes('eslint --quiet'));
  });

  test('Rule 10: Antigravity-specific slash command recommendation for autonomous tasks', () => {
    const res = lintPrompt('Work overnight autonomously until it is complete', 'antigravity');
    assert.ok(res.warnings.some(w => w.type === 'ANTIGRAVITY_SLASH_COMMAND'));
    assert.ok(res.optimizedPrompt.startsWith('/goal'));
  });
});
