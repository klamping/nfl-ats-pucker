"""Throwaway offline research; production and source data remain untouched.

Requires Python 3 and NumPy. Run from the repository root:
  OPENBLAS_NUM_THREADS=1 python3 spikes/historical-analogues/research.py
"""
import csv
import json
import math
import warnings
from collections import defaultdict
from pathlib import Path
import numpy as np

ROOT = Path(__file__).resolve().parents[2]
OUT = Path(__file__).resolve().parent / 'results'
METRICS = ['pointsFor', 'pointsAgainst', 'netYardsPerPlay', 'netEpaPerPlay',
           'turnoverMargin', 'offensiveSackRate', 'defensiveSackRate',
           'passingEpaPerDropback', 'rushingEpaPerCarry', 'explosivePlayRate',
           'passingCpoe', 'interceptionRate', 'rushingYardsPerCarry',
           'passingExplosiveRate', 'rushingExplosiveRate', 'penaltyYardsPerGame',
           'pastAtsMargin', 'pastMarketMargin']
CORE = METRICS[:7]


def home_spread(row):
    # nflverse spread_line = implied HOME score margin, not home handicap.
    return -float(row['spread_line'])


def stamp(game):
    return (game['kickoff']['date'], game['kickoff']['time'])


def average(values):
    values = [v for v in values if v is not None and math.isfinite(v)]
    return sum(values) / len(values) if values else None


def build_features(target, postgames):
    features = {}
    for side, team in [('home', target['homeTeam']), ('away', target['awayTeam'])]:
        history = sorted([r for r in postgames if r['season'] == target['season']
                          and r['team'] == team and stamp(r) < stamp(target)
                          and r['gameId'] != target['gameId']], key=stamp)
        for metric in METRICS:
            mean = average([r.get(metric) for r in history])
            last = average([r.get(metric) for r in history[-3:]])
            features[f'{side}.mean.{metric}'] = mean
            features[f'{side}.last3.{metric}'] = last
            features[f'{side}.trend.{metric}'] = None if mean is None or last is None else last - mean
        features[f'{side}.gamesPlayed'] = len(history)
        features[f'{side}.restDays'] = None if not history else (
            np.datetime64(target['kickoff']['date']) - np.datetime64(history[-1]['kickoff']['date'])
        ).astype(int).item()
    for metric in METRICS:
        for window in ['mean', 'last3', 'trend']:
            h, a = features[f'home.{window}.{metric}'], features[f'away.{window}.{metric}']
            features[f'diff.{window}.{metric}'] = None if h is None or a is None else h - a
    return features


def scale_from_training(train, test):
    with warnings.catch_warnings():
        warnings.simplefilter('ignore', RuntimeWarning)
        center = np.nanmean(train, axis=0)
        scale = np.nanstd(train, axis=0)
    center = np.where(np.isfinite(center), center, 0.)
    scale = np.where(np.isfinite(scale) & (scale > 1e-8), scale, 1.)
    def transform(x):
        return (np.where(np.isfinite(x), x, center) - center) / scale
    return transform(train), transform(test), center, scale


def neighbor_indices(distances, seasons, weeks, spreads, *, season, week, spread,
                     k, spread_band, week_band):
    eligible = (seasons < season) & (np.abs(spreads - spread) <= spread_band) & (np.abs(weeks - week) <= week_band)
    indices = np.flatnonzero(eligible)
    return indices[np.argsort(distances[indices], kind='stable')[:k]]


def published(stem):
    directory = ROOT / 'data/normalized/nfl'
    manifest = json.loads((directory / f'nflverse-team-{stem}-2005-2025.current.json').read_text())
    file = directory / manifest['accepted']
    return [json.loads(line) for line in file.read_text().splitlines() if line], str(file.relative_to(ROOT))


