"""Throwaway cumulative roster loss pilot. Offline after documented capture.

OPENBLAS_NUM_THREADS=1 python3 spikes/roster-feasibility/pilot.py
"""
import csv
import hashlib
import json
import math
import sys
from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
sys.path.insert(0, str(HERE.parent / 'historical-analogues'))
from research import load_data, published
from qb_mechanism import team_key, timestamp, report_timing, kickoff_utc
from selective import evidence

WINDOWS = ['season', 'last3']
COHORTS = ['multi_unit', 'ol_pressure', 'secondary_passing']
UNITS = {'C': 'OL', 'G': 'OL', 'T': 'OL', 'OT': 'OL', 'OG': 'OL', 'LT': 'OL', 'RT': 'OL',
         'WR': 'receivers', 'TE': 'receivers', 'RB': 'backs', 'FB': 'backs',
         'DE': 'DL', 'DT': 'DL', 'NT': 'DL', 'ED': 'DL', 'LB': 'LB', 'ILB': 'LB', 'OLB': 'LB',
         'CB': 'secondary', 'S': 'secondary', 'FS': 'secondary', 'SS': 'secondary', 'DB': 'secondary'}
OFFENSE = {'OL', 'receivers', 'backs'}
SPECIAL = {'K', 'P', 'LS'}


def prior_window(rows, target_date, season, team, window, expected_game_ids=None):
    history = sorted([r for r in rows if r['season'] == season and r['gameType'] == 'REG'
                      and team_key(r['team']) == team_key(team) and r['kickoff']['date'] < target_date],
                     key=lambda r: (r['kickoff']['date'], r['gameId']))
    if expected_game_ids is not None and (len(history) != len(expected_game_ids) or set(r['gameId'] for r in history) != set(expected_game_ids)):
        return None
    if len(history) < 3:
        return None
    cutoff = (datetime.fromisoformat(target_date)-timedelta(days=2)).date().isoformat()
    if any(r['kickoff']['date'] > cutoff for r in history):
        return None
    return history[-3:] if window == 'last3' else history


def select_reports(rows, kickoff):
    grouped = defaultdict(list)
    issues = []
    for r in rows:
        timing = report_timing(r, kickoff)
        if timing != 'pregame_timestamp':
            issues.append({'player': r['gsis_id'], 'reason': timing})
        else:
            grouped[r['gsis_id']].append(r)
    out = {}
    for gsis, reports in grouped.items():
        latest = max(timestamp(r) for r in reports)
        records = [r for r in reports if timestamp(r) == latest]
        if len({(r['report_status'].lower(), r['position']) for r in records}) != 1:
            issues.append({'player': gsis, 'reason': 'conflicting_latest_records'})
        elif records[0]['report_status'].lower() == 'out':
            out[gsis] = records[0]
    return out, issues


def exposure(history, team, out, crosswalk, tables):
    if not history or any(tables.get((r['gameId'], team_key(team))) is None for r in history):
        return None
    units = {u: 0. for u in set(UNITS.values())}
    players, major_units = [], set()
    qb_out = False
    for gsis, report in sorted(out.items()):
        position = report['position']
        if position == 'QB':
            qb_out = True
            continue
        if position in SPECIAL:
            continue
        unit = UNITS.get(position)
        if unit is None or gsis not in crosswalk:
            return None
        pfr = crosswalk[gsis]
        metric = 'offense_pct' if unit in OFFENSE else 'defense_pct'
        shares = []
        for game in history:
            row = tables[game['gameId'], team_key(team)].get(pfr)
            value = 0. if row is None else float(row[metric])
            if not math.isfinite(value) or not 0 <= value <= 1:
                return None
            shares.append(value)
        mean = sum(shares)/len(shares)
        units[unit] += mean
        if mean >= .3:
            major_units.add(unit)
        players.append({'gsis': gsis, 'pfr': pfr, 'name': report['full_name'], 'position': position,
                        'unit': unit, 'shares': shares, 'meanShare': mean,
                        'reportUpdated': report.get('date_modified'), 'source': report.get('sourceFile', 'injury_archive')})
    return {'total': sum(units.values()), 'offense': sum(v for u, v in units.items() if u in OFFENSE),
            'defense': sum(v for u, v in units.items() if u not in OFFENSE), 'units': units,
            'majorCount': sum(p['meanShare'] >= .3 for p in players), 'majorUnits': sorted(major_units),
            'qbOut': qb_out, 'players': players, 'historyGameIds': [r['gameId'] for r in history]}


