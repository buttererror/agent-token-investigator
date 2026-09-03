# Provider Usage Investigation: Diagnosis and Solution Direction

## Purpose

This document explains how the pacing mismatch was identified, why the original
model failed, and how the provider-grounded solution was designed. It is the
direction source for future quota attribution, recommendations, issue reports,
and frontend usability work.

The tracker remains observational. It explains recorded usage and recommends
workflow changes; it does not control, pause, or reconfigure agent tasks.

## 1. Problem signal

The investigation began with a user-visible contradiction:

- the Codex usage limit rose quickly during roughly one hour;
- the tracker described pacing as sustainable or produced an exhaustion time
  that did not reconcile with the provider meter;
- most local transcript activity appeared as cached input, which made the rapid
  provider increase look implausible.

This established two separate questions:

1. Is the tracker reading the latest provider state correctly?
2. Can local token totals be converted into provider quota consumption?

## 2. How the issue was identified

### 2.1 Trace both data paths

The investigation followed the value from ingestion to presentation:

1. `server/parser.js` reads timestamped `rate_limits` snapshots and turn token
   telemetry from session logs.
2. `server/analyzer.js` creates the pacing response.
3. `src/composables/useTokenData.js` fetches the response and filters sessions.
4. `src/components/RateLimitMeter.vue` renders provider and local values.

This exposed duplicate forecasting logic in the server and frontend, session
ordering being used as a proxy for snapshot recency, and scope differences
between the displayed meter and the fetched forecast.

### 2.2 Compare provider snapshots over time

Instead of trusting the calculated token velocity, the investigation ordered
provider snapshots by timestamp. The provider percentage rose from about 31%
to 67% while multiple sessions were active. This proved that the rapid increase
was real and that the tracker forecast—not the provider meter—was the mismatch.

### 2.3 Break local activity into token categories

Nearby turns were separated into fresh input, cached input, output, reasoning,
and observed total. Cached input dominated the transcript totals. That showed
prompt caching was working, but it did not establish that cached activity was
free or reveal the provider's private quota formula.

### 2.4 Inspect concurrency

The same interval contained overlapping sessions. A provider percentage change
is account-wide, so assigning the full delta to one turn while other sessions
were active would overstate causation. Concurrency therefore became required
context for every attribution.

## 3. Root causes in the original design

| Finding | Why it was incorrect | Design consequence |
| :--- | :--- | :--- |
| Fixed 250,000-token capacity | The provider did not expose that quota formula | Remove time-to-exhaustion and quota-reclaimed calculations |
| Transcript tokens treated as quota units | Fresh, cached, output, and reasoning tokens may be metered differently | Keep local activity separate from provider usage |
| First session snapshot treated as latest | Session ordering does not prove event recency | Select snapshots by event timestamp |
| Frontend recalculated pacing | Two implementations could disagree | Make the API the single pacing authority |
| Workspace filter omitted from pacing request | Advice and displayed sessions could represent different scopes | Apply the same agent/workspace scope end-to-end |
| Threshold warning labeled “rapid burn” | A high percentage does not prove a fast rate of change | Distinguish high usage from an observed increase |
| Issue reports predicted quota savings | No evidence linked a local optimization to an exact quota percentage | Report observed evidence and validation status only |

## 4. Solution principles

### Provider state is authoritative

Use provider `used_percent`, reset timestamps, and timestamped deltas for quota
claims. A missing or stale provider snapshot produces an unavailable state.

### Local telemetry explains activity

Use transcript tokens, tool calls, turn count, session age, and cache reuse to
describe likely contributors. Never convert these values into provider quota
without provider-supplied weighting.

### Attribution depends on concurrency

- **Isolated interval**: a provider delta can be associated directly with the
  only active session, while still retaining the provider-observed label.
- **Concurrent interval**: the delta is shared evidence. Rank nearby work as
  likely contributors without assigning each turn an invented percentage.

### Recommendations must be actionable and traceable

Each recommendation should state:

- the observed condition that triggered it;
- the affected session or turn;
- the confidence level;
- one concrete next action;
- how a later run could validate improvement.

## 5. Designed architecture

```text
Timestamped provider snapshots + transcript turns
                       |
                       v
          quotaCalculator.js enrichment
             /                     \
   provider deltas             concurrency context
             \                     /
                       v
             evidence-backed diagnosis
                       |
          +------------+-------------+
          |                          |
   dashboard/session UI       generated issue report
```

`server/quotaCalculator.js` owns turn/session deltas, reset detection, and
concurrency enrichment. `server/analyzer.js` owns diagnostic interpretation.
Issue generation records evidence and recommendations. Vue components present
the same terminology without recomputing provider usage.

## 6. Recommendation design

Recommendations are ordered by the strongest observed signal:

1. **Concurrent context-heavy sessions**: avoid starting another heavy task;
   inspect the linked overlapping sessions.
2. **Long context carryover**: create a concise handoff and continue in a fresh
   thread when earlier context is no longer required.
3. **Large fresh input**: narrow requested files and line ranges.
4. **Noisy tool or test output**: use targeted commands and quiet, bail-fast
   validation supported by the project.
5. **High routine reasoning**: use lower reasoning effort only after confirming
   the task is routine.
6. **Large output**: request focused diffs or concise results.

The UI shows accounting first and recommendations only when a threshold is
crossed. Generated issues use `observed`, `directly-attributed`, or
`likely-contributor` language as appropriate.

## 7. Implementation direction

### Completed foundation

- Timestamped provider snapshots and freshness handling.
- Provider/local telemetry separation.
- Removal of fixed quota-capacity forecasts and quota-savings claims.
- Scoped pacing requests.
- Turn/session quota delta enrichment.
- Reset and concurrency detection with unit coverage.
- Cross-thread links for investigating concurrent sessions.
- Read-only provider-usage incident generation.

### Next refinement

- Centralize recommendation thresholds and labels so home, session list, turn
  inspector, and issue reports cannot drift.
- Include tool-output byte/token evidence where the transcript provides it.
- Add comparable before/after baselines before labeling an improvement
  validated.
- Add fixtures for stale snapshots, reordered events, multiple resets, and
  partially overlapping sessions.
- Verify responsive and accessible presentation of dense attribution data.

## 8. Acceptance criteria

A provider-usage investigation is correct when:

- the newest snapshot is selected by event time;
- stale or missing snapshots are visibly unavailable;
- 5-hour and weekly deltas distinguish increases from resets/roll-off;
- isolated and concurrent intervals are labeled differently;
- local token categories reconcile with recorded turn telemetry;
- no UI or issue report invents quota capacity, exhaustion time, savings
  percentage, or per-turn provider weighting;
- every recommendation links to its evidence and offers a concrete next step;
- a recommendation is called validated only after comparable later telemetry
  demonstrates improvement.

## 9. Non-goals

- Pausing, throttling, or managing Codex tasks.
- Reverse-engineering the provider's private quota formula.
- Treating cached input as free.
- Claiming causation during concurrent activity without provider-level
  per-request attribution.
