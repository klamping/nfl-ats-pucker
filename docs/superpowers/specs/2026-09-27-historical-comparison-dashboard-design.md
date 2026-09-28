# Historical Comparison Dashboard Design

## Goal

Provide a local, browser-based research dashboard for one gathered matchup snapshot that makes its ranked historical analogues easy to inspect. It is descriptive research tooling only: no picks, confidence labels, wagering recommendations, external deployment, or browser-side credentials.

## Scope

- Start a local dashboard for one snapshot with a new CLI command:

  ```bash
  npm run dashboard -- --input data/current/<snapshot>.json
  ```

- Render the existing historical-comparison result as an analysis board:
  - target matchup and current consensus context;
  - comparison summary cards;
  - sortable table of the ranked historical analogues;
  - selected-game details and per-feature distance contributions.
- Include historical final scores and historical home spread in each comparator candidate result so the dashboard can describe each game without independently rereading records.
- Keep the dashboard local, dependency-free, and served from loopback only.

## Out of Scope

- Browsing the complete historical archive outside the ranked analogue set.
- Sharing, deployment, authentication, accounts, persistence, browser-side edits, or live refresh.
- Raw Odds API captures, bookmaker details, credentials, historical opening lines, player data, play-by-play, or model training.

## Architecture

`src/dashboard-server.js` is a built-in Node HTTP server started by the dashboard CLI. It accepts one input snapshot path, resolves and validates it, loads the accepted historical matchup manifest once, invokes the existing comparison logic, and serves static dashboard assets plus a sanitized `/api/comparison` JSON response.

The browser is dependency-free HTML, CSS, and JavaScript under `public/dashboard/`. It receives only the target context and comparison results needed for presentation. It does not read local files directly, make provider requests, receive raw provider captures, or receive credentials. The server binds to `127.0.0.1` by default and serves no mutating endpoints.

## CLI and Server Contract

### Command

```bash
npm run dashboard -- --input <path-to-gathered-matchup.json>
```

- `--input` is required exactly once.
- The command prints a local URL and starts a server bound to `127.0.0.1` on an ephemeral port unless a test injects a port.
- Invalid options, unreadable input, invalid snapshot, missing/invalid historical manifest, or malformed accepted JSONL fail before serving a usable dashboard.
- Comparison remains read-only: neither snapshot nor historical data is modified.

### API

`GET /api/comparison` returns JSON containing:

- a sanitized target context: game ID, season, week, game type, teams, kickoff, normalized current consensus spread, and contributing-book count;
- `filters`, `summary`, and ranked `candidates` from the comparator;
- no Odds API key, raw provider response, provider request URL, provider-native individual quotes, filesystem paths, or non-comparison data.

Static asset requests are limited to dashboard assets. Unknown paths return `404`; non-`GET` requests return `405` without changing data.

## Comparator Candidate Detail

Each candidate retains its existing ranking and ATS fields and additionally exposes:

- `homeScore` and `awayScore`;
- `closingSpreadHome`;
- the existing teams, season, week, game type, ATS margin/outcome, similarity score, coverage, omissions, and distance contributions.

Final scores remain top-level historical outcomes. They never enter `homePregame` or `awayPregame`, and target snapshot output remains score-free.

## Analysis Board UX

### Header and Summary

The header identifies the target matchup and kickoff, with the current consensus spread and contributing-book count. Summary cards display candidate count, historical home-cover rate, configured week window, and spread band.

### Historical Table

The primary table lists the ranked historical candidates with season/week, away at home matchup, final score, historical home spread, ATS outcome and margin, similarity score, and feature coverage. Default order is ascending similarity score. Users can sort by similarity, season, or ATS outcome using keyboard-accessible controls.

### Selected Candidate

Selecting a table row opens an adjacent or below-table details region. It shows the final score, historical line, ATS outcome/margin, similarity score, coverage/omitted fields, and a labeled per-feature distance-contribution table. The selected state is visually clear and available to keyboard users.

### Empty and Error States

- A valid comparison with no candidates clearly explains that no historical records matched the filters and presents the applied filters.
- The client displays a concise loading or API-failure message without leaking server details.
- Server startup and source validation errors are written to stderr with safe context but no credential or raw provider data.

## Accessibility and Presentation

- Use semantic heading, table, button, and detail-region elements.
- All interactive elements are keyboard operable and visibly focused.
- ATS results use text labels in addition to color.
- The layout remains usable on narrow viewports by allowing the table to scroll horizontally and placing selected details below it.
- Use no external fonts, scripts, tracking, or network resources.

## Testing

- Comparator tests assert final scores and historical spread are returned without changing ranking, feature coverage, or ATS math.
- Server tests cover required/duplicate CLI option handling, loopback-only binding, valid sanitized response shape, absent candidates, malformed input/manifest/JSONL, static routing, `404`, and `405` behavior.
- Browser tests, using no browser framework, assert the static client source includes sortable table controls, selected-candidate rendering, no-candidate rendering, and no forbidden provider/credential fields.
- The complete Node test suite remains green.

## Constraints

- Node.js 18+ and built-in Node HTTP only; no frontend framework or new runtime dependency.
- Read only the accepted historical matchup JSONL named by its manifest.
- Preserve the current comparator’s game type, week-window, spread-band, weighted similarity, 70% historical coverage threshold, and ATS semantics.
- No browser, CLI, error, API, or static asset output may expose the Odds API key.