def window_metrics(rows):
    result = {}
    for metric in ['defensiveSackRate', 'passingEpaPerDropback', 'pointsFor', 'pointsAgainst',
                   'offensiveEpaPerPlay', 'defensiveEpaPerPlay']:
        values = [r.get(metric) for r in rows]
        result[metric] = sum(values)/len(values) if values and all(v is not None and math.isfinite(v) for v in values) else None
    result['netPoints'] = None if result['pointsFor'] is None or result['pointsAgainst'] is None else result['pointsFor']-result['pointsAgainst']
    result['netEpa'] = None if result['offensiveEpaPerPlay'] is None or result['defensiveEpaPerPlay'] is None else result['offensiveEpaPerPlay']-result['defensiveEpaPerPlay']
    return result


def choose_side(cohort, home, away, home_metrics, away_metrics):
    if home is None or away is None or home['qbOut'] or away['qbOut']:
        return None
    def qualifies(a, b, opponent):
        if cohort == 'multi_unit':
            return a['total'] >= 2 and a['total']-b['total'] >= 1 and a['majorCount'] >= 3 and len(a['majorUnits']) >= 2
        if cohort == 'ol_pressure':
            rate = opponent.get('defensiveSackRate')
            return a['units']['OL'] >= 1.5 and a['units']['OL']-b['units']['OL'] >= 1 and rate is not None and rate > .07
        if cohort == 'secondary_passing':
            rate = opponent.get('passingEpaPerDropback')
            return a['units']['secondary'] >= 1.5 and a['units']['secondary']-b['units']['secondary'] >= 1 and rate is not None and rate > .1
        raise ValueError(cohort)
    h, a = qualifies(home, away, away_metrics), qualifies(away, home, home_metrics)
    return 'home' if h and not a else 'away' if a and not h else None


def ir_state(event, kickoff, prior_team_dates):
    if int(event['season']) != kickoff.year or datetime.fromisoformat(event['startUtc'].replace('Z', '+00:00')) >= kickoff:
        return 'unknown'
    activated = event.get('activatedUtc')
    if activated and datetime.fromisoformat(activated.replace('Z', '+00:00')) < kickoff:
        return 'activated'
    start_date = event['startUtc'][:10]
    missed = sum(start_date <= d < kickoff.date().isoformat() for d in prior_team_dates)
    return 'out' if event.get('seasonEnding') or missed < 4 else 'unknown'


def forecast(wins, decisions):
    return (wins+10)/(decisions+20)


def read_csv(path):
    with path.open() as f:
        return list(csv.DictReader(f))


def verified_assets(manifest_path):
    manifest = json.loads(manifest_path.read_text())
    for asset in manifest['assets']:
        p = ROOT / asset['path']
        assert hashlib.sha256(p.read_bytes()).hexdigest() == asset['sha256'], f'Changed source: {p}'
    return manifest['assets']


def load_sources():
    audit = Counter()
    player_assets = verified_assets(HERE / 'external/capture-manifest.json')
    player_path = next(ROOT/a['path'] for a in player_assets if a['path'].endswith('/players.csv'))
    ids = defaultdict(set)
    reverse = defaultdict(set)
    for r in read_csv(player_path):
        if r['gsis_id'] and r['pfr_id']:
            ids[r['gsis_id']].add(r['pfr_id'])
            reverse[r['pfr_id']].add(r['gsis_id'])
    crosswalk = {g: next(iter(p)) for g, p in ids.items() if len(p) == 1 and len(reverse[next(iter(p))]) == 1}
    tables = defaultdict(dict)
    bad = set()
    for asset in verified_assets(HERE / 'external/pilot-snap-manifest.json'):
        for r in read_csv(ROOT/asset['path']):
            if r['game_type'] != 'REG':
                continue
            key = r['game_id'], team_key(r['team'])
            pfr = r['pfr_player_id']
            if not pfr or pfr in tables[key]:
                audit['duplicate_or_missing_snap_player_id'] += 1
                bad.add(key)
            tables[key][pfr] = r
    # Rounded percentages sum to approximately 11 players; broad tolerance detects
    # incomplete/malformed tables, not an assertion of perfect snap provenance.
    for key, rows in tables.items():
        try:
            valid = len(rows) >= 35 and all(0 <= float(r[m]) <= 1 and math.isfinite(float(r[m])) for r in rows.values() for m in ['offense_pct', 'defense_pct'])
            valid = valid and all(10.4 <= sum(float(r[m]) for r in rows.values()) <= 11.6 for m in ['offense_pct', 'defense_pct'])
        except (ValueError, TypeError):
            valid = False
        if not valid:
            audit['malformed_or_incomplete_snap_tables'] += 1
            bad.add(key)
    for key in bad:
        tables[key] = None
    injuries = defaultdict(list)
    for asset in verified_assets(HERE.parent / 'historical-analogues/external/injury-capture-manifest.json'):
        if not 2013 <= asset['season'] <= 2024:
            continue
        for r in read_csv(ROOT/asset['path']):
            if r.get('game_type') == 'REG':
                injuries[int(r['season']), int(r['week']), team_key(r['team'])].append({**r, 'sourceFile': asset['path']})
    audit['snap_team_game_tables'] = len(tables)
    audit['crosswalk_pairs'] = len(crosswalk)
    return crosswalk, dict(tables), injuries, dict(audit)


