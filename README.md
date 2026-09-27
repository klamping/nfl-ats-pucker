# NFL ATS Pucker

Utilities for collecting finalized NFL market data from SportsGameOdds and normalizing Pinnacle opening and closing point spreads.

## Requirements

- Node.js 18 or newer.
- A SportsGameOdds API key stored outside this repository in `~/Sites/.env` under the variable name `sportsgameodds`.

Do not commit `~/Sites/.env`, generated raw responses, normalized JSONL files, or command output that contains secrets.

## Validate provider samples first

Before collecting the full 2005-onward history, run the bounded sample-validation command:

```bash
npm run validate:market-data
```

This validates the representative seasons 2005, 2010, 2015, 2020, and 2025, prints only counts, and writes local raw and normalized files for inspection. If any sample reports rejected records, inspect the rejected JSONL and matching raw provider response before continuing.

## Ingest one bounded season

After sample validation is clean, ingest one season at a time:

```bash
npm run ingest:market-data -- --season 2025
```

The default bounded window for a season is July 1 of that season through March 1 of the next year. Override it only when validating a specific provider-contract sample:

```bash
npm run ingest:market-data -- --season 2025 --starts-after 2025-09-01T00:00:00.000Z --starts-before 2026-02-20T00:00:00.000Z
```

## Output paths

- Raw provider responses: `data/raw/sportsgameodds/nfl/<season>/`
- Accepted normalized games: `data/normalized/nfl/pinnacle-lines-<season>.accepted.jsonl`
- Rejected games: `data/normalized/nfl/pinnacle-lines-<season>.rejected.jsonl`

Both raw and normalized output directories are gitignored.

## Normalized schema

Accepted records are one JSON object per line with provider event ID, provider/bookmaker IDs, season, week, season type, kickoff timestamp, away/home teams, final scores, Pinnacle opening and closing spreads with timestamps, spread orientation, spread team, spread market ID, and line movement.

Rejected records include available game metadata and a machine-readable `reason` so incomplete Pinnacle market data is reported instead of silently filled.

## Inspect before full collection

1. Run `npm run validate:market-data`.
2. For each sample season, compare a few records in `data/normalized/nfl/` against the corresponding raw JSON under `data/raw/sportsgameodds/nfl/<season>/`.
3. Confirm teams, kickoff date, final score, Pinnacle-only bookmaker selection, away-team spread orientation, and both opening and closing spread timestamps.
4. Resolve any rejected sample records before running season-by-season ingestion from 2005 onward.
