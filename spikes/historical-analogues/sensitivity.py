"""Exploratory robustness checks AFTER selection; no model reselection."""
import json
import numpy as np
from research import (load_data, feature_sets, matrix, scale_from_training,
                      neighbor_indices, empirical_su, score, OUT)


def main():
    games, _ = load_data()
    selected = json.loads((OUT / 'summary.json').read_text())['selected_model']
    bundle, k = selected.removeprefix('knn_').rsplit('_k', 1)
    results = {}
    for frozen in [False, True]:
        for spread_band, week_band in [(1.5, 2), (3.5, 1), (3.5, 2), (3.5, 4), (7., 2)]:
            rows = []
            for year in range(2023, 2026):
                train = [g for g in games if g['season'] < (2023 if frozen else year)]
                test = [g for g in games if g['season'] == year]
                keys = feature_sets()[bundle]
                tr, te, _, _ = scale_from_training(matrix(train, keys), matrix(test, keys))
                tr, te = np.clip(tr, -4, 4), np.clip(te, -4, 4)
                distances = np.mean(np.abs(te[:, None] - tr[None]), axis=2)
                residuals = np.array([g['residual'] for g in train])
                margins = np.array([g['marketMargin'] for g in test])
                su = empirical_su(margins, residuals)
                for i, game in enumerate(test):
                    ids = neighbor_indices(distances[i], np.array([g['season'] for g in train]),
                          np.array([g['week'] for g in train]), np.array([g['closingSpreadHome'] for g in train]),
                          season=year, week=game['week'], spread=game['closingSpreadHome'],
                          k=int(k), spread_band=spread_band, week_band=week_band)
                    r = residuals[ids]
                    rows.append({'residual': game['residual'], 'margin': game['margin'],
                        'pHomeCover': float((np.sum(r > 0)+10)/(np.sum(r != 0)+20)),
                        'predictedMargin': float(margins[i]+np.sum(r)/(len(r)+20)),
                        'pHomeWin': float((np.sum(r+margins[i] > 0)+.5*np.sum(r+margins[i] == 0)+20*su[i])/(len(r)+20))})
            name = f'{"frozen_2022" if frozen else "walk_forward"}_spread{spread_band}_week{week_band}'
            results[name] = score(rows)
    output = {'selected': selected, 'warning': 'Post-selection exploratory sensitivity only. Not used to pick another winner.',
              'test_2023_2025': results}
    (OUT / 'sensitivity.json').write_text(json.dumps(output, indent=2) + '\n')
    print(json.dumps({name: {'brier': s['brier'], 'accuracy': s['ats_accuracy'], 'mae': s['margin_mae']}
                      for name, s in results.items()}, indent=2))


if __name__ == '__main__':
    main()