def load_data():
    matchups, match_path = published('matchups')
    postgames, post_path = published('postgame')
    # Use the same raw schedule capture cited by the published matchup dataset.
    retrieved = matchups[0]['retrievedAt'].replace(':', '-')
    raw_files = sorted((ROOT / 'data/raw/nflverse').glob(f'games-{retrieved}-capture-*.csv'))
    assert raw_files, 'Matching source schedule capture missing'
    with raw_files[0].open() as file:
        raw = {r['game_id']: r for r in csv.DictReader(file)}
    corrected = []
    audit = {'matchup_file': match_path, 'postgame_file': post_path,
             'schedule_file': str(raw_files[0].relative_to(ROOT)),
             'published_matches_raw_sign': 0, 'published_matches_correct_sign': 0,
             'published_other_spread': 0, 'score_mismatches': 0,
             'duplicate_game_ids': len(matchups) - len({g['gameId'] for g in matchups})}
    for game in matchups:
        row = raw[game['gameId']]
        s = home_spread(row)
        if s != 0:
            audit['published_matches_raw_sign'] += game['closingSpreadHome'] == -s
            audit['published_matches_correct_sign'] += game['closingSpreadHome'] == s
        audit['published_other_spread'] += game['closingSpreadHome'] not in (s, -s)
        audit['score_mismatches'] += game['homeScore'] != float(row['home_score']) or game['awayScore'] != float(row['away_score'])
        margin = float(row['home_score']) - float(row['away_score'])
        assert abs(margin - float(row['result'])) < 1e-8
        # Independent orientation evidence: spread_line agrees with market favorite and moneyline.
        corrected.append({**game, 'closingSpreadHome': s, 'marketMargin': -s,
                          'margin': margin, 'residual': margin + s,
                          'total': float(row['total_line']) if row['total_line'] else None})
    assert not audit['score_mismatches'] and not audit['duplicate_game_ids']
    by_id = {g['gameId']: g for g in corrected}
    by_season = defaultdict(list)
    for r in postgames:
        r = dict(r)
        game = by_id[r['gameId']]
        sign = 1 if r['team'] == game['homeTeam'] else -1
        r['netYardsPerPlay'] = None if r['offensiveYardsPerPlay'] is None or r['defensiveYardsPerPlay'] is None else r['offensiveYardsPerPlay'] - r['defensiveYardsPerPlay']
        r['netEpaPerPlay'] = None if r['offensiveEpaPerPlay'] is None or r['defensiveEpaPerPlay'] is None else r['offensiveEpaPerPlay'] - r['defensiveEpaPerPlay']
        r['pastAtsMargin'] = sign * game['residual']
        r['pastMarketMargin'] = sign * game['marketMargin']
        assert r['pointsFor'] == (game['homeScore'] if sign == 1 else game['awayScore'])
        by_season[r['season']].append(r)
    targets = []
    mismatch = defaultdict(int)
    mapping = {'pointsFor': 'pointsScoredPerGame', 'pointsAgainst': 'pointsAllowedPerGame',
               'turnoverMargin': 'turnoverMarginPerGame'}
    for game in corrected:
        if game['gameType'] != 'REG' or not 4 <= game['week'] <= 14:
            continue
        features = build_features(game, by_season[game['season']])
        features['marketMargin'] = game['marketMargin']
        features['total'] = game['total']
        features['week'] = game['week']
        for side in ['home', 'away']:
            for metric in METRICS[:-2]:
                expected = features[f'{side}.mean.{metric}']
                stored = game[f'{side}Pregame'][mapping.get(metric, metric)]
                if (expected is None) != (stored is None) or (expected is not None and abs(expected - stored) > 1e-9):
                    mismatch[metric] += 1
        targets.append({**game, 'features': features})
    targets.sort(key=lambda g: (g['season'], stamp(g), g['gameId']))
    audit['reconstructed_pregame_mismatches'] = dict(mismatch)
    audit['games_by_season'] = {str(y): sum(g['season'] == y for g in targets) for y in range(2005, 2026)}
    audit['feature_missing_rate'] = {k: sum(g['features'][k] is None for g in targets) / len(targets) for k in targets[0]['features'] if any(g['features'][k] is None for g in targets)}
    return targets, audit


def feature_sets():
    sets = {'market': ['marketMargin', 'total', 'week']}
    for name, sides, windows, metrics in [
        ('core_levels', ['home', 'away'], ['mean'], CORE),
        ('all_levels', ['home', 'away'], ['mean'], METRICS[:-2]),
        ('core_diff', ['diff'], ['mean'], CORE),
        ('all_diff', ['diff'], ['mean'], METRICS[:-2]),
        ('last3_diff', ['diff'], ['last3'], METRICS[:-2]),
        ('mean_last3_diff', ['diff'], ['mean', 'last3'], METRICS[:-2]),
        ('mean_trend_diff', ['diff'], ['mean', 'trend'], METRICS[:-2]),
        ('market_form_diff', ['diff'], ['mean', 'last3'], ['pastAtsMargin', 'pastMarketMargin']),
    ]:
        sets[name] = ['marketMargin'] + [f'{s}.{w}.{m}' for s in sides for w in windows for m in metrics]
        sets[name] += ['home.restDays', 'away.restDays']
    return sets


def matrix(rows, keys):
    return np.array([[np.nan if g['features'][k] is None else g['features'][k] for k in keys] for g in rows], dtype=float)


def empirical_su(margins, residuals, shift=0):
    return np.array([np.mean(residuals + margin + shift > 0) + .5 * np.mean(residuals + margin + shift == 0) for margin in margins])


