"""Throwaway QB-absence ATS mechanism research. Offline after source capture.

OPENBLAS_NUM_THREADS=1 python3 spikes/historical-analogues/qb_mechanism.py
"""
import csv
import hashlib
import json
from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo
from pathlib import Path
import numpy as np
from research import ROOT, OUT, load_data, wilson
from selective import evidence

EXTERNAL = Path(__file__).resolve().parent / 'external'
COHORTS = ['recent_out', 'dominant_out', 'experienced_recent_out',
           'underdog_recent_out', 'large_underdog_recent_out', 'good_passing_recent_out']


def corrected_schedule(schedule):
    # Proven schedule metadata error, not an outcome-based exclusion. The team's
    # pregame report and game hub identify Mayfield; retain the affected case.
    # https://www.panthers.com/gameday/2022/week-11/injury-report
    # https://www.panthers.com/gameday/2022/week-11/game-hub-web
    return [{**r, 'away_qb_id': '00-0034855', 'away_qb_name': 'Baker Mayfield'}
            if r['game_id'] == '2022_11_CAR_BAL' else dict(r) for r in schedule]


def team_key(team):
    return {'LA': 'LAR', 'STL': 'LAR', 'LAR': 'LAR', 'SD': 'LAC',
            'OAK': 'LV', 'JAC': 'JAX', 'WSH': 'WAS'}.get(team, team)


def timestamp(row):
    value = row.get('date_modified', '')
    if not value:
        return None
    try:
        result = datetime.fromisoformat(value.replace('Z', '+00:00'))
        return result.astimezone(timezone.utc) if result.tzinfo is not None else None
    except (ValueError, TypeError):
        return None


def report_timing(row, kickoff):
    t = timestamp(row)
    if t is None:
        return 'missing_or_invalid_timestamp'
    if t >= kickoff:
        return 'not_before_kickoff'
    if t < kickoff - timedelta(days=7):
        return 'older_than_seven_days'
    return 'pregame_timestamp'


def eligible_report(row, kickoff):
    return row.get('position') == 'QB' and row.get('report_status', '').lower() == 'out' and report_timing(row, kickoff) == 'pregame_timestamp'


def latest_report(rows, kickoff):
    eligible = [r for r in rows if r.get('position') == 'QB' and report_timing(r, kickoff) == 'pregame_timestamp']
    if not eligible:
        return None
    latest_time = max(timestamp(r) for r in eligible)
    latest = [r for r in eligible if timestamp(r) == latest_time]
    if len({r.get('report_status', '').lower() for r in latest}) > 1:
        return None  # conflicting records at the same timestamp => abstain
    return latest[0]


def kickoff_utc(game):
    wall = datetime.fromisoformat(f"{game['gameday']}T{game['gametime']}:00")
    return wall.replace(tzinfo=ZoneInfo('America/New_York')).astimezone(timezone.utc)


def prior_qbs(target, team, schedule):
    team = team_key(team)
    prior = []
    for g in schedule:
        # Calendar-date cutoff also excludes possibly unfinished same-day games.
        if g.get('game_type') != 'REG' or g['gameday'] >= target['gameday']:
            continue
        if team_key(g['home_team']) == team:
            side = 'home'
        elif team_key(g['away_team']) == team:
            side = 'away'
        else:
            continue
        if g.get(f'{side}_qb_id'):
            prior.append((g, g[f'{side}_qb_id'], g.get(f'{side}_qb_name', '')))
    current_season = sorted([r for r in prior if int(r[0]['season']) == int(target['season'])], key=lambda r: r[0]['gameday'])
    if not current_season:
        return {'recent': None, 'dominant': None, 'recentCareerStarts': 0, 'priorGames': 0}
    recent = current_season[-1][1]
    counts = Counter(r[1] for r in current_season)
    leader = max(counts, key=lambda q: (counts[q], max(r[0]['gameday'] for r in current_season if r[1] == q)))
    dominant = leader if counts[leader] >= 2 and counts[leader]/len(current_season) >= .6 else None
    # Protocol's 2005+ career window includes other franchises, never future dates.
    career = 0
    for g in schedule:
        if g.get('game_type') == 'REG' and int(g['season']) >= 2005 and g['gameday'] < target['gameday']:
            career += g.get('home_qb_id') == recent
            career += g.get('away_qb_id') == recent
    return {'recent': recent, 'dominant': dominant, 'recentCareerStarts': career,
            'priorGames': len(current_season), 'recentName': current_season[-1][2],
            'dominantName': next((r[2] for r in current_season if r[1] == dominant), None)}


