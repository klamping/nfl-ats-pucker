# Team Matchup Profile and Analogue Features Design

## Goal

Improve the local research dashboard's view of an upcoming NFL matchup and its historical analogues using additional free nflverse weekly team statistics. The system remains descriptive research only: it produces no picks, confidence labels, or recommendations.

## Constraints

- All team values are pregame and leakage-safe: a game may use only results from games completed before its kickoff.
- Current odds remain The Odds API U.S. spreads; no key, raw provider response, or provider quote may be exposed by the dashboard.
- Historical market data remains nflverse closing home-team spreads.
- The local dashboard remains dependency-free and loopback-only, with an explicitly allowlisted API payload.
- Historical candidate eligibility keeps its 70% feature-coverage threshold; available feature weights are renormalized.

## Metrics

### Ranking metrics

For each home and away team, add three rolling metrics derived from the existing nflverse weekly team-stat download:

| Metric | Per-game derivation | Rolling value |
| --- | --- | --- |
| Passing EPA per dropback | `passing_epa / (attempts + sacks_suffered)` | Mean over prior final games |
| Rushing EPA per carry | `rushing_epa / carries` | Mean over prior final games |
| Explosive-play rate | `(passing_20 + rushing_10) / (attempts + sacks_suffered + carries)` | Mean over prior final games |

The denominator for each per-game metric must be positive. Missing numerator or denominator values yield `null`, and rolling means exclude null game values, matching the existing metric behavior.

The comparator adds these three fields for each team to `FEATURE_FIELDS`. The score therefore has 27 equal base weights: 13 home values, 13 away values, and the home spread. Existing historical-coverage and missing-feature weight-renormalization behavior applies unchanged.

### Display-only profile metrics

The dashboard displays these additional rolling pregame metrics but does not use them in similarity ranking:

| Metric | Per-game derivation |
| --- | --- |
| Passing CPOE | `passing_cpoe` |
| Interception rate | `passing_interceptions / attempts` |
| Rushing yards per carry | `rushing_yards / carries` |
| Pass 20+ rate | `passing_20 / (attempts + sacks_suffered)` |
| Rush 10+ rate | `rushing_10 / carries` |
| Penalty yards per game | `penalty_yards` |

The existing offensive and defensive sack rates are also shown in this profile. All display-only fields follow the same null and rolling-average rules.

## Data Flow

1. `normalize-team-postgame` calculates per-game metric values from an accepted pair of team-stat rows.
2. `derive-team-pregame` produces leakage-safe rolling values for each team before recording the current game into that team's history.
3. `join-team-matchups` allowlists the new feature fields into historical matchup records and current snapshots.
4. `compare-historical` ranks using the three designated ranking metrics and includes them in candidate distance contributions.
5. `dashboard-server` allowlists selected target pregame profile data for the browser.

Target marker records used while gathering an upcoming game must contain null values for every newly introduced postgame metric, so the target's derived features use only prior final games.

## Dashboard

Add a compact **Matchup profile** section directly after the target-game header. It contains a three-column table: metric, away-team value, and home-team value. Missing values render as `—`.

The section includes:

- Passing EPA/dropback, passing CPOE, and interception rate
- Rushing EPA/carry and yards/carry
- Explosive-play rate, pass 20+ rate, and rush 10+ rate
- Existing offensive and defensive sack rates
- Penalty yards/game

The existing analogue table remains focused on historical game outcomes. The selected-candidate distance detail gains readable labels for the three new ranking values through the existing contribution display.

## API and Privacy

`/api/comparison` exposes only an explicit target projection of the profile fields required by the browser. It must not expose raw nflverse team rows, outcomes in target pregame data, source URLs, file paths, Odds API payloads, individual bookmaker data, or credentials.

The server continues to bind only to `127.0.0.1`, serve local static files only, and load data before listening.

## Validation and Tests

- Unit-test every new per-game formula, zero/invalid denominator behavior, and rolling pregame derivation.
- Verify target marker rows cannot contribute outcome metrics.
- Verify join and snapshot validation preserve the new nullable finite fields.
- Verify comparator ranking includes exactly 27 base features and continues to renormalize missing-feature weights at the 70% eligibility threshold.
- Verify dashboard API projections include profile fields and exclude unsafe/raw data.
- Verify client rendering formats both teams' values, missing values, and new contribution labels.

## Operations

Historical matchup artifacts must be rebuilt once after this change to contain the new fields. The existing one-command game dashboard workflow then gathers a fresh current snapshot and runs the dashboard normally.
