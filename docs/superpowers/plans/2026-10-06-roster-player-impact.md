# Roster Player Impact Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an explainable, two-season missing-player-versus-replacement impact report to the weekly team-context dashboard for every position.

**Architecture:** A dedicated nflverse client captures and publishes season player, defensive-player, snap-count, and team-stat CSVs. Pure metric calculators turn those records into direct EPA evidence for skill positions and position-unit proxy evidence elsewhere; a roster-impact service joins that evidence to official Out statuses and current depth slots. Weekly orchestration precomputes isolated per-team results, and the existing safe slate API and context UI render them.

**Tech Stack:** Node.js 18+, CommonJS, built-in `node:fs/promises` and `node:zlib`, `csv-parse/sync`, `node:test`, existing NFL.com/Ourlads/nflverse public CSV sources.

**Spec:** `docs/superpowers/specs/2026-10-06-roster-player-impact-design.md`

## Global Constraints

- Evaluate only NFL.com injury rows with the explicit `Out` game status; do not infer health from missing, questionable, or practice-status rows.
- Use only the target season and immediately preceding season, strictly before the target game kickoff; never fill unavailable data with zero.
- The target season receives greater recency weight than the preceding season.
- Use a fixed current-season weight of `2` and previous-season weight of `1`; make the constants named and test them rather than tuning them to outcomes.
- Require at least 2 eligible games and 10 direct role opportunities per compared skill player, or 3 eligible snap-count games per compared unit-proxy player; otherwise emit `insufficient evidence`.
- Classify the primary EPA delta as material at an absolute `0.10` EPA per opportunity/play and possible at an absolute `0.03`; use `roughly neutral` below `0.03`. Secondary metrics corroborate/caveat the verdict but do not create it by themselves.
- Compare an unavailable player with the next available projected player at the same Ourlads position; Out replacements are skipped.
- QB/RB/WR/TE EPA evidence must be labeled direct; OL/DL/LB/DB and any other non-direct measures must be labeled unit proxy.
- Report descriptive verdicts and confidence only; do not emit a betting recommendation, ranking, point-spread adjustment, causal claim, source URL, raw capture, file path, or private error.
- Fail closed and preserve ready games when player data, identity, depth, replacement, or metric evidence is unavailable or ambiguous.

## Review Focus

- An `Out` player whose next depth-chart player is also Out must advance to the next available same-position player or emit `insufficient evidence` (Task 4).
- A game later on the same calendar day as the target must not contribute any player, snap, or team metric (Task 3).
- Name normalization that produces more than one team/season candidate must abstain instead of selecting an arbitrary player (Task 4).
- A malformed or partially published local data manifest/capture must not replace the previous valid publication or expose raw content (Task 2).
- A valid game with unavailable roster-impact data must stay ready and render an explicit unavailable/insufficient-evidence state (Tasks 5 and 6).

---

## File Structure

- `src/nflverse-roster-data-client.js` — download, validate, persist, and load the four nflverse season datasets needed by roster impact, keyed to the already downloaded NFL schedule.
- `src/roster-impact-metrics.js` — pure two-season filtering, weighting, direct-EPA and unit-proxy summary calculations, confidence, and verdict rules.
- `src/roster-impact-service.js` — resolve Out players/depth replacements, join roster data to metrics, and produce safe per-team impact records.
- `src/lineup-context.js` — retain normalized current first-/second-string slots in the in-memory lineup result so the impact service can choose replacements.
- `src/week-dashboard.js` — initialize shared roster data once, gather each team’s impact context with its matchup cutoff, and isolate failures.
- `src/week-dashboard-server.js` — validate and project only the roster-impact fields that are safe for `/api/slate`.
- `public/week-dashboard/app.js` and `public/dashboard/styles.css` — render accessible impact cards in the existing team-context expansion.
- `test/nflverse-roster-data-client.test.js`, `test/roster-impact-metrics.test.js`, `test/roster-impact-service.test.js` — fixture-driven unit coverage for the new units.
- Existing lineup, weekly orchestration, server, client, and README tests/docs — integration coverage and user-facing semantics.

### Task 1: Preserve Current Projected Depth Slots

**Files:**
- Modify: `src/lineup-context.js:37-43,58-63`
- Modify: `test/lineup-context.test.js`

