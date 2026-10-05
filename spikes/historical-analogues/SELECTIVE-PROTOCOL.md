# Selective ATS confidence spike (throwaway)

Approved objective: identify rare, repeatable circumstances where a favorite or underdog has an estimated cover probability >=55%; abstain on most games. Margin error is not an evaluation objective.

## Frozen probe before results

- [x] Add tests for favorite/underdog orientation, uncertainty, abstention, chronological selection, and target-outcome invariance.
- [x] Reuse corrected raw-source labels and strict pregame features; add opponent-adjusted same-season point/market/EPA/YPP ratings using earlier dates only (exclude potentially unfinished same-day games).
- [x] Generate prior-season-only out-of-sample cover probabilities, 2010–2025. Train direct ATS classifiers, sparse subgroup trees, and local historical probability models.
- [x] Orient stats relative to the favorite; investigate disagreement between statistical strength and the quoted line, recent form, prior ATS performance, rest, total, and home/away favorite context.
- [x] Calibrate each year's forecasts using only earlier out-of-sample forecasts, never its current outcomes. Calibration may collapse the signal to 50%.
- [x] Candidate policies: raw/calibrated probabilities at 55%, 57.5%, 60%, 65%; extreme mismatch filters at fixed thresholds; max 20% pick coverage.
- [x] Select on 2020–2022 only, requiring at least 30 decisive calls and three seasons of support. Report 2023–2025 separately, even if selection finds nothing.
- [x] Distinguish candidate from evidenced policy: a 55% point estimate is NOT evidence that the true rate exceeds 55%. Strong evidence requires a lower uncertainty bound above 55%; account for search size and season dependence.
- [x] Report pick count, abstention rate, W–L, probability calibration, intervals, favorite/underdog breakdown, per-season stability, and fixed-rule examples. No margin-error tables.
- [x] Check chance/search effects and perform independent review. Label all subgroup discoveries exploratory; future prospective validation remains necessary because archived seasons were already viewed.

No guarantee that the available public data contains a detectable edge. Do not silently invert losing test picks, select an attractive test subgroup, or treat absence of picks as a model failure to be optimized away. Production and source data remain untouched.
