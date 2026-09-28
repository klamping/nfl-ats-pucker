# Retrospective Current-Season Dashboard Design

## Purpose

Allow an operator to generate the local historical-comparison dashboard for a
completed current-season game when no pre-kickoff snapshot was saved. The
result must remain leakage-safe: its team features describe only information
available before the target kickoff.

## Scope

Add an explicit retrospective mode to the existing game dashboard command:

```sh
npm run game:dashboard -- --season 2026 --game-id 2026_03_LAR_DEN --retrospective
```

The mode supports completed games in the requested current season only. The
active NFL season is the UTC calendar year from March through December, and
the preceding year in January or February. It is not a replacement for live
gathering and does not reconstruct historical live odds or line movement.

## Mode Semantics

### Live mode (unchanged)

Without `--retrospective`, the target kickoff must be in the future. The
gatherer obtains current U.S. spread quotes from The Odds API, writes a raw
provider capture, and stores their consensus home-team spread.

### Retrospective mode

With `--retrospective`, the target kickoff must be in the past and its nflverse
schedule row must have final scores, a final result, and a finite `spread_line`.
The schedule row's home-team `spread_line` is the market input. Positive means
the home team was the underdog; negative means the home team was favored.

The mode must not load `theoddsapi`, create an odds client, call The Odds API,
or write an odds raw capture. It writes only the generated analysis snapshot.

## Leakage Safety

Both modes derive target features by collecting completed same-season games
with `kickoff < targetKickoff`, then adding featureless target markers before
running `deriveTeamPregame`. The target's final score/result establishes only
retrospective eligibility; it is not copied into the target snapshot and never
enters target team features.

The target snapshot continues to carry `closingSpreadHome`, but its market
metadata is source-aware:

- live: The Odds API consensus and contributing-book count;
- retrospective: nflverse closing line and no book count.

Comparator validation accepts these two explicit market sources and always
requires the finite `consensusSpreadHome` to equal `closingSpreadHome`. Raw
book quotes remain valid only for the live source.

## Dashboard Presentation

The dashboard preserves the existing line display. Its scope line identifies
the market source: live snapshots show contributing books; retrospective
snapshots show `nflverse closing line`. The server exposes only safe market
metadata, never raw provider responses or credential material.

## Interfaces and Errors

`--retrospective` is an optional boolean CLI flag for both the gatherer and
the game-dashboard wrapper. Other option parsing remains strict.

Retrospective mode rejects:

- a future or currently unstarted target;
- a target without a final score/result;
- a target with no finite nflverse closing spread;
- a non-current-season request.

Live mode retains its existing future-target rejection and provider validation.

## Tests

Regression tests will verify:

1. a completed current-season target creates a snapshot from its nflverse
   closing home spread without an odds client, credential lookup, or raw odds
   write;
2. target pregame features exclude the target game and later games;
3. retrospective mode rejects future, unfinished, line-less, and non-current
   season targets;
4. live mode behavior and raw-capture transaction behavior remain unchanged;
5. comparator and dashboard safely project both live and retrospective market
   metadata; and
6. the game-dashboard CLI forwards `--retrospective` correctly.
