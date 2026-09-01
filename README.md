# ⚡ Agent Token Tracker & Optimization Advisor

An intelligent, 100% local developer platform and CLI utility built with **Vue 3 Composition API** and **Node.js** that tracks Codex token usage, monitors real-time 5-hour and weekly rate limits, detects context bloat and tool output noise, and executes 7 high-leverage optimization actions.

---

## 🚀 Quick Start

### 1. Launch the Vue 3 Web Dashboard
```bash
cd /home/ellol/apps/agent-token-tracker
npm start
```
Then open **[http://localhost:3333](http://localhost:3333)** in your browser.

### 2. Run the Terminal CLI Report
```bash
cd /home/ellol/apps/agent-token-tracker
node cli.js
```

---

## 🌟 Key Capabilities

1. **Real-Time Rate-Limit Meter**:
   - 5-Hour rolling window usage percentage with live countdown until reset.
   - Real-time token burn velocity (tokens/min) and exhaustion forecast.

2. **Guided Optimization Advisor (What-If Simulation)**:
   - Quantified waste calculation for every detected issue (e.g. *"Heavy test dumps cost 65,000 tokens — 26% of 5-hour quota"*).
   - Multi-option action selector with the **Recommended Fix** highlighted on top.
   - 1-Click direct file application to `AGENTS.md` and `package.json` with **Instant Undo/Rollback**.

3. **Session Explorer & Turn-by-Turn Inspector**:
   - Filter and search past threads with health scores (🟢 Lean, 🟡 Bloated, 🔴 Noisy).
   - Click **Inspect** to see step-by-step turn breakdowns highlighting payload spikes and tool inputs.

4. **Pre-Flight Prompt Token Linter**:
   - Interactive scratchpad to test draft prompts for token expansion risks before sending to Codex.
   - Generates token-lean rewrites with estimated token savings.

5. **State-Preserving Session Handoff Compiler**:
   - Extracts task goals, modified files, and last decisions from bloated threads into a clean 1-paragraph prompt to resume in a fresh session saving ~85% input tokens.

6. **Educational Tooltip & Glossary System**:
   - Hoverable `ℹ️` tooltips on every metric and action.
   - Slide-out **Agent Token Guide & Glossary** drawer explaining *Cached Input*, *Reasoning Tokens*, *5-Hour Limits*, *Payload Noise*, and *Progressive Disclosure*.
