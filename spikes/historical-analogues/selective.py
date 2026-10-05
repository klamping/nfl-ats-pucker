"""Throwaway selective ATS-confidence experiment; no production changes.

OPENBLAS_NUM_THREADS=1 OMP_NUM_THREADS=1 python3 spikes/historical-analogues/selective.py
"""
import csv
import json
import math
from collections import defaultdict
import numpy as np
from scipy.stats import binomtest
from sklearn.linear_model import LogisticRegression
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.tree import DecisionTreeClassifier
from research import ROOT, OUT, load_data, published, scale_from_training, wilson

MODELS = ['logistic_c0.01', 'logistic_c0.1', 'logistic_c1.0',
          'interaction_c0.01', 'interaction_c0.1', 'boost_leaves3', 'boost_leaves7',
          'tree_depth1', 'tree_depth2', 'neighbors_k50', 'neighbors_k150']
THRESHOLDS = [.55, .575, .60, .65]
GAP_FILTERS = [0., 3., 6.]


def favorite_frame(game):
    sign = 1 if game['marketMargin'] > 0 else -1
    f = game['features']
    def oriented(key):
        value = f.get(key)
        return None if value is None else sign * value
    def difference(a, b):
        return None if a is None or b is None else a-b
    features = {
        'spreadSize': abs(game['marketMargin']), 'homeFavorite': sign,
        'total': f.get('total'), 'week': f.get('week'),
        'netPoints': difference(oriented('diff.mean.pointsFor'), oriented('diff.mean.pointsAgainst')),
        'netEpa': oriented('diff.mean.netEpaPerPlay'), 'netYpp': oriented('diff.mean.netYardsPerPlay'),
        'passingEpa': oriented('diff.mean.passingEpaPerDropback'),
        'rushingEpa': oriented('diff.mean.rushingEpaPerCarry'),
        'turnovers': oriented('diff.mean.turnoverMargin'),
        'sackPressure': difference(oriented('diff.mean.defensiveSackRate'), oriented('diff.mean.offensiveSackRate')),
        'explosives': oriented('diff.mean.explosivePlayRate'),
        'cpoe': oriented('diff.mean.passingCpoe'), 'interceptions': oriented('diff.mean.interceptionRate'),
        'rushYpc': oriented('diff.mean.rushingYardsPerCarry'),
        'penalties': oriented('diff.mean.penaltyYardsPerGame'),
        'restEdge': difference(f.get('home.restDays'), f.get('away.restDays')),
        'recentEpa': oriented('diff.last3.netEpaPerPlay'), 'recentYpp': oriented('diff.last3.netYardsPerPlay'),
        'recentNetPoints': difference(oriented('diff.last3.pointsFor'), oriented('diff.last3.pointsAgainst')),
        'epaTrend': oriented('diff.trend.netEpaPerPlay'),
        'pastAts': oriented('diff.mean.pastAtsMargin'), 'recentAts': oriented('diff.last3.pastAtsMargin'),
        'pastMarket': oriented('diff.mean.pastMarketMargin'),
        'recentMarket': oriented('diff.last3.pastMarketMargin'),
        'ratingGap': None if f.get('ratingActual') is None else sign * (f['ratingActual']-game['marketMargin']),
        'priorMarketGap': None if f.get('ratingMarket') is None else sign * (f['ratingMarket']-game['marketMargin']),
        'ratingEpa': oriented('ratingEpa'), 'ratingYpp': oriented('ratingYpp'),
    }
    if features['restEdge'] is not None:
        features['restEdge'] *= sign
    residual = sign * game['residual']
    return {'favoriteCovers': None if residual == 0 else residual > 0,
            'eligible': game['marketMargin'] != 0, 'features': features}


def choose_side(probability, threshold):
    if probability >= threshold - 1e-12:
        return 'favorite'
    if probability <= 1-threshold + 1e-12:
        return 'underdog'
    return 'abstain'


def rating_history(games, target):
    # An earlier kickoff does not imply a final result is available.
    # Conservatively exclude ALL same-day games when fitting league ratings.
    return [g for g in games if g['kickoff']['date'] < target['kickoff']['date']]


def evidence(wins, decisions, searched=1):
    interval = wilson(wins, decisions)
    p = float(binomtest(wins, decisions, p=.55, alternative='greater').pvalue) if decisions else 1.
    adjusted = min(1., searched*p)
    return {'lower95': interval[0], 'upper95': interval[1], 'pValue55': p,
            'pValue55Adjusted': adjusted,
            'strong55Evidence': bool(decisions and interval[0] > .55 and adjusted < .05)}


