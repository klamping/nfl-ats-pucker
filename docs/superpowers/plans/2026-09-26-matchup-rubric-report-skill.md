# Matchup Rubric Report Skill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a reusable skill that produces a fully sourced, independently verified, neutral evidence report for one NFL matchup using every section of `PICK_RUBRIC.md`.

**Architecture:** The skill directs a coordinator to create a 12-section claim ledger, send each rubric section to its own research subagent, and send every completed section to a fresh verification subagent. A final report-writing subagent receives the whole status-labeled ledger and produces a neutral report that exposes all evidence gaps and conflicts.

**Tech Stack:** Markdown Agent Skill (`SKILL.md`), OpenCode subagents, source URLs, and Markdown report artifacts.

**Spec:** `docs/superpowers/specs/2026-09-26-matchup-rubric-report-skill-design.md`

## Global Constraints

- Use all 12 sections of `PICK_RUBRIC.md`, with one research subagent and one fresh verification subagent per section.
- Every factual claim must carry a source URL, supporting quote or value, source publication or retrieval date, uncertainty, and a `verified`, `conflicted`, or `unverified` status.
- The report writer receives the entire ledger, including unverified and conflicted entries.
- Never score the rubric, make a pick, imply a side, provide confidence, or recommend a wager.
- Missing, inaccessible, failed, or conflicting research must remain visible in **Verification gaps and conflicts**; do not infer replacements.
- Default report path: `REPORTS/<season>-week-<week>-<away>-at-<home>-rubric.md`.

## Review Focus

- A time-pressure request still dispatches all 12 research passes and all 12 independent verification passes.
- An inaccessible source becomes an `unverified` ledger entry with its failure reason rather than an omitted claim or invented fact.
- Conflicting sources remain `conflicted` with both source records available to the report writer.
- The report writer cannot turn research evidence into an ATS selection, score, confidence level, or wagering advice.
- A failed subagent produces an explicit incomplete-section and verification-gap entry while the final report remains usable.

---

### Task 1: Establish the pre-skill pressure-test baseline

**Files:**
- Create: `docs/superpowers/skill-tests/2026-09-26-matchup-rubric-report-baseline.md`

**Interfaces:**
- Consumes: `PICK_RUBRIC.md`
- Produces: Verbatim subagent outputs and a baseline-failure table consumed by Task 2.

- [ ] **Step 1: Define the three control prompts in the baseline document**

Use the same basic one-matchup report request in all controls, then add exactly one pressure per prompt:

1. A short deadline encouraging the agent to skip detail.
2. A required data source that is inaccessible or lacks the requested information.
3. Two specified sources that disagree on a game fact.

Each prompt must request a report without loading the new skill and must state the target matchup, season/week, spread, and market timestamp.

- [ ] **Step 2: Run each control prompt with a fresh general subagent and record its response verbatim**

Run: one `subagent` call per scenario, with no `SKILL.md` content in the subagent prompt.

Expected: The outputs provide the untreated baseline; they may fail the desired behavior.

- [ ] **Step 3: Classify the observed baseline failures**

Add a table with scenario, exact observed behavior, quoted rationale, and whether the failure is a skipped rubric section, unsupported inference, hidden missing evidence, lost verification status, or ATS/wager recommendation.

- [ ] **Step 4: Commit the baseline evidence**

```bash
git add docs/superpowers/skill-tests/2026-09-26-matchup-rubric-report-baseline.md
git commit -m "test: establish matchup report skill baseline"
```

### Task 2: Author the matchup-rubric reporting skill

**Files:**
- Create: `skills/creating-matchup-rubric-report/SKILL.md`

**Interfaces:**
- Consumes: `PICK_RUBRIC.md`, `docs/superpowers/skill-tests/2026-09-26-matchup-rubric-report-baseline.md`
- Produces: A discoverable project-local skill that accepts matchup inputs and emits the research, verification, and reporting prompts described in the spec.

- [ ] **Step 1: Write the YAML frontmatter and discovery triggers**

