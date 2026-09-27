# nflverse Closing-Line Ingestion Design

## Goal

Build a reproducible, no-cost historical NFL market dataset beginning with the 2005 season. Use nflverse schedule data and its `spread_line` field as the historical closing-spread benchmark for market-aware research.

## Data Source

- Use nflverse public schedule data as the single historical market source.
- Treat `spread_line` as the closing spread. nflverse documents it as sourced from Pro-Football-Reference.
- Do not use SportsGameOdds, Pinnacle, an API key, or a paid provider in this slice.

## Collected Data

For each NFL regular-season and postseason game from 2005 onward, store:

- nflverse game ID
- season, week, season type, and kickoff date/time
- home and away teams
- home and away final scores
- closing spread and its documented home-team orientation
- closing total and available spread prices
- rest-day, venue, division-game, and weather/context fields supplied by the schedule dataset
- source identifier and retrieval timestamp

## Validation

- Validate representative samples from 2005, 2010, 2015, 2020, and 2025 before full collection.
- Confirm team/date/final-score agreement with the source data.
- Confirm that spread orientation matches nflverse documentation.
- Report games with absent closing spreads rather than inventing or imputing a value.
- Preserve raw downloaded source data in an ignored local directory and produce a normalized dataset separately.

## Opening-Line Scope

- Historical opening spreads and historical line movement are out of scope for this no-cost dataset.
- The model may use closing spreads as the primary historical market benchmark.
- For future games, opening/current/closing line snapshots may be collected prospectively if a free and permitted source is selected.

## Boundaries

- This slice only ingests and normalizes historical nflverse schedule/market data.
- It does not build a predictive model, make picks, or add player/play-by-play features.
- It does not use scraping or an unverified historical-odds dataset.
