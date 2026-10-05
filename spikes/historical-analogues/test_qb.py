"""Safety boundaries for the QB-absence mechanism spike."""
import unittest
from datetime import datetime, timezone
from qb_mechanism import eligible_report, prior_qbs, kickoff_utc, cohorts, shrunk_probability, construct_cases, latest_report


class QBTests(unittest.TestCase):
    def test_timestamp_missing_late_or_stale_never_establishes_out(self):
        kickoff = datetime(2024, 9, 29, 17, tzinfo=timezone.utc)
        base = {'position': 'QB', 'report_status': 'Out', 'date_modified': '2024-09-27T20:00:00Z'}
        self.assertTrue(eligible_report(base, kickoff))
        for timestamp in ['', '2024-09-29T17:00:00Z', '2024-09-29T18:00:00Z', '2024-09-01T00:00:00Z', 'invalid']:
            self.assertFalse(eligible_report({**base, 'date_modified': timestamp}, kickoff))

    def test_questionable_doubtful_and_practice_dnp_are_not_out(self):
        kickoff = datetime(2024, 9, 29, 17, tzinfo=timezone.utc)
        for status in ['', 'Questionable', 'Doubtful']:
            self.assertFalse(eligible_report({'position': 'QB', 'report_status': status,
                  'practice_status': 'Did Not Participate In Practice',
                  'date_modified': '2024-09-27T20:00:00Z'}, kickoff))

    def test_eastern_kickoff_uses_actual_dst_offset(self):
        self.assertEqual(kickoff_utc({'gameday': '2024-09-29', 'gametime': '13:00'}).hour, 17)
        self.assertEqual(kickoff_utc({'gameday': '2024-11-24', 'gametime': '13:00'}).hour, 18)

    def test_only_prior_qbs_define_recent_and_dominant_starter(self):
        def game(week, date, qb):
            return {'season': '2024', 'week': str(week), 'game_type': 'REG', 'gameday': date,
                    'gametime': '13:00', 'game_id': str(week), 'home_team': 'H', 'away_team': 'A',
                    'home_qb_id': qb, 'away_qb_id': 'away', 'home_qb_name': qb, 'away_qb_name': 'Away'}
        prior = [game(1, '2024-09-08', 'starter'), game(2, '2024-09-15', 'starter'), game(3, '2024-09-22', 'starter')]
        target = game(4, '2024-09-29', 'eventual_backup')
        expected = prior_qbs(target, 'H', prior)
        self.assertEqual(expected['recent'], 'starter')
        self.assertEqual(expected['dominant'], 'starter')
        self.assertEqual(expected['recentCareerStarts'], 3)
        future = game(5, '2024-10-06', 'poison')
        self.assertEqual(prior_qbs(target, 'H', prior + [target, future]), expected)

    def test_cohorts_are_facts_not_current_game_outcomes(self):
        facts = {'recentOut': True, 'dominantOut': True, 'recentCareerStarts': 40,
                 'affectedSpread': 7, 'passingEpa': .1}
        result = cohorts(facts)
        self.assertTrue(result['recent_out'])
        self.assertTrue(result['experienced_recent_out'])
        self.assertTrue(result['large_underdog_recent_out'])
        self.assertFalse(cohorts({**facts, 'recentOut': False})['recent_out'])

    def test_small_samples_shrink_toward_neutral(self):
        self.assertEqual(shrunk_probability(0, 0), .5)
        self.assertEqual(shrunk_probability(6, 10), 16/30)
        self.assertLess(shrunk_probability(6, 10), .55)

    def test_latest_pregame_status_overrides_an_earlier_out(self):
        kickoff = datetime(2024, 9, 29, 17, tzinfo=timezone.utc)
        earlier = {'position': 'QB', 'report_status': 'Out', 'date_modified': '2024-09-26T20:00:00Z'}
        later = {**earlier, 'report_status': 'Questionable', 'date_modified': '2024-09-27T20:00:00Z'}
        self.assertFalse(eligible_report(latest_report([earlier, later], kickoff), kickoff))

    def test_case_facts_ignore_eventual_target_qb_and_scores(self):
        import copy
        schedule = [{'season': '2024', 'week': str(i), 'game_type': 'REG',
              'gameday': f'2024-09-{day}', 'gametime': '13:00', 'game_id': str(i),
              'home_team': 'H', 'away_team': 'A', 'home_qb_id': 'starter',
              'away_qb_id': 'away', 'home_qb_name': 'Starter', 'away_qb_name': 'Away'}
              for i, day in [(1, '08'), (2, '15'), (3, '22'), (4, '29')]]
        target = {'gameId': '4', 'season': 2024, 'week': 4, 'homeTeam': 'H', 'awayTeam': 'A',
                  'closingSpreadHome': 7., 'residual': 3., 'homePregame': {'passingEpaPerDropback': .1},
                  'awayPregame': {'passingEpaPerDropback': .1}}
        injury = {'position': 'QB', 'report_status': 'Out', 'date_modified': '2024-09-27T20:00:00Z',
                  'full_name': 'Starter', 'gsis_id': 'starter', 'sourceFile': 'fixture'}
        injuries = {(2024, 4, 'H', 'starter'): [injury],
                    (2024, 4, 'H', 'backup'): [{**injury, 'gsis_id': 'backup'}],
                    (2024, 4, 'UNKNOWN', 'orphan'): [{**injury, 'gsis_id': 'orphan'}]}
        a, audit = construct_cases([target], schedule, injuries)
        self.assertEqual(audit['role_lookups_without_injury_record'], 2)
        self.assertEqual(audit['injury_keys_without_target_team_week'], 1)
        self.assertEqual(audit['injury_keys_on_target_team_week_not_queried_as_role'], 1)
        poisoned = copy.deepcopy(schedule)
        poisoned[-1]['home_qb_id'] = 'eventual_backup'
        b, _ = construct_cases([{**target, 'residual': -999}], poisoned, injuries)
        self.assertEqual(len(a), 1)
        self.assertEqual({k:v for k,v in a[0].items() if k != 'affectedCover'},
                         {k:v for k,v in b[0].items() if k != 'affectedCover'})

    def test_corroborated_schedule_correction_is_copy_only(self):
        from qb_mechanism import corrected_schedule
        row = {'game_id': '2022_11_CAR_BAL', 'away_qb_id': '00-0033275', 'away_qb_name': 'Phillip Walker'}
        fixed = corrected_schedule([row])
        self.assertEqual(fixed[0]['away_qb_name'], 'Baker Mayfield')
        self.assertEqual(row['away_qb_name'], 'Phillip Walker')

    def test_career_starts_exclude_pre_2005_schedule_rows(self):
        def game(season, day):
            return {'season': str(season), 'game_type': 'REG', 'gameday': day,
                    'home_team': 'H', 'away_team': 'A', 'home_qb_id': 'starter',
                    'away_qb_id': 'other', 'home_qb_name': 'Starter'}
        history = [game(2004, '2004-09-12'), game(2005, '2005-09-11'), game(2024, '2024-09-08')]
        self.assertEqual(prior_qbs(game(2024, '2024-09-29'), 'H', history)['recentCareerStarts'], 2)


if __name__ == '__main__':
    unittest.main()
