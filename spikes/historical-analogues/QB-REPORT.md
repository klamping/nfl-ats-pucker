# QB-absence ATS mechanism probe

## Bottom line

**No trustworthy, calibrated 55%+ rule established.** A small directional signal survives: betting against teams whose most recent starter is explicitly out went **10–8–1 (55.6%)** on 19 retrospective evaluation games, abstaining on **96.0%** of the 480 eligible games. Its nominal 95% Wilson interval is **33.7%–75.4%**. This is a watchlist hypothesis, not a betting recommendation or proof of an edge.

This is closer to the requested rare-event mechanism than the broad analogue models, but availability and sample size still constrain the conclusion. We did not optimize margin error.

## Sources and pregame boundary

- Captured free nflverse injury CSVs for 2009–2025 under `external/`, with URLs, row counts and SHA-256 hashes in `external/injury-capture-manifest.json`. The run verifies hashes.
- **2010–2024:** all QB rows in REG Weeks 4–14 have parseable update timestamps. **2009:** the timestamp column exists but all relevant QB timestamps are blank. **2025:** the column is absent. Both endpoint seasons contribute no qualified cases.
- Require explicit `Out`, with timezone-aware `date_modified` strictly before kickoff and within the preceding seven days. Questionable, doubtful, DNP and missing reports never establish absence. Kickoff is converted from Eastern wall time with daylight-saving rules.
- If repeated records existed, use the latest qualified pregame status; conflicting same-timestamp statuses cause abstention. The current source is generally a final report per player/week, not a full revision history.
- Identify the most recent and season-dominant QBs using earlier-calendar-date games only. No target-game starter or score determines inclusion or forecasts. “Dominant” means at least two recorded earlier season starts and at least 60% of earlier recorded starts; career experience is lower-bounded by the 2005+ local archive.
- Three games with qualifying absences on both teams are excluded by a fixed abstention rule. There are 177 single-affected-team cases across all qualified seasons, with 28 in 2022–2024; cohorts overlap.
- Join audit: all 1,869 injury keys map to eligible team/weeks; 1,432 are queried as prior-starter roles and 437 are not (e.g. backups). Of 10,542 role lookups, 8,106 have no injury record. Roles can duplicate the same QB; these counts are not unique games. Missing role records cannot distinguish absence from the source versus a player-ID mismatch, and are never presumed healthy/out.
- Closing spreads use the corrected nflverse home-handicap sign from the earlier research. This tests mispricing **at close**, not announcement-to-price movement or prices available before the news.

**Important provenance limit:** `date_modified` is a retrospectively retrieved source field, not an immutable snapshot proving exact pregame availability. These are timestamp-qualified records, not a fully certified as-of information archive. Missing reports also do not mean healthy, and injuries placed on IR may disappear from weekly reports. No confident 2025 test is reported.

### Primary-source spot checks

Chosen independently of results: the first chronological selected-policy case in each evaluation year.