def cohorts(facts):
    recent = facts['recentOut']
    return {'recent_out': recent, 'dominant_out': facts['dominantOut'],
        'experienced_recent_out': recent and facts['recentCareerStarts'] >= 32,
        'underdog_recent_out': recent and facts['affectedSpread'] > 0,
        'large_underdog_recent_out': recent and facts['affectedSpread'] >= 7,
        'good_passing_recent_out': recent and facts['passingEpa'] is not None and facts['passingEpa'] > 0}


def shrunk_probability(wins, decisions):
    return (wins+10)/(decisions+20)


def injury_sources():
    manifest = json.loads((EXTERNAL / 'injury-capture-manifest.json').read_text())
    indexed = defaultdict(list)
    source_audit = []
    for asset in manifest['assets']:
        path = ROOT / asset['path']
        content = path.read_bytes()
        assert hashlib.sha256(content).hexdigest() == asset['sha256'], f'Changed source: {path}'
        with path.open() as f:
            rows = list(csv.DictReader(f))
        quarterbacks = [r for r in rows if r['position'] == 'QB' and (r.get('game_type') or r.get('season_type')) == 'REG' and 4 <= int(r['week']) <= 14]
        source_audit.append({'season': asset['season'], 'rows': len(rows), 'qbTargetWeekRows': len(quarterbacks),
             'hasTimestampColumn': asset['has_timestamp'], 'timestampedQbRows': sum(timestamp(r) is not None for r in quarterbacks),
             'statusCounts': dict(Counter(r['report_status'] or 'blank' for r in quarterbacks))})
        for row in quarterbacks:
            row = {**row, 'sourceFile': asset['path']}
            indexed[(int(row['season']), int(row['week']), team_key(row['team']), row['gsis_id'])].append(row)
    return indexed, source_audit


def construct_cases(games, schedule, injuries):
    raw_by_id = {r['game_id']: r for r in schedule}
    audit = Counter()
    cases = []
    queried_keys = set()
    target_team_weeks = {(g['season'], g['week'], team_key(g[f'{side}Team']))
                         for g in games if 2009 <= g['season'] <= 2025 for side in ['home', 'away']}
    audit['injury_keys_total'] = len(injuries)
    audit['injury_keys_without_target_team_week'] = sum(k[:3] not in target_team_weeks for k in injuries)
    for game in games:
        if not 2009 <= game['season'] <= 2025:
            continue
        raw = raw_by_id[game['gameId']]
        kickoff = kickoff_utc(raw)
        affected = []
        for side in ['home', 'away']:
            team = game[f'{side}Team']
            history = prior_qbs(raw, team, schedule)
            role_reports = {}
            for role in ['recent', 'dominant']:
                q = history[role]
                if q is None:
                    audit['role_lookups_without_prior_qb'] += 1
                    continue
                key = (game['season'], game['week'], team_key(team), q)
                queried_keys.add(key)
                rows = injuries.get(key, [])
                audit['role_lookups_total'] += 1
                audit['role_lookups_with_injury_record' if rows else 'role_lookups_without_injury_record'] += 1
                for r in rows:
                    audit[f"role_report_timing_{report_timing(r, kickoff)}"] += 1
                report = latest_report(rows, kickoff)
                if report is not None:
                    audit[f"role_report_status_{report.get('report_status') or 'blank'}"] += 1
                    if eligible_report(report, kickoff):
                        role_reports[role] = report
            if not role_reports:
                continue  # absent/uncertain/missing reports do NOT imply healthy/out
            report = role_reports.get('recent', role_reports.get('dominant'))
            facts = {'recentOut': 'recent' in role_reports, 'dominantOut': 'dominant' in role_reports,
                     'recentCareerStarts': history['recentCareerStarts'],
                     'affectedSpread': game['closingSpreadHome'] if side == 'home' else -game['closingSpreadHome'],
                     'passingEpa': game[f'{side}Pregame']['passingEpaPerDropback']}
            sign = 1 if side == 'home' else -1
            margin = sign*game['residual']
            affected.append({'gameId': game['gameId'], 'season': game['season'], 'week': game['week'],
                 'affectedTeam': team, 'opponent': game['awayTeam'] if side == 'home' else game['homeTeam'],
                 'affectedHome': side == 'home', 'kickoffUtc': kickoff.isoformat(),
                 'knownOutQb': report['full_name'], 'knownOutGsis': report['gsis_id'],
                 'reportUpdatedUtc': report['date_modified'], 'sourceFile': report['sourceFile'],
                 'cohorts': cohorts(facts), 'facts': facts,
                 'affectedCover': None if margin == 0 else margin > 0})
            # Audit ONLY: never influences eligibility/predictions/policy selection.
            audit['out_report_actual_target_starter_conflict'] += raw.get(f'{side}_qb_id') == report['gsis_id']
        if len(affected) > 1:
            audit['both_teams_affected_abstained'] += 1
            continue
        cases.extend(affected)
    cases.sort(key=lambda r: (r['season'], r['kickoffUtc'], r['gameId']))
    audit['single_affected_game_cases'] = len(cases)
    audit['injury_keys_queried_as_role'] = sum(k in queried_keys for k in injuries)
    audit['injury_keys_on_target_team_week_not_queried_as_role'] = sum(k[:3] in target_team_weeks and k not in queried_keys for k in injuries)
    audit['cases_by_season'] = dict(Counter(r['season'] for r in cases))
    return cases, dict(audit)


