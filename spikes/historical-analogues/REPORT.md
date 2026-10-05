# Do historical NFL statistical analogues improve on the spread?

**Finding: not reliably in this probe. The extraordinary earlier results were primarily a spread-sign/data-label bug, not a predictive edge.** With correct labels and chronological evaluation, the existing comparator was below 50% ATS in both 2024 and 2025. New statistical analogues did not produce a stable improvement over the market baseline.

Scope: regular-season Weeks 4–14, local 2005–2025 archive. This is a throwaway offline research spike, not a production change or betting system.

## 1. The earlier 75–80% claims were wrong

The published matchup archive has **5,688 nonzero spreads with the wrong home-handicap sign**, and zero with the correct sign. Ten pick'em games have no sign distinction. The current `src/normalize-nflverse-game.js` correctly negates raw nflverse `spread_line`, but the saved archive retains the uncorrected market data. Reading corrected source code did not make the previously generated data correct.

Raw nflverse `spread_line` is the market-implied **home score margin**. The home betting handicap is its negative:

```text
implied home margin = raw spread_line
home handicap       = -raw spread_line
home ATS residual   = home score - away score - raw spread_line
```

Concrete example: `2024_01_ARI_BUF`. Buffalo won 34–28, a six-point margin. Raw spread_line is +6.5, and Buffalo's moneyline is -310. Buffalo was favored, so its handicap is **-6.5**: ATS residual **-0.5**, a failed cover. The stored +6.5 handicap instead grades it as covering by **12.5** points. This makes strong-team/favorite signals look much better than they actually are ATS.

The separate temporal leakage finding was also real: the existing comparator does not internally exclude its target or enforce a historical cutoff. Here are the independently rerun results using that exact JavaScript comparator:

| Labels/history | 2024 W–L | 2024 accuracy | 2025 W–L | 2025 accuracy |
|---|---:|---:|---:|---:|
| Wrong signs, before-target kickoff cutoff | 121–29 | 80.7% | 106–34 | 75.7% |
| Correct signs, **full archive with leakage** | 86–53 | 61.9% | 83–61 | 57.6% |
| Correct signs, **before-target kickoff cutoff** | 67–72 | **48.2%** | 60–73 | **45.1%** |
| Correct signs, prior seasons only | 64–73 | 46.7% | 59–71 | 45.4% |

Every season has 160 targets. In the corrected before-kickoff rows: 2024 has 3 pushes and 18 abstentions; 2025 has 1 push and 26 abstentions. W–L accuracy excludes pushes and equal historical splits. A kickoff cutoff is the earlier analysis's reproduction, not proof that a game starting earlier had finished; the new experiment avoids this issue entirely by using only prior seasons as comparators.

**Correction to the earlier audit:** verifying feature timing and candidate dates was insufficient. ATS label orientation also needed independent validation against the raw source and market favorite. The previous accuracy claims should be withdrawn.

Evidence: `results/audit.json` and `results/comparator-audit.json`.

## 2. Data checks and feature construction

- All **3,366** raw schedule targets in 2005–2025 Weeks 4–14 are present in the accepted matchup archive: no missing target games.
- No duplicate accepted game IDs; no final-score discrepancies against raw schedule scores/result.
- Reconstructed all saved comparison feature season means from strictly prior same-season postgame records. **Zero discrepancies** across both teams and all checked metrics.
- Built independent season means, last-three-game means, last-three-minus-season trends, and home–away differences.
- Included scoring/allowance, net YPP, net EPA, turnovers, sacks, passing/rushing EPA, explosives, CPOE, interceptions, rush efficiency, penalties, rest, prior ATS residuals, and prior market-implied margins.
- CPOE is unavailable for about 4.8% of all target feature rows, mostly early history. Missing values are imputed using training-only means. No other constructed metric listed in the audit was missing.
- No current-game outcomes, current-game statistics, postgame weather, identity memorization, or future season summaries enter model features.

Safety tests verify home-favorite ATS grading, exclusion of target/future/simultaneous/other-season statistics, training-only scaling, prior-season neighbor eligibility, and invariance of every model's prediction to poisoned target outcomes.

## 3. Experiment design

The objective is to forecast the **market error**, not just identify the better football team. If the market expects the home team to win by seven, predicting that it wins is not an ATS edge; the relevant outcome is whether it wins by more than seven.

Each evaluation season is predicted using only **earlier seasons**. Both target and analogue pools are restricted to REG Weeks 4–14; season features can use earlier weeks. Scaling/imputation use only the training pool. We ran **2,561 evaluation games across 2010–2025**, with 2005–2009 as initial history.

