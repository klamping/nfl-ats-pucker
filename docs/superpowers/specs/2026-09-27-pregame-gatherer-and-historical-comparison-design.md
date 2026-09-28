# Pregame Gatherer and Historical Comparison Design

## Goal

Create a no-cost research workflow that gathers an upcoming NFL matchup into the same pregame schema as historical team/market data, obtains a current consensus spread from a free provider, and finds/ranks comparable historical games with ATS results.

## Scope

- Gather a requested upcoming NFL matchup using public nflverse schedule/team sources and The Odds API current spread market.
- Derive current-season pregame features using only games completed before the target kickoff.
- Produce a timestamped matchup JSON suitable for historical comparison.
- Search the existing 2005–2025 published matchup dataset for comparable games and report home/away ATS outcomes and aggregate cover rate.
- This is research tooling only; it does not make or publish picks.

## Sources and Credentials

- Use public nflverse schedules, team identity/branding, and weekly team-stat sources already used by the project.
- Use The Odds API only for current NFL U.S. spread markets.
- Read the The Odds API key from `theoddsapi` in `~/Sites/.env`.
- Never log, return, persist, or commit the API key.
- Do not use paid services, web scraping, historical odds from the provider, player data, or play-by-play data.

## Pregame Gatherer

### CLI

```bash
npm run gather:pregame -- --season <YYYY> --game-id <nflverse-game-id>
```

- The target game is resolved from the public nflverse schedule; callers do not manually supply teams, kickoff, or a spread.
- The target must be a supported upcoming `REG` or `POST` game with a valid kickoff.
- The gatherer downloads current-season weekly team stats and identity data, then uses only completed games before target kickoff to calculate each team’s pregame features.
- Same-week games count only when their kickoff is earlier and their result is final.
- Target-game postgame data never contributes to the gathered feature set.

### Current Consensus Spread

- Request `americanfootball_nfl`, U.S. `spreads` from The Odds API.
- Match the provider event to the scheduled game by canonical home/away names and kickoff.
- Validate each bookmaker’s home-team spread quote.
- Set `closingSpreadHome` in the output to the median valid home-team point spread, normalized so positive means home favored (matching historical `closingSpreadHome`).
- Include a `currentOdds` object with provider identifier, retrieval timestamp, count of contributing books, provider-native individual home quotes, and normalized consensus median.
- The field is a **current consensus spread**, never described as a historical closing spread.
- No matching event or no valid quotes is an error; no value is guessed.

### Output

- Write a timestamped JSON snapshot to Git-ignored local storage, defaulting to `data/current/`.
- Do not overwrite prior snapshots.
- Output contains season, week, game type, teams, kickoff, `closingSpreadHome`, `currentOdds`, and `homePregame`/`awayPregame` feature objects matching historical matchup schema.

## Historical Comparator

### CLI

```bash
npm run compare:historical -- --input <path-to-gathered-matchup.json>
```

- Read the published historical matchup manifest once and load its accepted records only.
- Require a valid input matchup with scalar market context, current consensus spread, and complete home/away pregame feature objects.
- No data files are modified by comparison.

### Candidate Selection

- Compare only historical records with the same `gameType`.
- Default week window for target week `W` is `max(1, W - 1)` through `W + 2`; therefore Week 3 searches Weeks 2–5.
- Permit an explicit `weekWindow` override using `startOffset` and `endOffset`.
- Filter candidates to a configurable home-spread band around the input consensus spread.
- Require finite values for all selected comparison features on both sides.

### Ranking and Results

- Rank filtered candidates by weighted, normalized home/away differences across: games played, win percentage, scoring, net YPP, net EPA, turnover margin, offensive/defensive sack rates, rest, and spread.
- Report each match’s similarity score and per-feature distance contribution.
- Evaluate ATS from the home-team perspective:

```text
homeAtsMargin = homeScore - awayScore - closingSpreadHome
```

- Positive margin means the home team covered; negative means the away team covered; zero is a push.
- Return ranked comparisons plus aggregate home-cover, away-cover, push counts, and home cover rate.

## Storage, Failure, and Validation

- Preserve raw The Odds API responses locally in ignored storage with retrieval timestamps.
- A provider, schedule, source-shape, team-match, or spread-quote failure must fail closed and leave existing snapshots untouched.
- The gatherer output must not contain credentials.
- Tests must prove median consensus calculation, source/event matching, missing quote failure, secret non-exposure, pregame leakage prevention, default Week 3 window, explicit window override, ATS grading, and no-candidate behavior.

## Boundaries

- No automatic bets, confidence labels, wagering recommendations, or model training.
- No historical opening line or historical line-movement feature.
- No paid provider, scraper, player dataset, or play-by-play dataset.
