"""Boundary tests for the selective-confidence extension."""
import unittest
import numpy as np
from selective import favorite_frame, choose_side, evidence, select_policy, fit_predict, generate_predictions, rating_history


class SelectiveTests(unittest.TestCase):
    def test_favorite_orientation_does_not_confuse_home_and_away(self):
        f = {'diff.mean.netEpaPerPlay': .1, 'home.restDays': 10,
             'away.restDays': 7, 'diff.mean.pointsFor': 4,
             'diff.mean.pointsAgainst': -2}
        a = favorite_frame({'marketMargin': 3, 'residual': -1, 'features': f})
        b = favorite_frame({'marketMargin': -3, 'residual': -1, 'features': f})
        self.assertEqual(a['favoriteCovers'], False)
        self.assertEqual(b['favoriteCovers'], True)
        self.assertAlmostEqual(a['features']['netEpa'], .1)
        self.assertAlmostEqual(b['features']['netEpa'], -.1)
        self.assertEqual(a['features']['restEdge'], 3)
        self.assertEqual(b['features']['restEdge'], -3)
        self.assertEqual(a['features']['netPoints'], 6)

    def test_abstention_and_push_are_explicit(self):
        self.assertEqual(choose_side(.54, .55), 'abstain')
        self.assertEqual(choose_side(.56, .55), 'favorite')
        self.assertEqual(choose_side(.44, .55), 'underdog')
        self.assertEqual(choose_side(.5, .55), 'abstain')

    def test_ratings_do_not_use_possibly_unfinished_earlier_same_day_games(self):
        target = {'kickoff': {'date': '2024-09-29', 'time': '16:05'}}
        yesterday = {'kickoff': {'date': '2024-09-28', 'time': '20:00'}}
        early_today = {'kickoff': {'date': '2024-09-29', 'time': '13:00'}}
        future = {'kickoff': {'date': '2024-09-30', 'time': '20:00'}}
        self.assertEqual(rating_history([yesterday, early_today, future], target), [yesterday])

    def test_small_sample_is_not_confident_evidence_of_55_percent(self):
        e = evidence(60, 100, searched=1)
        self.assertLess(e['lower95'], .55)
        self.assertFalse(e['strong55Evidence'])
        self.assertTrue(evidence(700, 1000, searched=1)['strong55Evidence'])
        self.assertGreaterEqual(evidence(60, 100, searched=50)['pValue55Adjusted'], e['pValue55'])

    def test_policy_selection_cannot_see_current_or_future_seasons(self):
        history = [{'policy': 'a', 'season': y, 'picked': True, 'win': i < 6}
                   for y in [2020, 2021, 2022] for i in range(10)]
        expected = select_policy(history, evaluation_year=2023, max_coverage=1.)
        self.assertEqual(expected, 'a')
        future = [{'policy': 'b', 'season': y, 'picked': True, 'win': True}
                  for y in [2023, 2024] for _ in range(1000)]
        self.assertEqual(select_policy(history + future, evaluation_year=2023, max_coverage=1.), expected)

    def test_predictions_do_not_depend_on_target_outcome(self):
        rng = np.random.default_rng(8)
        train = rng.normal(size=(120, 4))
        labels = (train[:, 0] > 0).astype(int)
        target = rng.normal(size=(3, 4))
        first = fit_predict('logistic_c0.1', train, labels, target)
        # No target outcomes are accepted by the predictor interface.
        second = fit_predict('logistic_c0.1', train.copy(), labels.copy(), target.copy())
        np.testing.assert_allclose(first, second)
        self.assertTrue(np.all((first >= 0) & (first <= 1)))

    def test_full_forecast_pipeline_ignores_target_scores_and_future_records(self):
        import copy
        rng = np.random.default_rng(10)
        rows = []
        for year, n in [(2009, 120), (2010, 3)]:
            for i in range(n):
                rows.append({'gameId': f'{year}_{i}', 'season': year, 'week': 7,
                   'marketMargin': 3., 'residual': 1 if i % 2 else -1,
                   'homeTeam': 'H', 'awayTeam': 'A',
                   'features': {'diff.mean.netEpaPerPlay': float(rng.normal()),
                                'home.restDays': 7, 'away.restDays': 7}})
        first = generate_predictions(rows, years=[2010])
        poisoned = copy.deepcopy(rows)
        for g in poisoned:
            if g['season'] == 2010:
                g['residual'] = 999.
                g['homeScore'] = 999.
        future = copy.deepcopy(poisoned[-1])
        future['season'], future['gameId'] = 2011, 'future'
        second = generate_predictions(poisoned + [future], years=[2010])
        self.assertEqual(len(first), len(second))
        for a, b in zip(first, second):
            self.assertEqual(a['raw'], b['raw'])
            self.assertEqual(a['calibrated'], b['calibrated'])


if __name__ == '__main__':
    unittest.main()
