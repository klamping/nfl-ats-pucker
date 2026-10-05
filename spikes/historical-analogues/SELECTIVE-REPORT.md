# Can we identify rare, trustworthy 55%+ ATS opportunities?

## Answer

**Not demonstrated by this probe. Allowing frequent abstention produces attractive historical outliers, but we did not find a reliably calibrated or independently replicated 55%+ cover rule.** This is not proof that no edge exists. It is evidence against treating a large historical split or a raw model probability as sufficient confidence.

The strongest candidate picked only about one game in ten in the selection period and went **32–14 (69.6%)**. The same decision rule then went **13–20 (39.4%)**, picking fewer than one in fourteen evaluation games. Abstention alone did not make its probabilities trustworthy.

The market is not simply an average of team statistics. Closing spreads also reflect expected lineups, injuries, opponent strength, venue, schedule, informed wagering, and other information not necessarily present in this archive. A statistical outlier can therefore reflect **information omitted from our model**, rather than information omitted from the market.

## What we investigated

Only regular-season Weeks 4–14; corrected raw-source home handicaps. Production and source data were not changed.

We generated **2,558 non-pick'em evaluation games across 2010–2025**, using only prior seasons as training data. Features include:

- Favorite-relative season strength, scoring/allowance, net EPA/YPP, pass/rush efficiency, sacks, turnovers, explosive plays, penalties, rest and home/away context.
- Last-three-game form and changes from season averages.
- Earlier performance against the spread and earlier market assessments of each team.
- New opponent-adjusted team-strength ratings from earlier same-season points, EPA, YPP and quoted lines.
- Disagreement between point-based statistical ratings and the target's quoted spread, including directional 3/6-point mismatch filters.

The league ratings conservatively use **earlier dates only**, not earlier same-day kickoffs: another game can start before the target and still be unfinished at target kickoff. Team-specific season features already exclude their own target and future games. A regression test covers this same-day timing boundary.

Eleven fixed models: regularized direct ATS logistic models, limited interactions, shallow boosted models, one/two-level subgroup trees, and nearest-neighbor cover probabilities. Trees require at least 100 training observations per leaf; neighbor probabilities are shrunk toward 50% with 20 neutral observations. These are not unlimited searches for arbitrary tiny groups.

Each model has a raw forecast and a second forecast calibrated against **earlier out-of-sample predictions only**. Calibration needs 400 prior decisions; absent/reversed relationships yield neutral forecasts. Current-year outcomes never fit the current-year model or its calibrator.

Policies combine:

- Raw or calibrated forecast.
- Minimum predicted probability of 55%, 57.5%, 60%, or 65% for the chosen ATS side.
- No mismatch filter, or a directional statistical-rating disagreement of at least 3/6 points.

That gives **264 predeclared policies**. Selection uses 2020–2022 only, requires at least 30 decisive picks across all three seasons, limits coverage to 20%, and ranks by the lower Wilson confidence bound. **Nineteen** policies meet those support/coverage requirements. Results on 2023–2025 are then reported without changing the selected rule.

This is retrospective evaluation, not a pristine holdout: these archived seasons were already examined. It cannot substitute for a frozen prospective test.

## The candidate that looked most convincing

Selected rule: `logistic_c0.1|raw|p0.55|gap3.0`.

Interpretation: a regularized direct-ATS classifier estimates at least 55% for one side, and the opponent-adjusted point-rating disagreement supports that side by at least three points. This is a fitted model's disagreement with the line, **not a proven fair line**. Ridge ratings shrink noisy early-season strengths and can systematically understate large favorites; raw disagreement alone is not evidence of mispricing.

Every selected pick in both periods was an **underdog**.

| Measure | Selection 2020–2022 | Evaluation 2023–2025 |
|---|---:|---:|
| Eligible games | 480 | 480 |
| Picks | 47 | 33 |
| W–L–push | **32–14–1** | **13–20–0** |
| Decisive-pick accuracy | **69.6%** | **39.4%** |
| Abstention rate | **90.2%** | **93.1%** |
| Average forecast for picked side | 59.0% | 58.1% |
| Descriptive 95% Wilson interval | 55.2%–80.9% | 24.7%–56.3% |

Per evaluation year: 2023 **4–6**, 2024 **5–6**, 2025 **4–8**. The candidate failed in each year, not just one unusual slate.

Notice the selection-period interval: **even its naive lower bound exceeds 55%**. That looks compelling if the rule is presented alone. But it was selected after considering 264 policies. A one-sided binomial test against 55% gives p=.0316 **before** adjustment; conservative search-count adjustment eliminates that apparent evidence. The later performance then fails to replicate it.

Whole-season bootstrap of the selected rule's evaluation rate gives 33.3%–45.5%, but only three seasons are available and this interval omits within-season variation. It is an illustrative stability check, not a reliable precision estimate. The broader game-level interval is also only descriptive because outcomes are not fully independent.

## Are any of the other rules above 55%?

**Yes numerically; no convincing validated 55% claim.** For example, a different interaction model/threshold goes **36–28 (56.25%)** across 64 decisive evaluation picks. However:

- It was not the validation-selected policy; its validation accuracy was about **54.2%**.
- It is being identified after viewing the evaluation period.
- Its uncertainty interval is wide (roughly 44%–68%).
- The sample does not establish a true rate above 55%, even before accounting for searching many rules.

