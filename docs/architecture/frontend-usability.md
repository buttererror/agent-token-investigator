# Frontend usability model

The tracker is a read-only decision aid. Its interface must make the selected
scope, provider-backed quota, observed local telemetry, and recommended next
step easy to distinguish.

## Removed controls

Projects are discovered from recorded sessions and selected from the scope
picker. The UI does not offer an add-project workflow. Recommendations are
generated from observed evidence and are not customized inline; users can
create an issue document when a recommendation needs project follow-up.

## Recommendations

The home view presents provider-backed advice first, followed by diagnostics.
Session inspection uses the same terms and gives one concise recommendation
only when a turn crosses a meaningful threshold. Recommendations are ordered
by impact and label provider quota separately from observed tokens.

## Session token accounting

Each session and turn distinguishes observed total, fresh input, cached input,
reasoning, and output. The UI shows accounting first, then efficiency guidance
only for large fresh input, large output, excessive routine reasoning, dense
tool activity, or weak cache reuse. Cached tokens are never described as free,
and observed tokens are never presented as a provider-quota conversion.

## States and accessibility

Every view names its current scope and provides distinct empty, unavailable,
and stale-data states. Dense token tables retain horizontal scrolling on small
screens. Action buttons use explicit labels and state changes remain visible
without relying on color alone.
