# ⚡ Optimization Actions & Diagnostic Engine

The diagnostic engine ([`server/analyzer.js`](file:///home/ellol/apps/agent-token-tracker/server/analyzer.js)) and action applier ([`server/actionApplier.js`](file:///home/ellol/apps/agent-token-tracker/server/actionApplier.js)) analyze agent trajectories to identify systemic inefficiencies and provide 1-click corrective remedies.

---

## 1. The 7 High-Leverage Optimization Actions

| Action # | Name | Target File | Impact |
| :---: | :--- | :--- | :--- |
| **Action 1** | **AGENTS.md Rule Injection** | `AGENTS.md` | Injects progressive disclosure rules, low reasoning defaults, and turn boundaries. |
| **Action 2** | **Package Quiet Script** | `package.json` | Adds `"test:agent": "... --bail=1 --silent"` to suppress noisy green assertion output. |
| **Action 3** | **Project Skill Generator** | `.agents/skills/<name>/SKILL.md` | Encapsulates complex repetitive multi-turn verification workflows into a single tool invocation. |
| **Action 4** | **State-Preserving Session Handoff** | UI Handoff Modal | Compiles thread goals, modified files, and decisions into a 1-turn prompt saving ~85% input context. |
| **Action 5** | **Pre-Flight Prompt Linter** | UI Prompt Linter | Identifies token expansion anti-patterns before sending prompts to the agent. |
| **Action 6** | **Atomic Undo / Rollback** | `.backups/` | Reverts any automated rule or script change with 1-click safety. |
| **Action 7** | **Pacing & Burn Rate Forecast** | UI Rate Limit Meter | Forecasts rolling 5-hour quota exhaustion and recommends pacing pauses. |

---

## 2. Turn Inspector & Issue Report Generator

### A. Turn Efficiency Diagnosis
In the **Turn-by-Turn Session Inspector** ([`TurnInspectorModal.vue`](file:///home/ellol/apps/agent-token-tracker/src/components/TurnInspectorModal.vue)), each interaction turn is analyzed for:
- **Payload Ratio**: Fresh vs cached tokens.
- **Noise Spikes**: Large tool results (`>25,000` chars) or un-cached input additions (`>15,000` tokens).
- **Tool Churn**: Multi-tool sequential executions.

### B. Batch Issue Post-Mortem Generator (`📑 Generate docs/ Issues`)
Clicking the header button automatically filters the session for heavy/problematic turns and writes structured Markdown post-mortem files to:
```
docs/tokens-consumptions/issues/issue-turn-<turnNumber>-<sessionIdPrefix>.md
```

Each generated issue report contains:
1. **Telemetry Snapshot**: Token breakdown (`In`, `Cache`, `Think`, `Out`), duration, and tool count.
2. **Root Cause Analysis**: Explaining why the turn became heavy (e.g. unconstrained file read, verbose test run).
3. **Prescriptive Agent Prompt**: A copy-pasteable instruction for an AI agent to fix the inefficiency following progressive disclosure principles.