def ridge_predict(train, test, y, alpha):
    train = np.column_stack([np.ones(len(train)), train])
    test = np.column_stack([np.ones(len(test)), test])
    penalty = np.eye(train.shape[1]) * alpha * len(train)
    penalty[0, 0] = 0
    coef = np.linalg.solve(train.T @ train + penalty, train.T @ y)
    return test @ coef


def run_models(games, years=range(2010, 2026)):
    predictions = []
    sets = feature_sets()
    for year in years:
        train = [g for g in games if g['season'] < year]
        test = [g for g in games if g['season'] == year]
        assert train and test and max(g['season'] for g in train) < year
        residuals = np.array([g['residual'] for g in train])
        margins = np.array([g['marketMargin'] for g in test])
        seasons = np.array([g['season'] for g in train])
        weeks = np.array([g['week'] for g in train])
        spreads = np.array([g['closingSpreadHome'] for g in train])
        decisions = residuals != 0
        base_su = empirical_su(margins, residuals)
        def save(name, p, delta, su, counts=None):
            for i, game in enumerate(test):
                predictions.append({'model': name, 'gameId': game['gameId'], 'season': year,
                                    'week': game['week'], 'residual': game['residual'], 'margin': game['margin'],
                                    'marketMargin': game['marketMargin'], 'pHomeCover': float(p[i]),
                                    'predictedMargin': float(margins[i] + delta[i]),
                                    'pHomeWin': float(su[i]), 'candidateCount': int(counts[i]) if counts is not None else 0})
        save('spread_baseline', np.full(len(test), .5), np.zeros(len(test)), base_su)
        save('historical_home_rate', np.full(len(test), np.mean(residuals[decisions] > 0)),
             np.full(len(test), np.mean(residuals)), base_su)
        for name, keys in sets.items():
            tr, te, _, _ = scale_from_training(matrix(train, keys), matrix(test, keys))
            # Clipping protects distances from isolated feature outliers; thresholds fixed upfront.
            tr, te = np.clip(tr, -4, 4), np.clip(te, -4, 4)
            distances = np.mean(np.abs(te[:, None, :] - tr[None, :, :]), axis=2)
            for k in [25, 75, 200]:
                probabilities, deltas, su, counts = [], [], [], []
                for i, game in enumerate(test):
                    ids = neighbor_indices(distances[i], seasons, weeks, spreads,
                          season=year, week=game['week'], spread=game['closingSpreadHome'],
                          k=k, spread_band=3.5, week_band=2)
                    # Rare extreme lines have no eligible historical games.
                    # Empty arrays naturally yield market-only predictions via shrinkage.
                    assert np.all(seasons[ids] < year)
                    r = residuals[ids]
                    n = np.sum(r != 0)
                    # 20 neutral pseudo-observations shrink noisy cover splits toward the market.
                    probabilities.append((np.sum(r > 0) + 10) / (n + 20))
                    deltas.append(np.sum(r) / (len(r) + 20))
                    su.append((np.sum(r + margins[i] > 0) + .5 * np.sum(r + margins[i] == 0) + 20 * base_su[i]) / (len(r) + 20))
                    counts.append(len(ids))
                save(f'knn_{name}_k{k}', probabilities, deltas, su, counts)
            # Linear controls: stats predict actual margin or correct the market residual.
            if name in ['core_diff', 'mean_last3_diff']:
                for alpha in [.1, 1., 10.]:
                    delta = ridge_predict(tr, te, residuals, alpha)
                    # Gaussian approximation uses TRAINING residual variance only.
                    sigma = np.std(residuals)
                    p = np.array([.5 * (1 + math.erf(d / (sigma * math.sqrt(2)))) for d in delta])
                    save(f'ridge_residual_{name}_a{alpha}', p, delta,
                         np.array([.5 * (1 + math.erf((m + d) / (sigma * math.sqrt(2)))) for m, d in zip(margins, delta)]))
        print(f'Finished {year}: {len(train)} prior-season comparators, {len(test)} targets', flush=True)
    return predictions


def wilson(w, n):
    if not n:
        return [None, None]
    z = 1.96
    center = (w / n + z*z / (2*n)) / (1 + z*z/n)
    half = z * math.sqrt(w/n * (1-w/n)/n + z*z/(4*n*n)) / (1+z*z/n)
    return [center - half, center + half]


