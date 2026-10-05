# Cumulative roster deterioration pilot — completed findings

## Bottom line

**No trustworthy 55%+ ATS opportunity was established.** Six frozen unavailable-participation rules were evaluated over REG Weeks 4–14. The two reasonably populated multi-unit rules achieved about 51% in 2022–2024; the position/opponent interaction rules were too rare for meaningful inference. No rule qualified for protocol selection, and all prior-only 55% probability diagnostics abstained.

The hypothesis remains mechanically plausible: accumulated injuries can make a team's statistical profile describe players who will not be available. But **measuring that mismatch did not establish that closing spreads underprice it**. This is a negative/underpowered pilot, not a refutation of every injury-based strategy.

## Frozen experiment

Protocol: `PILOT-PROTOCOL.md`, written before joining rule eligibility to ATS outcomes. Capture and safety tests preceded the implementation. The six rules are three cohorts × two windows:

- Multi-unit: >=2.0 summed non-QB unavailable snap shares, >=3 contributors each with mean share >=0.30, >=2 affected position units, and >=1.0 more loss than the opponent.
- OL versus pressure: >=1.5 OL shares unavailable, >=1.0 more OL loss than opponent, opponent defensive sack rate >7%.
- Secondary versus passing: >=1.5 secondary shares unavailable, >=1.0 more secondary loss than opponent, opponent passing EPA/dropback >0.10.

Always pick **against** the affected team; abstain if both sides qualify. A share is average historical participation, not player quality, points, or replacement drop-off. Known-Out QBs on either side cause abstention, keeping this separate from the paused replacement-QB research.

For each window, injury usage and opponent/team statistical means use **identical prior game IDs and equal game weights**: season-to-date or last three. Inputs exclude the target game, future games, same-day games, and prior games less than two calendar dates earlier. Missing schedule/postgame matches, malformed snap tables, unmapped relevant Out players, and unusable report timing cause abstention rather than fabricated health. Latest unambiguous timestamp-qualified explicit Out reports define unavailable players. Missing individual reports do not prove health.

Development 2013–2018: 961 games. Selection 2019–2021: 480. Retrospective evaluation 2022–2024: 480. These evaluation years had already been inspected during earlier research; they are not pristine untouched holdouts and cannot substitute for prospective confirmation.

Source checks found 6,270 prior snap team-game tables across 2013–2024, two failing broad content checks. The ID crosswalk contains 22,669 unambiguous pairs. There are 30 problematic report-row encounters across target teams (including invalid timestamps/conflicts); four team/window history lookups were unavailable. 477/480 evaluation games had usable basic features in each window, with 38 additional games encountering an explicit QB-Out exclusion. These are coverage checks, not proof of complete injury/IR reporting.

## Results against closing spreads

Home closing handicap is `-spread_line`; home ATS residual is home margin plus that handicap. Pushes are excluded from accuracy and binomial evidence, but included in pick coverage. Nominal Wilson intervals assume independent decisions, which repeated team/injury episodes do not fully satisfy.

| Rule | Development W–L–P | Selection W–L–P | Evaluation W–L–P | Evaluation accuracy | Picks / 480 | Nominal 95% interval |
|---|---:|---:|---:|---:|---:|---:|
| Season / multi-unit | 33–26–4 | 20–17–0 | **27–26–1** | **50.9%** | 54 (11.3%) | 37.9%–63.9% |
| Last three / multi-unit | 17–17–0 | 12–13–0 | **19–18–0** | **51.4%** | 37 (7.7%) | 35.9%–66.6% |
| Season / OL-pressure | 3–0–0 | 1–0–0 | 0–2–0 | 0% | 2 (0.4%) | 0%–65.8% |
| Last three / OL-pressure | 1–0–0 | 1–1–0 | 2–1–0 | 66.7% | 3 (0.6%) | 20.8%–93.9% |
| Season / secondary-passing | 4–1–0 | 0–1–0 | 1–1–0 | 50% | 2 (0.4%) | 9.5%–90.5% |
| Last three / secondary-passing | 1–0–0 | 1–0–0 | 0–1–0 | 0% | 1 (0.2%) | 0%–79.3% |

