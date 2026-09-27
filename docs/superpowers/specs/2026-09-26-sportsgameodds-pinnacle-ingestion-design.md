# SportsGameOdds Pinnacle Line Ingestion Design

## Goal

Collect a reproducible historical NFL market dataset beginning with the 2005 season. The dataset will use Pinnacle as the single selected line source and retain opening and closing point spreads for market-baseline and line-movement research.

## Credentials

- Read the SportsGameOdds API key from the `sportsgameodds` variable in `~/Sites/.env`.
- Do not copy the key into the repository, source code, committed configuration, generated reports, or logs.

## Data Collection

- Query SportsGameOdds finalized NFL events in bounded date ranges.
- Request opening and closing market fields and filter each event to Pinnacle.
- Preserve each raw API response in an ignored local data directory so normalized records can be traced to their source.
- Begin by validating representative samples from the 2005, 2010, 2015, 2020, and 2025 seasons before collecting the full range.

## Normalized Record

Store one game-level record for each regular-season and postseason NFL game with:

- provider event ID
- season, week, season type, and kickoff timestamp
- home and away teams
- final home and away scores
- Pinnacle opening spread and timestamp
- Pinnacle closing spread and timestamp
- spread orientation, explicitly identifying the team to which each spread applies
- line movement, calculated as closing spread minus opening spread using the same orientation
- provider and bookmaker identifiers

## Validation

- Confirm every sampled game has correct teams, kickoff date, final score, and spread orientation.
- Confirm Pinnacle is the only selected bookmaker.
- Confirm opening and closing spreads are both present before admitting a game to the primary dataset.
- Report, rather than silently fill, games with incomplete market data.
- Compare a small sample with the provider response before full historical ingestion.

## Boundaries

- This slice ingests and normalizes historical market data only.
- It does not build a predictive model, make game picks, or combine player/play-by-play features yet.
- nflverse remains the intended source for football, player, roster, and play-by-play data in later slices.