def score(rows):
    decisive = [r for r in rows if r['residual'] != 0]
    called = [r for r in decisive if abs(r['pHomeCover'] - .5) > 1e-12]
    wins = sum((r['pHomeCover'] > .5) == (r['residual'] > 0) for r in called)
    su = [r for r in rows if r['margin'] != 0]
    p = np.array([r['pHomeCover'] for r in decisive])
    y = np.array([r['residual'] > 0 for r in decisive], dtype=float)
    clipped = np.clip(p, 1e-6, 1-1e-6)
    error = np.array([r['predictedMargin'] - r['margin'] for r in rows])
    return {'games': len(rows), 'ats_decisions': len(decisive), 'ats_calls': len(called),
            'ats_wins': wins, 'ats_losses': len(called)-wins,
            'ats_accuracy': wins / len(called) if called else None, 'ats_wilson95': wilson(wins, len(called)),
            'brier': float(np.mean((p-y)**2)), 'log_loss': float(np.mean(-y*np.log(clipped)-(1-y)*np.log(1-clipped))),
            'margin_mae': float(np.mean(np.abs(error))), 'margin_rmse': float(np.sqrt(np.mean(error**2))),
            'su_accuracy': sum((r['pHomeWin'] > .5) == (r['margin'] > 0) for r in su) / len(su),
            'su_brier': float(np.mean([(r['pHomeWin']-(r['margin'] > 0))**2 for r in su])),
            'roi_at_minus110': (wins * (100/110) - (len(called)-wins))/len(called) if called else None}


def summarize(predictions):
    groups = defaultdict(list)
    for p in predictions:
        groups[p['model']].append(p)
    phases = {'development_2010_2019': (2010, 2019), 'validation_2020_2022': (2020, 2022), 'test_2023_2025': (2023, 2025)}
    result = {'protocol': {'training': 'prior seasons only; REG Weeks 4–14 only',
                          'selection': 'minimum validation ATS Brier score; test not used to select',
                          'analogue_distance': 'mean absolute train-standardized feature distance, clipped ±4',
                          'eligibility': 'home spread ±3.5; week ±2; no distance ceiling',
                          'shrinkage': '20 pseudo-observations at market ATS probability 0.5',
                          'configurations': len(groups)-2}, 'phases': {}}
    for phase, (start, end) in phases.items():
        result['phases'][phase] = {name: score([p for p in rows if start <= p['season'] <= end]) for name, rows in groups.items()}
    validation = result['phases']['validation_2020_2022']
    experiments = [n for n in groups if n not in ['spread_baseline', 'historical_home_rate']]
    selected = min(experiments, key=lambda n: validation[n]['brier'])
    result['selected_model'] = selected
    result['by_season'] = {name: {str(year): score([p for p in groups[name] if p['season'] == year]) for year in range(2010, 2026)}
                           for name in ['spread_baseline', selected]}
    heldout = [r for r in groups[selected] if r['season'] >= 2023]
    result['confidence_subsets_test'] = {str(t): score([r for r in heldout if abs(r['pHomeCover'] - .5) >= t-.5])
                                      for t in [.5, .55, .6] if any(abs(r['pHomeCover']-.5) >= t-.5 for r in heldout)}
    result['calibration_test'] = []
    for low, high in [(0,.4),(.4,.45),(.45,.5),(.5,.55),(.55,.6),(.6,1.00001)]:
        bucket = [r for r in heldout if r['residual'] != 0 and low <= r['pHomeCover'] < high]
        if bucket:
            result['calibration_test'].append({'range': [low, high], 'n': len(bucket),
                 'mean_probability': float(np.mean([r['pHomeCover'] for r in bucket])),
                 'actual_home_cover_rate': float(np.mean([r['residual'] > 0 for r in bucket]))})
    # Bootstrap whole SEASONS, not falsely independent games. Only 3 test clusters: weak interval.
    diffs = np.array([(r['pHomeCover']-(r['residual'] > 0))**2 - .25 for r in heldout if r['residual'] != 0])
    years = np.array([r['season'] for r in heldout if r['residual'] != 0])
    rng = np.random.default_rng(20261001)
    boot = []
    for _ in range(5000):
        sample = rng.choice([2023, 2024, 2025], 3, replace=True)
        boot.append(np.mean(np.concatenate([diffs[years == y] for y in sample])))
    result['paired_test_brier_minus_spread'] = {'difference': float(np.mean(diffs)),
        'season_bootstrap95': np.quantile(boot, [.025, .975]).tolist(), 'warning': 'Only three season clusters; interval is unstable.'}
    return result


def main():
    games, audit = load_data()
    OUT.mkdir(exist_ok=True)
    (OUT / 'audit.json').write_text(json.dumps(audit, indent=2) + '\n')
    predictions = run_models(games)
    with (OUT / 'predictions.csv').open('w') as file:
        writer = csv.DictWriter(file, fieldnames=list(predictions[0]))
        writer.writeheader()
        writer.writerows(predictions)
    results = summarize(predictions)
    (OUT / 'summary.json').write_text(json.dumps(results, indent=2) + '\n')
    print(json.dumps({'selected': results['selected_model'], 'test': results['phases']['test_2023_2025'][results['selected_model']],
                      'baseline': results['phases']['test_2023_2025']['spread_baseline']}, indent=2))


if __name__ == '__main__':
    main()
