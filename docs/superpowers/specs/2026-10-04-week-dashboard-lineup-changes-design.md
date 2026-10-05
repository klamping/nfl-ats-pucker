# Weekly Dashboard Lineup Changes Design

## Goal

Extend the weekly NFL dashboard with build-time lineup context for both teams in every requested game. The dashboard must distinguish official availability and roster movement from a third-party projected depth chart, and must identify first- and second-string depth-chart changes since the last successful local capture.

## Sources

Two public HTML sources serve distinct purposes:

- **NFL.com** supplies official injury-report and league-transaction entries. Only entries dated in the 14 calendar days before the dashboard build are shown.
- **Ourlads** supplies the timestamped projected team depth chart, including starter order and reserve/IR designations. Its first- and second-string entries are a projection, not an official lineup.

The UI and API retain these labels. Neither source is treated as a complete roster-health reconstruction or as input to picks, rankings, or confidence.

## Build-Time Gathering

`npm run week:dashboard -- --season YYYY --week N` already downloads and filters the schedule before gathering individual game snapshots. After resolving the slate, it will collect lineup context once for each unique participating team. This work completes before the weekly server begins listening; the browser makes no request to either external source.

Dedicated NFL.com and Ourlads clients download the needed HTML, and source-specific parsers normalize it to a small source-neutral shape. Inputs include team identity, source URL, source update time when available, retrieval time, official injury/transaction entries, and depth-chart slots. Clients and parsers have fixture-based tests so source markup changes fail closed rather than producing invented information.

## Local Captures and Change Detection

Every successful source download retains an immutable local-only raw capture, while a normalized per-team snapshot records the safe parsed content and retrieval metadata. On each build, the lineup service locates that team's latest earlier valid normalized snapshot as its baseline.

For Ourlads, only the player occupying depth ranks one and two at each position is compared. A changed player at the same position/rank produces a change record containing the position, rank, outgoing player, incoming player, and source label. New or removed rank-one/rank-two entries are also reported. The first successful capture for a team establishes its baseline and explicitly reports that no prior depth chart is available; it does not manufacture a change.

The service does not infer player health from missing injury reports, prolong temporary status into later dates, or interpret an injury/transaction as a confirmed starter replacement.

## Failure Handling

Lineup collection is isolated by team and source. A failed source request, unparseable document, invalid team mapping, or snapshot-write failure yields an unavailable status for that team/source. It does not fail the game’s ordinary pregame gathering, hide the game from the slate, or prevent other teams from receiving lineup context. A failed collection never replaces a valid prior normalized snapshot.

## API and User Interface

The weekly slate API adds a safe precomputed lineup-context projection for the home and away teams. It includes only source label, source/retrieval time, status, 14-day official entries, baseline status, and normalized first-/second-string changes. It excludes raw HTML, raw source payloads, filesystem paths, request details, and arbitrary provider URLs.

Each ready game row gains a compact, accessible lineup-changes area. For each team it shows:

- **Official — NFL.com:** the recent dated injury and transaction entries;
- **Projected depth chart — Ourlads:** first- and second-string changes against the prior local capture;
- an explicit unavailable or no-prior-baseline message where applicable.

This context is informational only. It adds no betting recommendation, score, confidence, ordering, or automatic interpretation.

## Testing and Documentation

Tests use static NFL.com and Ourlads HTML fixtures to verify strict parsing, team mapping, 14-day date filtering, raw/snapshot persistence, previous-snapshot selection, first-/second-string diffing, no-baseline behavior, and per-source failure isolation. Weekly orchestration tests verify one lineup gather per unique slate team and ensure lineup errors cannot make an otherwise gathered game unavailable. Server and client tests verify the safe projection and labeled rendering states.

The README documents the two sources, build-time behavior, local snapshot baseline semantics, 14-day window, projection caveat, and source-failure behavior.
