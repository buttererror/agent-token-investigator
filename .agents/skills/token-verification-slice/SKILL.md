---
name: token-verification-slice
description: Run focused, low-noise validation for Agent Token Tracker changes while preserving token-efficient investigation boundaries.
---

# Token Verification Slice

Use this skill when validating a change in `/home/ellol/apps/agent-token-tracker`.

## Workflow

1. Identify changed files with `git status --short` and inspect only relevant
   symbols or line ranges. Use `rg` before opening a file.
2. Read `package.json` scripts before choosing a command. Do not invent a test
   runner or install dependencies as part of verification.
3. Run the narrowest applicable check:
   - changed server `.js`: `node --check <file>`;
   - a configured test script: use the repository's quiet script, or pass
     `--bail 1 --silent` when that runner supports those flags;
   - frontend or cross-file changes with no test script: `pnpm build`.
4. Stop at the first failure and report the specific assertion, error, or
   command. Do not paste complete passing logs or large stack traces.
5. If pnpm is blocked by dependency approval or cache access, report that as an
   environment limitation. Do not run `pnpm approve-builds` or install packages
   without explicit user direction.

## Boundaries

- This skill validates the current change; it does not modify source files,
  package scripts, or project guidance.
- Preserve unrelated working-tree changes.
- A passing syntax check is not a substitute for a passing behavior test; state
  exactly which level of validation completed.
