"""Post-probe diagnostics; not used to reselect or retune the model.

Permutation results describe the ONE validation-selected model, not a
multiple-testing-corrected significance test of the 33-config search.
"""
import csv
import json
from collections import defaultdict
import numpy as np
from research import load_data, feature_sets, matrix, scale_from_training, neighbor_indices, OUT


def correlation(a, b):
    keep = np.isfinite(a) & np.isfinite(b)
    return float(np.corrcoef(a[keep], b[keep])[0, 1])


def main():
    games, _ = load_data()
    summary = json.loads((OUT / 'summary.json').read_text())
    selected = summary['selected_model']
    bundle, k = selected.removeprefix('knn_').rsplit('_k', 1)
    k = int(k)
    rng = np.random.default_rng(20261002)
    iterations = 500
    permutations = defaultdict(list)
    labels = defaultdict(list)
    counts = defaultdict(list)
    for year in range(2020, 2026):
        train = [g for g in games if g['season'] < year]
        test = [g for g in games if g['season'] == year]
        keys = feature_sets()[bundle]
        tr, te, _, _ = scale_from_training(matrix(train, keys), matrix(test, keys))
        tr, te = np.clip(tr, -4, 4), np.clip(te, -4, 4)
        distances = np.mean(np.abs(te[:, None] - tr[None]), axis=2)
        residual = np.array([g['residual'] for g in train])
        # Preserve spread bins only, NOT season/week or cross-year dependence.
        # Each year's overlapping training pool is shuffled independently.
        # This is a descriptive control, not a formal dependence-aware null test.
        spreads = np.array([g['closingSpreadHome'] for g in train])
        bins = np.digitize(spreads, [-10, -6, -3, 0, 3, 6, 10])
        shuffled = np.tile(residual, (iterations, 1))
        for j in range(iterations):
            for b in np.unique(bins):
                ids = np.flatnonzero(bins == b)
                shuffled[j, ids] = rng.permutation(residual[ids])
        seasons = np.array([g['season'] for g in train])
        weeks = np.array([g['week'] for g in train])
        phase = 'validation' if year <= 2022 else 'test'
        for i, game in enumerate(test):
            ids = neighbor_indices(distances[i], seasons, weeks, spreads, season=year,
                  week=game['week'], spread=game['closingSpreadHome'], k=k, spread_band=3.5, week_band=2)
            counts[str(year)].append(len(ids))
            if game['residual'] == 0:
                continue
            r = shuffled[:, ids]
            p = (np.sum(r > 0, axis=1) + 10) / (np.sum(r != 0, axis=1) + 20)
            permutations[phase].append(p)
            labels[phase].append(game['residual'] > 0)
    result = {'selected': selected, 'permutation_trials': iterations,
              'permutation_protocol': 'Permute training ATS residuals within spread bins; fixed selected neighbors; no test-label shuffling or model reselection.',
              'warning': 'Validation rank is post-selection, NOT a valid search-adjusted p-value.',
              'permutation': {}, 'candidate_counts': {}}
    for phase in ['validation', 'test']:
        p = np.array(permutations[phase])
        y = np.array(labels[phase], dtype=float)[:, None]
        brier = np.mean((p-y)**2, axis=0)
        name = 'validation_2020_2022' if phase == 'validation' else 'test_2023_2025'
        observed = summary['phases'][name][selected]['brier']
        result['permutation'][phase] = {'observed_brier': observed,
            'shuffled_brier_median': float(np.median(brier)),
            'shuffled_brier95': np.quantile(brier, [.025, .975]).tolist(),
            'fraction_shuffled_as_good_or_better': float(np.mean(brier <= observed))}
    for year, n in counts.items():
        result['candidate_counts'][year] = {'minimum': int(min(n)), 'median': float(np.median(n)),
                                            'maximum': int(max(n)), 'no_candidates': n.count(0)}
    # Show why forecasting a winner is not the same as beating the spread.
    heldout = [g for g in games if g['season'] >= 2023]
    residual = np.array([g['residual'] for g in heldout])
    margin = np.array([g['margin'] for g in heldout])
    result['test_feature_correlations_exploratory'] = {}
    for key in ['marketMargin', 'diff.mean.pointsFor', 'diff.mean.netYardsPerPlay',
                'diff.mean.netEpaPerPlay', 'diff.last3.netEpaPerPlay', 'diff.mean.pastAtsMargin']:
        x = np.array([g['features'][key] for g in heldout], dtype=float)
        result['test_feature_correlations_exploratory'][key] = {
            'with_actual_margin': correlation(x, margin), 'with_ats_residual': correlation(x, residual)}
    result['test_ablations'] = {name: metrics for name, metrics in summary['phases']['test_2023_2025'].items()
         if name in ['spread_baseline', 'historical_home_rate', selected,
                     'knn_market_k200', 'knn_core_levels_k200', 'knn_all_diff_k200',
                     'knn_mean_last3_diff_k200', 'ridge_residual_mean_last3_diff_a10.0']}
    (OUT / 'diagnostics.json').write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps(result, indent=2))


if __name__ == '__main__':
    main()
