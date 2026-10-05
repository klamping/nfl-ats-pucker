"""Safety tests for throwaway roster-loss research."""
import unittest
from datetime import datetime, timezone
from pilot import prior_window, select_reports, exposure, choose_side, window_metrics, ir_state, forecast, results


class PilotTests(unittest.TestCase):
    def test_missing_scheduled_postgame_forces_abstention(self):
        rows = [{'gameId': str(i), 'season': 2024, 'gameType': 'REG', 'kickoff': {'date': d}, 'team': 'H'}
                for i, d in enumerate(['2024-09-01', '2024-09-08', '2024-09-22'])]
        self.assertIsNone(prior_window(rows, '2024-09-29', 2024, 'H', 'last3', ['0', '1', 'missing', '2']))

    def test_selection_requires_fifteen_decisions_in_each_season(self):
        rows = [{'gameId': f'{y}_{i}', 'season': y, 'policy': 'season|multi_unit', 'pick': 'home',
                 'win': True, 'featureEligible': True, 'qbOut': False, 'affectedNetPoints': 1}
                for y, n in [(2019, 13), (2020, 16), (2021, 8), (2022, 2), (2023, 2), (2024, 2)] for i in range(n)]
        # Include abstentions so coverage is not the reason for rejection.
        rows += [{**rows[0], 'season': y, 'pick': None, 'win': None} for y in range(2019, 2025) for _ in range(150)]
        self.assertIsNone(results(rows)['selectedPolicy'])

    def test_window_rejects_current_future_and_unavailable_prior_dates(self):
        rows = [{'gameId': str(i), 'season': 2024, 'gameType': 'REG',
                 'kickoff': {'date': d}, 'team': 'H'} for i, d in enumerate(
                    ['2024-09-01', '2024-09-08', '2024-09-15', '2024-09-22', '2024-09-29'])]
        self.assertEqual([r['gameId'] for r in prior_window(rows, '2024-09-22', 2024, 'H', 'last3')], ['0', '1', '2'])
        # An intervening unfinished/unpublished game must cause abstention, not a shifted window.
        unavailable = {'gameId': 'late', 'season': 2024, 'gameType': 'REG', 'kickoff': {'date': '2024-09-21'}, 'team': 'H'}
        self.assertIsNone(prior_window(rows+[unavailable], '2024-09-22', 2024, 'H', 'season'))

    def test_reports_require_explicit_latest_pregame_out(self):
        ko = datetime(2024, 9, 22, 17, tzinfo=timezone.utc)
        base = {'gsis_id': 'a', 'position': 'G', 'report_status': 'Out', 'date_modified': '2024-09-20T12:00:00Z'}
        reports, issues = select_reports([base], ko)
        self.assertEqual(set(reports), {'a'})
        self.assertFalse(issues)
        for ts in ['', '2024-09-22T17:00:00Z', '2024-09-01T12:00:00Z']:
            reports, issues = select_reports([{**base, 'date_modified': ts}], ko)
            self.assertFalse(reports)
            self.assertTrue(issues)
        later = {**base, 'report_status': 'Questionable', 'date_modified': '2024-09-21T12:00:00Z'}
        self.assertFalse(select_reports([base, later], ko)[0])

    def test_conflicting_same_timestamp_reports_are_unknown(self):
        ko = datetime(2024, 9, 22, 17, tzinfo=timezone.utc)
        row = {'gsis_id': 'a', 'position': 'G', 'report_status': 'Out', 'date_modified': '2024-09-20T12:00:00Z'}
        reports, issues = select_reports([row, {**row, 'report_status': ''}], ko)
        self.assertFalse(reports)
        self.assertTrue(issues)

    def test_exposure_uses_exact_window_and_does_not_double_count_qbs(self):
        history = [{'gameId': str(i)} for i in range(3)]
        tables = {('0', 'H'): {'p': {'offense_pct': '1', 'defense_pct': '0'}},
                  ('1', 'H'): {'p': {'offense_pct': '.5', 'defense_pct': '0'}}, ('2', 'H'): {}}
        out = {'g': {'position': 'G', 'full_name': 'Guard'}, 'q': {'position': 'QB', 'full_name': 'QB'}}
        result = exposure(history, 'H', out, {'g': 'p', 'q': 'q'}, tables)
        self.assertEqual(result['total'], .5)
        self.assertEqual(result['units']['OL'], .5)
        self.assertTrue(result['qbOut'])
        self.assertEqual(result['players'][0]['shares'], [1., .5, 0.])

    def test_missing_table_or_unmapped_out_is_not_zero_loss(self):
        out = {'g': {'position': 'G', 'full_name': 'Guard'}}
        history = [{'gameId': '0'}]
        self.assertIsNone(exposure(history, 'H', out, {'g': 'p'}, {}))
        self.assertIsNone(exposure(history, 'H', out, {}, {('0', 'H'): {}}))

    def test_unit_threshold_and_opponent_loss_both_matter(self):
        def profile(ol):
            return {'total': ol, 'units': {'OL': ol, 'secondary': 0}, 'majorCount': 2, 'majorUnits': ['OL'], 'qbOut': False}
        pressure = {'defensiveSackRate': .08, 'passingEpaPerDropback': .2}
        self.assertEqual(choose_side('ol_pressure', profile(1.6), profile(.2), pressure, pressure), 'home')
        self.assertIsNone(choose_side('ol_pressure', profile(1.6), profile(.8), pressure, pressure))
        self.assertIsNone(choose_side('ol_pressure', profile(1.6), profile(.2), pressure, {**pressure, 'defensiveSackRate': .05}))

    def test_qb_out_prevents_both_sides_picks(self):
        high = {'total': 3., 'majorCount': 3, 'majorUnits': ['OL', 'secondary'], 'units': {'OL': 2, 'secondary': 1}, 'qbOut': False}
        low = {**high, 'total': 0, 'qbOut': True}
        self.assertIsNone(choose_side('multi_unit', high, low, {}, {}))

    def test_stats_are_equal_game_means_over_the_same_window(self):
        rows = [{'passingEpaPerDropback': v, 'defensiveSackRate': .1, 'pointsFor': 20, 'pointsAgainst': 10} for v in [.2, .1, -.3]]
        self.assertAlmostEqual(window_metrics(rows)['passingEpaPerDropback'], 0.)
        self.assertEqual(window_metrics(rows)['netPoints'], 10.)

    def test_ir_minimum_does_not_imply_indefinite_absence(self):
        event = {'startUtc': '2024-09-25T20:00:00Z', 'season': 2024, 'seasonEnding': False}
        ko = datetime(2024, 10, 13, 17, tzinfo=timezone.utc)
        dates = ['2024-09-29', '2024-10-07']
        self.assertEqual(ir_state(event, ko, dates), 'out')
        self.assertEqual(ir_state(event, ko, dates+['2024-10-09', '2024-10-11']), 'unknown')
        self.assertEqual(ir_state({**event, 'practiceWindowUtc': '2024-10-10T20:00:00Z'}, ko, dates), 'out')
        self.assertEqual(ir_state({**event, 'activatedUtc': '2024-10-12T20:00:00Z'}, ko, dates), 'activated')

    def test_forecast_shrinks_small_samples(self):
        self.assertEqual(forecast(0, 0), .5)
        self.assertLess(forecast(6, 10), .55)


if __name__ == '__main__':
    unittest.main()
