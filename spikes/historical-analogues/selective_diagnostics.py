"""Describe calibration and fixed-mask search luck; not formal inference."""
import csv
import json
from collections import defaultdict
import numpy as np
from scipy.stats import beta
from selective import MODELS, THRESHOLDS, GAP_FILTERS, apply_policy, policy_score
from research import OUT, wilson


def read_predictions():
    with (OUT / 'selective-predictions.csv').open() as f:
        rows = list(csv.DictReader(f))
    for r in rows:
        for key in ['season', 'week']:
            r[key] = int(r[key])
        for key in ['raw', 'calibrated', 'spreadSize', 'ratingGap']:
            r[key] = float(r[key])
        r['favoriteCovers'] = None if r['favoriteCovers'] == '' else r['favoriteCovers'] == 'True'
        r['favoriteHome'] = r['favoriteHome'] == 'True'
    return rows


def main():
    records = read_predictions()
    summary = json.loads((OUT / 'selective-summary.json').read_text())
    by_model = defaultdict(list)
    for r in records:
        by_model[r['model']].append(r)
    out = {'calibrationByModel': {}, 'fixedMaskCoinSearch': {},
        'warning': 'Coin search conditions on already-fit forecast masks, freezes pushes and is not a full pipeline retraining/null significance test.'}
    for model in MODELS:
        test = [r for r in by_model[model] if r['season'] >= 2023]
        raw = np.array([max(r['raw'], 1-r['raw']) for r in test])
        cal = np.array([max(r['calibrated'], 1-r['calibrated']) for r in test])
        out['calibrationByModel'][model] = {'raw55Count': int(np.sum(raw >= .55)),
            'calibrated55Count': int(np.sum(cal >= .55)), 'maxRawProbability': float(max(raw)),
            'maxCalibratedProbability': float(max(cal))}
    # Same random outcome for each game across all overlapping policies.
    # Shows the danger of hindsight subgroup searches even with fair coins.
    for phase, start, end in [('validation', 2020, 2022), ('test', 2023, 2025)]:
        reference = [r for r in by_model[MODELS[0]] if start <= r['season'] <= end and r['favoriteCovers'] is not None]
        game_ids = [r['gameId'] for r in reference]
        directions, names = [], []
        for name, values in summary['policies'].items():
            s = values[phase]
            if s['decisions'] < 30 or s['coverage'] > .2 or s['seasonsWithPicks'] < 3:
                continue
            model, channel, probability, gap = name.split('|')
            rows = apply_policy([r for r in by_model[model] if start <= r['season'] <= end],
                                 channel, float(probability[1:]), float(gap[3:]))
            lookup = {r['gameId']: r for r in rows}
            directions.append([1 if lookup[g]['side'] == 'favorite' else -1 if lookup[g]['side'] == 'underdog' else 0 for g in game_ids])
            names.append(name)
        direction = np.array(directions, dtype=float)
        rng = np.random.default_rng(20261004)
        coins = rng.choice([-1., 1.], size=(len(game_ids), 5000))
        n = np.sum(np.abs(direction), axis=1)
        wins = (n[:, None] + direction @ coins)/2
        rates = wins/n[:, None]
        # Rank policies by Wilson lower bound, exactly as candidate selection does.
        z = 1.96
        lower = (rates+z*z/(2*n[:, None])-z*np.sqrt(rates*(1-rates)/n[:, None]+z*z/(4*n[:, None]**2)))/(1+z*z/n[:, None])
        selected_ids = np.argmax(lower, axis=0)
        selected_rate = rates[selected_ids, np.arange(5000)]
        chosen = summary['selectedCandidatePolicy'] if phase == 'validation' else summary['testHindsightTopPolicies_NOT_VALIDATED'][0]
        observed = summary['policies'][chosen][phase]
        out['fixedMaskCoinSearch'][phase] = {'eligibleOverlappingPolicies': len(names), 'trials': 5000,
             'medianWinningPolicyRate': float(np.median(selected_rate)),
             'winningPolicyRate95': np.quantile(selected_rate, [.025, .975]).tolist(),
             'fractionWinnerRateAtLeast55': float(np.mean(selected_rate >= .55)),
             'fractionBestLowerBoundAtLeastObserved': float(np.mean(np.max(lower, axis=0) >= observed['lower95'])),
             'observedChosenPolicy': chosen, 'observedRate': observed['accuracy']}
    selected = summary['selectedCandidatePolicy']
    out['selectedCandidatePosterior_descriptiveOnly'] = {}
    for phase in ['validation', 'test']:
        s = summary['policies'][selected][phase]
        # Symmetric 20-observation prior. Post-selection posterior is not a guarantee.
        a, b = 10+s['wins'], 10+s['losses']
        out['selectedCandidatePosterior_descriptiveOnly'][phase] = {
             'prior': 'Beta(10,10)', 'mean': a/(a+b),
             'probabilityRateExceeds55': float(beta.sf(.55, a, b)),
             'credible95': beta.ppf([.025, .975], a, b).tolist(),
             'warning': 'Conditions on selected subgroup; does not adjust for discovery or correlated games.'}
    (OUT / 'selective-diagnostics.json').write_text(json.dumps(out, indent=2)+'\n')
    print(json.dumps(out, indent=2))


if __name__ == '__main__':
    main()