def build_records(games, postgames, schedule, crosswalk, tables, injuries):
    raw = {r['game_id']: r for r in schedule}
    by_team = defaultdict(list)
    for r in postgames:
        by_team[r['season'], team_key(r['team'])].append(r)
    records, profiles = [], {}
    audit = Counter()
    for game in games:
        if not 2013 <= game['season'] <= 2024:
            continue
        kickoff = kickoff_utc(raw[game['gameId']])
        out, issues = {}, {}
        for side in ['home', 'away']:
            team = team_key(game[f'{side}Team'])
            rows = injuries.get((game['season'], game['week'], team), [])
            if not rows:
                issues[side] = [{'reason': 'missing_entire_team_injury_report'}]
                out[side] = {}
            else:
                out[side], issues[side] = select_reports(rows, kickoff)
            audit['report_issues'] += len(issues[side])
        for window in WINDOWS:
            sides, metrics = {}, {}
            for side in ['home', 'away']:
                team = team_key(game[f'{side}Team'])
                expected = [r['game_id'] for r in schedule if int(r['season']) == game['season'] and r['game_type'] == 'REG'
                            and r['gameday'] < game['kickoff']['date'] and team in [team_key(r['home_team']), team_key(r['away_team'])]]
                history = prior_window(by_team[game['season'], team], game['kickoff']['date'], game['season'], team, window, expected)
                if history is None:
                    audit['missing_or_unavailable_prior_history'] += 1
                sides[side] = exposure(history, team, out[side], crosswalk, tables) if not issues[side] else None
                metrics[side] = window_metrics(history or [])
            profiles[game['gameId'], window] = {'gameId': game['gameId'], 'season': game['season'], 'week': game['week'],
                'kickoffUtc': kickoff.isoformat(), 'window': window, 'teams': {side: game[f'{side}Team'] for side in ['home', 'away']},
                'profiles': sides, 'metrics': metrics, 'reportIssues': issues}
            for cohort in COHORTS:
                affected = choose_side(cohort, sides['home'], sides['away'], metrics['home'], metrics['away'])
                pick = 'away' if affected == 'home' else 'home' if affected == 'away' else None
                # Outcomes enter only AFTER constructing all eligibility features.
                win = None if pick is None or game['residual'] == 0 else (game['residual'] > 0 if pick == 'home' else game['residual'] < 0)
                records.append({'gameId': game['gameId'], 'season': game['season'], 'week': game['week'],
                    'policy': f'{window}|{cohort}', 'affectedSide': affected, 'pick': pick, 'win': win,
                    'push': bool(pick and game['residual'] == 0),
                    'featureEligible': all(sides[s] is not None for s in ['home', 'away']),
                    'qbOut': any(sides[s] is not None and sides[s]['qbOut'] for s in ['home', 'away']),
                    'affectedExposure': sides[affected]['total'] if affected else None,
                    'affectedNetPoints': metrics[affected]['netPoints'] if affected else None,
                    'affectedNetEpa': metrics[affected]['netEpa'] if affected else None})
    audit['unique_target_games'] = len({r['gameId'] for r in records})
    return records, profiles, dict(audit)


def summarize_rows(rows, search_count=6):
    picks = [r for r in rows if r['pick'] is not None]
    decisive = [r for r in picks if r['win'] is not None]
    wins = sum(r['win'] for r in decisive)
    return {'games': len(rows), 'picks': len(picks), 'wins': wins, 'losses': len(decisive)-wins,
            'pushes': len(picks)-len(decisive), 'accuracy': wins/len(decisive) if decisive else None,
            'coverage': len(picks)/len(rows) if rows else 0., 'seasons': sorted({r['season'] for r in decisive}),
            'featureEligibleGames': sum(r['featureEligible'] for r in rows),
            'qbOutAbstentionGames': sum(r['qbOut'] for r in rows), **evidence(wins, len(decisive), search_count)}