def select_policy(history, evaluation_year, max_coverage=.2):
    # Only prior three years; current/future outcomes never influence selection.
    groups = defaultdict(list)
    for row in history:
        if evaluation_year-3 <= row['season'] < evaluation_year:
            groups[row['policy']].append(row)
    candidates = []
    for name, rows in groups.items():
        picked = [r for r in rows if r['picked'] and r['win'] is not None]
        seasons = {r['season'] for r in picked}
        if len(picked) < 30 or len(seasons) < 3 or sum(r['picked'] for r in rows)/len(rows) > max_coverage:
            continue
        wins = sum(r['win'] for r in picked)
        candidates.append((wilson(wins, len(picked))[0], name))
    return max(candidates)[1] if candidates else None


def fit_predict(name, train, labels, target):
    if len(np.unique(labels)) < 2:
        return np.full(len(target), .5)
    if name.startswith(('logistic_', 'interaction_')):
        c = float(name.rsplit('c', 1)[1])
        if name.startswith('interaction_'):
            # Limited first-eight-feature interactions, not exhaustive polynomial search.
            pairs = [(i, j) for i in range(min(8, train.shape[1])) for j in range(i+1, min(8, train.shape[1]))]
            train = np.column_stack([train] + [train[:, i]*train[:, j] for i, j in pairs])
            target = np.column_stack([target] + [target[:, i]*target[:, j] for i, j in pairs])
        model = LogisticRegression(C=c, max_iter=1000, random_state=20261001)
    elif name.startswith('boost_'):
        model = HistGradientBoostingClassifier(max_leaf_nodes=int(name.rsplit('leaves', 1)[1]),
                   min_samples_leaf=100, max_iter=70, learning_rate=.04, l2_regularization=10,
                   early_stopping=False, random_state=20261001)
    elif name.startswith('tree_'):
        model = DecisionTreeClassifier(max_depth=int(name.rsplit('depth', 1)[1]),
                   min_samples_leaf=100, random_state=20261001)
    elif name.startswith('neighbors_'):
        k = min(int(name.rsplit('k', 1)[1]), len(train))
        distance = np.mean(np.abs(target[:, None]-train[None]), axis=2)
        ids = np.argsort(distance, axis=1, kind='stable')[:, :k]
        return (np.sum(labels[ids], axis=1)+10)/(k+20)
    else:
        raise ValueError(name)
    model.fit(train, labels)
    return model.predict_proba(target)[:, 1]


def add_ratings(games, audit):
    """Ridge team strengths adjusting for opponents; before-target games only."""
    matchups, _ = published('matchups')
    postgames, _ = published('postgame')
    by_team_game = {(r['gameId'], r['team']): r for r in postgames}
    with (ROOT / audit['schedule_file']).open() as file:
        raw = {r['game_id']: r for r in csv.DictReader(file)}
    season_games = defaultdict(list)
    for g in matchups:
        if g['gameType'] == 'REG':
            season_games[g['season']].append(g)
    for season, targets in ((y, [g for g in games if g['season'] == y]) for y in sorted(season_games)):
        all_games = sorted(season_games[season], key=lambda g: (g['kickoff']['date'], g['kickoff']['time']))
        teams = sorted({g[s] for g in all_games for s in ['homeTeam', 'awayTeam']})
        ids = {t: i+1 for i, t in enumerate(teams)}
        cache = {}
        for target in targets:
            time = (target['kickoff']['date'], target['kickoff']['time'])
            if time not in cache:
                earlier = rating_history(all_games, target)
                x = np.zeros((len(earlier), len(teams)+1))
                y = np.zeros((len(earlier), 4))
                for i, g in enumerate(earlier):
                    row = raw[g['gameId']]
                    h = by_team_game[(g['gameId'], g['homeTeam'])]
                    x[i, 0] = 1.
                    x[i, ids[g['homeTeam']]] = 1.
                    x[i, ids[g['awayTeam']]] = -1.
                    y[i] = [float(row['home_score'])-float(row['away_score']), float(row['spread_line']),
                            h['offensiveEpaPerPlay']-h['defensiveEpaPerPlay'],
                            h['offensiveYardsPerPlay']-h['defensiveYardsPerPlay']]
                penalty = np.eye(x.shape[1])*12.
                penalty[0, 0] = 0
                cache[time] = np.linalg.solve(x.T @ x + penalty, x.T @ y)
            beta = cache[time]
            estimates = beta[0]+beta[ids[target['homeTeam']]]-beta[ids[target['awayTeam']]]
            for name, value in zip(['ratingActual', 'ratingMarket', 'ratingEpa', 'ratingYpp'], estimates):
                target['features'][name] = float(value)


def logit(p):
    p = np.clip(p, .01, .99)
    return np.log(p/(1-p)).reshape(-1, 1)