Set `name: creating-matchup-rubric-report`. Use a third-person `description` beginning with “Use when...” and include triggers such as one NFL matchup, rubric report, sourced evidence, garbage time, claim verification, conflicting sources, and no pick. Do not summarize the workflow in the description.

- [ ] **Step 2: Specify required inputs and the exact ledger record shape**

Require away team, home team, season/week or game date, spread, market timestamp, and optional output path. Define one ledger record per claim with these fields: rubric section, claim, supporting value or quote, source URL, source date, uncertainty, verification status, verification evidence, and failure reason.

- [ ] **Step 3: Specify the mandatory research and verification dispatch protocol**

Require the coordinator to enumerate all 12 headings in `PICK_RUBRIC.md`, dispatch a dedicated research subagent for each heading, then dispatch a fresh verifier for each completed heading. Require verifier prompts to independently inspect source evidence and return only `verified`, `conflicted`, or `unverified` records. Require section failures to create ledger records instead of being skipped.

- [ ] **Step 4: Specify the final-writer prompt contract and report template**

Require the final writer to receive every ledger record, grouped by status. Define report headings for matchup/market context, all 12 rubric sections, **Verification gaps and conflicts**, source support, and neutral synthesis. Explicitly forbid rubric scoring, ATS picks, confidence, and betting recommendations.

- [ ] **Step 5: Add error-handling and anti-rationalization rules addressing the Task 1 baseline**

Turn every observed failure into a direct, observable requirement. State that deadline pressure cannot reduce the 12-section research-and-verification workflow; inaccessible sources must be recorded; conflicting source facts must retain both records; and unknown facts cannot be inferred.

- [ ] **Step 6: Perform a structural review of the skill**

Run: `wc -w skills/creating-matchup-rubric-report/SKILL.md && sed -n '1,260p' skills/creating-matchup-rubric-report/SKILL.md`

Expected: Valid frontmatter, a concise skill with all required contracts, and no placeholders or conflicting instructions.

- [ ] **Step 7: Commit the skill**

```bash
git add skills/creating-matchup-rubric-report/SKILL.md
git commit -m "feat: add matchup rubric report skill"
```

### Task 3: Run the skill’s GREEN pressure scenarios and verify the repository

**Files:**
- Create: `docs/superpowers/skill-tests/2026-09-26-matchup-rubric-report-validation.md`
- Modify: `skills/creating-matchup-rubric-report/SKILL.md` only if a scenario reveals a new rationalization

**Interfaces:**
- Consumes: the three scenarios and observed failures from Task 1; `skills/creating-matchup-rubric-report/SKILL.md`
- Produces: documented pass/fail evidence that the skill closes the baseline gaps.

- [ ] **Step 1: Run each Task 1 scenario with a fresh general subagent after supplying the complete skill content**

Run: one fresh `subagent` call per scenario. Include the skill content and the same scenario prompt; do not alter the scenario pressures.

Expected: Each response defines 12 research dispatches, 12 fresh verification dispatches, status-labeled ledger records, complete-ledger delivery to the final writer, visible failures/conflicts, and no ATS/wager conclusion.

- [ ] **Step 2: Manually inspect every scenario output and record the result**

For each scenario, record a checklist covering all required workflow elements and quote the output that proves each one. Record any new rationalization verbatim.

- [ ] **Step 3: Close any newly observed loophole and rerun the affected scenario**

If a scenario fails, add the minimal conditional, structural field, or explicit rule to `SKILL.md` that addresses the exact observed failure. Re-run the same scenario until it meets every acceptance criterion.

- [ ] **Step 4: Run the project regression suite**

Run: `npm test`

Expected: exit code 0; report any unrelated failure by test name.

- [ ] **Step 5: Commit validation evidence and any final skill refinement**

```bash
git add skills/creating-matchup-rubric-report/SKILL.md docs/superpowers/skill-tests/2026-09-26-matchup-rubric-report-validation.md
git commit -m "test: validate matchup rubric report skill"
```