**Interfaces:**
- Consumes: normalized Ourlads `{ position, rank, player }` slots.
- Produces: ready `depthChart` context with `slots: Array<{ position: string, rank: 1 | 2, player: string }>` alongside the existing baseline/change fields; persisted snapshots retain the same slots.

- [ ] **Step 1: Write failing tests for ready depth context retaining only first- and second-string slots**

  Assert a depth result with ranks 1–3 exposes sorted rank-1/rank-2 `slots`, preserves current snapshot behavior, and never exposes rank 3.

- [ ] **Step 2: Run the lineup-context test file to verify it fails**

  Run: `node --test test/lineup-context.test.js`

  Expected: FAIL because `depthChart.slots` is absent.

- [ ] **Step 3: Add safe current-slot projection to `gatherLineupContext`**

  Keep the persisted schema unchanged; return the already validated, rank-filtered `{ position, rank, player }` list in a ready Ourlads result. Do not add source URLs, raw markup, or third-string slots.

- [ ] **Step 4: Run the lineup-context tests to verify they pass**

  Run: `node --test test/lineup-context.test.js`

  Expected: PASS.

- [ ] **Step 5: Commit the depth-slot interface**

  ```bash
  git add src/lineup-context.js test/lineup-context.test.js
  git commit -m "feat: retain current projected depth slots"
  ```

### Task 2: Add Validated nflverse Roster Data Acquisition

**Files:**
- Create: `src/nflverse-roster-data-client.js`
- Create: `test/nflverse-roster-data-client.test.js`

**Interfaces:**
- Produces: `createNflverseRosterDataClient({ fetchImpl, now, fileSystem })` with `loadSeasons({ seasons: number[], scheduleRows: object[], outputRoot: string }): Promise<{ seasons: RosterSeasonData[], retrievedAt: string }>`.
- `RosterSeasonData` has `{ season, playerStats, defensivePlayerStats, snapCounts, teamStats, kickoffsByTeamWeek }`, with parsed, validated rows and source metadata retained only on disk.
- Consumes: public URLs `player_stats/player_stats_<season>.csv`, `player_stats/player_stats_def_<season>.csv`, `snap_counts/snap_counts_<season>.csv`, and `stats_team/stats_team_week_<season>.csv`.

- [ ] **Step 1: Write failing client tests using four small CSV fixtures per season**

  Cover required headers and numeric/date validation; deriving a unique UTC kickoff by team/season/week from the already downloaded schedule rows; immutable raw capture creation; atomic publication of a manifest under `data/current/roster-impact/`; loading a previously published valid pair; and a failed/malformed download leaving the preceding manifest intact.

- [ ] **Step 2: Run the new client tests to verify they fail**

  Run: `node --test test/nflverse-roster-data-client.test.js`

  Expected: FAIL because the client module does not exist.

- [ ] **Step 3: Implement `createNflverseRosterDataClient` in `src/nflverse-roster-data-client.js`**

  Use the existing `csv-parse/sync` validation style and the repository’s immutable-capture/atomic-publication convention. Require enough columns to identify player/team/season/week/game type and calculate the specified direct/proxy metrics: offensive player EPA/usage, defensive counting evidence, snap counts, and team passing/rushing/sack/turnover EPA context. Convert the already downloaded NFL schedule into a unique UTC kickoff index for team/season/week; reject an ambiguous/missing schedule key rather than admitting a row without a cutoff. Retain raw CSVs under `data/raw/nflverse/roster-impact/`; write validated normalized data plus a manifest under `data/current/roster-impact/`. Reject duplicate/invalid season requests, unsafe manifests, malformed rows, and non-OK requests without publishing partial results.

- [ ] **Step 4: Run the client tests to verify they pass**

  Run: `node --test test/nflverse-roster-data-client.test.js`

  Expected: PASS.

- [ ] **Step 5: Commit the data client**

  ```bash
  git add src/nflverse-roster-data-client.js test/nflverse-roster-data-client.test.js
  git commit -m "feat: add nflverse roster impact data client"
  ```

### Task 3: Implement Position-Aware, Two-Season Metric Calculators

**Files:**
- Create: `src/roster-impact-metrics.js`
- Create: `test/roster-impact-metrics.test.js`

