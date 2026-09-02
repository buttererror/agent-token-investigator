# Agent Guide: Agent Token Tracker

This document establishes the project contract, role-specific agent guidance, recommendation reference framework, and periodic synchronization protocols for autonomous and pair-programming agents.

---

## 1. Project Contract

- **Application**: Agent Token Tracker — real-time token telemetry, rate-limit pacing, and optimization dashboard for AI agent sessions.
- **Stack**: Vue 3 (Composition API), Express backend, Vite, Node.js.
- **Key Directories**:
  - [`server/`](server/): Backend API, session parser (`parser.js`, `antigravityParser.js`), quota & concurrency engine (`quotaCalculator.js`), diagnostic engine (`analyzer.js`), action applier (`actionApplier.js`), and benchmark runner (`benchmarkEngine.js`).
  - [`tests/`](tests/): Native Node.js unit test suite (`quotaCalculator.test.js`).
  - [`src/`](src/): Vue 3 frontend components, analytics charts, and composables (`useTokenData.js`, `useActionSelector.js`, `usePromptLinter.js`).
  - [`dist/`](dist/): Production frontend build artifacts served by Express.
  - [`docs/architecture/`](docs/architecture/): Modular reference documentation and mental models:
    - [🧠 Mental Model & Token Economics](docs/architecture/mental-model.md)
    - [🤖 Multi-Agent Architecture & Ingestion](docs/architecture/multi-agent-system.md)
    - [📁 Project Discovery & Data Privacy](docs/architecture/project-discovery-and-privacy.md)
    - [⚡ Optimization Actions & Diagnostics](docs/architecture/optimization-actions-and-diagnostics.md)
    - [⚡ Provider-Grounded Pacing & Quota Engine](docs/architecture/provider-grounded-pacing.md)
    - [🔍 Roadmap: Agent Guidance Verification Layer](docs/architecture/agent-guidance-verification-plan.md)

---

## 2. Agent-Specific Guidance & Reference

Every agent operates under specialized guidance tailored to its functional role. These rules serve as the authoritative baseline for recommendation algorithms, automated diagnostics, and interactive pair programming:

### 🏛️ Architect / Planner Agent
- **Scope**: Requirements clarification, multi-step implementation planning, token budget estimation.
- **Guidance & Boundaries**:
  - Keep high-level plans concise and structured. Use Markdown links for referenced files rather than pasting full code snippets.
  - Set `reasoning_effort: low` for routine chores, refactors, and simple file edits; reserve `high` reasoning only for difficult algorithms.
  - Break work into discrete tasks (under 15 turns per thread) to prevent quadratic context cost inflation.

### 💻 Implementation / Coder Agent
- **Scope**: Writing, modifying, and refactoring source code.
- **Guidance & Boundaries**:
  - Practice **Progressive Disclosure**: Only inspect targeted code sections using line ranges (`StartLine`/`EndLine`).
  - Use precise file replacements (`replace_file_content`) instead of full file overwrites to keep output token generation tight.
  - Avoid redundant boilerplate dumps and preserve existing docstrings and comments.

### 🧪 Testing & Verification Agent
- **Scope**: Executing tests, linters, and type checkers.
- **Guidance & Boundaries**:
  - Always execute test runners with bail and silent flags (e.g. `--bail 1 --silent` or `test:agent`).
  - Suppress verbose console logs and passing test lists. Inject only the specific failing assertion and trace into context.
  - Package repetitive multi-turn test/lint workflows into modular `.agents/skills/` with `allow_implicit_invocation: false`.

### 🔍 Codebase Researcher / Explorer Agent
- **Scope**: File searches, pattern matching, dependency analysis.
- **Guidance & Boundaries**:
  - Use targeted tools (`grep_search`, `find_by_name`) with strict limits before reading files.
  - Avoid reading entire directories or large binary/lock files into context.
  - Return concise summaries to the calling planner rather than raw search dumps.

### 🤝 Handoff & Subagent Coordinator
- **Scope**: Thread management, subagent spawning, and context compaction.
- **Guidance & Boundaries**:
  - When conversations exceed 15-20 turns, generate a structured session handoff (`compileSessionHandoff`) and initiate a clean thread.
  - Isolate distinct research questions into dedicated ephemeral subagents to keep the parent context lean.

---

## 3. Recommendation Engine Reference Rules

The diagnostic engine ([`server/analyzer.js`](server/analyzer.js)) and action applier ([`server/actionApplier.js`](server/actionApplier.js)) use these guidance definitions to generate actionable recommendations:

1. **Action 1 (AGENTS Rule Injection)**: Injects durable token-saving conventions into `AGENTS.md` when repeated waste is detected across threads.
2. **Action 2 (Package Scripts)**: Adds lean test and verification scripts (e.g. `"test:agent"`) to `package.json` to prevent console noise.
3. **Action 3 (Project Skills)**: Generates progressive-disclosure skills in `.agents/skills/` to encapsulate complex workflows. Narrow, broadly safe skills with clear triggers may allow automatic invocation; broad or specialized skills remain explicit-only.
4. **Action 4 (Session Handoff)**: Compiles structured handoffs when thread length exceeds optimal cache windows.
5. **Action 5 (Prompt Linter)**: Lints prompt structures against standard anti-patterns (e.g. full-file request dumps, unconstrained outputs).
6. **Action 7 (Pacing Forecast & Quota Attribution)**: Evaluates 5-hour and weekly rolling consumption rates, computes turn/session deltas via [`server/quotaCalculator.js`](server/quotaCalculator.js), detects multi-session concurrency overlap, and surfaces interactive cross-thread links.
7. **Verification Layer (Planned Roadmap)**: Audits diagnostic recommendations and turn telemetry against active `AGENTS.md` rules and `.agents/skills/` to prevent redundant proposals and detect rule compliance drift ([Architecture Plan](docs/architecture/agent-guidance-verification-plan.md)).

---

## 4. Monthly Guidance Synchronization Protocol

> [!IMPORTANT]
> **Cadence**: This agent guidance and its underlying token baselines must be **fetched, evaluated, and refreshed every month (every 30 days)**.
> See [Agent Guidance Verification Plan](docs/architecture/agent-guidance-verification-plan.md) for the automated verification and audit specification.

### Monthly Review Checklist
- [ ] **Audit Token Baselines**: Review rolling 30-day token consumption, cache hit rate percentages, and reasoning ratios in the Token Tracker.
- [ ] **Refresh Model Guidance**: Check for updated model capabilities, pricing adjustments, or new reasoning effort configurations.
- [ ] **Validate Active Skills**: Inspect `.agents/skills/` to retire obsolete skills and optimize active skill triggers.
- [ ] **Update Package Test Scripts**: Ensure test runner flags (`--bail 1`, `--silent`, `"test:agent"`) match current test framework versions.
- [ ] **Synchronize Multi-Project Rules**: Ensure project-specific `AGENTS.md` across workspaces reflect latest best practices.

## Token Optimization Rules
- Practice progressive disclosure: always inspect targeted line ranges (`StartLine`/`EndLine`) rather than reading entire files into prompt context.
- Keep conversation turns single-objective and concise to maximize prompt cache hit rates.