def calibrated_probability(previous, raw):
    usable = [r for r in previous if r['favoriteCovers'] is not None]
    if len(usable) < 400:
        return np.full(len(raw), .5)
    x = logit(np.array([r['raw'] for r in usable]))
    labels = np.array([r['favoriteCovers'] for r in usable], dtype=int)
    if np.std(x) < 1e-8:
        return np.full(len(raw), .5)
    model = LogisticRegression(C=.2, max_iter=1000, random_state=20261001).fit(x, labels)
    # A reversed/absent calibration relationship is not a new opposite-side edge.
    if model.coef_[0, 0] <= 0:
        return np.full(len(raw), .5)
    return model.predict_proba(logit(raw))[:, 1]


def generate_predictions(games, years=range(2010, 2026)):
    records = []
    frames = {g['gameId']: favorite_frame(g) for g in games}
    keys = list(next(iter(frames.values()))['features'])
    def x(rows):
        return np.array([[frames[g['gameId']]['features'][k] for k in keys] for g in rows], dtype=float)
    for year in years:
        train = [g for g in games if g['season'] < year and frames[g['gameId']]['eligible'] and frames[g['gameId']]['favoriteCovers'] is not None]
        targets = [g for g in games if g['season'] == year and frames[g['gameId']]['eligible']]
        assert max(g['season'] for g in train) < year
        tr, te, _, _ = scale_from_training(x(train), x(targets))
        tr, te = np.clip(tr, -4, 4), np.clip(te, -4, 4)
        labels = np.array([frames[g['gameId']]['favoriteCovers'] for g in train], dtype=int)
        for name in MODELS:
            raw = fit_predict(name, tr, labels, te)
            previous = [r for r in records if r['model'] == name and r['season'] < year]
            calibrated = calibrated_probability(previous, raw)
            for i, g in enumerate(targets):
                f = frames[g['gameId']]
                records.append({'gameId': g['gameId'], 'season': year, 'week': g['week'], 'model': name,
                   'raw': float(raw[i]), 'calibrated': float(calibrated[i]),
                   'favoriteCovers': f['favoriteCovers'], 'favoriteHome': g['marketMargin'] > 0,
                   'favoriteTeam': g['homeTeam'] if g['marketMargin'] > 0 else g['awayTeam'],
                   'underdogTeam': g['awayTeam'] if g['marketMargin'] > 0 else g['homeTeam'],
                   'spreadSize': abs(g['marketMargin']), 'ratingGap': f['features']['ratingGap']})
        print(f'Selective forecasts {year}: {len(train)} training decisions, {len(targets)} eligible games', flush=True)
    return records


def apply_policy(rows, channel, threshold, gap_filter):
    evaluated = []
    for r in rows:
        side = choose_side(r[channel], threshold)
        if gap_filter:
            gap = r['ratingGap']
            # Require statistical disagreement to support the proposed ATS side.
            if gap is None or (side == 'favorite' and gap < gap_filter) or (side == 'underdog' and gap > -gap_filter):
                side = 'abstain'
        picked = side != 'abstain'
        win = None if r['favoriteCovers'] is None or not picked else bool(r['favoriteCovers'] == (side == 'favorite'))
        evaluated.append({**r, 'side': side, 'picked': picked, 'win': win,
                          'predictedCover': r[channel] if side == 'favorite' else 1-r[channel] if picked else None})
    return evaluated


def policy_score(rows, searched=1):
    picks = [r for r in rows if r['picked']]
    decisions = [r for r in picks if r['win'] is not None]
    wins = sum(r['win'] for r in decisions)
    n = len(decisions)
    return {'eligibleGames': len(rows), 'picks': len(picks), 'decisions': n,
            'wins': wins, 'losses': n-wins, 'pushes': len(picks)-n,
            'coverage': len(picks)/len(rows) if rows else 0.,
            'abstentionRate': 1-len(picks)/len(rows) if rows else 1.,
            'accuracy': wins/n if n else None, **evidence(wins, n, searched),
            'meanPredictedCover': float(np.mean([r['predictedCover'] for r in decisions])) if n else None,
            'selectedBrier': float(np.mean([(r['predictedCover']-r['win'])**2 for r in decisions])) if n else None,
            'seasonsWithPicks': len({r['season'] for r in decisions}),
            'favoritePicks': sum(r['side'] == 'favorite' for r in picks),
            'underdogPicks': sum(r['side'] == 'underdog' for r in picks)}


def bootstrap_rate(rows):
    by_year = defaultdict(list)
    for r in rows:
        if r['picked'] and r['win'] is not None:
            by_year[r['season']].append(r['win'])
    if not by_year:
        return [None, None]
    years = list(by_year)
    rng = np.random.default_rng(20261003)
    samples = []
    for _ in range(5000):
        samples.append(np.mean([v for y in rng.choice(years, len(years), replace=True) for v in by_year[y]]))
    return np.quantile(samples, [.025, .975]).tolist()