def stats(rows, action, searched=12, total_games=None):
    decisions = [r for r in rows if r['affectedCover'] is not None]
    wins = sum(r['affectedCover'] if action == 'affected' else not r['affectedCover'] for r in decisions)
    n = len(decisions)
    return {'picks': len(rows), 'decisions': n, 'wins': wins, 'losses': n-wins,
            'pushes': len(rows)-n, 'accuracy': wins/n if n else None,
            'coverage': len(rows)/total_games if total_games else None,
            'seasonsWithPicks': len({r['season'] for r in decisions}),
            **evidence(wins, n, searched)}


def prior_only_forecasts(cases):
    records = []
    for row in cases:
        if row['season'] > 2024:
            continue
        for cohort in COHORTS:
            if not row['cohorts'][cohort]:
                continue
            prior = [r for r in cases if r['season'] < row['season'] and r['cohorts'][cohort] and r['affectedCover'] is not None]
            n, wins = len(prior), sum(r['affectedCover'] for r in prior)
            probability = shrunk_probability(wins, n)
            side = 'affected' if probability >= .55 else 'opponent' if probability <= .45 else 'abstain'
            if n < 20 or len({r['season'] for r in prior}) < 3:
                side = 'abstain'
            records.append({'gameId': row['gameId'], 'season': row['season'], 'cohort': cohort,
                'priorDecisions': n, 'priorAffectedWins': wins, 'pAffectedCover': probability,
                'chosenSide': side, 'chosenProbability': probability if side == 'affected' else 1-probability if side == 'opponent' else None,
                'win': None if side == 'abstain' or row['affectedCover'] is None else row['affectedCover'] if side == 'affected' else not row['affectedCover']})
    return records


