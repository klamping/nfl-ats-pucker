# NFLverse Spread Orientation Correction Design

## Goal

Correct historical NFL market ingestion so `closingSpreadHome` uses the repository's conventional home-team betting spread: a negative value means the home team was favored and a positive value means the home team was the underdog.

## Problem

The public nflverse schedule's `spread_line` has the inverse source convention: a positive value means the home team was favored and a negative value means the away team was favored. The current normalizer copies that source value directly into `closingSpreadHome`, while downstream ATS grading, current Odds API handling, and dashboard language assume conventional home-team betting signs.

For example, nflverse's `2026_03_ARI_SF` row has `spread_line: 7.5` and an SF home moneyline of `-395`: nflverse correctly represents SF as a 7.5-point home favorite, but the current application represents SF as a 7.5-point home underdog.

## Design

### Normalize at the source boundary

`normalizeNflverseGame()` will parse the required nflverse `spread_line` and negate it when assigning `closingSpreadHome`.

| nflverse `spread_line` | Normalized `closingSpreadHome` | Meaning |
| --- | --- | --- |
| `+2.5` | `-2.5` | Home team favored by 2.5 |
| `-2.5` | `+2.5` | Home team underdog by 2.5 |

Accepted records keep `spreadOrientation: "home_team"`. This describes the normalized field, whose value is a home-team spread, not nflverse's raw sign convention.

No downstream conversion will be added. The existing ATS margin formula, `homeScore - awayScore + closingSpreadHome`, historical comparison spread filtering, retrospective snapshots, dashboard labels, and live The Odds API consensus values already use the normalized convention.

### Published data

Ingestion continues to write immutable accepted/rejected JSONL pairs and switches a manifest to a completed run atomically. Corrected values are published only by a fresh `ingest:market-data` run. Existing market data and derived team/matchup data are stale under the old sign interpretation and must be rebuilt by running:

1. `npm run ingest:market-data -- --start-season 2005 --end-season 2025`
2. `npm run ingest:team-data -- --start-season 2005 --end-season 2025`

Old immutable runs are retained but must not be used for comparisons after correction.

### Documentation

The README will state nflverse's source convention accurately, then distinguish it from the repository's normalized `closingSpreadHome` convention. It will document the required market and team-data regeneration sequence.

## Verification

- Normalizer tests prove that nflverse `+2.5` produces `closingSpreadHome: -2.5` and nflverse `-2.5` produces `closingSpreadHome: +2.5`.
- Ingestion tests assert corrected persisted normalized values.
- Retrospective gathering tests assert that its nflverse-derived current market inherits the normalized sign.
- Existing ATS and comparison tests continue to exercise the unchanged normalized home-spread contract.
- The complete Node test suite passes.

## Out of Scope

- Changing The Odds API conventions or live consensus calculation.
- Adding raw source-spread fields to the normalized schema.
- Mutating or deleting prior immutable ingestion runs.
- Introducing a paid historical-odds provider.