**Interfaces:**
- Produces: `summarizeComparison({ unavailablePlayer, replacementPlayer, position, team, kickoff, targetSeason, seasons }): ImpactEvidence | null`.
- `ImpactEvidence` is `{ evidenceType: 'direct' | 'unit-proxy', metrics: MetricDelta[], teamContext: TeamContext, sample: { unavailable, replacement }, confidence: 'high' | 'medium' | 'low' }`.
- `MetricDelta` is `{ key, label, unavailableValue, replacementValue, delta, direction: 'higher' | 'lower', unavailableSample, replacementSample }`.
- Consumes: `RosterSeasonData[]` from Task 2 and resolved identity records from Task 4.

- [ ] **Step 1: Write failing calculator tests for strict cutoff and weighted direct EPA**

  Use current/prior-season fixture rows to assert the exact `2:1` current-to-prior weight; target, future, same-day, and post-kickoff rows are excluded using `kickoffsByTeamWeek`; QB EPA/dropback uses passing EPA divided by attempts plus sacks; RB EPA/carry uses rushing EPA divided by carries; WR/TE EPA/target uses receiving EPA divided by targets; and zero denominators abstain rather than divide by zero.

- [ ] **Step 2: Add failing tests for transparent unit proxies and sparse evidence**

  Assert OL returns `unit-proxy` metrics based on team offensive EPA/play, sack outcome, rushing efficiency, and snap continuity across participation games; DL/LB/DB return opponent EPA allowed plus applicable sacks/takeaways/continuity; metrics with unavailable source fields are omitted; and an unsupported/sparse position returns `null` rather than invented values.

- [ ] **Step 3: Run the metric tests to verify they fail**

  Run: `node --test test/roster-impact-metrics.test.js`

  Expected: FAIL because the calculator module does not exist.

- [ ] **Step 4: Implement `summarizeComparison` and its private position-family helpers**

  Build one strictly pre-kickoff game index from `kickoffsByTeamWeek`, filter to REG/POST games in `targetSeason` and `targetSeason - 1`, and aggregate by game with named weights `CURRENT_SEASON_WEIGHT = 2` and `PRIOR_SEASON_WEIGHT = 1`. Return direct evidence only for QB/RB/WR/TE. Associate OL and defensive players to their snap-count participation games and calculate only explicitly labeled team/opponent-unit proxy metrics. Include team-unit baseline and sample counts; return `null` unless both direct comparators have at least 2 games/10 role opportunities or both proxy comparators have at least 3 snap-count games.

- [ ] **Step 5: Run the metric tests to verify they pass**

  Run: `node --test test/roster-impact-metrics.test.js`

  Expected: PASS.

- [ ] **Step 6: Commit the metric layer**

  ```bash
  git add src/roster-impact-metrics.js test/roster-impact-metrics.test.js
  git commit -m "feat: calculate position-aware roster impact evidence"
  ```

### Task 4: Resolve Official Absences into Replacement Comparisons

**Files:**
- Create: `src/roster-impact-service.js`
- Create: `test/roster-impact-service.test.js`

**Interfaces:**
- Produces: `gatherRosterImpacts({ team, kickoff, targetSeason, lineup, rosterData }): Promise<{ status: 'ready', playerImpacts: PlayerImpact[] } | { status: 'unavailable' }>`.
- `PlayerImpact` is `{ player, position, status: 'Out', observedAt, depthRole, replacement, verdict, confidence, evidenceType, metrics, teamContext, sample, caveats }` or `{ player, position, status: 'Out', observedAt, verdict: 'insufficient evidence', reason }`.
- Consumes: lineup official injuries/current slots from Task 1 and `summarizeComparison` from Task 3.

- [ ] **Step 1: Write failing service tests for status, identity, and replacement selection**

  Assert that only case-normalized explicit `Out` injuries are evaluated; `Questionable`/practice/blank rows are ignored; the affected depth slot selects the next higher rank at the same position; a same-position replacement marked Out is skipped; no available replacement emits `insufficient evidence`; and a distinct multi-match name resolution emits `insufficient evidence`.

