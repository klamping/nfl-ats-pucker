"""Safety tests for the throwaway spike; run with unittest discovery."""
import unittest
import numpy as np
from research import home_spread, build_features, scale_from_training, neighbor_indices, run_models


class SafetyTests(unittest.TestCase):
    def test_home_favorite_must_cover_not_just_win(self):
        # A home favorite of 7 winning by 3 loses ATS.
        self.assertEqual(home_spread({'spread_line': '7'}), -7)
        self.assertLess(3 + home_spread({'spread_line': '7'}), 0)
        self.assertEqual(7 + home_spread({'spread_line': '7'}), 0)

    def test_features_exclude_current_future_and_other_seasons(self):
        target = {'gameId': 'target', 'season': 2024, 'week': 4,
                  'kickoff': {'date': '2024-09-29', 'time': '13:00'},
                  'homeTeam': 'H', 'awayTeam': 'A'}
        def row(game, date, points, season=2024, time='13:00'):
            return {'gameId': game, 'season': season, 'team': 'H',
                    'kickoff': {'date': date, 'time': time},
                    'pointsFor': points, 'pointsAgainst': 10}
        rows = [row('one', '2024-09-01', 10), row('two', '2024-09-08', 20),
                row('three', '2024-09-15', 30), row('four', '2024-09-22', 40)]
        clean = build_features(target, rows)
        poisoned = build_features(target, rows + [row('target', '2024-09-29', 999),
                    row('simultaneous', '2024-09-29', 999),
                    row('future', '2024-10-06', 999), row('old', '2023-09-01', 999, 2023)])
        self.assertEqual(clean, poisoned)
        self.assertEqual(clean['home.mean.pointsFor'], 25)
        self.assertEqual(clean['home.last3.pointsFor'], 30)
        self.assertEqual(clean['home.trend.pointsFor'], 5)

    def test_test_values_do_not_change_scaling(self):
        train = np.array([[1., 2.], [3., np.nan]])
        a, b, center, scale = scale_from_training(train, np.array([[999., np.nan]]))
        np.testing.assert_allclose(center, [2., 2.])
        np.testing.assert_allclose(scale, [1., 1.])
        np.testing.assert_allclose(a, [[-1., 0.], [1., 0.]])
        np.testing.assert_allclose(b, [[997., 0.]])

    def test_neighbors_require_prior_season_and_spread_week_band(self):
        # Future/self rows have perfect distance but must never be eligible.
        indices = neighbor_indices(np.array([.3, 0., 0., .1, .2]),
                    np.array([2023, 2024, 2025, 2023, 2023]),
                    np.array([7, 7, 7, 14, 7]), np.array([-3., -3., -3., -3., 8.]),
                    season=2024, week=7, spread=-3., k=20, spread_band=3.5, week_band=2)
        np.testing.assert_array_equal(indices, [0])

    def test_target_scores_cannot_change_any_predictions(self):
        from research import feature_sets
        keys = {key for values in feature_sets().values() for key in values}
        def game(year, number, residual):
            return {'gameId': f'{year}_{number}', 'season': year, 'week': 7,
                    'closingSpreadHome': -3., 'marketMargin': 3., 'residual': residual,
                    'margin': residual + 3., 'features': {k: float(number) for k in keys}}
        games = [game(2009, 0, 4), game(2009, 1, -5), game(2010, 0, 2)]
        clean = run_models(games, years=[2010])
        games[-1]['margin'] = 999.
        games[-1]['residual'] = 996.
        poisoned = run_models(games, years=[2010])
        for a, b in zip(clean, poisoned):
            for key in ['pHomeCover', 'predictedMargin', 'pHomeWin', 'candidateCount']:
                self.assertEqual(a[key], b[key])


if __name__ == '__main__':
    unittest.main()
