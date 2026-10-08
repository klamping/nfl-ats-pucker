# NFL ATS Pucker

Utilities for collecting historical NFL closing lines from the public [nflverse games schedule](https://github.com/nflverse/nfldata/blob/master/data/games.csv). The schedule's raw `spread_line` is positive for a home favorite and negative for an away favorite. The application negates that source value into `closingSpreadHome`, where negative means home favorite and positive means home underdog. nflverse documents this spread as sourced from Pro-Football-Reference.

## Requirements

- Node.js 18 or newer and `npm install`.
- Network access to nflverse's public `games.csv`. No credentials are required.

## Weekly dashboard

Generate one local dashboard for an NFL week:

```bash
npm run week:dashboard -- --season 2026 --week 3
```

Open the printed loopback URL. Upcoming games use current live odds. Completed games in the current NFL season use nflverse closing lines and strictly pre-kickoff features. If one game cannot be gathered, it remains visible as unavailable while the rest of the weekly slate continues.

The weekly view is a ranked card board. Drag a card's grip (mouse or touch), edit its points, or use Up/Down while the grip is focused. Moving a card shifts the intervening cards rather than swapping them. Click a team abbreviation to set **My Pick**; the pick displays the team's name. Ordering and personal picks are saved in browser local storage separately for each season/week and origin (host/port). **Reset order** restores the historical ordering without clearing your picks. Existing saved weekly rankings are retained.

**Leans** and **Deviation** show the existing historical recommendation and weighted 0–100 score, separate from your personal pick. Deviation is a display label, not a new standard-deviation calculation. The magnifying-glass control below points opens the existing game page; displaying matchup details/history in a large modal is deferred.

### Recent player / lineup changes

All dashboard commands (`dashboard`, `game:dashboard`, and `week:dashboard`) default to `http://127.0.0.1:3000/`. Add `--port 3001` to choose another port without interfering with an existing server, or `--port 0` to let the OS assign a free port. The actual URL is printed on startup. Ports must be integers from 0 to 65535; if a requested port is occupied, startup fails rather than choosing another port.

```sh
npm run week:dashboard -- --season 2026 --week 3 --port 3001
npm run game:dashboard -- --season 2026 --game-id 2026_03_PHI_CHI --port 0
npm run dashboard -- --input data/current/<game-id>-<timestamp>.json --port 0
```

Expand **View team context** at the bottom of a game card for both teams. The weekly build gathers this context once per participating team before starting the server or printing its URL; the browser only reads the local `/api/slate` endpoint.

- **Official — NFL.com:** the latest injury-report rows available from NFL.com, labeled **Current status as of build**. These rows have no individual publication dates; their observation time is not a claimed injury date. When game status is blank, an explicitly labeled practice status is shown, or “Not reported”—never an inference that a player is healthy. Transactions include all six league categories for the current and preceding month, filtered to inclusive UTC calendar dates from build date minus 14 days through build date. Blank published transaction positions remain unknown.
- **Projected depth chart — Ourlads:** changes in the player at each position's first- and second-string slots, compared with that team's latest valid local capture strictly earlier than this build. Entrants and removals are included; third-string changes are excluded. The source's Eastern update timestamp is displayed in UTC, separately from retrieval time. The first successful capture establishes a baseline and shows **No prior depth chart baseline**; later unchanged captures show **No first- or second-string changes**.

This is **current build-time context**, even when viewing a completed game: it is not a historical reconstruction of availability at kickoff. Neither source establishes a complete roster-health picture. Lineup context does not affect picks, confidence, rankings, or recommendations.

Public source pages are fetched with a 15-second timeout per request. League documents are shared across teams within a build. A request, parsing, or persistence failure marks only that team/source unavailable; valid games and other sources remain usable. Changed or ambiguous markup fails closed. Failed collection never overwrites a prior valid snapshot.

Raw HTML is retained locally under `data/raw/lineups/<team>/`; immutable normalized source snapshots are under `data/current/lineups/<team>/`. The baseline is local to the output directory, so separate checkouts/worktrees have separate histories. `/api/slate` exposes only validated source labels, timestamps, official entries, baseline status, and depth-slot changes—not raw HTML, source URLs, capture paths, or private error details.

Both dashboards show the unweighted historical home-cover split in percentage points (PP) and its 95% Wilson confidence interval. The game-detail dashboard also shows the decided-game count (home covers + away covers; pushes excluded); weekly cards omit this count. The interval is expressed relative to 50%: an interval containing 0 pp is compatible with a 50/50 split. Empty or push-only samples have no interval. These are descriptive intervals, not predictions or significance badges; they assume independent observations, and shared teams/seasons and analogue selection can overstate precision. The historical pick and weighted-score calculations are unchanged. Comparison JSON exposes `confidence.coverSplitInterval` (`lower`/`upper` in PP, or `null`) and `confidence.decidedGameCount`.

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

Accepted records cover regular season (`REG`) and nflverse postseason rounds (`WC`, `DIV`, `CON`, `SB`). They include game ID, season, week, normalized `gameType` (`REG` or `POST`), original `sourceGameType`, kickoff details, teams, final scores, `closingSpreadHome`, `spreadOrientation: "home_team"`, available closing total/spread prices and schedule context, `sourceUrl`, and `retrievedAt`. `closingSpreadHome` is the normalized home-team spread: it is the inverse of nflverse's source `spread_line`, so negative means home favorite and positive means home underdog. Rejected records have a machine-readable `reason` and available identity and source metadata. Missing spread, score, or identity fields are rejected, not guessed. Historical opening-line and line-movement fields are **not available** here; this ingestion does not produce a model or picks.

## Team identity, postgame, and pregame data

Team-season identities and weekly statistics come from the public [nflverse `nfldata` teams CSV](https://github.com/nflverse/nfldata/blob/master/data/teams.csv) and [nflverse weekly team-stat releases](https://github.com/nflverse/nflverse-data/releases/tag/stats_team). The `nfldata` teams CSV does not contain conference, division, colors, or logos, so identity rows are enriched by stable `nfl_team_id` from nflverse's public [`teams_colors_logos.csv`](https://github.com/nflverse/nflverse-data/releases/download/teams/teams_colors_logos.csv) release. Published identities include conference, division, primary/secondary colors, and ESPN/Wikipedia logo URLs, and record both source URLs. Both downloaded identity CSVs are retained as raw captures. Missing branding rows or fields reject the identity rather than silently omitting requested metadata. No credentials, paid data providers, or scraping are used. Team aliases are mapped to continuous franchise identities, including historical relocations and renames, so records retain franchise continuity across seasons.

Ingest the market data first, then validate the five required sample seasons or ingest an inclusive team-data range:

```bash
npm run validate:team-data
npm run ingest:team-data -- --start-season 2005 --end-season 2025
```

Both commands accept `--output-root PATH`. Validation uses exactly 2005, 2010, 2015, 2020, and 2025, loading the published `nflverse-lines-2005-2025.current.json` market pair and downloading metadata once plus statistics once per sample season. Range ingestion uses the already-published `nflverse-lines-<start>-<end>.current.json` pair; it does not redownload or replace market data. A missing market manifest is an error: run `npm run ingest:market-data -- --start-season <start> --end-season <end>` first.

The team workflow retains the source CSV captures under `data/raw/nflverse/` and publishes four independent accepted/rejected JSONL pairs with pointers in `data/normalized/nfl/`: `nflverse-team-identity-<start>-<end>.current.json`, `nflverse-team-postgame-<start>-<end>.current.json`, `nflverse-team-pregame-<start>-<end>.current.json`, and `nflverse-team-matchups-<start>-<end>.current.json`. Read each pointer once and resolve both relative paths against `data/normalized/nfl/`; each accepted/rejected pair switches together through an atomic pointer rename. Older immutable runs remain available.

Postgame records contain factual team-game outcomes and available core efficiency/statistics. Yards per play subtracts the magnitude of `sack_yards_lost` once, handling the live source's negative values as well as positive values. Turnover margin normalizes both source naming pairs (`passing_interceptions` or `interceptions`; `fumbles_lost_total` or `lost_fumbles`) and retains original columns under `rawStats`. Pregame records are derived only from results completed before kickoff; teams with no completed games in that season have null early-season feature values rather than invented zeros. Matchups safely join the pregame features and final market scores to the existing market game records: scores are top-level historical outcome fields for ATS evaluation, never pregame features. Invalid or incomplete source pairs are written to their dataset's rejected JSONL with machine-readable reasons; they are not silently repaired. Inspect accepted and rejected records alongside the raw source captures before bulk use. The source may not provide every optional statistic in every season; unavailable measures remain null.

## Gather an upcoming pregame snapshot

```bash
npm run gather:pregame -- --season 2026 --game-id 2026_03_DAL_PHI
```

Both `--season` and `--game-id` are required. Add `--output-root PATH` to write under a different local root. The command prints only a one-line summary with the season, game ID, snapshot path, raw-capture count, and contributing-book count; it does not print provider payloads, bookmaker names, spreads, or credentials.

Current odds come from [The Odds API](https://the-odds-api.com/) NFL U.S. `spreads` endpoint. Put the API key in `~/Sites/.env` as `theoddsapi=<key>`. This workflow uses only the provider's current/future NFL spread market and does not require a paid plan, historical odds, scraping, player data, or play-by-play data.

The target game is resolved from the public nflverse schedule by game ID and season. The gathered team features use public nflverse identity and weekly team-stat sources, and include only final games completed before the target kickoff. The value written to `closingSpreadHome` is the **current consensus home-team spread**: the median of valid current home-team spread quotes from distinct bookmakers for the matched provider event, where positive means home underdog and negative means home favored. `currentOdds.homeSpreads` and `currentOdds.consensusSpreadHome` preserve the provider's home-team sign convention. This is included for compatibility with the historical matchup schema, but it is not a historical closing line or line-movement feed.

Successful runs write:

- Snapshot JSON: `data/current/<game-id>-<timestamp>.json`
- Raw The Odds API response capture: `data/raw/odds-api/<retrieval-timestamp>-capture.json`

These files are ignored local research artifacts and are never overwritten; repeated timestamps receive a unique suffix. The provider request URL and API key are not stored, and client-side provider responses are redacted before raw capture. Current snapshots under `data/current/` are local-only and ignored by Git, just like raw captures under `data/raw/`. A missing/blank `theoddsapi` key, provider failure, missing target, started kickoff, invalid nflverse source shape, unresolved teams, missing prior stats, no unique provider event, no valid spread quotes, or snapshot write failure causes the command to fail closed. Failed validation writes no snapshot; if the raw provider capture was staged but the snapshot cannot be written, the raw capture is removed.

## Compare a gathered matchup with historical games

```bash
npm run compare:historical -- --input data/current/<game-id>-<timestamp>.json
```

The read-only command loads `data/normalized/nfl/nflverse-team-matchups-2005-2025.current.json` once and reads only the accepted matchup JSONL named by that manifest. Incomplete records are excluded. The gathered input requires finite home and away values for points scored/allowed per game, net yards and EPA per play, turnover margin per game, offensive/defensive sack rates, rest days, passing EPA per dropback, rushing EPA per carry, explosive-play rate, passing CPOE, interception rate, rushing yards per carry, passing/rushing explosive-play rates, and penalty yards per game. Games played and win percentage remain stored snapshot metadata but are not comparison inputs. A historical candidate may omit optional values if at least 70% of total comparison weight remains; its available weights are renormalized and its coverage and omitted features are reported. The default target-week window is one week before through two weeks after the input week (Week 3 therefore searches Weeks 2–5); the library API also accepts `{ startOffset, endOffset }` to override it. Candidates must have the same `gameType` and a home spread within 3.5 points of the snapshot's current consensus home spread.

Candidates are ranked by a normalized distance: for each selected home/away team feature, the absolute delta is divided by that feature's largest delta among eligible candidates, then multiplied by an equal weight (1/34 per each of 34 comparisons). The closing home spread is an eligibility filter only, not a distance contribution. The reported score is the sum of team-feature contributions; lower scores are closer. Only candidates at or below the fixed 0.200 distance threshold (at least 80% similarity) are returned by default; library callers may provide a non-negative integer `limit` to cap that qualifying list further. ATS margin is exactly `homeScore - awayScore + closingSpreadHome`: positive is a home cover, negative an away cover, and zero a push. The JSON result reports per-game contributions and counts plus home cover rate among decided games (pushes excluded). This is descriptive research output only; it does not produce picks or confidence recommendations, and comparison never writes or changes datasets.

### Open the local analysis board

The matchup dashboard shows a **Previous game · point difference** chart for each team, including weekly game-detail pages. Each chart uses that team's most recent completed regular-season or postseason game in the selected season strictly before the matchup's kickoff. One step line shows **team score minus opponent score** at recorded ESPN play-by-play scoring times. Zero is centered vertically; positive means leading, negative means trailing. Vertical lines mark quarters and overtime; sudden-death overtime ends at the last recorded play. ESPN sometimes groups a touchdown and its conversion at the same game-clock time.

Schedule and play-by-play data are fetched server-side on demand with a 15-second timeout per request and cached for the server's lifetime. The browser reads only local `/api/previous-games` (single game) or `/api/previous-games/<game-id>` (weekly detail) endpoints. A team with no previous game shows an empty state; missing, failed, or inconsistent play-by-play shows unavailable rather than inferred scoring times. These charts do not change historical comparisons or picks.

The game dashboard includes three final-margin distribution pies for non-overlapping distance bands: `<0.150`, `0.150–<0.175`, and `0.175–0.200` (inclusive at 0.200). Each uses in-range historical games only and raw home score minus away score, not ATS margin. The buckets are `≤−7`, `>−7 to ≤−3`, `>−3 to <0`, `0 to <+3`, `+3 to <+7`, and `≥+7`; percentages and counts are shown per band, with “No games” for empty bands. Charts sit side-by-side on wide screens and stack on narrow screens.

First rebuild the historical matchup data with `npm run ingest:market-data -- --start-season 2005 --end-season 2025` and `npm run ingest:team-data -- --start-season 2005 --end-season 2025` if the published `nflverse-team-matchups-2005-2025.current.json` manifest and accepted records are not already present. Rebuild once after updates that add matchup-profile fields or normalized market fields, so historical analogues use the same feature schema and `closingSpreadHome` convention as newly gathered snapshots. If previously published historical comparisons used raw nflverse `spread_line` signs, rerun market ingestion first and then team-data ingestion to publish corrected normalized matchup records. Gather a current snapshot as above, then start:

```bash
npm run dashboard -- --input data/current/<game-id>-<timestamp>.json
```

To gather a requested game and open its dashboard in one step, reuse the existing historical matchup data:

```bash
npm run game:dashboard -- --season 2026 --game-id 2026_03_PHI_CHI
```

For a completed game in the current NFL season, gather its nflverse closing-line snapshot without Odds API credentials or a live provider request:

```bash
npm run game:dashboard -- --season 2026 --game-id 2026_03_PHI_CHI --retrospective
```

`--retrospective` is a valueless flag. Retrospective snapshots use nflverse's recorded source `spread_line`, then normalize it into the same `closingSpreadHome`/`currentOdds.consensusSpreadHome` convention used elsewhere: negative means home favorite and positive means home underdog. They do not include bookmaker quotes or line movement. If published historical comparisons were built with raw nflverse signs, rerun `npm run ingest:market-data -- --start-season <start> --end-season <end>` followed by `npm run ingest:team-data -- --start-season <start> --end-season <end>` so retrospective snapshots and historical matchup records compare normalized values.

Open the printed local address in a browser. The dashboard binds only to `127.0.0.1`, serves local assets and a sanitized `/api/comparison` response, and has no external scripts, fonts, or browser-side provider requests. It displays the target context, outcome counts, sortable historical analogues, and selected-game score, line, textual ATS result, feature coverage, omissions, and distance contributions. Select a row with its distance button (Tab and Enter/Space work); sort using column-heading buttons. Loading, failed-fetch, and no-candidate states are explicit. The server reads the snapshot and accepted matchup data on startup, never modifies them, and does not deliver keys, raw provider records, individual bookmaker quotes, or local file paths. This board is descriptive research only, not picks or betting advice.
