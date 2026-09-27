# nflverse Team Data Design

## Goal

Add no-cost historical team data to the existing 2005–2025 nflverse closing-line dataset. The result supports ATS research with factual postgame performance and leakage-safe pregame features, while retaining franchise continuity through relocations and rebrands.

## Sources

- Use only public nflverse data.
- Use `https://raw.githubusercontent.com/nflverse/nfldata/master/data/teams.csv` for team-season abbreviations, stable nflverse team IDs, and names.
- Enrich identity rows from the public `https://github.com/nflverse/nflverse-data/releases/download/teams/teams_colors_logos.csv` release, matching normalized `team_id`/`nfl_team_id` plus exact team abbreviation because historical aliases share franchise IDs. It supplies conference, division, primary/secondary colors, and ESPN/Wikipedia logo URLs; preserve both raw source files and both source URLs.
- Use weekly team-stat CSV releases at `https://github.com/nflverse/nflverse-data/releases/download/stats_team/stats_team_week_<season>.csv` for postgame performance.
- Do not use credentials, paid data, web scraping, opening lines, or player/play-by-play data in this slice.

## Datasets

### Team identity

- Publish one identity record per continuous franchise with a stable `franchiseId`.
- Include current team name, conference, division, primary/secondary colors, and logo URLs from the public identity/branding sources.
- Preserve historical aliases with valid season ranges and map each alias to its franchise ID.
- Treat relocations/rebrands as continuous franchises, including Rams (`STL`/`LA`), Raiders (`OAK`/`LV`), Chargers (`SD`/`LAC`), and Washington aliases.
- Keep the historical alias map version controlled and auditable; it supplements nflverse current-team metadata.

### Postgame weekly performance

- Publish one record for every team in each completed game, keyed by `gameId` and historical team alias.
- Include raw official weekly source statistics plus normalized identity fields needed for joins.
- The initial normalized core is game outcome, points, offensive/defensive yards per play, offensive/defensive EPA per play, turnover margin, offensive/defensive sack rates, and source metadata. Calculate YPP as `(passing_yards + rushing_yards - abs(sack_yards_lost)) / (attempts + carries + sacks_suffered)`, so positive or negative sack-loss signs reduce passing yards exactly once. Normalize `passing_interceptions`/`interceptions` and `fumbles_lost_total`/`lost_fumbles` to turnovers while preserving raw source columns.
- Accept regular season and postseason; explicitly reject preseason and unsupported game types.

### Pregame features

- Publish one record per team/game at the same grain as postgame performance.
- Compute games played, wins/losses, win percentage, points scored/allowed per game, net yards per play, net EPA per play, turnover margin per game, offensive/defensive sack rates, and rest days.
- Use only earlier completed games in the same season. Postseason may use preceding regular-season and postseason games in that season.
- Week 1 and records without valid history retain `null`; do not borrow a prior-season baseline or impute values.
- A game's postgame values must never appear in its pregame record.

### Market matchup join

- Publish a separate dataset keyed by market `gameId`.
- Each accepted market game has exactly one `homePregame` and one `awayPregame` object.
- Do not embed postgame facts in the matchup dataset.
- Unmatched aliases, duplicate team/game records, missing required core fields, and incomplete home/away pairs create explicit rejection records.

## Storage and Publication

- Preserve every downloaded source under ignored `data/raw/nflverse/` storage.
- Publish accepted/rejected JSONL pairs for identity, postgame, pregame, and matchup data under ignored `data/normalized/nfl/` storage.
- Use immutable run directories and a single atomically replaced manifest pointer for each pair; readers discover both files from one manifest read.
- Download, parsing, validation, output-write, and publication failures leave the prior published pair visible.

## Validation

- Validate 2005, 2010, 2015, 2020, and 2025 before full collection.
- Confirm each market game has two team-stat records and each matchup has one home and one away pregame record.
- Confirm every alias resolves to exactly one continuous franchise ID.
- Prove a game cannot contribute to its own pregame values.
- Verify opening-week history is null rather than fabricated.
- Report rejected and unmatched records separately with machine-readable reasons.

## Boundaries

- This slice only ingests, normalizes, derives, and joins team data.
- It does not create an ATS model, picks, UI, player features, or play-by-play analysis.
- Historical opening spreads and line movement remain out of scope.
