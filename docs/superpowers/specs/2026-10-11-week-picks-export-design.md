# Week Picks Export Design

## Goal

Allow a user to export the personal picks and confidence points arranged in
the NFL ATS Pucker week dashboard, then load that file into the `../gig`
WebdriverIO submission command without manually translating Gridiron game
IDs.

## Export Contract

The week dashboard downloads `week-<week>-picks.json` containing an array of
entries in this shape:

```json
[
  { "team": "Dallas", "points": 7 }
]
```

`team` is the exact site team name that Gridiron exposes in its radio input
value, and `points` is the dashboard's assigned confidence value. The export
does not include game IDs, credentials, market data, provider data, or other
dashboard content.

## Week Dashboard

The client keeps its existing local pick and rank state. It adds an Export
button near existing weekly controls.

The button is enabled only when every ready game has a selected team and every
selected NFL abbreviation has a known canonical Gridiron name. The canonical
mapping is maintained locally in the week-dashboard client. It must translate
site-sensitive names such as `DAL` to `Dallas` and `LAC` to `LA Chargers`.
Unknown mappings never produce guessed output: export remains disabled and the
status identifies the unexportable matchup.

When enabled, the button serializes the ordered ready games into the export
contract, creates a local JSON download, and announces the result in the
existing dashboard status area. The export is browser-local and sends no data
to the server.

Unavailable games are not exportable; the file contains only ready games. The
Gig importer remains the authority on whether that list completely matches the
live weekly slate before it touches the form.

## Gig Importer

The existing Gig JSON form remains supported:

```json
{ "gameId": 11, "team": "home", "points": 2 }
```

It additionally accepts team-identified entries without `gameId`. After
discovering the live current-week games, it resolves an exact team value to
the one game where it equals the discovered home or away value, then converts
the entry into the existing game-ID validation path.

Resolution rejects unknown teams, ambiguous teams, duplicate resolved games,
and incomplete lists. Existing validation continues to reject invalid team
values, locked games, duplicate or out-of-range points, and anything other
than one entry for every discovered game. All input resolution and validation
finishes before any browser interaction that changes picks.

Mixed inputs with `gameId` entries and team-identified entries are permitted
only when their resolved games are unique and collectively cover the live
slate.

## Testing

NFL ATS Pucker client tests cover disabled and enabled export states, exact
canonical names, confidence-point ordering, local JSON download construction,
and unmapped-team handling.

Gig input tests cover team-only resolution, legacy game-ID input compatibility,
valid mixed input, and unknown, ambiguous, duplicate, and incomplete
team-identified entries. Each repository's full test suite runs after its
changes.
