# NFL ATS Pucker

Utilities for collecting historical NFL closing lines from the public [nflverse games schedule](https://github.com/nflverse/nfldata/blob/master/data/games.csv). The schedule's `spread_line` is a **home-team closing spread**: a positive value means the home team is favored; a negative value means the away team is favored. The source sign is preserved without inversion. nflverse documents this spread as sourced from Pro-Football-Reference.

## Requirements

- Node.js 18 or newer and `npm install`.
- Network access to nflverse's public `games.csv`. No credentials are required.

## Validate samples before bulk ingestion

```bash
npm run validate:market-data
```

Validation downloads the schedule **once**, then checks exactly five sample seasons: 2005, 2010, 2015, 2020, and 2025. It reports fetched/in-range/accepted/rejected **counts only**, saves one raw CSV capture, and publishes a separate accepted/rejected JSONL pair for each sample season. Inspect accepted and rejected records alongside the raw source, especially game IDs, teams, scores, spread signs, and missing-data reasons, before a bulk run. Rejections are reported rather than silently filled; they do not automatically abort validation.

## Ingest an inclusive season range

```bash
npm run ingest:market-data -- --start-season 2005 --end-season 2025
```

Both endpoints are inclusive; seasons before 2005 are not supported. A run downloads `games.csv` once, filters the requested seasons, then sorts accepted and rejected rows separately by game ID. Add `--output-root PATH` to either command to choose a different root directory.

## Output paths

- Raw, unmodified CSV captures: `data/raw/nflverse/games-<retrieval-timestamp>-capture-<number>.csv`
- Published pointer: `data/normalized/nfl/nflverse-lines-<start>-<end>.current.json`
- Accepted games: `data/normalized/nfl/nflverse-lines-<start>-<end>-run-<unique>/nflverse-lines-<start>-<end>.accepted.jsonl`
- Rejected games: `data/normalized/nfl/nflverse-lines-<start>-<end>-run-<unique>/nflverse-lines-<start>-<end>.rejected.jsonl`

Read the pointer JSON **once** and resolve its `accepted` and `rejected` paths relative to `data/normalized/nfl/`. These fields always refer to the same completed run; do not find runs by listing directories or independently reread the pointer for each file. The JavaScript ingestion API summaries also return `manifestPath`, `acceptedPath`, and `rejectedPath` along with counts and `rawPath`. Raw captures are never overwritten even when a timestamp repeats. Each normalized run uses deterministic accepted/rejected filenames inside its unique directory; publishing the pointer with one atomic rename switches the pair together. Failed writes or publication leave the prior pointer intact (and may leave an unreferenced run directory); older published runs are retained so readers holding an earlier pointer can finish. Legacy flat JSONL files, if present from an earlier version, are not part of the published pair. Both output directories are gitignored. Download and CSV parsing must succeed before any output is written; a download error does not replace prior normalized results.

Accepted records cover regular season (`REG`) and nflverse postseason rounds (`WC`, `DIV`, `CON`, `SB`). They include game ID, season, week, normalized `gameType` (`REG` or `POST`), original `sourceGameType`, kickoff details, teams, final scores, `closingSpreadHome`, `spreadOrientation: "home_team"`, available closing total/spread prices and schedule context, `sourceUrl`, and `retrievedAt`. Rejected records have a machine-readable `reason` and available identity and source metadata. Missing spread, score, or identity fields are rejected, not guessed. Historical opening-line and line-movement fields are **not available** here; this ingestion does not produce a model or picks.

## Team identity, postgame, and pregame data

Team metadata and weekly team statistics are downloaded from the public nflverse repositories. No credentials, paid data providers, or scraping are used. Team aliases are mapped to continuous franchise identities, including historical relocations and renames, so records retain franchise continuity across seasons.

Ingest the market data first, then validate the five required sample seasons or ingest an inclusive team-data range:

```bash
npm run validate:team-data
npm run ingest:team-data -- --start-season 2005 --end-season 2025
```

Both commands accept `--output-root PATH`. Validation uses exactly 2005, 2010, 2015, 2020, and 2025, loading the published `nflverse-lines-2005-2025.current.json` market pair and downloading metadata once plus statistics once per sample season. Range ingestion uses the already-published `nflverse-lines-<start>-<end>.current.json` pair; it does not redownload or replace market data. A missing market manifest is an error: run `npm run ingest:market-data -- --start-season <start> --end-season <end>` first.

The team workflow retains the source CSV captures under `data/raw/nflverse/` and publishes four independent accepted/rejected JSONL pairs with pointers in `data/normalized/nfl/`: `nflverse-team-identity-<start>-<end>.current.json`, `nflverse-team-postgame-<start>-<end>.current.json`, `nflverse-team-pregame-<start>-<end>.current.json`, and `nflverse-team-matchups-<start>-<end>.current.json`. Read each pointer once and resolve both relative paths against `data/normalized/nfl/`; each accepted/rejected pair switches together through an atomic pointer rename. Older immutable runs remain available.

Postgame records contain factual team-game outcomes and available core efficiency/statistics. Pregame records are derived only from results completed before kickoff; teams with no completed games in that season have null early-season feature values rather than invented zeros. Matchups safely join the pregame features to the existing market game records. Invalid or incomplete source pairs are written to their dataset's rejected JSONL with machine-readable reasons; they are not silently repaired. Inspect accepted and rejected records alongside the raw source captures before bulk use. The source may not provide every optional statistic in every season; unavailable measures remain null.