def summarize(cases, games):
    periods = {'development_2009_2018': (2009, 2018), 'validation_2019_2021': (2019, 2021), 'evaluation_2022_2024': (2022, 2024)}
    policies = {}
    candidates = []
    for cohort in COHORTS:
        for action in ['affected', 'opponent']:
            key = f'{cohort}|{action}'
            policies[key] = {}
            for period, (start, end) in periods.items():
                rows = [r for r in cases if start <= r['season'] <= end and r['cohorts'][cohort]]
                total = sum(start <= g['season'] <= end for g in games)
                policies[key][period] = stats(rows, action, total_games=total)
            val = policies[key]['validation_2019_2021']
            if val['decisions'] >= 15 and val['seasonsWithPicks'] == 3 and val['coverage'] <= .2:
                candidates.append((val['lower95'], key))
    selected = max(candidates)[1] if candidates else None
    forecasts = prior_only_forecasts(cases)
    adaptive = {}
    for cohort in COHORTS:
        rows = [r for r in forecasts if r['cohort'] == cohort and 2022 <= r['season'] <= 2024]
        picked = [r for r in rows if r['chosenSide'] != 'abstain']
        decisions = [r for r in picked if r['win'] is not None]
        n, wins = len(decisions), sum(r['win'] for r in decisions)
        adaptive[cohort] = {'cohortCases': len(rows), 'picks': len(picked), 'wins': wins, 'losses': n-wins,
             'pushes': len(picked)-n, 'accuracy': wins/n if n else None,
             'coverageAllGames': len(picked)/sum(2022 <= g['season'] <= 2024 for g in games),
             'meanChosenProbability': float(np.mean([r['chosenProbability'] for r in decisions])) if n else None,
             **evidence(wins, n, searched=6)}
    result = {'protocol': {'source': 'nflverse public injury reports, row date_modified before kickoff within seven days',
        'periods': periods, 'fixedPolicies': 12, 'selection': 'max validation Wilson lower; >=15 decisions, 3 seasons, <=20% coverage',
        'targetStarterUsed': False, 'quote': 'corrected nflverse closing spread; no announcement-time price reconstruction'},
        'policies': policies, 'selectedCandidate': selected, 'selectionEligibleCount': len(candidates),
        'validationStrong55Policies': [key for _, key in candidates if policies[key]['validation_2019_2021']['strong55Evidence']],
        'priorOnly55ForecastsEvaluation': adaptive,
        'warnings': ['Missing records do not mean healthy; 2009 row timestamps are empty and 2025 has no timestamp column; both are excluded.',
             'Development 2009–2018 is effectively 2010–2018 because 2009 lacks usable timestamps.',
             'Unqueried injury keys may be backup QBs; missing role records may mean no report, not necessarily failed joins.',
             'date_modified is a retrospective source update timestamp, not an immutable pregame snapshot.',
             'Starter roles inferred from earlier starts, not confirmed depth charts; IR/benched/long-term absences may be missed.',
             'Repeated QB injuries and team-season outcomes are dependent; binomial/Wilson/search corrections are nominal.',
             'All archived years have already been seen: retrospective corroboration only.']}
    if selected:
        cohort, action = selected.split('|')
        selected_cases = [r for r in cases if 2022 <= r['season'] <= 2024 and r['cohorts'][cohort]]
        result['selectedEvaluationCases'] = selected_cases
        result['selectedByEvaluationYear'] = {str(y): stats([r for r in selected_cases if r['season'] == y], action, searched=12, total_games=sum(g['season'] == y for g in games)) for y in range(2022, 2025)}
    return result, forecasts


def main():
    games, original_audit = load_data()
    with (ROOT / original_audit['schedule_file']).open() as f:
        schedule = list(csv.DictReader(f))
    schedule = corrected_schedule(schedule)
    injuries, sources = injury_sources()
    cases, audit = construct_cases(games, schedule, injuries)
    assert not audit['out_report_actual_target_starter_conflict'], 'Conflicting Out reports require investigation; do not drop based on target outcome.'
    result, forecasts = summarize(cases, games)
    result['sourceAudit'] = sources
    result['caseAudit'] = audit
    result['scheduleCorrection'] = {'gameId': '2022_11_CAR_BAL', 'field': 'away_qb_id/name',
        'raw': 'Phillip Walker / 00-0033275', 'researchOnly': 'Baker Mayfield / 00-0034855',
        'sources': ['https://www.panthers.com/gameday/2022/week-11/injury-report',
                    'https://www.panthers.com/gameday/2022/week-11/game-hub-web']}
    (OUT / 'qb-summary.json').write_text(json.dumps(result, indent=2)+'\n')
    (OUT / 'qb-cases.json').write_text(json.dumps(cases, indent=2)+'\n')
    (OUT / 'qb-prior-forecasts.json').write_text(json.dumps(forecasts, indent=2)+'\n')
    selected = result['selectedCandidate']
    print(json.dumps({'caseAudit': audit, 'selected': selected, 'selectedResults': result['policies'].get(selected),
                      'adaptive55': result['priorOnly55ForecastsEvaluation']}, indent=2))


if __name__ == '__main__':
    main()
