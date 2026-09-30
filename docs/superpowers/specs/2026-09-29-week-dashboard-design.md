# Weekly NFL Dashboard Design

## Goal

Provide one local, loopback-only dashboard for every supported game in a requested NFL season/week, with compact slate rows linking to each game’s existing detailed comparison.

## Command and Gathering

`npm run week:dashboard -- --season YYYY --week N` downloads the schedule once and selects supported REG/POST games in that season/week. For each game, it uses the existing future-target live gather path when kickoff is after the injected clock, otherwise the existing retrospective path using nflverse’s closing line. Each successful gather writes its ordinary snapshot; a failed game is recorded in the slate rather than aborting the week.

## Slate Server and Data

One server binds only to `127.0.0.1`. Its safe slate API includes season, week, game status, matchup, kickoff, market line/source, candidate count, home/away cover rates, and a detail route for each successful game. It exposes no raw market data, credentials, paths, or provider URLs.

## UI

The compact table shows matchup, kickoff, line/source, qualifying count, home-cover rate, and away-cover rate. A successful row opens that game’s existing detail comparison in the same local server; failed rows display the safe failure status and are not selectable. No picks, confidence labels, or promotional copy.

## Safety and Tests

Per-game feature derivation remains strictly pre-kickoff. Test mixed live/retrospective scheduling, schedule filtering, per-game failure isolation, safe API projection/routes, row navigation, and rejection of invalid season/week CLI input.
