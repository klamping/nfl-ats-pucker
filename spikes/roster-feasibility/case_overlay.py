"""Reproduce partial dated IR overlays without using any target outcomes."""
import json
from datetime import datetime
from zoneinfo import ZoneInfo
from pilot import (HERE, ROOT, load_sources, published, prior_window, exposure,
                   ir_state, choose_side, verified_assets)


def main():
    crosswalk, tables, _, _ = load_sources()
    verified_assets(HERE/'external/pilot-primary-manifest.json')
    verified_assets(HERE/'external/primary-source-manifest.json')
    cases = json.loads((HERE/'results/fixed-case-profiles.json').read_text())
    events = json.loads((HERE/'fixed-events.json').read_text())
    postgames, _ = published('postgame')
    output = []
    for case in cases:
        ko = datetime.fromisoformat(case['kickoffUtc'])
        enriched = {}
        details = []
        returns = []
        for side, team in case['teams'].items():
            target_date = ko.astimezone(ZoneInfo('America/New_York')).date().isoformat()
            history = prior_window(postgames, target_date, case['season'], team, case['window'])
            profile = case['profiles'][side]
            if profile is None:
                enriched[side] = None
                continue
            unavailable = {p['gsis']: {'full_name': p['name'], 'position': p['position'],
                           'date_modified': p['reportUpdated'], 'sourceFile': p['source']} for p in profile['players']}
            assert [r['gameId'] for r in history] == profile['historyGameIds']
            dates = [r['kickoff']['date'] for r in postgames if r['season'] == case['season'] and r['team'] == team and r['gameType'] == 'REG' and r['kickoff']['date'] < target_date]
            for event in events['events']:
                if event['team'] != team:
                    continue
                state = ir_state(event, ko, dates)
                details.append({'name': event['name'], 'team': team, 'state': state, 'source': event['source']})
                if state == 'out':
                    unavailable[event['gsis']] = {'full_name': event['name'], 'position': event['position'],
                        'date_modified': event['startUtc'], 'sourceFile': event['source']}
            enriched[side] = exposure(history, team, unavailable, crosswalk, tables)
            # Preserve QB exclusion; overlay does not silently remove an archive QB Out.
            enriched[side]['qbOut'] = profile['qbOut']
            for event in events['returns']:
                if event['gameId'] != case['gameId'] or event['team'] != team:
                    continue
                pfr = crosswalk[event['gsis']]
                metric = 'offense_pct' if event['position'] in ['TE', 'QB'] else 'defense_pct'
                shares = [float(tables[r['gameId'], team].get(pfr, {}).get(metric, 0)) for r in history]
                returns.append({**event, 'historyShares': shares, 'historicalMeanShare': sum(shares)/len(shares),
                                'unrepresentedFraction': 1-sum(shares)/len(shares),
                                'warning': 'Participation gap, not points or net value; expected return only'})
        output.append({'gameId': case['gameId'], 'window': case['window'], 'teams': case['teams'],
            'automatedProfiles': case['profiles'], 'enrichedProfiles': enriched, 'datedEventStates': details,
            'returns': returns, 'metrics': case['metrics'],
            'automatedAffectedSides': {c: choose_side(c, case['profiles']['home'], case['profiles']['away'], case['metrics']['home'], case['metrics']['away']) for c in ['multi_unit', 'ol_pressure', 'secondary_passing']},
            'enrichedAffectedSides': {c: choose_side(c, enriched['home'], enriched['away'], case['metrics']['home'], case['metrics']['away']) for c in ['multi_unit', 'ol_pressure', 'secondary_passing']},
            'unknowns': events['unknowns'], 'warning': 'Case illustration only. Not exhaustive net loss or event-enriched ATS performance.'})
    (HERE/'results/fixed-case-overlay.json').write_text(json.dumps(output, indent=2)+'\n')
    for row in output:
        print(row['gameId'], row['window'], 'archive→partial enriched',
              {s: (round(row['automatedProfiles'][s]['total'], 3), round(row['enrichedProfiles'][s]['total'], 3)) for s in ['home', 'away']},
              'rules', row['automatedAffectedSides'], '→', row['enrichedAffectedSides'])


if __name__ == '__main__':
    main()