The 2–1 result is three games, not a usable high-confidence edge. None passes either the nominal lower-bound-above-55% criterion or the full strong-55 gate with six-rule search correction. That correction does not encompass the larger preceding research program or dependence.

The multi-unit results were unstable by year:

- Season: 2022 **11–14–1**, 2023 **5–5**, 2024 **11–7**.
- Last three: 2022 **6–10**, 2023 **6–3**, 2024 **7–5**.

An additional declared descriptive check limited already-issued picks to affected teams with positive prior mean point differential—the “good stats, compromised roster” scenario. Season-window performance was **8–9**, last-three **7–7**. It did not rescue the hypothesis. This is a conditional performance subset, not an independently selected policy or a measured opportunity-coverage rate.

### Selection correction and probability diagnostic

The protocol originally said “>=15 decisive calls in all three selection seasons.” First code interpreted this as >=15 total plus all three seasons represented, provisionally selecting season/multi-unit. Review identified the ambiguity. We retained the stricter literal requirement: **>=15 in each season**. Its counts were 13, 16 and 8; last-three counts were 6, 12 and 7. **No policy qualifies.** The provisional selection claim is withdrawn; the raw evaluation records above remain unchanged. This conservative clarification is documented rather than silently rewriting selection after seeing outcomes.

Prior-only forecast diagnostics use Beta(10,10) shrinkage on earlier seasons, require >=20 decisions across >=3 seasons, and only issue a hypothetical call at estimated cover probability >=55%. **All six abstained on every evaluation game.** For season/multi-unit, prior probabilities entering 2022, 2023 and 2024 were 54.3%, 52.5% and 52.3%; last-three/multi-unit had 49.4%, 47.4% and 49.0%. A sparse OL rule briefly exceeded 55% numerically but had only four/five prior decisions and failed the sample gate. These cohort estimates are not independently validated calibration; with no gated picks there is no realized 55%-forecast performance to certify.

## Dated IR and return audit: fixed cases, not cherry-picked global repairs

Three cases were fixed before this run: NO Week 4, NO Week 6, SF Week 13 of 2024. They were already discussed in the feasibility study. Dated club reports verify IR placement/season-ending losses and expected returns. Current HTML publication metadata is corroboration, **not an immutable pregame archive**.

The partial overlay adds McCoy and Dalman only within their mandatory four-team-game IR absence; Hargrave and Aiyuk use explicit season-ending announcements. It does not indefinitely carry Out statuses forward, treat a practice window as activation, infer availability from current participation, or score the three illustrations as an event-enriched ATS strategy. Other reserve/return cases remain unknown; no comprehensive net roster state is claimed.

### Saints at Falcons, Week 4

- Archive-only total unavailable exposure: NO **1.807**, ATL **0.750**.
- Adding dated IR placements for **Erik McCoy** and **Drew Dalman**: NO **2.457**, ATL **1.520**.
- McCoy adds 0.650 mean offensive share; Dalman adds 0.770. Considering only New Orleans' missing IR player would misleadingly exaggerate the relative injury mismatch.
- Neither version meets the complete frozen rules. Taysom Hill's Friday report has full practice/no game designation following an absence; that is a possible offset, not a guaranteed full snap contribution.

### Buccaneers at Saints, Week 6

- NO archive-only exposure: **2.322 season**, **1.830 last three**.
- With McCoy: **2.712 season**, **1.847 last three**. His loss contributes 0.390 season-to-date but only 0.017 recently, illustrating how repeated absences are already incorporated in recent statistics.
- TB also has substantial known unavailable exposure: **2.164 season**, **2.200 last three**. Lucas Patrick is questionable, not an explicit-Out contributor; questionable players are not assumed absent.
- Derek Carr is explicitly Out, so this case **must abstain** in both versions. Kendre Miller's practice/return status does not establish available contribution. No replacement-QB quality experiment was resumed.

