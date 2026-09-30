# Weekly NFL Dashboard Implementation Plan

> **For the implementer:** Use test-driven development for every task: add the focused test, run it to confirm it fails, implement the smallest change, then rerun the focused and full suites. Commit after each green task.

**Goal:** Provide one loopback-only weekly slate dashboard that gathers and summarizes every supported NFL game in a requested season/week, safely linking each successful game to its existing detailed historical-comparison view.

**Architecture:** A new weekly CLI downloads the schedule once, selects REG/POST games for the requested week, and calls the existing pregame gatherer once per game with a memoized schedule client. It decides `--retrospective` from the target kickoff versus the injected clock. A dedicated slate server precomputes each successful comparison using the existing comparator and exposes a narrow slate projection plus per-game comparison API routes. The existing comparison client becomes route-aware so it can render the same detail UI at a weekly-game URL.

**Tech Stack:** Node.js 18 CommonJS, `node:test`, built-in `http`, existing nflverse/odds clients, static HTML/CSS/JavaScript.

## File map

| File | Responsibility |
| --- | --- |
| `package.json` | Add the `week:dashboard` command. |
| `src/gather-pregame.js` | Permit callers to supply an already-downloaded, validated schedule to avoid repeated schedule downloads. |
| `src/week-dashboard.js` (new) | Parse weekly CLI input, download/filter the schedule once, select live versus retrospective gathering, isolate per-game errors, and launch the slate server. |
| `src/week-dashboard-server.js` (new) | Create the loopback slate server, load comparisons, strictly project slate/detail data, and serve exact slate/detail routes. |
| `public/week-dashboard/index.html` (new) | Accessible compact weekly-slate page shell. |
| `public/week-dashboard/app.js` (new) | Fetch and render the slate; make successful rows keyboard-accessible links and failed rows non-selectable. |
| `public/dashboard/app.js` | Resolve a detail API endpoint from `/games/<game-id>/` while preserving `/api/comparison` for the standalone dashboard. |
| `test/gather-pregame.test.js` | Prove supplied schedules are used without a second schedule download. |
| `test/week-dashboard.test.js` (new) | Cover CLI validation, REG/POST filtering, one schedule download, mixed live/retrospective selection, and per-game failure isolation. |
| `test/week-dashboard-server.test.js` (new) | Cover strict projections, detail routes, safe failures, loopback binding, and exact static/API routes. |
| `test/dashboard-client.test.js` | Prove the detail client requests the selected game comparison endpoint. |
| `test/week-dashboard-client.test.js` (new) | Cover compact row fields, link navigation, and failed-row rendering. |

## Task 1: Reuse a downloaded schedule in pregame gathering

**Files:**
- Modify: `src/gather-pregame.js`
- Modify: `test/gather-pregame.test.js`

1. Add a failing test that calls `gatherPregame` with a valid `scheduleDownload` fixture and asserts `downloadNflverseGames()` is not called, while the generated snapshot matches the normal gather path.
2. Run `node --test test/gather-pregame.test.js` and confirm the new test fails because the supplied schedule is ignored.
3. Add an optional `scheduleDownload` input to `gatherPregame`. Use it when present; otherwise download normally. Run the existing `validateDownload(schedule, 'schedule')` in both cases so caller-provided data receives the same validation.
4. Keep all target resolution, kickoff gating, historical feature derivation, and source metadata behavior unchanged.
5. Run `node --test test/gather-pregame.test.js`, then `npm test`.
6. Commit: `refactor: allow pregame gather to reuse schedule`

## Task 2: Implement weekly selection and mixed-mode orchestration

**Files:**
- Create: `src/week-dashboard.js`
- Modify: `package.json`
- Create: `test/week-dashboard.test.js`

1. Write failing tests for exported `parseCli` and `runWeekDashboardCli`:
   - accepts exactly `--season YYYY --week N`, with season in the existing 2005–3000 range and positive integer week;
   - rejects duplicate, missing, unknown, and malformed options before downloading;
   - downloads the schedule once and selects only that season/week’s `REG` and `POST` rows with valid normalized kickoffs;
   - invokes gathering with `retrospective: false` for future kickoff rows and `true` for past kickoff rows, passing the shared schedule download to every call;
   - records a safe per-game failure and continues gathering later games;
   - passes successful snapshots and failures to the slate-server factory once.
2. Run `node --test test/week-dashboard.test.js` and confirm failures for the absent module/exports.
3. Implement `parseCli(argv)` and `runWeekDashboardCli(argv, output, dependencies)` with dependency injection matching the existing CLI tests (`now`, nflverse client, gather function, server factory).
4. Derive each mode from the normalized schedule kickoff and the same validated clock used for the entire run. Do not infer completion from week number; the downstream retrospective gatherer remains the authority for final score and closing-line validation.
5. Construct one memoized schedule client/download for gathering so `downloadNflverseGames()` is called once. Reuse the existing gatherer rather than duplicating pre-kickoff feature or odds logic.
6. Add `"week:dashboard": "node src/week-dashboard.js"` to `package.json`.
7. Run `node --test test/week-dashboard.test.js`, then `npm test`.
8. Commit: `feat: orchestrate weekly game dashboards`

