# Historical Comparator Outcome and Coverage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Return ranked historical comparisons with valid ATS outcomes even when a historical candidate has unavailable optional pregame metrics.

**Architecture:** Preserve final scores as top-level historical market facts in the published matchup record; scores never enter either pregame feature object. Keep existing type/week/spread hard filters, then score shared finite features, require at least 70% of total feature weight, and renormalize the remaining weights.

**Tech Stack:** Node.js CommonJS, built-in `node:test`, existing nflverse JSONL workflow.

**Spec:** `docs/superpowers/specs/2026-09-27-pregame-gatherer-and-historical-comparison-design.md`

## Global Constraints

- Historical final scores are results-only fields and never pregame features.
- Current snapshots use final games strictly before their target kickoff.
- The comparator remains read-only research tooling—no picks or confidence labels.
- Require matching `gameType`, configured week window, and configured home-spread band before ranking.
- Candidates need at least 70% of weighted comparisons available; report coverage and omissions.
- Do not log, return, persist, or commit The Odds API credential.

## Review Focus

- A missing/non-finite market score must reject the matchup. (Task 1)
- Final scores must remain top-level rather than leaking into pregame objects. (Task 1)
- Fourteen of 21 weighted features rejects; 15 of 21 accepts with renormalized weights. (Task 2)
- A missing feature cannot poison another candidate’s normalization. (Task 2)
- Rebuilt local artifacts produce ATS-bearing Eagles–Bears comparisons and remain untracked. (Task 3)

---

### Task 1: Preserve historical final scores in matchup records

**Files:**
- Modify: `src/join-team-matchups.js:1-100`
- Modify: `src/ingest-nflverse-team-data.js:103-105`
- Modify: `test/join-team-matchups.test.js:31-43`
- Modify: `test/gather-pregame.test.js:78-95`
- Modify: `test/ingest-nflverse-team-data.test.js:87-103`
- Modify: `README.md:50-52`

**Interfaces:**
- Consumes: normalized market games containing finite `homeScore` and `awayScore`.
- Produces: historical matchup records with top-level scores and unchanged pregame objects; gatherer callers retain score-free target snapshots.

- [ ] **Step 1: Write failing tests**

Require `homeScore: 28` and `awayScore: 17` in the successful join assertion; add a missing-score case that rejects as `missing_core_field`.

- [ ] **Step 2: Run red test**

Run: `node --test test/join-team-matchups.test.js`

Expected: FAIL because scores are omitted and a missing score is accepted.

- [ ] **Step 3: Implement top-level score projection**

Require finite market scores with core validation and add both fields to `MARKET_SCALAR_FIELDS.number`. Add `includeFinalScores`, defaulting to `false`, so the historical ingestion call opts in while the gatherer retains a score-free target snapshot. Do not add either field to `FEATURE_FIELDS`.

- [ ] **Step 4: Verify and document**

Run: `node --test test/join-team-matchups.test.js`

Document that scores are retained solely for historical outcome evaluation.

- [ ] **Step 5: Commit**

Run: `git add src/join-team-matchups.js src/ingest-nflverse-team-data.js test/join-team-matchups.test.js test/gather-pregame.test.js test/ingest-nflverse-team-data.test.js README.md && git commit -m "feat: retain historical matchup outcomes"`

### Task 2: Rank partially populated historical records

**Files:**
- Modify: `src/compare-historical.js:4-150`
- Modify: `test/compare-historical.test.js:37-103`
- Modify: `docs/superpowers/specs/2026-09-27-pregame-gatherer-and-historical-comparison-design.md:65-84`
- Modify: `README.md:73-81`

**Interfaces:**
- Consumes: complete target snapshot plus historical matchups with top-level scores and nullable pregame metrics.
- Produces: candidate `similarityScore`, `distanceContributions`, `featureCoverage`, `omittedFeatures`, and ATS result.

- [ ] **Step 1: Write failing tests**

Add a 20/21 candidate missing `home.netEpaPerPlay` and a 14/21 candidate; assert only the former is returned, reports its omission, and renormalizes included weights. Preserve the existing exact full-coverage assertion.

- [ ] **Step 2: Run red test**

Run: `node --test test/compare-historical.test.js`

Expected: FAIL because every historical metric is currently required.

- [ ] **Step 3: Implement coverage-aware ranking**

Add `MINIMUM_FEATURE_COVERAGE = 0.7`; calculate finite shared feature keys, reject below the threshold, compute maximum deltas only where the candidate has the key, and renormalize included weights. Preserve original exact weights for all 21 features; expose threshold, coverage, and omissions.

- [ ] **Step 4: Verify and document**

Run: `node --test test/compare-historical.test.js`

Update spec and README from all-finite historical candidates to the 70%-coverage policy, while retaining a complete gathered input and exact ATS formula.

- [ ] **Step 5: Commit**

Run: `git add src/compare-historical.js test/compare-historical.test.js docs/superpowers/specs/2026-09-27-pregame-gatherer-and-historical-comparison-design.md README.md && git commit -m "feat: rank partial historical comparisons"`

### Task 3: Rebuild local artifacts and verify Eagles–Bears

**Files:**
- Generated (ignored): `data/raw/nflverse/`, `data/normalized/nfl/`, `data/current/`

**Interfaces:**
- Consumes: revised matcher plus existing Eagles–Bears snapshot.
- Produces: local score-bearing matchup records and comparison candidates with ATS outcomes.

- [ ] **Step 1: Rebuild local datasets**

Run `npm run ingest:market-data -- --start-season 2005 --end-season 2025`, then `npm run ingest:team-data -- --start-season 2005 --end-season 2025`.

- [ ] **Step 2: Run requested comparison**

Run `npm run compare:historical -- --input /home/klamping/Sites/nfl-ats-pucker/data/current/2026_03_PHI_CHI-2026-09-28T00-39-34-620Z.json`.

Expected: ranked candidates with ATS outcomes, coverage, and aggregate cover counts.

- [ ] **Step 3: Verify generated data stays untracked**

Run: `git status --short`

### Final verification

- [ ] Run `npm test` and `git diff --check`.
- [ ] Review the final diff for score leakage, changed pregame safeguards, credentials, or generated artifacts.

## Self-Review

- **Spec coverage:** Task 1 restores the result fields required by ATS grading; Task 2 implements the approved coverage policy; Task 3 proves the complete requested workflow.
- **Step scan:** Every task provides specific assertions, a command, expected outcome, and one focused implementation.
- **Type consistency:** Existing `homeScore`, `awayScore`, `featureCoverage`, `omittedFeatures`, `homeAtsMargin`, and `outcome` names are preserved.
- **Review focus:** Each listed risk has an owning task and a corresponding test or end-to-end verification.
- **Proportion:** Three independently verifiable delivery units cover the correction without duplicating source code.
