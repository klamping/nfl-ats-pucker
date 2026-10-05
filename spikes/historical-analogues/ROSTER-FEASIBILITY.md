# Cumulative roster deterioration — data feasibility spike

Approved question: can historical pregame injury reports plus earlier-game snap counts measure how much healthier the roster behind recent team statistics was than the expected roster for the upcoming game?

Scope: source/coverage audit only; no ATS rule fitting, outcome-driven case selection, production edits, or claim of a 55% edge. Any exploratory commands and captures are throwaway research. Retain REG Weeks 4–14 for a subsequent test.

- [x] Confirm scope and approval.
- [x] Audit snap-count availability, player IDs and prior-game joins.
- [x] Audit all-position injury timestamps, explicit Out statuses and position coverage.
- [x] Check injured-reserve/return tracking and whether missing reports can establish availability.
- [x] Quantify a small cross-era sample's ID joins and outcome-blind roster-loss examples.
- [x] Report feasible measurement, blind spots, and recommendation.

## Finding: feasible in a restricted form, not a complete roster-health reconstruction

Free sources can measure **the prior playing contribution of players explicitly known to be Out before the upcoming game**. That directly addresses part of the proposed mismatch between the roster behind recent stats and the roster taking the field. It does not, by itself, establish net deterioration, replacement quality, confirmed returns, or a market pricing error.

No ATS outcomes were used to select examples or thresholds, and no ATS model or rule was tested in this feasibility check. Research captures and generated audit results are under `spikes/roster-feasibility/`; production and `data/` remain untouched.

### Available sources and actual coverage