def summarize_selective(records):
    by_model = defaultdict(list)
    for r in records:
        by_model[r['model']].append(r)
    configurations = [(name, channel, threshold, gap) for name in MODELS
                      for channel in ['raw', 'calibrated'] for threshold in THRESHOLDS for gap in GAP_FILTERS]
    policies, validation_history, params = {}, [], {}
    for name, channel, threshold, gap in configurations:
        key = f'{name}|{channel}|p{threshold}|gap{gap}'
        params[key] = (name, channel, threshold, gap)
        rows = apply_policy(by_model[name], channel, threshold, gap)
        val = [r for r in rows if 2020 <= r['season'] <= 2022]
        test = [r for r in rows if 2023 <= r['season'] <= 2025]
        policies[key] = {'validation': policy_score(val, len(configurations)),
                         'test': policy_score(test, len(configurations))}
        validation_history.extend({'policy': key, 'season': r['season'], 'picked': r['picked'], 'win': r['win']} for r in val)
    selected = select_policy(validation_history, evaluation_year=2023)
    result = {'protocol': {'models': MODELS, 'policyCount': len(configurations),
        'thresholds': THRESHOLDS, 'directionalRatingGapFilters': GAP_FILTERS,
        'selection': 'maximum validation Wilson lower bound; >=30 calls across all 3 validation seasons; <=20% coverage',
        'probabilityMeaning': 'cover conditional on a non-push outcome; pickem games abstained',
        'calibration': 'Platt on earlier OOS forecasts only, minimum 400 prior decisions; nonpositive slope => neutral',
        'strongEvidence': 'Wilson lower95 >55% and Bonferroni-adjusted one-sided binomial p<.05; independence caveat applies'},
        'selectedCandidatePolicy': selected, 'policies': policies}
    eligible = [name for name, values in policies.items() if values['validation']['decisions'] >= 30
                and values['validation']['coverage'] <= .2 and values['validation']['seasonsWithPicks'] == 3]
    ranked = sorted(eligible, key=lambda n: policies[n]['validation']['lower95'], reverse=True)
    result['validationTopCandidates'] = ranked[:10]
    result['eligibleSelectionPolicies'] = len(eligible)
    result['validationStrong55Policies'] = [n for n in eligible if policies[n]['validation']['strong55Evidence']]
    if selected:
        name, channel, threshold, gap = params[selected]
        selected_rows = apply_policy(by_model[name], channel, threshold, gap)
        result['selectedBySeason'] = {str(y): policy_score([r for r in selected_rows if r['season'] == y]) for y in range(2010, 2026)}
        evaluation = [r for r in selected_rows if 2023 <= r['season'] <= 2025]
        result['selectedTestSeasonBootstrap95'] = bootstrap_rate(evaluation)
        result['selectedTestPicks'] = [r for r in evaluation if r['picked']]
        result['selectedBreakdown'] = {side: policy_score([r for r in evaluation if r['side'] == side]) for side in ['favorite', 'underdog']}
    # Separately disclose apparent evaluation winners without calling them selected.
    test_candidates = [n for n in policies if policies[n]['test']['decisions'] >= 30 and policies[n]['test']['coverage'] <= .2]
    result['testHindsightTopPolicies_NOT_VALIDATED'] = sorted(test_candidates,
                    key=lambda n: policies[n]['test']['lower95'], reverse=True)[:10]
    result['testStrong55PoliciesExploratory'] = [n for n in test_candidates if policies[n]['test']['strong55Evidence']]
    result['warnings'] = ['2023–2025 were previously viewed: retrospective test, not pristine holdout.',
       'Bonferroni corrects search count but binomial/Wilson assume independent, stationary trials; games/seasons are correlated.',
       'Selected candidate is not a trusted 55% policy unless strong prior evidence exists; otherwise production-style policy abstains.',
       'No observed outcome can establish the true probability of one unique matchup.']
    return result


def main():
    games, audit = load_data()
    add_ratings(games, audit)
    records = generate_predictions(games)
    with (OUT / 'selective-predictions.csv').open('w') as file:
        writer = csv.DictWriter(file, fieldnames=list(records[0]))
        writer.writeheader()
        writer.writerows(records)
    result = summarize_selective(records)
    result['allTargetsByPhase'] = {'validation': sum(2020 <= g['season'] <= 2022 for g in games),
                                  'test': sum(2023 <= g['season'] <= 2025 for g in games)}
    (OUT / 'selective-summary.json').write_text(json.dumps(result, indent=2) + '\n')
    selected = result['selectedCandidatePolicy']
    print(json.dumps({'selected': selected, 'eligiblePolicies': result['eligibleSelectionPolicies'],
        'strong55Validation': result['validationStrong55Policies'],
        'selectedScores': result['policies'].get(selected),
        'hindsight': result['testHindsightTopPolicies_NOT_VALIDATED'][:3]}, indent=2))


if __name__ == '__main__':
    main()
