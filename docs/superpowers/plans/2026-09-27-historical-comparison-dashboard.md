# Historical Comparison Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Provide a local analysis-board dashboard for the ranked historical analogues of one gathered matchup snapshot.

**Architecture:** Extend comparator candidates with the historical game fields needed by a presentation layer. A loopback-only built-in Node HTTP server loads the snapshot and accepted matchup dataset once, creates a sanitized comparison response, and serves dependency-free dashboard assets. The browser renders summary cards, a sortable table, and keyboard-accessible game details.

**Tech Stack:** Node.js 18+ built-in `node:http`, CommonJS, static HTML/CSS/JavaScript, `node:test` / `node:assert/strict`.

**Spec:** `docs/superpowers/specs/2026-09-27-historical-comparison-dashboard-design.md`

## Global Constraints

- Serve only from `127.0.0.1`; no external deployment, dependencies, browser file reads, or browser provider requests.
- Read only the accepted matchup JSONL named by its manifest; comparison remains read-only.
- API/browser output must never include API keys, raw provider responses, provider request URLs, individual bookmaker quotes, or filesystem paths.
- Preserve game-type, week-window, spread-band, weighted ranking, 70% coverage, and ATS semantics.
- Historical final scores stay top-level results; target snapshots and nested pregame features remain score-free.
- No picks, confidence labels, or wagering recommendations.

## Review Focus

- Traversal-like accepted manifest paths fail before a response is served. (Task 2)
- Invalid snapshots, malformed JSONL, and unavailable manifests fail closed with safe errors. (Task 2)
- API data omits individual provider quotes and every filesystem/credential-bearing field. (Task 2)
- Empty candidate results render a no-match state rather than a blank table. (Task 3)
- Sorting and selected details remain keyboard-accessible and ATS results are textual as well as colored. (Task 3)

---

### Task 1: Expose historical game context from the comparator

**Files:**
- Modify: `src/compare-historical.js:42-56`
- Modify: `test/compare-historical.test.js:109-123`

**Interfaces:**
- Produces: every candidate has finite `homeScore`, `awayScore`, and `closingSpreadHome` plus its existing rank/ATS fields.
- Consumed by: Task 2's `buildDashboardPayload()`.

- [ ] **Step 1: Write the failing candidate-context test**

Extend the ATS aggregation test with distinct score/spread values. Assert the matching candidate exposes those top-level values and contains neither `homePregame` nor `awayPregame`.

- [ ] **Step 2: Verify RED**

Run: `node --test test/compare-historical.test.js`

Expected: FAIL because candidates omit game context.

- [ ] **Step 3: Implement context projection**

Add only `homeScore`, `awayScore`, and `closingSpreadHome` to the candidate object. Do not alter eligibility, scoring, or nested feature output.

- [ ] **Step 4: Verify GREEN and commit**

Run: `node --test test/compare-historical.test.js`

Expected: PASS.

Commit: `git add src/compare-historical.js test/compare-historical.test.js && git commit -m "feat: expose historical comparison context"`

### Task 2: Add loopback dashboard server and sanitized comparison API

**Files:**
- Create: `src/dashboard-server.js`
- Create: `test/dashboard-server.test.js`
- Modify: `package.json:9-17`

**Interfaces:**
- Produces: `runDashboardCli(argv, output, dependencies)` and `createDashboardServer(options)`.
- Consumes: required `--input` snapshot path, accepted historical manifest, and `compareHistorical()` output.
- Serves: `GET /api/comparison` and static assets supplied by Task 3.

- [ ] **Step 1: Write failing server tests**

Use an injected filesystem and ephemeral server port. Assert missing/duplicate `--input` rejects; valid input reads manifest and accepted JSONL once; the payload includes only target ID/season/week/gameType/teams/kickoff/current consensus/contributing books plus comparison filters/summary/candidates; it omits `currentOdds.homeSpreads`, provider URLs, raw data, and paths. Assert invalid manifest path, malformed JSONL, unknown `GET`, and non-`GET` requests return safe failures (`404`/`405` as applicable).

- [ ] **Step 2: Verify RED**

Run: `node --test test/dashboard-server.test.js`

Expected: FAIL because the module and command do not exist.

- [ ] **Step 3: Implement server lifecycle and routes**

Use built-in `node:http`, bind only to `127.0.0.1`, confine the manifest accepted path as in `runComparisonCli`, whitelist the response rather than serializing a snapshot, and send JSON with `application/json`. Return a server handle for tests and print only the local URL. Add the `dashboard` package script.

- [ ] **Step 4: Verify GREEN and commit**

Run: `node --test test/dashboard-server.test.js`

Expected: PASS.

Commit: `git add src/dashboard-server.js test/dashboard-server.test.js package.json && git commit -m "feat: serve historical comparison dashboard"`

### Task 3: Build the analysis-board client and static routing

**Files:**
- Create: `public/dashboard/index.html`
- Create: `public/dashboard/app.js`
- Create: `public/dashboard/styles.css`
- Modify: `src/dashboard-server.js`
- Modify: `test/dashboard-server.test.js`
- Create: `test/dashboard-client.test.js`
- Modify: `README.md:73-81`

**Interfaces:**
- Consumes: Task 2's sanitized `GET /api/comparison` payload.
- Produces: summary cards, sortable table, selected-candidate details, and loading/error/no-candidate states.

- [ ] **Step 1: Write failing static-client and route tests**

Assert `GET /` serves `index.html` and JavaScript/CSS content types. Assert client source includes accessible sort buttons, focusable/selectable rows, textual ATS labels, selected-detail rendering, and no-candidate/error messages. Assert no asset includes `theoddsapi`, `homeSpreads`, or external `http` resource URLs.

- [ ] **Step 2: Verify RED**

Run: `node --test test/dashboard-server.test.js test/dashboard-client.test.js`

Expected: FAIL because static assets and routes do not exist.

- [ ] **Step 3: Implement the analysis board**

Use semantic local HTML/CSS. Fetch `/api/comparison`, render target/header and summary cards, maintain in-memory sort/selection state, and show selected final score, line, ATS result/margin, coverage/omissions, and labeled feature contributions. Render explicit no-candidate and failed-fetch states. Route only exact static filenames with safe content types.

- [ ] **Step 4: Document and verify GREEN**

Document dashboard usage, loopback scope, required rebuilt historical data, and sanitized data delivery. Run: `node --test test/dashboard-server.test.js test/dashboard-client.test.js && npm test`

Expected: PASS.

Commit: `git add public/dashboard src/dashboard-server.js test/dashboard-server.test.js test/dashboard-client.test.js README.md && git commit -m "feat: render comparison analysis board"`

### Final verification

- [ ] Run `npm test` and `git diff --check`.
- [ ] Start the dashboard with the Eagles–Bears snapshot and verify target context, 10 analogues, textual ATS outcomes, selected-game details, and no individual provider quotes.

## Self-Review

- **Spec coverage:** Task 1 gives the UI historical game information; Task 2 supplies the local sanitized API; Task 3 supplies the selected analysis-board layout, accessibility, errors, empty state, and documentation.
- **Step scan:** Every task names files, interfaces, tests, expected command results, and one focused implementation.
- **Type consistency:** Comparator candidate fields feed the whitelisted payload, which is the sole client data source.
- **Review focus:** Every listed routing, data-exposure, empty-state, and accessibility risk has an owning test task.
- **Proportion:** Three independently verifiable tasks match the implementation boundaries without duplicating source bodies.