def results(records):
    policies = {}
    adaptive = {}
    for policy in sorted({r['policy'] for r in records}):
        rows = [r for r in records if r['policy'] == policy]
        periods = {'development': (2013, 2018), 'selection': (2019, 2021), 'evaluation': (2022, 2024)}
        policies[policy] = {period: summarize_rows([r for r in rows if start <= r['season'] <= end]) for period, (start, end) in periods.items()}
        policies[policy]['evaluationByYear'] = {str(y): summarize_rows([r for r in rows if r['season'] == y]) for y in range(2022, 2025)}
        subset = summarize_rows([r for r in rows if 2022 <= r['season'] <= 2024 and r['pick'] is not None and r['affectedNetPoints'] is not None and r['affectedNetPoints'] > 0])
        subset['coverage'] = None
        subset['denominatorNote'] = 'Conditional performance among existing picks with positive prior net points; broader opportunity coverage not measured.'
        policies[policy]['evaluationGoodStats'] = subset
        forecasts = []
        for y in range(2022, 2025):
            prior = [r for r in rows if r['season'] < y and r['pick'] is not None and r['win'] is not None]
            p = forecast(sum(r['win'] for r in prior), len(prior))
            supported = len(prior) >= 20 and len({r['season'] for r in prior}) >= 3 and p >= .55
            for r in rows:
                if r['season'] == y:
                    forecasts.append({**r, 'estimatedProbability': p, 'priorDecisions': len(prior), 'pick': r['pick'] if supported else None,
                                      'win': r['win'] if supported else None})
        adaptive[policy] = {'summary': summarize_rows(forecasts), 'probabilitiesByYear': {str(y): next(r['estimatedProbability'] for r in forecasts if r['season'] == y) for y in range(2022, 2025)},
                           'priorDecisionsByYear': {str(y): next(r['priorDecisions'] for r in forecasts if r['season'] == y) for y in range(2022, 2025)}}
    candidates = [(r['selection']['lower95'], name) for name, r in policies.items()
                  if all(sum(x['win'] is not None and x['pick'] is not None for x in records if x['policy'] == name and x['season'] == y) >= 15 for y in [2019, 2020, 2021])
                  and r['selection']['coverage'] <= .2]
    selected = max(candidates)[1] if candidates else None
    return {'selectedPolicy': selected, 'selectionEligiblePolicies': [name for _, name in candidates], 'policies': policies,
            'priorOnly55Forecasts': adaptive,
            'interpretation': 'Incomplete unavailable-exposure probes, NOT net roster deterioration or calibrated probabilities.',
            'searchCaveat': 'Six fixed against-affected policies; wider research search and team/QB dependence are not captured by nominal intervals/tests.',
            'periods': {'development': '2013–2018', 'selection': '2019–2021', 'evaluation': '2022–2024 (retrospective, previously seen years)'}}


def main():
    crosswalk, tables, injuries, source_audit = load_sources()
    games, existing_audit = load_data()
    postgames, _ = published('postgame')
    schedule = read_csv(ROOT/existing_audit['schedule_file'])
    records, profiles, case_audit = build_records(games, postgames, schedule, crosswalk, tables, injuries)
    summary = results(records)
    summary['sourceAudit'], summary['caseAudit'] = source_audit, case_audit
    selected = summary['selectedPolicy']
    summary['selectedEvaluationCalls'] = [r for r in records if r['policy'] == selected and 2022 <= r['season'] <= 2024 and r['pick'] is not None]
    (HERE/'results/pilot-summary.json').write_text(json.dumps(summary, indent=2)+'\n')
    (HERE/'results/pilot-records.json').write_text(json.dumps(records, indent=2)+'\n')
    # Fixed case diagnostics contain no target outcomes or target participation.
    case_ids = ['2024_04_NO_ATL', '2024_06_TB_NO', '2024_13_SF_BUF']
    fixed = [profiles[g, w] for g in case_ids for w in WINDOWS]
    (HERE/'results/fixed-case-profiles.json').write_text(json.dumps(fixed, indent=2)+'\n')
    print(json.dumps({'sourceAudit': source_audit, 'caseAudit': case_audit, 'selected': selected,
         'policies': {p: {period: {k:v for k,v in s.items() if k in ['picks','wins','losses','pushes','accuracy','coverage','lower95','upper95','strong55Evidence']} for period,s in d.items() if period in ['development','selection','evaluation']} for p,d in summary['policies'].items()}}, indent=2))


if __name__ == '__main__':
    main()