- [ ] **Step 2: Add failing tests for verdicts and failure isolation**

  Assert deterministic direct/proxy evidence maps to the five approved verdicts and confidence labels with caveats: `>= 0.10` EPA primary-metric disadvantage is material, `0.03`–`0.099...` is possible, and `< 0.03` is neutral (with signs reversed for an upgrade). A metric exception or missing roster data returns a source-safe unavailable/insufficient result; no raw capture, URL, path, or thrown private error appears in the output.

- [ ] **Step 3: Run the service tests to verify they fail**

  Run: `node --test test/roster-impact-service.test.js`

  Expected: FAIL because the service module does not exist.

- [ ] **Step 4: Implement `gatherRosterImpacts` with fail-closed identity matching**

  Normalize names only for comparison, then require a unique candidate constrained by team, mapped position family, and two-season data. Derive depth role from the Out player’s current slot, select the next non-Out slot, call Task 3, and expose only compact evidence. Map weighted deltas to `material downgrade`, `possible downgrade`, `roughly neutral`, or `possible upgrade` only when minimum coverage and agreement are met; otherwise return `insufficient evidence` with a user-safe reason.

- [ ] **Step 5: Run the service tests to verify they pass**

  Run: `node --test test/roster-impact-service.test.js`

  Expected: PASS.

- [ ] **Step 6: Commit the service**

  ```bash
  git add src/roster-impact-service.js test/roster-impact-service.test.js
  git commit -m "feat: compare out players with projected replacements"
  ```

### Task 5: Integrate Impact Gathering into the Weekly Build and Safe API

**Files:**
- Modify: `src/week-dashboard.js:1-77`
- Modify: `src/week-dashboard-server.js:7-46`
- Modify: `test/week-dashboard.test.js`
- Modify: `test/week-dashboard-server.test.js`

**Interfaces:**
- Consumes: Tasks 1–4.
- Produces: each ready `lineup.{home,away}` context includes `impacts: { status: 'ready', playerImpacts } | { status: 'unavailable' }`; `/api/slate` exposes the validated safe equivalent as `playerImpacts`.

- [ ] **Step 1: Write failing weekly-orchestration tests for shared, isolated impact gathering**

  Assert roster data is loaded once for the target and preceding seasons; each unique slate team gets its own target-game cutoff and lineup input; impact gathering completes before the server opens; a team impact failure does not hide a ready game; and the current lineup gathering order/behavior remains intact.

- [ ] **Step 2: Write failing slate-projection tests for safe roster impact data**

  Assert valid direct/proxy items reach `/api/slate`; invalid nested fields fail closed to an unavailable impact section while the game stays ready; and raw HTML, capture paths, URLs, internal errors, and arbitrary extra fields are absent from the serialized response.

- [ ] **Step 3: Run integration tests to verify they fail**

  Run: `node --test test/week-dashboard.test.js test/week-dashboard-server.test.js`

  Expected: FAIL because roster impacts are not gathered or projected.

- [ ] **Step 4: Wire a shared client and per-team impact gatherer into `runWeekDashboardCli`**

  Initialize the Task 2 client once using injectable dependencies, load `[season - 1, season]` plus the already downloaded `scheduleDownload.rows` once, pair each team with its sole slate game’s kickoff, and invoke Task 4 after lineup context. Catch expected data/service failures per team and attach only `{ status: 'unavailable' }`; preserve unexpected programmer errors in direct unit tests. Pass the enriched lineup context into the existing game snapshots.

- [ ] **Step 5: Extend `projectLineupContext` with strict impact validation/projection**

  Add allow-list validation for approved verdicts, evidence types, confidence labels, finite metrics/samples, safe strings, and safe reasons. Preserve the existing default unavailable official/depth behavior, never serialize unrecognized fields, and keep a malformed impact block from changing game readiness.

- [ ] **Step 6: Run integration tests to verify they pass**

  Run: `node --test test/week-dashboard.test.js test/week-dashboard-server.test.js`

  Expected: PASS.

- [ ] **Step 7: Commit weekly integration**

  ```bash
  git add src/week-dashboard.js src/week-dashboard-server.js test/week-dashboard.test.js test/week-dashboard-server.test.js
  git commit -m "feat: expose roster impact context in weekly slate"
  ```

### Task 6: Render Accessible Impact Context and Document Its Limits

