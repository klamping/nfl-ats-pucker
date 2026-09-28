# Team Matchup Profile Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add leakage-safe team matchup profile metrics to current snapshots, historical analogues, and the local dashboard.

**Architecture:** Extend the existing postgame normalization and rolling-pregame derivation pipeline with new nullable rate and display metrics. Preserve them through the established matchup join, add the three specified ranking features to the comparator, and explicitly project target profile fields to a new local dashboard section.

**Tech Stack:** Node.js CommonJS, built-in `node:test`, nflverse weekly team CSV, static HTML/CSS/JavaScript.

**Spec:** `docs/superpowers/specs/2026-09-27-team-matchup-profile-design.md`

## Global Constraints

- Use only results from games completed before the target kickoff for every pregame metric.
- Keep current odds from The Odds API U.S. spreads; never expose credentials, raw provider responses, quote-level data, or file paths.
- Keep nflverse historical home-team closing spreads and the local, dependency-free, loopback-only dashboard.
- Preserve the 70% historical feature coverage rule and renormalize weights among available features.
- Do not add picks, confidence labels, or recommendations.

## Review Focus

- Zero or absent rate denominators must produce `null`, never `Infinity`, `NaN`, or zero; Task 1 tests this.
- Target marker rows must not seed a future-game metric; Task 1 tests their all-null optional metric values.
- A partially populated historical record must retain the existing coverage/renormalization behavior after the three rank features are added; Task 2 tests this.
- API payloads must expose only named pregame profile fields and must still omit source, provider, credentials, and path values; Task 3 tests this.
- Missing profile values must render as `—`, not crash or produce misleading numeric text; Task 3 tests this.

---

### Task 1: Derive and preserve team profile metrics

**Files:**
- Modify: `src/normalize-team-postgame.js:109-166`
- Modify: `src/derive-team-pregame.js:1-114`
- Modify: `src/join-team-matchups.js:13-17`
- Modify: `src/gather-pregame.js:77-85`
- Test: `test/normalize-team-postgame.test.js`
- Test: `test/derive-team-pregame.test.js`
- Test: `test/join-team-matchups.test.js`
- Test: `test/gather-pregame.test.js`

**Interfaces:**
- Consumes: nflverse weekly team row fields `passing_epa`, `rushing_epa`, `attempts`, `carries`, `sacks_suffered`, `passing_20`, `rushing_10`, `passing_cpoe`, `passing_interceptions`, `rushing_yards`, and `penalty_yards`.
- Produces: `homePregame` and `awayPregame` fields `passingEpaPerDropback`, `rushingEpaPerCarry`, `explosivePlayRate`, `passingCpoe`, `interceptionRate`, `rushingYardsPerCarry`, `passingExplosiveRate`, `rushingExplosiveRate`, and `penaltyYardsPerGame`, each `number | null`.

- [ ] **Step 1: Write failing normalization tests for calculated metrics and invalid denominators**

Add exact assertions using `weeklyRow()` values for every new per-game rate, including `null` for zero or missing denominators.

- [ ] **Step 2: Run the normalization test to verify it fails**

Run: `node --test test/normalize-team-postgame.test.js`

Expected: FAIL because the new fields are absent.

- [ ] **Step 3: Add per-game profile calculations to `buildPostgame()`**

Implement focused helpers in `src/normalize-team-postgame.js` for ratio calculation and carry the new nullable metrics on normalized postgame records. Treat `attempts + sacks_suffered` as dropbacks.

- [ ] **Step 4: Run the normalization test to verify it passes**

Run: `node --test test/normalize-team-postgame.test.js`

Expected: PASS.

- [ ] **Step 5: Write failing rolling-derivation and target-marker tests**

Extend `postgame()` fixtures and assert the Week 2 feature values equal the prior game's values; update opening-week null expectations. In the gather test, assert target markers leave every new postgame metric null and only prior finals supply the target values.

- [ ] **Step 6: Run the focused derivation and gather tests to verify they fail**

Run: `node --test test/derive-team-pregame.test.js test/gather-pregame.test.js`

Expected: FAIL because the new fields are not derived or marker-complete.

- [ ] **Step 7: Extend `deriveTeamPregame()` and target marker records**

Add the optional postgame metric names to `METRICS`; return their prior-game means under the produced feature names. Include null values for every new postgame metric in `gather-pregame` target markers.

- [ ] **Step 8: Preserve the new pregame fields in joined matchups**

Add all produced fields to `join-team-matchups` `FEATURE_FIELDS`, then update its fixture test to require finite-or-null validation and exact preservation.

- [ ] **Step 9: Run focused data-pipeline tests to verify they pass**

Run: `node --test test/normalize-team-postgame.test.js test/derive-team-pregame.test.js test/join-team-matchups.test.js test/gather-pregame.test.js`

Expected: PASS.

