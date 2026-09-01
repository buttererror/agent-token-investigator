# 🧠 Mental Model & Token Economics

The **Agent Token Tracker** operates on a simple principle: **AI agent context growth is inherently quadratic ($O(N^2)$) in multi-turn conversations**, and maintaining high prompt cache hit rates is the single most effective way to preserve developer velocity and avoid rate-limit exhaustion.

---

## 1. The Physics of Agent Token Consumption

### A. The Accumulation Trap
In standard LLM conversational interactions, every turn re-submits the entire conversation history, loaded system prompt, active agent rules (`AGENTS.md`), and all tool results (terminal command outputs, file contents).

```
Turn 1: [System Rules] + [Prompt 1] ➔ [Output 1]
Turn 2: [System Rules] + [Prompt 1] + [Output 1] + [Prompt 2] ➔ [Output 2]
Turn N: [System Rules] + ∑(Previous Turns 1..N-1 Context) + [Prompt N] ➔ [Output N]
```

Without boundary control or context compaction, a single 30-turn session can consume over **1,500,000 cumulative input tokens** even if each individual prompt is only a few words.

---

## 2. Core Token Metric Taxonomy

| Metric | Representation | Economic & Performance Impact |
| :--- | :--- | :--- |
| **`In` (Total Input Tokens)** | `tokenUsage.input_tokens` | The raw payload processed by the model on that step. Accumulates quadratically across turns. |
| **`Cache` (Cached Input Tokens)** | `tokenUsage.cached_input_tokens` | Input tokens served directly from the provider's fast prompt memory cache. Billed at a **75–90% discount** with ~3x lower latency. |
| **`Think` (Reasoning Tokens)** | `tokenUsage.reasoning_output_tokens` | Internal chain-of-thought deliberation tokens. Billed at full output pricing and counted against output rate limits. |
| **`Out` (Output Tokens)** | `tokenUsage.output_tokens` | Model response tokens (markdown explanations, file diffs, tool calls). Output tokens are typically 3–4x more expensive than fresh input tokens. |

---

## 3. Four Guiding Principles for Agent Optimization

### 1. Progressive Disclosure
> *Never load what has not been explicitly requested.*
- Avoid reading entire files when only a small method needs to be modified.
- Use line-targeted slice inspection (`StartLine`/`EndLine`) and symbol-scoped searches (`grep_search`) instead of full directory dumps.

### 2. Output Scoping (Quiet Runners)
> *Passing tests should produce silence, not context noise.*
- Test runners (Vitest, Jest, PyTest) should always run with `--bail 1 --silent`.
- A passing test suite dumping 5,000 lines of green checkmarks injects 40,000 un-cached tokens that pollute every subsequent turn for the remainder of the thread.

### 3. State-Preserving Session Compaction (The 15-Turn Rule)
> *Long threads degrade model reasoning and explode costs.*
- When conversations exceed 15–20 turns, generate a structured session handoff prompt and initiate a clean thread.
- This resets the baseline context window and recovers ~85% in input token overhead.

### 4. Dynamic Reasoning Calibration
> *Do not spend high reasoning tokens on routine chores.*
- Set `reasoning_effort: low` for routine chores, refactors, and simple file edits.
- Reserve `high` reasoning only for difficult mathematical or architectural algorithms.