**Files:**
- Modify: `public/week-dashboard/app.js:42-70`
- Modify: `public/dashboard/styles.css`
- Modify: `test/week-dashboard-client.test.js`
- Modify: `README.md:20-31`

**Interfaces:**
- Consumes: safe `lineup.{home,away}.playerImpacts` projection from Task 5.
- Produces: an accessible Missing-player impact subsection in each expanded team context, plus documented data/source and interpretation rules.

- [ ] **Step 1: Write failing client tests for impact display states**

  Assert direct evidence visibly says direct EPA evidence, proxy evidence visibly says unit proxy, each card identifies Out player/replacement/verdict/confidence/sample/caveat, `insufficient evidence` displays its safe reason, and unavailable impact data displays without disrupting existing official/depth sections.

- [ ] **Step 2: Run the client tests to verify they fail**

  Run: `node --test test/week-dashboard-client.test.js`

  Expected: FAIL because no roster-impact UI exists.

- [ ] **Step 3: Add the Missing-player impact renderer and responsive styles**

  Use DOM APIs and `textContent` only, following the existing client’s no-innerHTML pattern. Render a clear informational-only caveat, compact verdict cards, metric delta/sample text, and separate unavailable/no-Out states. Add responsive CSS that keeps the expanded two-team layout readable without horizontal overflow.

- [ ] **Step 4: Document roster impact semantics in `README.md`**

  Describe public data sources, explicit-Out rule, projected replacement selection, two-season strict pre-kickoff window, recency weighting, direct EPA versus unit-proxy labels, confidence/abstention behavior, raw-data storage, and the non-predictive/non-betting limitation.

- [ ] **Step 5: Run the client tests to verify they pass**

  Run: `node --test test/week-dashboard-client.test.js`

  Expected: PASS.

- [ ] **Step 6: Commit the UI and documentation**

  ```bash
  git add public/week-dashboard/app.js public/dashboard/styles.css test/week-dashboard-client.test.js README.md
  git commit -m "feat: render missing-player impact context"
  ```

### Task 7: Run Full Regression and Verify Layout

**Files:**
- Modify only if a regression test exposes a defect in the files owned by Tasks 1–6.

**Interfaces:**
- Consumes: complete roster-impact feature.
- Produces: verified full Node test suite and, where Chromium is installed, no-overflow dashboard layout evidence.

- [ ] **Step 1: Run the complete Node test suite**

  Run: `npm test`

  Expected: PASS with all existing and new tests.

- [ ] **Step 2: Run the layout regression test**

  Run: `node --test test/dashboard-layout.test.js`

  Expected: PASS, or SKIP only when Chromium is unavailable.

- [ ] **Step 3: Manually smoke-test a generated weekly dashboard with a fixture/injected build**

  Verify an Out player with direct evidence, an Out lineman/defender with proxy evidence, an unavailable replacement, and a no-impact-data team all render explanatory non-betting states while the game remains ready.

- [ ] **Step 4: Commit only regression fixes if needed**

  ```bash
  git add <files changed to fix verified regressions>
  git commit -m "fix: preserve roster impact dashboard regressions"
  ```

## Self-Review

- **Spec coverage:** Tasks 1 and 4 implement the official-Out and projected-replacement rules. Task 2 covers raw capture, validation, and atomic local publication. Task 3 covers two-season strict pre-kickoff evidence, recency weighting, direct EPA, and unit proxies. Task 4 produces abstentions, verdicts, confidence, and safe caveats. Task 5 provides build-time isolation and API projection. Task 6 provides labeled, accessible rendering and documentation. Task 7 verifies the feature together with existing behavior.
- **Step scan:** Every task begins with a concrete failing test, names its exact production interface, verifies passing behavior, and commits an independently reviewable unit.
- **Type consistency:** `RosterSeasonData` flows from the client into `summarizeComparison`; `ImpactEvidence` flows into `gatherRosterImpacts`; the `{ status, playerImpacts }` result is attached to lineup context and projected by the weekly server.
- **Review focus coverage:** replacement-Out logic and ambiguous names are Task 4 tests; same-day cutoff is Task 3; failed publication is Task 2; and ready-game/UI degradation is covered by Tasks 5–6.
- **Proportion:** The plan defines interfaces, source boundaries, and test assertions without prescribing implementation bodies beyond the spec’s fixed rules.