## Task 3: Add a secure weekly slate server and API

**Files:**
- Create: `src/week-dashboard-server.js`
- Create: `test/week-dashboard-server.test.js`

1. Write failing server tests using injected snapshots/failures and fixture historical data:
   - binds to `127.0.0.1` and logs one local root URL through the CLI wrapper;
   - `GET /api/slate` returns only season, week, success/failure status, game ID, matchup, kickoff, projected line/source, candidate count, and home/away cover rates;
   - it never serializes snapshot paths, source URLs, raw odds, credentials, retrieval times, feature data, or caught error internals;
   - `GET /api/comparison/<encoded-game-id>` returns the existing `buildDashboardPayload` projection for a successful game and 404 for failures/unknown IDs;
   - `GET /games/<encoded-game-id>/` serves the detail HTML only for successful games;
   - accepts only exact GET routes, returns 405 for other methods and 404 for path variants/query strings.
2. Run `node --test test/week-dashboard-server.test.js` and confirm failures because the server does not exist.
3. Extract/reuse `buildDashboardPayload`, `loadPayload`’s manifest loading logic, and safe `projectCurrentOdds` behavior from `dashboard-server.js` as small exported helpers where needed; preserve standalone dashboard behavior and its safe API contract.
4. Implement `createWeekDashboardServer({ season, week, games, failures, outputRoot, fileSystem, port })`. Load the historical manifest once, compare each successful snapshot once before listening, and store only precomputed projected payloads in memory.
5. Serve the slate root/assets and the existing comparison assets from exact allowlisted routes. Bind exclusively to `127.0.0.1` and use the same no-store, nosniff, referrer, and strict CSP headers as `dashboard-server.js`.
6. Run `node --test test/week-dashboard-server.test.js test/dashboard-server.test.js`, then `npm test`.
7. Commit: `feat: serve secure weekly slate dashboard`

## Task 4: Render the compact slate and route detailed comparisons

**Files:**
- Create: `public/week-dashboard/index.html`
- Create: `public/week-dashboard/app.js`
- Modify: `public/dashboard/app.js`
- Create: `test/week-dashboard-client.test.js`
- Modify: `test/dashboard-client.test.js`

1. Write failing slate-client tests with the project’s lightweight DOM fixture pattern:
   - fetches only `/api/slate` and renders matchup, kickoff, home line/source, qualifying count, home-cover rate, and away-cover rate for a successful game;
   - renders a semantic, keyboard-usable link to `/games/<encoded-game-id>/` for successes;
   - renders a failure status without a detail link for failures;
   - uses `—` for unavailable cover rates and contains no picks/confidence wording.
2. Add a failing detail-client test for a location path such as `/games/2026_03_LA_DEN/`, asserting it fetches `/api/comparison/2026_03_LA_DEN`; retain the standalone root assertion for `/api/comparison`.
3. Run `node --test test/week-dashboard-client.test.js test/dashboard-client.test.js` and confirm the new tests fail.
4. Implement the slate page as a compact accessible table. Format the line using the established home-team convention (negative = home favored, positive = home underdog); identify `nflverse` as closing-line data and live odds by contributing-book count only when safely projected.
5. Update the existing comparison client to derive its API URL from the exact `/games/<encodeURIComponent(gameId)>/` route, otherwise use `/api/comparison`. Do not use query parameters or raw IDs inserted as HTML.
6. Run the focused client tests, then `npm test`.
7. Commit: `feat: render weekly slate and game detail links`

## Task 5: Document and verify the end-to-end workflow

**Files:**
- Modify: `README.md`
- Modify: `test/week-dashboard.test.js`

1. Add a failing CLI-level test proving `runWeekDashboardCli` prints the one loopback URL returned by the slate server after mixed-mode processing.
2. Run `node --test test/week-dashboard.test.js` and confirm the expected output contract is not yet met (if Task 2 did not already require it).
3. Ensure the CLI delegates URL logging to exactly one place and returns the running server for test cleanup.
4. Add README usage and behavior notes:
   ```bash
   npm run week:dashboard -- --season 2026 --week 3
   ```
   Explain that upcoming games use current live odds, completed current-season games use nflverse closing lines and pre-kickoff features, and individual failures remain visible without blocking the slate.
5. Run `npm test` and `git diff --check`.
6. Commit: `docs: document weekly dashboard workflow`