### 49ers at Bills, Week 13

- SF archive-only exposure: **3.954 season**, **3.483 last three**; BUF **0.571 season**, **0.343 last three**.
- Adding **Brandon Aiyuk and Javon Hargrave** raises SF season exposure to **4.612**, but last-three exposure remains **3.483**: neither participated in those three games. Counting them as fresh recent-stat losses would double-count weakness already visible in the stats.
- The multi-unit rule flags SF under either partial version. That is an eligibility illustration, not evidence from one game's outcome.
- **Charvarius Ward** was expected back after missing all three recent games; **Brock Purdy** was expected back after missing one but remained questionable. These positive changes are invisible to an Out-only count. Returns are listed separately; no unjustified arithmetic subtraction of QB/CB value from offensive-line/DL losses is performed.

Exact shares, game IDs, event states, source files, and expected-return uncertainty are in `results/fixed-case-overlay.json`; the case outputs contain no target outcomes. The three cases are a **partial event audit**, not a proof that all significant IR players or opponent returns were captured.

## Interpretation and stopping decision

1. **Use window-matched injury context to interpret stats.** The case audit supports that measurement principle, including accumulated loss of replacements, already-established absences, and opposing-team injuries.
2. **Do not deploy these rules as betting signals or advertise calibrated 55% confidence.** The populated probes are approximately coin-flip ATS, and the narrower interactions are underpowered.
3. **Do not tune thresholds against these evaluation years until something looks good.** That would change the question into retrospective search. The pilot stops with its negative findings.
4. **A future net-deterioration study needs a better event ledger**, tracking dated IR/PUP/activation/personal absences and credible return availability for both teams, plus prior-only replacement quality. That is a materially different experiment, not a hidden completion of this one. Any promising revised rule needs new/prospective confirmation.

Additional limits: equal game weights may not match every production profile; snap share is usage rather than talent; report positions occasionally differ from actual roles (Ruiz is listed C in one report but still maps to OL); questionable/limited players and in-game injuries are unmodeled; closing line timestamps and news ordering are not reconstructed. The test asks whether these fixed inputs beat the closing number, not how quickly bookmakers react to news.

## Reproduce and verification

Run offline after capture, from repository root:

```sh
OPENBLAS_NUM_THREADS=1 OMP_NUM_THREADS=1 python3 spikes/roster-feasibility/pilot.py
OPENBLAS_NUM_THREADS=1 python3 spikes/roster-feasibility/case_overlay.py
OPENBLAS_NUM_THREADS=1 python3 -m unittest discover -s spikes/roster-feasibility -p 'test_*.py'
OPENBLAS_NUM_THREADS=1 OMP_NUM_THREADS=1 python3 -m unittest discover -s spikes/historical-analogues -p 'test_*.py'
npm test
```

Verified **12 pilot tests**, **22 existing research tests**, and **149 Node tests**, all passing. Historical safety coverage includes latest-report conflicts, strict pregame time, future exclusion, schedule/postgame reconciliation, exact exposure windows, unmapped/table abstention, QB exclusion, opponent interaction, IR carry expiration and activation, shrinkage, and per-season selection minimum. Source hashes are checked at load; captures/manifests remain under the throwaway spike.

Independent review reproduced historical results and identified three issues: selection wording/implementation mismatch, misleading conditional-subset coverage, and missing schedule reconciliation. All were corrected with results regenerated; per-policy evaluation records were unchanged. An overlay UTC-date rollover failure was also caught and corrected to use Eastern target dates plus exact-history assertions.

Follow-up independent review reproduced the fixed-case overlay, verified event provenance, preserved QB exclusions and separate returns, and found no remaining important issues. Partial event coverage remains a limitation, not a verified complete roster reconstruction.

No production files or original source data were changed. All research remains uncommitted; no paid API, account creation, commit, push, or merge.