| Game | Qualified absence | Public pregame corroboration |
|---|---|---|
| 2022 Week 4 NE at GB | Mac Jones | [Packers report](https://www.packers.com/news/packers-patriots-injury-report-week-4-sept-30-2022), published Sept. 30: Jones out, Hoyer expected to start |
| 2023 Week 6 NYG at BUF | Daniel Jones | [NFL report](https://www.nfl.com/news/giants-qb-daniel-jones-neck-ruled-out-vs-bills), published/updated Oct. 13: Jones ruled out |
| 2024 Week 6 TB at NO | Derek Carr | [Saints report](https://www.neworleanssaints.com/news/buccaneers-saints-friday-injury-report-2024-nfl-week-6-tampa-bay-new-orleans), published/updated Oct. 11: Carr out |

HTML and publication metadata are saved in `external/primary-source-manifest.json`. The Packers page's modification timestamp is after the game, so it corroborates the historical announcement but cannot establish every word of the present page existed pregame. These three checks are not comprehensive verification of 177 cases.

### Schedule error found and corrected only in memory

The local and current upstream schedule both incorrectly identify Phillip Walker as Carolina's QB for `2022_11_CAR_BAL`. Carolina's [pregame report](https://www.panthers.com/gameday/2022/week-11/injury-report) explicitly rules Walker out and names Baker Mayfield; its [game hub](https://www.panthers.com/gameday/2022/week-11/game-hub-web) confirms Mayfield's 21/33 passing line.

The research copies that schedule row and corrects the QB ID/name to Mayfield. It **retains the Week 11 absence case**, and fixes later prior-starter histories; neither raw data nor production is edited. After this documented correction, zero identified “Out” QBs conflict with target-game QB metadata. This narrow audit does not prove all other schedule identities are correct.

## Fixed rules, chronology, and results

Before seeing the joined outcome results, recorded six cohorts × two directions (12 policies): recent starter out; dominant starter out; experienced recent starter out (32+ prior starts); recent starter out and underdog; recent starter out and underdog by 7+; recent starter out with positive prior team passing EPA. Each bets the affected team or its opponent.

- Development: 2009–2018 (effectively 2010–2018 due to missing 2009 timestamps).
- Selection: 2019–2021. Require 15+ decisive picks, picks in all three seasons, and at most 20% game coverage; maximize Wilson lower bound.
- Retrospective evaluation: 2022–2024. Do not select again from evaluation outcomes. These archived seasons were already viewed in earlier experiments, so this is not a pristine holdout.

Only four policies met selection eligibility. Selected: **`recent_out|opponent`**.

| Period | W–L–push | ATS rate | Picks | Coverage |
|---|---:|---:|---:|---:|
| Development | 37–23–3 | 61.7% | 63 | 3.9% |
| Selection | 11–6–1 | 64.7% | 18 | 3.8% |
| Evaluation | 10–8–1 | 55.6% | 19 | 4.0% |

Evaluation by season: **2022 3–5; 2023 4–3–1; 2024 3–0.** The three 2024 wins are not sufficient evidence on their own.

For transparency, every cohort's opponent-side results follow; affected-side results reverse wins/losses and preserve pushes. These are overlapping samples, not independent replications.

| Cohort | Selection W–L–push | Evaluation W–L–push |
|---|---:|---:|
| Recent starter out | 11–6–1 | 10–8–1 |
| Dominant starter out | 14–11–1 | 13–8–2 |
| Experienced recent starter out | 6–2–0 | 5–5–1 |
| Recent starter out, underdog | 8–5–0 | 7–7–1 |
| Recent starter out, underdog 7+ | 3–3–0 | 1–4–0 |
| Recent starter out, positive passing EPA | 7–3–0 | 3–3–0 |

The dominant-starter rule's evaluation 61.9% cannot replace the originally selected policy simply because it now looks better. No eligible selection rule met the strong-55 gate. The selected policy's evaluation one-sided p-value against 55% is **0.578** (12-policy Bonferroni-adjusted: **1.0**). Search correction addresses only this declared family, not the entire evolving research program. Repeated team/QB injuries violate strict independent-game assumptions, so the intervals and tests are nominal and may overstate precision.

## Probability and abstention check

Separately tracked six fixed prior-only forecasting policies. For each cohort and target season, use previous seasons' decisive cases only, shrink with ten wins and ten losses toward 50%, and require 20+ prior decisions over at least three seasons. Pick the affected team at estimated probability >=55%, its opponent at <=45%; otherwise abstain.

| Cohort | 2022–2024 picks | W–L–push | Mean forecast on decisive picks | Observed rate |
|---|---:|---:|---:|---:|
| Recent starter out | 19 | 10–8–1 | 58.8% | 55.6% |
| Dominant starter out | 9 | 4–5–0 | 55.4% | 44.4% |
| Experienced recent starter out | 11 | 5–5–1 | 60.5% | 50.0% |
| Recent starter out, underdog | 15 | 7–7–1 | 58.3% | 50.0% |
| Recent starter out, underdog 7+ | 4 | 0–4–0 | 58.5% | 0.0% |
| Recent starter out, positive passing EPA | 4 | 1–3–0 | 56.2% | 25.0% |

These are **shrunk empirical estimates, not validated calibrated probabilities**. Some groups fail visibly despite plausible-looking estimates. Even the selected group's proximity between forecast and realization is far too imprecise to establish calibration. There is no supported high-confidence deployable policy.

## What is worth doing next

Do not keep optimizing filters on these same 19 evaluation games. The useful next step is higher-quality mechanism measurement: **confirmed replacement quality and the market's actual announcement-time line adjustment**, using dated QB announcements, prior-only player performance and timestamped odds snapshots. This can distinguish “the QB is out” from “the replacement is better/worse than the price assumes.” Without suitable odds history, start a prospective paper-trading log rather than inventing historical prices.

No new feature or production repair was made. All research remains uncommitted.

## Reproduction

```sh
OPENBLAS_NUM_THREADS=1 OMP_NUM_THREADS=1 python3 spikes/historical-analogues/qb_mechanism.py
OPENBLAS_NUM_THREADS=1 OMP_NUM_THREADS=1 python3 -m unittest discover -s spikes/historical-analogues -p 'test_*.py'
```

Generated outputs: `results/qb-summary.json`, `results/qb-cases.json`, `results/qb-prior-forecasts.json`. The main run is offline after source capture.

Independent review found a career-start window mismatch: the raw schedule extends back to 1999, but the protocol specifies 2005+. A failing regression test reproduced it; the counter now excludes pre-2005 starts. The experienced cohort's development opponent record changed from 24–12–2 to 23–12–2 and its evaluation mean forecast from 61.1% to 60.5%. The selected rule and its 10–8–1 evaluation record are unchanged. The review's join-audit and explicit 2009-warning omissions were also addressed.

Verification: **22 Python research tests** (including ten QB safety tests) and **149 existing Node tests** pass. All 17 captured injury CSV hashes and five primary-source HTML hashes match their manifests.