Models:

1. **Spread baseline:** predicted actual margin equals market-implied margin; home ATS probability .5. Straight-up probabilities use prior-season empirical market-error distributions shifted by the target spread.
2. **Historical home-rate baseline:** unconditional prior-season home-cover rate, with prior mean market error as the margin adjustment.
3. **27 analogue configurations:** eight statistical bundles plus one market-only bundle, each with nearest 25/75/200 eligible games. Bundles cover raw home/away levels, home–away differences, recent form, trends, and market-relative performance.
4. **Six ridge-residual controls:** two difference/form bundles, three fixed regularization strengths. These test whether a simple linear correction outperforms nearest neighbors.

Analogue eligibility is ±3.5 points of home handicap and ±2 weeks. Distance is mean absolute difference of training-standardized features, clipped at ±4 standard deviations. Cover rates and mean ATS residuals are shrunk toward the spread baseline with 20 neutral pseudo-observations. Empty candidate pools fall back to the market instead of disappearing from evaluation.

The same market residual distribution is shifted to each target's implied margin to forecast straight-up outcomes; this avoids treating analogue scores from different spreads as interchangeable target scores.

Selection uses **minimum ATS Brier score on 2020–2022**, with development diagnostics in 2010–2019. The selected configuration is `knn_market_form_diff_k200`: spread, rest, and differences in prior market-implied margins / ATS residuals over the season and last three games. There was no reselection using 2023–2025 results.

This later period is a **retrospective evaluation set**, not a pristine untouched holdout: 2024/2025 were already examined before this spike. A future frozen evaluation remains necessary for any positive claim.

## 4. Main results

### The apparent validation edge did not generalize

| Selected analogue model | Games | Graded calls | W–L | ATS accuracy | ATS Brier |
|---|---:|---:|---:|---:|---:|
| Development 2010–2019 | 1,601 | 1,525 | 761–764 | 49.9% | .251100 |
| Selection 2020–2022 | 480 | 458 | 246–212 | 53.7% | .248403 |
| Evaluation 2023–2025 | 480 | 456 | 208–248 | **45.6%** | **.253349** |

The evaluation period contains 469 non-push outcomes. Thirteen of those receive exactly .5 (abstention); eleven other games push. Brier scoring includes abstentions as neutral forecasts, avoiding inflated metrics from dropping difficult games.

### Comparison with the market, 2023–2025

| Metric | Spread baseline | Selected analogues | Better |
|---|---:|---:|---|
| ATS Brier score (lower is better) | **.250000** | .253349 | Spread |
| ATS log loss (lower is better) | **.693147** | .699893 | Spread |
| Actual-margin MAE | **9.480 points** | 9.550 points | Spread |
| Actual-margin RMSE | **12.262 points** | 12.294 points | Spread |
| Straight-up accuracy | **68.7%** | 68.5% | Spread |
| Straight-up Brier | **.208460** | .209831 | Spread |

The spread baseline does not call an ATS side: .5 is a neutral probability benchmark, not a claimed achieved 50% betting record.

The selected analogue model was below 50% in **each** evaluation season: 47.7% in 2023, 43.8% in 2024, and 45.4% in 2025. Its game-level descriptive 95% Wilson interval is **41.1%–50.2%**. Exact -110 arithmetic yields -12.9% per graded stake, but this is not an execution-aware historical P&L.

### Ablations and alternatives

| Configuration, evaluated on 2023–2025 | ATS accuracy | Brier | Margin MAE |
|---|---:|---:|---:|
| Unconditional historical home rate | 49.9% | .250263 | 9.484 |
| Market-only analogues, k=200 | 46.3% | .253357 | 9.619 |
| Core home/away season levels, k=200 | 49.3% | .253654 | 9.623 |
| All season home–away differences, k=200 | 48.5% | .253027 | 9.592 |
| Season + last-three differences, k=200 | 45.3% | .254385 | 9.616 |
| Strongly regularized season + last-three ridge | 51.2% | .249976 | 9.482 |

**All 27 nearest-neighbor configurations have worse evaluation ATS Brier scores than .5.** The strongest ridge result improves Brier by only **0.0000245**, essentially indistinguishable from the market baseline, while its margin MAE is slightly worse. That ridge was not the validation-selected model; it is not a substitute winner chosen after seeing evaluation results. Its 51.2% ATS rate is below the 52.38% -110 break-even threshold, with a wide 46.7%–55.7% descriptive interval.

Some analogue variants marginally improve straight-up probability Brier, but that did not translate into a stable ATS or margin advantage. This distinction matters: probability calibration for game winners and betting against a spread are different objectives.