- **Injuries:** the already-captured nflverse 2009–2025 files contain all the main position groups, not just QBs. Audited all REG Weeks 4–14 rows against schedule team/week and Eastern-to-UTC kickoff. All team/week keys joined. 2010–2024 have usable row timestamps except 20 records updated at/after kickoff and seven older than seven days; these must be excluded. 2009 timestamps are empty; 2025 lacks the column. Row timestamps are still retrospective source metadata, not immutable pregame snapshots.
- **Snap counts:** [nflreadr documents coverage from 2012](https://raw.githubusercontent.com/nflverse/nflreadr/main/R/load_snap_counts.R), but the current 2012 CSV is only a 154-byte header with zero rows. This was confirmed against the upstream release asset's size, not inferred from a parser error. Release metadata lists nonempty CSVs for 2013–2025. Actual sampled coverage was checked for 2013, 2022 and 2024; other seasons are not yet fully audited.
- **ID crosswalk:** the players file provides 22,669 unambiguous GSIS↔PFR pairs, with no ambiguous populated pairs in this capture. Only IDs are used—not current team, status, position, or experience fields. Historical injury positions and team identities come from the corresponding historical records.
- **Weekly rosters:** sampled 2012 and 2024 files include reserve/inactive/practice-squad statuses, but no observation timestamps. These are diagnostic leads, **not safe pregame availability inputs**. Missing injury reports cannot mean healthy or returned.
- **Publication lag:** snap counts are postgame data and must come only from earlier completed dates, with an appropriate availability buffer in an eventual test. Current historical files are revised datasets rather than archived as-of vintages.

Sources and SHA-256 hashes: `spikes/roster-feasibility/external/capture-manifest.json`, `supplementary-snap-manifest.json`, and `primary-source-manifest.json`. Injury hashes reference the existing capture manifest.

### Sampled joins and potential case availability

For each explicitly Out player with a qualified report timestamp, looked up snap participation in the team's three earlier-calendar-date regular-season games. No current-game participation was used. Missing player rows count as zero only when the prior team-game snap table exists and has no duplicate player keys; table existence alone is not a complete certification of its contents.

| Sample season | Injury rows mapped to PFR IDs | Qualified Out rows with all three prior team-game tables | Eligible team-game snap tables | Team-games with 2+ Out contributors across 2+ listed positions |
|---|---:|---:|---:|---:|
| 2013 | 3,197 / 3,197 | 516 / 516 | 320 / 320 | 46 |
| 2022 | 3,419 / 3,419 | 682 / 682 | 320 / 320 | 90 |
| 2024 | 3,702 / 3,703 | 691 / 691 | 320 / 320 | 87 |

“Contributor” here is a feasibility-only definition: mean offensive or defensive snap share at least 30% across those three games. Position means the source's listed position, not a harmonized unit grouping. Counts include QBs and are **not a betting selection rule**. The one unmapped 2024 injury row was Alec Anderson; it was not an eligible Out row. No duplicate player/team/game rows appeared in the sampled snap data. A few snap rows have no unambiguous GSIS mapping, so crosswalk coverage is not universally perfect.

The broad condition is not especially rare—about 14%–28% of team-games in these samples. An eventual selective test would need a predetermined definition of severe, newly worsened exposure and must also account for the opponent's injuries. These counts do not show that the team is in a bad betting spot.

Machine-readable evidence: `spikes/roster-feasibility/results/feasibility-audit.json` and `all-position-injury-audit.json`.

## Two examples that explain what the measurement must capture

### Accumulating losses: San Francisco, 2024 Week 13 at Buffalo

Selected mechanically as the 2024 team-game with the largest sum of prior mean snap shares among current qualified Out players—not selected by its result. Five relevant losses span four listed positions:

| Player | Listed position | Mean share in prior three games |
|---|---|---:|
| Aaron Banks | G | 95.3% |
| Deommodore Lenoir | CB | 97.0% |
| Trent Williams | T | 66.7% |
| Jordan Elliott | DT | 46.7% |
| Nick Bosa | DE | 42.7% |

The [Nov. 29 pregame report](https://abcnews.com/Sports/49ers-purdy-ward-expected-play-williams-bosa-ruled/story?id=116328547) corroborates all five absences: Bosa and Williams had already missed the previous game, while additional losses compounded the problem. Dre Greenlaw is also listed Out in the archive but has zero recent exposure; counting him as another fresh loss would misdescribe the mismatch with recent statistics.

**Offsetting returns matter:** that same article says Brock Purdy and Charvarius Ward were expected back. Consequently, the five losses alone do not establish the net change in team strength. The figures represent unavailable prior participation, not five equally valuable players or an additive points penalty. Snap share measures usage, not player ability or replacement drop-off.

### IR omissions and stats-window choice: Erik McCoy, New Orleans, 2024

The Saints [announced McCoy's IR placement on Sept. 25](https://www.neworleanssaints.com/news/erik-mccoy-injury-new-orleans-saints-roster-moves-announced-september-25-2024), before Week 4. The historical injury file contains **no McCoy rows in Weeks 4–6**, despite his absence. Weekly roster records show reserve status, but their timestamps do not establish when that information became known.

McCoy's earlier offensive snap shares were 100%, 90%, and 5% in Weeks 1–3, then zero in Weeks 4–5:

- Before Week 4, he represents **65% mean participation** in the three-game statistics window, yet is unavailable. A current injury-report count would miss him entirely.
- Before Week 6, his share is **39% in season-to-date history**, but only **1.7% in the last-three-game window**. His absence is largely already reflected in that shorter window. Applying the same large injury penalty again would double-count the deterioration.

This is exactly why the injury exposure must use **the same games and weights as the statistical profile being corrected**. A healthy-roster baseline and a recent-stats mismatch are different quantities.

Both articles were captured with historical publication metadata. They are current HTML, not immutable pregame snapshots; the checks corroborate examples rather than certify the entire archive.

## Recommendation for a subsequent experiment

Use a window-matched unavailable-exposure measure, separated by offense, defense, and position unit. Start with explicit timestamp-qualified Out reports; supplement consequential missing IR cases with dated transaction announcements and track return/activation events. Do not carry Out statuses forward indefinitely, infer returns from a missing report, or use eventual participation to establish availability.

For accumulating losses, track each player's exposure across earlier games: long-established absences contribute little to a recent-window mismatch, while recent losses and newly lost replacements remain visible. Any extension using a healthier baseline must remain separate so it does not double-count what recent stats already reflect.

**A restricted historical pilot is feasible. A comprehensive automated “current roster health” backtest is not yet justified.** The biggest unresolved requirement is timestamped IR/activation coverage and return confirmation. A next step should audit those events for a fixed, outcome-blind subset before declaring any team severely deteriorated, then test a few fixed rules chronologically against closing spreads. A closing-price test need not reconstruct announcement-time line movement, but would not measure the market's immediate response to news.

Maintain Weeks 4–14, frequent abstention, and the distinction between an estimated 55% probability and evidence that a filtered subgroup actually achieves it. No advantage or calibrated probability has been established by this audit.

## Verification

Verified all seven captured CSV hashes, both primary-source HTML hashes, and all 17 existing injury-file hashes. The audit checks confirmed 960/960 sampled eligible team-game snap tables, every qualified Out row joined to three prior tables, no duplicate player/team/game rows, and no injury team/week join failures. No executable implementation was added, so no new production/test-suite claim is made.
