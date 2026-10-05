# Historical analogue research spike — throwaway

Question: do statistically similar historical NFL games add reliable information beyond the closing spread? Only regular-season Weeks 4–14 are targets **and** historical analogue candidates. Weeks 1–3 still contribute to pregame team statistics. No product changes, data republication, or betting recommendations are part of this spike.

## Reproduce

From the repository root, using the existing Python 3 + NumPy environment:

```sh
python3 -m unittest discover -s spikes/historical-analogues -p 'test_*.py'
OPENBLAS_NUM_THREADS=1 python3 spikes/historical-analogues/research.py
node spikes/historical-analogues/audit-comparator.js
OPENBLAS_NUM_THREADS=1 python3 spikes/historical-analogues/diagnostics.py
OPENBLAS_NUM_THREADS=1 python3 spikes/historical-analogues/sensitivity.py
```

The original commands above write only to this spike's `results/` directory and download nothing. No experiment modifies `data/`, production code, or existing user changes. The later approved QB probe also stores externally captured sources under this spike's `external/` directory.
The per-game `results/predictions.csv` is generated locally and Git-ignored; the compact audit/summary JSON files are retained. The original JavaScript comparator audit is substantially slower than the vectorized Python experiment.

## Fixed probe protocol

- Read the published matchup/postgame manifests and the raw schedule capture cited by the matchups.
- Correct home handicap to **negative** raw nflverse `spread_line`. Verify scores against the raw schedule's `result` field.
- Reconstruct each team's stats from strictly earlier same-season games. Audit all existing comparison metrics against the saved pregame features.
- New features: home/away season means, last-three-game means, last-three minus season mean, home–away differences, prior ATS residuals, prior market-implied margins, and rest days.
- Exclude identities, current-game scores/statistics, actual weather, future games, and postgame fields from predictors.
- Training/candidate pool for season Y: **seasons strictly before Y**, avoiding even same-season outcomes. No target/future games can be candidates.
- Fit standardization and missing-value imputation on training records only. Distances use mean absolute standardized differences, clipped at ±4 standard deviations. Eligibility: spread ±3.5 points and week ±2. Nearest 25, 75, or 200 eligible games; no claimed universal percentage similarity.
- Eight statistical feature bundles plus a market-only analogue bundle. Two ridge-residual feature bundles, with three regularization strengths. 33 experimental configurations total.
- Cover probabilities shrink toward .5 with 20 neutral pseudo-observations. Expected ATS margin shrinks toward zero with the same weight. No eligible games means fallback to the market, not silent dropping.
- Spread baseline: predicted actual score margin = implied closing margin; ATS probability = .5. Straight-up probability comes from the **prior-training** empirical ATS residual distribution shifted by the target spread (ties count half).
- Model selection: minimum ATS Brier score on 2020–2022. 2010–2019 are development diagnostics. Report 2023–2025 separately; never choose a model based on this period's results.
- Report proper probability losses, margin MAE/RMSE, straight-up metrics, ATS W–L, abstentions, calibration, fixed confidence thresholds, and paired season-block uncertainty.
- Nominal -110 returns are arithmetic illustrations, **not** executable historical profits: exact archived price/liquidity and a pre-close execution timestamp are not established.

## Limitations

This is retrospective research, not pristine prospective validation: 2024/2025 were already examined, and the existing comparator was designed after the archived seasons. Closing lines are a strong market benchmark, not a promise of availability at an earlier pick time. Revised historical statistics are not immutable as-of vintages. No QB/injury/starter/weather forecasts, schedule-adjusted team ratings, or player-level data are included. Game-level Wilson intervals are descriptive; season-block intervals have only three evaluation clusters. Multiple specifications can produce chance apparent edges.

See `REPORT.md` for findings and the machine-readable files in `results/` for supporting evidence.

## Selective 55%+ confidence extension

The follow-up question is whether rare circumstances support a calibrated ATS pick while abstaining on at least 80% of games. See `SELECTIVE-PROTOCOL.md` and `SELECTIVE-REPORT.md`. This extension uses the already-installed SciPy and scikit-learn packages in addition to NumPy.

```sh
OPENBLAS_NUM_THREADS=1 OMP_NUM_THREADS=1 python3 spikes/historical-analogues/selective.py
OPENBLAS_NUM_THREADS=1 OMP_NUM_THREADS=1 python3 spikes/historical-analogues/selective_diagnostics.py
```

The extension's forecasts are in Git-ignored `results/selective-predictions.csv`. Compact policy and diagnostic results are in `results/selective-summary.json` and `results/selective-diagnostics.json`. Calibration and selection use earlier outcomes only; all claimed subgroup confidence remains retrospective and subject to the documented uncertainty/search limitations.

## QB-absence mechanism probe

See `QB-PROTOCOL.md` and `QB-REPORT.md` for the fixed-rule follow-up using approved free public historical injury reports. Source URLs and hashes are in `external/injury-capture-manifest.json`; dated primary-source spot checks are in `external/primary-source-manifest.json`. The main run uses captured sources offline:

```sh
OPENBLAS_NUM_THREADS=1 OMP_NUM_THREADS=1 python3 spikes/historical-analogues/qb_mechanism.py
```

Its selected rare rule went 10–8–1 in 2022–2024 (4.0% coverage), but does not establish a reliable/calibrated 55% edge. Missing timestamps exclude 2009 and 2025; row update timestamps are not immutable pregame snapshots. One independently corroborated schedule QB identity is corrected in memory only, without excluding the affected game.
