# Provider-grounded pacing and recommendations

The tracker is read-only. Provider-reported `rate_limits` snapshots are the
authority for quota percentage and reset time. Transcript telemetry is a
separate diagnostic signal: it explains likely contributors (fresh input,
cached input, output, reasoning, tool noise, and concurrent sessions), but it
cannot prove the provider's private rolling-window accounting.

Recommendations must therefore be evidence-backed and honest:

- warn at provider usage thresholds (60% warning, 80% critical);
- identify the timestamped interval and nearby high-context turns;
- label findings as `observed` or `likely-contributor`, never as proven quota
  cost;
- recommend focused work, low reasoning for routine tasks, narrower reads,
  quieter tests, or a fresh-thread handoff;
- do not report quota reclaimed percentages or time-to-exhaustion from a
  hard-coded token capacity;
- validate an improvement only by comparing later telemetry with the prior
  baseline.

The UI must display provider usage/reset data separately from observed local
tokens per minute. Missing or stale provider snapshots produce an unavailable
state rather than a fabricated quota estimate. A provider snapshot is treated
as stale after five minutes. Recommendations include the most recent one-hour
provider percentage change, active-session count, and the largest nearby turns
as likely contributors; these are correlation evidence, not proof of quota cost.

When provider usage rises, the meter can generate a read-only Provider Usage
Incident in `docs/tokens-consumptions/issues/`. The incident records the
provider change, likely contributors, and concrete workflow recommendations;
it never controls or pauses Codex tasks.

---

## Turn & Session Quota Attribution Engine

All quota calculation and concurrency detection logic is isolated in [`server/quotaCalculator.js`](../../server/quotaCalculator.js):

1. **5-Hour & Weekly Rolling Window Deltas**:
   - **Turn Level**: Computes $\Delta 5\text{h}$ (`primaryDeltaPercent`) and $\Delta \text{Weekly}$ (`secondaryDeltaPercent`) between consecutive turns.
   - **Session Level**: Computes net start-to-end quota shift across the entire session lifecycle.
   - **Reset / Roll-Off**: Automatically identifies rolling window resets and usage roll-offs (`isReset: true`).

2. **Multi-Session Concurrency & Interactive Cross-Thread Linking**:
   - Compares turn and session execution timestamp intervals across all active threads.
   - Identifies whether a turn was `🎯 Isolated` (100% directly attributed) or executed alongside `⚠️ Concurrent Sessions`.
   - Surfaces interactive `🔗 Concurrent Session` navigation buttons in `TurnInspectorModal.vue` and `SessionList.vue` to allow immediate cross-thread inspection.
   - Fully verified with unit tests in `tests/quotaCalculator.test.js`.

