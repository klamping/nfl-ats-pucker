# NFLelo Game-Detail Context Design

## Goal

Add current NFLelo model context to game-detail dashboards so a reader can
compare NFLelo's game projection and team ratings with the displayed market
line while researching a matchup. The context is descriptive only: it does
not alter historical comparisons, leans, personal picks, rankings, confidence,
or any other recommendation.

## Scope

The feature applies to game-detail pages served by both commands that expose
them:

- `npm run dashboard -- --input ...`
- `npm run game:dashboard -- --season ... --game-id ...`
- a game-detail route within `npm run week:dashboard -- --season ... --week ...`

The weekly slate itself does not display NFLelo context. Historical NFLelo
result/tracker files are out of scope. The feature uses only current game and
team information from NFLelo's public `output_data` files.

## Collection and Matching

When a dashboard server starts, it downloads these public CSV files once,
concurrently, on the server:

- `elo_snapshot.csv` for team ratings;
- `nfelo_games.csv` for game projections.

The browser makes no external NFLelo requests. The collection path validates
CSV headers and each required target row before projecting it. Required numeric
values must be finite; missing, malformed, duplicate, or incompatible records
are unavailable rather than coerced or guessed.

The game projection is matched by the dashboard target's season, week, and
home/away teams. Team identifiers are reconciled using the application's
existing franchise alias rules so historical names such as `OAK` and current
names can be compared safely. A match must unambiguously describe the same
home and away franchises. Each team rating row must correspond to the same
target season and be no later than the target week. The implementation selects
the latest valid applicable row for each team; it never substitutes a rating
from a later week.

For the weekly dashboard, data is downloaded once for the server startup and
then used to enrich every ready game-detail payload. It is not downloaded once
per card or once per API request.

## Safe API Contract

Game-detail comparison payloads gain an `nfelo` object with one of two states:

- `status: "ready"`, a retrieval timestamp, a target game projection, and
  two validated team-rating summaries; or
- `status: "unavailable"`, with a short, non-sensitive reason category.

The ready projection includes only the current matchup fields needed by the
display: NFLelo home/away spread, home win probability, home/away cover
probability, and model-to-current-market home-spread difference. It uses the
dashboard's documented convention that a negative home spread means the home
team is favored.

Each team summary includes NFLelo rating, base rating, QB adjustment, and
points versus average. Raw CSV text, complete source rows, source URLs,
filesystem paths, arbitrary upstream errors, and unrelated NFLelo columns are
not included in dashboard responses.

## User Interface

Each game-detail page adds a responsive **NFLelo model context** card near the
target-market summary. It displays:

- home and away NFLelo projected spread;
- NFLelo home win probability and each side's cover probability;
- the NFLelo-versus-market home-line difference; and
- a compact home/away table of NFLelo rating, base rating, QB adjustment, and
  points versus average.

The card labels NFLelo as a third-party public model and labels its server
retrieval time. Number formatting is consistent with existing spread and
percentage rendering. The content is represented as accessible text and table
semantics; no chart is required.

When unavailable, the card remains present with an explicit concise
unavailable state. It never renders partial data, stale data, inferred values,
or a betting recommendation.

## Failure Isolation

NFLelo collection is best effort. Network failures, non-OK responses, invalid
CSV, missing target-game data, unmatched team aliases, invalid projections, or
missing team ratings make only NFLelo context unavailable. They do not prevent
the server from starting, invalidate the snapshot, change historical
comparisons, or make an otherwise ready weekly game unavailable. A failed
request is not retried by browser refreshes because source collection happens
only during server startup.

## Testing and Documentation

Use static CSV fixtures and injected fetch implementations to test concurrent
startup collection, schema validation, target-game selection, home/away
orientation, franchise-alias matching, valid same-or-earlier-week rating
selection, and malformed/ambiguous/missing data handling. Server tests verify
that successful game-detail API payloads contain only the permitted projection
and rating fields and that unavailable NFLelo data preserves normal dashboard
operation without exposing URLs, raw records, paths, or upstream errors.

Client and browser tests verify formatted ready and unavailable cards on both
standalone and weekly-detail routes. The README documents the public NFLelo
source, startup-refresh behavior, limited fields, failure isolation, spread
orientation, and the fact that NFLelo context is informational rather than a
pick or ranking input.
