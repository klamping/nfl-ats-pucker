# Roster deterioration pilot — throwaway, approved 2026-10-02

Question: does known unavailable participation, measured over the same games as prior team statistics, identify rare ATS opportunities beyond the closing spread? Include a fixed primary-source IR/return audit; do not call incomplete injury lists net roster health.

- [x] Approval: user requested running the proposed pilot through completed findings.
- [x] Freeze rules before reading joined ATS records.
- [x] Capture/verify 2013–2024 snap sources; retain existing timestamp-qualified injury sources. No 2012 (empty snaps), 2009/2025 (missing injury timestamps).
- [x] Write and run failing safety tests before implementing research functions.
- [x] Construct prior-only non-QB unavailable exposure for season-to-date and last-three games; reconstruct opponent/team statistics on identical windows.
- [x] Run fixed-rule development 2013–2018, selection 2019–2021, retrospective evaluation 2022–2024; do not reselect from evaluation.
- [x] Audit fixed 2024 cases: NO Week 4, NO Week 6, SF Week 13. These are already discussed, not pristine holdouts. Obtain dated IR/return evidence; report unknowns explicitly, don't infer from target participation.
- [x] Compare automated versus event-enriched exposure in those cases only; no cherry-picked global corrections.
- [x] Report forecast estimates, observed rates, coverage, intervals, search effects, window sensitivity and roster incompleteness.
- [x] Independent review, complete test runs, findings and reproduction report. No production edits, commits, payments, or account signup.

## Fixed measurement and rules

At closing benchmark, accept latest unambiguous explicit Out report dated within seven days and strictly before kickoff. All prior snap games must be at least two calendar dates earlier than target (availability buffer); if excluded intervening games exist, abstain rather than silently changing the stats window. Injured players missing from a complete prior snap table get zero usage; missing/malformed/duplicate tables cause abstention. Current snap counts, starters, roster statuses, scores, and eventual participation never set eligibility.

For each known-Out player, average offense and defense snap shares over the exact history window (all earlier REG games this season, or last three). Sum non-QB offensive/defensive unavailable shares separately and by units: OL, receivers/TE, RB/FB, DL, LB, secondary. One full share means one player's average unit snap participation, not points or replacement ability. Exclude a game if either team has a qualified Out QB report; other uncertain QB situations remain a limitation.

Three predetermined cohorts × two windows = **six policies**, all betting against the more affected team:

1. **Multi-unit loss:** total unavailable exposure >=2.0, at least three contributors each with >=0.30 share, at least two units with such contributors; total exposure exceeds opponent by >=1.0.
2. **OL vs pressure:** OL exposure >=1.5 and exceeds opponent OL loss by >=1.0; opponent defensive sack rate >0.07 over the same window.
3. **Secondary vs passing:** secondary exposure >=1.5 and exceeds opponent secondary loss by >=1.0; opponent passing EPA/dropback >0.10 over the same window.

If both teams meet a cohort's criteria, abstain. Unknown/unmapped Out contribution or unusable injury timing on either team causes conservative abstention for that game. These are unavailable-exposure probes, NOT verified net-loss rules: broad samples cannot reliably offset returns or include IR players missing from reports.

Selection: >=15 decisive calls **in each** of the three selection seasons, <=20% game coverage; maximize nominal Wilson lower bound, deterministic name tiebreak. If none qualify, report no selected policy. Report all six anyway; never swap winners after evaluation. Review clarified the ambiguous original wording conservatively: the first implementation used >=15 aggregate and three-season representation. That provisional winner is withdrawn, not retained by changing the protocol.

Probability diagnostic: Beta(10,10) shrink prior-seasons-only cohort cover records; require >=20 decisions across >=3 seasons; issue hypothetical picks only at estimated probability >=55% (same fixed against-affected direction), otherwise abstain. Do not equate this with calibrated 55%. Strong evidence: nominal Wilson lower bound >55% and six-rule-adjusted binomial p<0.05, with dependence and wider research-search caveats.

IR overlay: carry dated IR placement only during mandatory four-team-game ineligibility for 2024, or an explicit season-ending announcement. A return-to-practice window is NOT activation. Later eligibility/health remains unknown without corroboration. Returning-player exposure is reported separately; it is not numerically equivalent to recovered team value or automatically subtracted from injured players' usage. Do not present an unverified net statistic.