## 5. Why the team statistics look useful but do not beat the market

Exploratory correlations on the evaluation set:

| Predictor | With actual score margin | With error relative to spread |
|---|---:|---:|
| Market-implied margin | .483 | .075 |
| Season net EPA home–away difference | .375 | .043 |
| Season net YPP difference | .337 | .039 |
| Season points scored difference | .294 | .018 |
| Last-three net EPA difference | .286 | .006 |

These stats describe team quality and help explain who wins. Much of that information is **already incorporated into the spread**. Matching on it can reconstruct market expectations without discovering why the market will be wrong.

Nearest neighbors also have limited independent information. Several related efficiency metrics duplicate the same underlying strength signal, reducing effective diversity; season/last-three estimates share games; many historical analogues recur across targets. A large comparator count is not a corresponding count of independent pieces of evidence about a target.

## 6. Calibration, chance, and sensitivity checks

- At a fixed **55% minimum predicted confidence**, the selected model grades **41–51 (44.6%)** on 92 non-push games. Higher reported confidence did not rescue it. No evaluation predictions reach 60% confidence.
- Forecasts in the 40–45% home-cover bucket averaged 43.3%, but home covered 52.7% of those 74 games. Forecasts in 55–60% averaged 56.0%, but home covered only 33.3% of those 18 games. These are noisy buckets, but not evidence of calibrated confidence.
- **500 training-label permutations within spread bins**, holding the selected neighbor sets fixed: 6.2% achieve validation Brier at least as good as the selected model, and 98.0% do at least as well as its evaluation Brier. These permutations do not preserve season/week dependence and independently reshuffle overlapping training pools. The ranks are descriptive diagnostics, not formal inferential evidence. The validation figure is also **not** a search-adjusted p-value: selection among 33 specifications makes a chance validation winner more likely.
- The paired evaluation Brier penalty versus the spread is +.003349; a whole-season bootstrap gives approximately +.002272 to +.004403. With only three season clusters, that interval is unstable and should not be overinterpreted.
- Post-selection sensitivity checks varied spread bands (±1.5/3.5/7), week bands (±1/2/4), and froze history at 2022 versus annual updates. **All ten variants still have worse Brier and margin MAE than the spread.** ATS accuracy spans 45.6%–51.3%. These are exploratory robustness checks, not another model-selection stage.

## 7. Recommendation

1. **Do not interpret the earlier 75–80% rates, similarity percentages, or historical cover splits as validated pick accuracy.** The data-label error explains the spectacular results; direct comparator leakage further inflates them.
2. Before trusting production dashboards, republish the normalized market/matchup data with the corrected orientation and enforce temporal/self exclusion inside the comparator. **Those repairs were not performed in this spike**, to preserve user changes and source data.
3. Keep historical analogues as **context/explanation tooling**: comparable spreads, profiles, observed score variance, and descriptive matchup examples. Do not turn a majority split or nested-distance consistency score into uncalibrated prediction confidence.
4. For forecasting, keep the market as the default. Any added model should predict a small, regularized residual correction and earn its place on proper probability losses and margin error—not win rate alone.
5. If pursuing an edge, look for information plausibly missing from the quoted market at the prediction time (e.g., a timestamped injury/QB/starter change), then prospectively freeze and evaluate it. More combinations of already-public box-score stats risk fitting noise.

**Bottom line:** this probe supports the premise that the spread is already an excellent predictive summary. It does not establish that historical analogues can never help, but these season-stat, difference, and recent-form approaches do **not** demonstrate a reproducible incremental advantage.

## Artifacts and verification

- `research.py`: corrected-data audit, independent feature construction, walk-forward models, selection, scoring/calibration/uncertainty.
- `audit-comparator.js`: reproduction of original comparator results, both signs and three temporal modes.
- `diagnostics.py`: spread-bin permutation control, feature correlations, ablations, candidate counts.
- `sensitivity.py`: frozen-history and band-width robustness checks.
- `test_research.py`: feature/label/selection boundary safety tests.
- `results/`: audit, full model summary, diagnostics, sensitivity, original-comparator audit; locally generated per-game predictions CSV is Git-ignored.

The experiment uses existing Python 3/NumPy and project Node dependencies; no packages or data were downloaded. See `README.md` for exact commands and limitations.

Independent methodological/code review found no critical or important issues. The reviewer independently reproduced all 35 models' 2023–2025 metrics, verified raw target coverage and spread orientation, and confirmed the five safety tests. Minor limitations concerning the permutation control and analogue specifications are recorded above; these results establish failure of the tested specifications, not impossibility of all historical analogue methods.
