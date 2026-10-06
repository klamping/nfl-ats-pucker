# Roster Player Impact Design

## Goal

Extend the weekly team-context/roster report with an explainable assessment of how an officially unavailable player compares with the team’s next projected player at that position. The assessment covers every position, uses the current and preceding NFL seasons, includes EPA where player attribution is defensible, and labels position-unit evidence as a proxy where it is not.

The report is informational research context. It does not create a point-spread adjustment, pick, confidence score, ranking, or betting recommendation.

## Availability and Replacement Rules

NFL.com remains the availability authority and Ourlads remains the projected depth-chart authority. The impact service evaluates only official injury-report entries with an explicit `Out` game status. Questionable statuses, practice statuses, depth-chart changes, and the absence of an injury-report row do not establish that a player is unavailable.

For each evaluated Out player, the service resolves the player to the current team’s projected depth chart and identifies the next projected player at the same position as the primary replacement comparator. If the affected player’s slot, a unique player identity, or an available replacement cannot be established, the result is `insufficient evidence`. A proposed replacement who is also explicitly Out is skipped in favor of the next available projected player at that position; if none remains, the result is `insufficient evidence`.

Reserve-list and transaction entries remain roster context only in this release. They are not converted into a missing-player impact estimate because the current build does not establish an authoritative active/inactive event ledger.

## Data Collection and Historical Window

A dedicated nflverse player-data client downloads, strictly validates, retains, and atomically publishes the public player/play participation data needed for impact calculations. It retains immutable raw captures and publishes normalized local datasets without exposing source payloads or filesystem paths through the dashboard API.

For an upcoming or retrospective target game, all metrics use only events strictly before that game’s kickoff. The calculation window includes the target season to date plus the immediately preceding season. The current season receives greater recency weight than the preceding season. Same-day, target-game, future, and post-kickoff events are excluded. Missing, malformed, ambiguous, or incompatible data produces `insufficient evidence`; values are never filled with zero.

## Position-Aware Evidence

The service returns metric summaries with an explicit `evidenceType`:

- **Direct player evidence (QB, RB, WR, TE):** role-specific usage and efficiency, including EPA per relevant play where nflverse play attribution supports it. The report distinguishes passing, rushing, and receiving roles rather than implying that all offensive EPA belongs to one player.
- **Unit-proxy evidence (OL):** offensive EPA per play, sack/pressure outcomes when available, and rushing efficiency across games in which the player participated, alongside snap/role continuity. These are team-unit results associated with participation, not individual EPA caused by the lineman.
- **Unit-proxy evidence (DL, LB, DB):** opponent offensive EPA per play; passing and rushing EPA where applicable; sacks, takeaways, and role continuity across participation games. These are defensive-unit outcomes associated with participation, not individual defensive EPA attribution.
- **Other supported positions:** position-appropriate usage, participation, and unit outcomes with the same proxy label. A position lacking a validated metric definition abstains.

Each calculation uses recency-weighted current/previous-season summaries for both the unavailable player and the primary replacement. It also includes the relevant team-unit baseline so a reader can see whether the estimated gap occurs within an otherwise strong or weak unit.

## Impact Interpretation

The comparison service turns validated deltas, role continuity, and sample coverage into one of these descriptive verdicts:

- `material downgrade`
- `possible downgrade`
- `roughly neutral`
- `possible upgrade`
- `insufficient evidence`

Verdicts are accompanied by a confidence level driven by eligible games, plays/snaps, identity certainty, replacement continuity, and agreement among applicable metrics. The UI displays the underlying deltas and sample sizes rather than hiding them behind a single score. It does not express a numeric point value or causal certainty.

## Service and API Shape

The new roster-impact service runs during weekly dashboard generation after existing lineup context has been gathered. Work is deduplicated by team and is isolated from the normal game gather: a failure for one player, team, source, or metric cannot make an otherwise ready game or team context unavailable.

The safe API projection adds a per-team `playerImpacts` list. Each item includes:

- unavailable player, position, official status, observed time, and source label;
- projected depth role and the selected replacement;
- verdict, confidence, evidence type, and explanatory caveats;
- the two-season pre-kickoff window, player/replacement metric summaries and deltas, team-unit context, and eligible sample counts; and
- an explicit unavailable/insufficient-evidence reason where an estimate cannot be made.

It excludes raw captures, provider URLs, private errors, file paths, arbitrary payloads, betting recommendations, and point-spread adjustments.

## User Interface

The weekly dashboard extends each team’s existing expandable context with a compact **Missing-player impact** area. Each Out player shows the player-to-replacement comparison, verdict, confidence, direct-versus-proxy label, concise evidence, sample counts, and caveats. The expanded view can show position-specific metrics and the team-unit baseline.

The interface states that official availability is observed at build time, Ourlads is a projected depth chart, stats are pre-kickoff and limited to two seasons, and unit-proxy measures are associations rather than individual causal values. No impact card is rendered as a recommendation.

## Error Handling

Source, identity, depth, and metric validation fails closed. Ambiguous player names, unmatched positions, no suitable replacement, a replacement marked Out, insufficient role/sample coverage, or unavailable player data produces a visible `insufficient evidence` result with a non-sensitive reason. It does not infer health, availability, role, performance, or a numeric impact.

## Testing and Documentation

Tests use static fixtures and deterministic clocks to cover player-data parsing and publication, source and identity mapping, strict pre-kickoff filtering, two-season selection, recency weighting, direct and proxy position-family calculations, confidence thresholds, and abstentions. Service tests cover multiple absences, unavailable replacements, ambiguous matching, and per-team failure isolation. Server and client tests verify the safe API shape, accessible rendering, explanatory labels, and unavailable states.

The README documents data sources, the two-season window, status and replacement rules, direct-versus-proxy semantics, confidence limits, failure behavior, and the explicit non-predictive/non-betting scope.