- [ ] **Step 10: Commit the data-pipeline slice**

```bash
git add src/normalize-team-postgame.js src/derive-team-pregame.js src/join-team-matchups.js src/gather-pregame.js test/normalize-team-postgame.test.js test/derive-team-pregame.test.js test/join-team-matchups.test.js test/gather-pregame.test.js
git commit -m "feat: derive team matchup profile metrics"
```

### Task 2: Rank analogues with the designated profile metrics

**Files:**
- Modify: `src/compare-historical.js:4-16`
- Test: `test/compare-historical.test.js`

**Interfaces:**
- Consumes: matchup pregame feature fields from Task 1.
- Produces: `compareHistorical()` filters with 27 equal base feature weights and candidate contributions keyed by the three new home/away fields.

- [ ] **Step 1: Write failing comparator tests for rank fields and coverage**

Update the fixture feature list, assert 27 weight keys summing to one, and assert differences in a new metric affect similarity contributions. Keep a partial-record case that verifies the 70% threshold and reduced-weight renormalization.

- [ ] **Step 2: Run the comparator test to verify it fails**

Run: `node --test test/compare-historical.test.js`

Expected: FAIL because the feature keys are not part of ranking.

- [ ] **Step 3: Add the three ranking field names to comparator `FEATURE_FIELDS`**

Append `passingEpaPerDropback`, `rushingEpaPerCarry`, and `explosivePlayRate`; retain the existing dynamic equal-weight calculation and no special weighting.

- [ ] **Step 4: Run the comparator test to verify it passes**

Run: `node --test test/compare-historical.test.js`

Expected: PASS.

- [ ] **Step 5: Commit the ranking slice**

```bash
git add src/compare-historical.js test/compare-historical.test.js
git commit -m "feat: rank analogues with efficiency profile metrics"
```

### Task 3: Project and render the matchup profile

**Files:**
- Modify: `src/dashboard-server.js:13-63`
- Modify: `public/dashboard/index.html:16-30`
- Modify: `public/dashboard/app.js:14-95`
- Modify: `public/dashboard/styles.css:45-81`
- Test: `test/dashboard-server.test.js`
- Test: `test/dashboard-client.test.js`

**Interfaces:**
- Consumes: target `homePregame` and `awayPregame` values from Task 1 and candidate contributions from Task 2.
- Produces: sanitized `target.homePregame`/`target.awayPregame` profile projections and an accessible Away/Home matchup-profile table.

- [ ] **Step 1: Write failing server projection tests**

Expand dashboard snapshot fixtures with the new fields and assert the target response contains exactly the named profile values while serialized unsafe source/provider/path data remains absent.

- [ ] **Step 2: Run the server test to verify it fails**

Run: `node --test test/dashboard-server.test.js`

Expected: FAIL because the target projection lacks profile fields.

- [ ] **Step 3: Explicitly project profile values in `buildDashboardPayload()`**

Define one allowlisted profile-field list shared by both team sides and copy only those finite-or-null values into target pregame payloads.

- [ ] **Step 4: Write failing dashboard-client tests for profile values and labels**

Add profile data to the browser fixture. Assert the rendered profile includes away/home values and `—` for null, and candidate detail labels the three ranking metrics.

- [ ] **Step 5: Run the client test to verify it fails**

Run: `node --test test/dashboard-client.test.js`

Expected: FAIL because no profile elements or new labels are rendered.

- [ ] **Step 6: Add the accessible profile table and client renderer**

Add a `Matchup profile` section after the target header. Render a three-column local table from a fixed metric configuration, format rates and CPOE consistently, and preserve text-only DOM construction. Add corresponding responsive table styles and feature labels.

- [ ] **Step 7: Run dashboard tests to verify they pass**

Run: `node --test test/dashboard-server.test.js test/dashboard-client.test.js`

Expected: PASS.

- [ ] **Step 8: Commit the dashboard slice**

```bash
git add src/dashboard-server.js public/dashboard/index.html public/dashboard/app.js public/dashboard/styles.css test/dashboard-server.test.js test/dashboard-client.test.js
git commit -m "feat: display team matchup profile"
```

### Task 4: Validate and document artifact refresh

**Files:**
- Modify: `README.md:83-91`

**Interfaces:**
- Consumes: updated historical artifact schema and `game:dashboard` command.
- Produces: operator documentation that requires one historical rebuild before using the expanded profile.

- [ ] **Step 1: Update the analysis-board operator note**

State that existing historical artifacts must be rebuilt after profile-schema updates, then retain the one-command dashboard example.

- [ ] **Step 2: Run the complete regression suite and whitespace check**

Run: `npm test && git diff --check`

Expected: all tests pass and no whitespace errors.

- [ ] **Step 3: Commit documentation and final verification**

```bash
git add README.md
git commit -m "docs: note matchup profile artifact refresh"
```