These apparent successes are disclosed in `testHindsightTopPolicies_NOT_VALIDATED`, not promoted into a replacement winner. No supported sparse policy met the strong-55 evidence gate in either period.

## What calibration did to confidence

Calibration checks whether previous high-confidence forecasts actually worked on games not used to train their models. It sharply reduced the apparent opportunities:

| Model | Raw >=55% calls in evaluation | Calibrated >=55% calls |
|---|---:|---:|
| Regularized logistic C=.1 | 142 | **15** |
| Interaction logistic C=.1 | 214 | **4** |
| Shallow boosting, 7 leaves | 130 | **0** |
| Subgroup tree, depth 2 | 133 | **0** |
| Nearest 50 historical games | 150 | **0** |

The logistic C=.1 calibrated calls went **7–8**, not a demonstrated edge. Across calibrated models, the highest point forecasts were approximately 57%, and surviving samples were generally too small for confident subgroup claims.

The model can estimate 55% for a matchup, but unless those estimates are calibrated and supported, displaying "55% confidence" is largely labeling rather than evidence.

The Platt calibrator is global for each model; it does not automatically establish calibration inside a rare rating-gap-filtered subgroup. That subgroup needs its own independent evidence. Small samples limit how precisely we can assess it.

## Why rare-outlier searches can look successful without an edge

We ran **5,000 fixed-mask fair-coin simulations**. Each game receives the same simulated outcome across overlapping policies; policy masks and observed pushes are frozen. This demonstrates subgroup search luck, not formal significance: it does not refit the whole model/calibration pipeline under a null and does not preserve real game dependence.

Among the 19 supported validation policy masks:

- The selected apparent winner has a median simulated win rate of **60.6%**, despite every simulated game having no edge.
- About **83.7%** of simulations find a winning rule with at least 55% observed accuracy.
- About **5.8%** have a best lower confidence bound at least as attractive as the actual selected candidate.

This is why "there must be some 55%+ historical circumstances" can be true as a description of the archive but false as a reliable future prediction. Searching small, overlapping groups makes attractive chance patterns common.

## What would count as useful confidence for a particular game?

A useful output would separate three quantities:

1. **Estimated probability:** the model's calibrated prediction for favorite/underdog covering, conditional on no push.
2. **Evidence/support:** out-of-sample performance of the forecasting rule, number and age of relevant examples, season stability, uncertainty and search correction.
3. **Decision:** a pick only if the evidence meets a frozen acceptance standard; otherwise abstain.

In this experiment, zero rules passed the strong evidence gate. A production-style policy requiring that gate would therefore **abstain on every game**, even though exploratory models still generate 55–65% estimates. This is a conclusion, not a reason to lower the threshold until something qualifies.

The gate deliberately asks for evidence **strictly above 55%**, which is stronger than estimating a rate of at least 55% or demonstrating a positive betting edge. Its binomial/Wilson calculations remain nominal under independence/stationarity assumptions; Bonferroni does not fix dependence or adaptive annual refitting. Failure to pass this gate alone cannot rule out a true modest 55% advantage. The selected candidate's later failed replication is separate evidence against trusting that specific rule.

There is a genuine sample-size trade-off. At 10% coverage there are only about 16 picks per season in Weeks 4–14. Observing a true modest 55% advantage with convincing uncertainty can require many seasons—during which the market and teams change. This probe cannot exclude every small edge merely because it lacks power to establish one.

## Recommendation

**Keep looking for market-model disagreements if desired, but do not assume that a rare public-statistical outlier is an exploitable market error.** These tested facts did not establish a trustworthy 55%+ prediction rule.

The next defensible hypothesis would be a concrete source of information not fully represented in the quoted price at a defined decision time: changed QB/starter usage, lineup/injury updates, expected weather affecting a particular matchup, or an offered line different from a trustworthy market reference. Some such inputs are not available as historical pregame, timestamped data in this archive. Their presence in a postgame record would not make them safe predictors.

For any new hypothesis: define the mechanism and rule first, retain abstention, record predictions prospectively, and evaluate only selected-pick calibration and actual cover rates. No method can establish the exact true probability of one unique game from its eventual result.

## Artifacts

- `SELECTIVE-PROTOCOL.md`: frozen question, scope, models/policies and acceptance criteria.
- `selective.py`: rating features, direct cover models, chronological calibration, sparse policies and uncertainty.
- `selective_diagnostics.py`: calibrated-call counts, descriptive Bayesian intervals and fixed-mask luck simulation.
- `test_selective.py`: favorite/underdog orientation, abstention, uncertainty, chronological selection, target-outcome invariance and same-day availability.
- `results/selective-summary.json`: all 264 policies and every selected evaluation pick, including losses.
- `results/selective-diagnostics.json`: calibration and chance diagnostics.
- `results/selective-predictions.csv`: locally generated, Git-ignored full out-of-sample forecasts.

All commands use existing Python/NumPy/SciPy/scikit-learn packages. No downloads or source-data repairs were performed.

Independent review found no critical or important issues, reproduced all 264 policies and every stored raw/calibrated forecast, and confirmed all 12 safety tests. The review's material cautions about subgroup calibration, dependence and the stricter acceptance gate are documented above.
