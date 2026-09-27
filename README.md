# NFL ATS Pucker

Utilities for collecting historical NFL closing lines from the public [nflverse games schedule](https://github.com/nflverse/nfldata/blob/master/data/games.csv). The schedule's `spread_line` is a **home-team closing spread**: a positive value means the home team is favored; a negative value means the away team is favored. The source sign is preserved without inversion. nflverse documents this spread as sourced from Pro-Football-Reference.

## Requirements

- Node.js 18 or newer and `npm install`.
- Network access to nflverse's public `games.csv`. No credentials are required.

## Validate samples before bulk ingestion

```bash
npm run validate:market-data
```

Validation downloads the schedule **once**, then checks exactly five sample seasons: 2005, 2010, 2015, 2020, and 2025. It reports fetched/in-range/accepted/rejected **counts only**, saves one raw CSV capture, and writes separate accepted/rejected JSONL for each sample season. Inspect accepted and rejected records alongside the raw source, especially game IDs, teams, scores, spread signs, and missing-data reasons, before a bulk run. Rejections are reported rather than silently filled; they do not automatically abort validation.

## Ingest an inclusive season range

```bash
npm run ingest:market-data -- --start-season 2005 --end-season 2025
```

Both endpoints are inclusive; seasons before 2005 are not supported. A run downloads `games.csv` once, filters the requested seasons, then sorts accepted and rejected rows separately by game ID. Add `--output-root PATH` to either command to choose a different root directory.

## Output paths

- Raw, unmodified CSV captures: `data/raw/nflverse/games-<retrieval-timestamp>-capture-<number>.csv`
- Accepted games: `data/normalized/nfl/nflverse-lines-<start>-<end>.accepted.jsonl`
- Rejected games: `data/normalized/nfl/nflverse-lines-<start>-<end>.rejected.jsonl`

Raw captures are never overwritten even when a timestamp repeats. Normalized outputs use stable filenames for a season range and are replaced on a successful run. Both output directories are gitignored. Download and CSV parsing must succeed before any output is written; a download error does not replace prior normalized results.

Accepted records cover regular season (`REG`) and nflverse postseason rounds (`WC`, `DIV`, `CON`, `SB`). They include game ID, season, week, normalized `gameType` (`REG` or `POST`), original `sourceGameType`, kickoff details, teams, final scores, `closingSpreadHome`, `spreadOrientation: "home_team"`, available closing total/spread prices and schedule context, `sourceUrl`, and `retrievedAt`. Rejected records have a machine-readable `reason` and available identity and source metadata. Missing spread, score, or identity fields are rejected, not guessed. Historical opening-line and line-movement fields are **not available** here; this ingestion does not produce a model or picks.
