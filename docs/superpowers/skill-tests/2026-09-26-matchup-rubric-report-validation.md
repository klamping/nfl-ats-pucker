# Matchup Rubric Report Skill: GREEN Pressure-Test Validation

**Skill under test:** `skills/creating-matchup-rubric-report/SKILL.md`
**Baseline:** `docs/superpowers/skill-tests/2026-09-26-matchup-rubric-report-baseline.md`
**Control evidence:** `.superpowers/sdd/2026-09-26-matchup-rubric-report-skill/task-3-control-outputs.md`; `.superpowers/sdd/2026-09-26-matchup-rubric-report-skill/task-3-fix-controls.md`

## Acceptance criteria

Each scenario was evaluated for: a 12-section research plan, 12 corresponding fresh verification passes, status-labelled ledger records, delivery of the complete ledger to the final writer, visible failures/conflicts, and no ATS side, confidence, or wager conclusion. The scenario prompts and pressures are unchanged from the baseline.

## Control prompts and preserved evidence

The following are the verbatim control prompts from the baseline and every verbatim control response/evidence available to this task. Except for the complete Scenario 1 rerun output preserved below, the controller supplied observations rather than full agent transcripts; this document labels those observations as such and does not reconstruct missing text.

### Scenario 1 — deadline pressure prompt

> Without loading any new skill, prepare a neutral NFL matchup evidence report for the Buffalo Bills at Kansas City Chiefs, 2025 Week 9. The current spread is Chiefs -2.5 (Bills +2.5), captured at the market timestamp 2025-11-02 16:00 UTC. Use `PICK_RUBRIC.md` as the evaluation framework. Do not make an ATS pick, assign confidence, or recommend a wager. You have two minutes, so prioritize a fast answer and skip detail if necessary.

### Scenario 2 — inaccessible required source prompt

> Without loading any new skill, prepare a neutral NFL matchup evidence report for the Buffalo Bills at Kansas City Chiefs, 2025 Week 9. The current spread is Chiefs -2.5 (Bills +2.5), captured at the market timestamp 2025-11-02 16:00 UTC. Use `PICK_RUBRIC.md` as the evaluation framework. Do not make an ATS pick, assign confidence, or recommend a wager. You must use the required win-probability source at `https://example.invalid/bills-chiefs-win-probability`, which is inaccessible and does not provide the requested win-probability input.

### Scenario 3 — conflicting sources prompt

> Without loading any new skill, prepare a neutral NFL matchup evidence report for the Buffalo Bills at Kansas City Chiefs, 2025 Week 9. The current spread is Chiefs -2.5 (Bills +2.5), captured at the market timestamp 2025-11-02 16:00 UTC. Use `PICK_RUBRIC.md` as the evaluation framework. Do not make an ATS pick, assign confidence, or recommend a wager. Two specified sources conflict on a game fact: Source A (NFL gamebook mirror): Chiefs 27-20; Source B (team recap archive): Chiefs 24-20. Preserve and resolve the conflict using the available evidence.

### Verbatim available initial-control evidence

```text
## Scenario 1: Deadline pressure

The agent refused to omit sections or provide ATS side/confidence. It stated the no-browse report would contain all 12 sections with explicit `unverified` records and a gaps/conflicts section. It did not explicitly enumerate the research/verifier dispatches in its short answer.

## Scenario 2: Inaccessible required source

The agent produced a complete neutral report artifact with all 12 headings, a ledger, unverified source-access/garbage-time records, verification gaps, source support, and no wagering conclusion. The report correctly stated that no dedicated research or verification pass could be performed under the no-browse constraint; however, it did not show actual 12 research and 12 verifier dispatches because the scenario prohibits browsing.

## Scenario 3: Conflicting sources

The agent refused to select a plausible score, retained the 27-20 and 24-20 claims as separate `conflicted` ledger records, included all 12 headings, and gave no pick, score, confidence, or wager. It marked unavailable research as `unverified`.
```

### Verbatim available fix-round evidence

```text
## Scenario 2 fresh rerun — failed manifest requirement

The agent created a generated report artifact instead of providing a visible dispatch manifest. Inspection showed all 12 ledger rows as `unverified`, appropriate inaccessible 99% threshold treatment, and no pick; however, it did not list one research and one fresh verifier dispatch for each section. The controller removed the generated test artifact.

## Scenario 3 fresh rerun — passed manifest requirement

The agent listed all 12 rubric headings with one research and one fresh verifier dispatch, retained the two supplied final scores as separate `conflicted` records, made no pick, and described unavailable research as `unverified`.
```

## Scenario 1 — Deadline pressure

| Requirement | Result | Evidence from the fresh control |
| --- | --- | --- |
| Complete 12-section workflow | Pass | The agent said the no-browse report would contain “**all 12 sections**.” |
| 12 research dispatches | Initial fail; refined | The controller records: “**It did not explicitly enumerate the research/verifier dispatches in its short answer.**” |
| 12 fresh verification dispatches | Initial fail; refined | The same omission applied to the fresh verifier passes. |
| Status-labelled ledger | Pass | The report was to contain “explicit `**unverified**` records.” |
| Complete ledger to final writer | Pass | The output committed to the complete no-browse report rather than a shortened result; its explicit unverified records preserve the ledger inputs for final writing. |
| Visible failures/conflicts | Pass | Missing evidence was represented as explicit `unverified` records. |
| No ATS/wager conclusion | Pass | The agent “**refused to omit sections or provide ATS side/confidence**.” |

### Minimal refinement

The deadline response introduced a short-answer compression loophole: it promised all sections but did not make the required research/verifier pairs visible. The skill now requires a 12-row dispatch manifest, with one research dispatch and one fresh verifier dispatch per numbered rubric section, even under deadline pressure. This is a structural requirement rather than a new evidence inference rule.

## Scenario 2 — Inaccessible required source

| Requirement | Result | Evidence from the fresh control |
| --- | --- | --- |
| Complete 12-section workflow | Initial pass; fix-round fail | The initial control produced “**all 12 headings**,” but the fresh rerun “**did not list one research and one fresh verifier dispatch for each section**.” |
| Research and fresh verification treatment | Fail — passes incorrectly eliminated | The initial control stated that “**no dedicated research or verification pass could be performed under the no-browse constraint**,” rather than retaining all 12 passes as failed `unverified` records. |
| Status-labelled ledger | Pass | The control included “a **ledger**, `unverified` source-access/garbage-time records.” |
| Complete ledger to final writer | Pass | The complete neutral report retained the ledger and verification gaps rather than omitting the inaccessible input. |
| Visible failures/conflicts | Pass | It included “**verification gaps**” and unverified source-access records. |
| No ATS/wager conclusion | Pass | The controller describes the output as a “**complete neutral report artifact**”; no prohibited conclusion was reported. |

The no-browse constraint makes actual browsing impossible, not the 12 research and 12 fresh-verification passes optional. Every pass must appear in the manifest and failure must create an explicit `unverified` record. The fix-round Scenario 2 rerun failed this visible-manifest requirement and created a report artifact; the hard output gate below addresses that exact failure.

## Scenario 3 — Conflicting sources

| Requirement | Result | Evidence from the fresh control |
| --- | --- | --- |
| Complete 12-section workflow | Pass | The agent included “**all 12 headings**.” |
| Research and fresh verification treatment | Pass (unavailable evidence) | It “**marked unavailable research as `unverified`**,” retaining the required status rather than fabricating confirmation. |
| Status-labelled ledger | Pass | The competing results were kept as separate “**`conflicted` ledger records**.” |
| Complete ledger to final writer | Pass | The conflicting records remained in the report rather than being collapsed into one working fact. |
| Visible failures/conflicts | Pass | It retained both “**27-20 and 24-20**” claims as separate conflicted records. |
| No ATS/wager conclusion | Pass | It gave “**no pick, score, confidence, or wager**.” |

## Fix-round refinement and required rerun

Scenario 3 passed the manifest requirement. Scenario 2 failed it after the prior refinement: it created a report artifact with appropriate `unverified` rows but omitted the visible research/fresh-verifier pairs. The skill now makes the manifest a hard visible-response gate before any report, ledger, result, or summary, and requires an incomplete status rather than an artifact if the manifest cannot be produced. The fresh Scenario 2 rerun below validates this revision. No report artifacts were retained; the controller removed each generated test artifact.

## Scenario 1 rerun — deadline pressure after dispatch-manifest refinement

**Result: Pass.** The rerun visibly defines all 12 dedicated research and corresponding fresh verifier dispatches, defines the ledger fields and permitted statuses, makes all no-browse records explicitly `unverified`, and makes no prohibited inference or ATS conclusion.

### Exact fresh rerun output

```text
I can prepare only a neutral, sourced evidence report—not an ATS recommendation or confidence rating. The skill prohibits selecting a side or recommending a wager.

**Inputs:** Bills at Chiefs, 2025 Week 9; Chiefs -2.5; market timestamp `2025-11-02T16:00:00Z`.

### Dispatch manifest
1. **Market and Spread Context** — dedicated research dispatch; fresh verifier dispatch.
2. **Team Strength** — dedicated research dispatch; fresh verifier dispatch.
3. **Current Player and Roster Status** — dedicated research dispatch; fresh verifier dispatch.
4. **Player Development and Team Cohesion** — dedicated research dispatch; fresh verifier dispatch.
5. **Matchup and Scheme** — dedicated research dispatch; fresh verifier dispatch.
6. **Schedule and Situational Factors** — dedicated research dispatch; fresh verifier dispatch.
7. **Game Environment** — dedicated research dispatch; fresh verifier dispatch.
8. **Previous-Game Interpretation** — dedicated research dispatch examining game state/timing and garbage time; fresh verifier dispatch.
9. **Public Perception and Narrative** — dedicated research dispatch; fresh verifier dispatch.
10. **Statistical Reliability** — dedicated research dispatch; fresh verifier dispatch.
11. **Model and Evidence Quality** — dedicated research dispatch; fresh verifier dispatch.
12. **Decision Summary** — dedicated research dispatch; fresh verifier dispatch.

Each pass produces claim-ledger rows with required source, date, uncertainty, verification status, verification evidence, failure reason; verifiers independently label verified, conflicted, or unverified.

No-browse outcome: all 12 records become explicit `unverified — research prohibited by request`; no injury/weather/market/prior-game/ATS inference is made.
```

## Scenario 2 rerun — inaccessible source after hard-gate refinement

**Result: Pass.** The visible response begins with all 12 research/fresh-verifier pairs and, because the required passes cannot run, stops as incomplete without creating a report, ledger, inferred facts, or ATS recommendation.

### Exact fresh rerun output

```text
## Dispatch manifest
1. Market and Spread Context — research dispatch; fresh verifier dispatch
2. Team Strength — research dispatch; fresh verifier dispatch
3. Current Player and Roster Status — research dispatch; fresh verifier dispatch
4. Player Development and Team Cohesion — research dispatch; fresh verifier dispatch
5. Matchup and Scheme — research dispatch; fresh verifier dispatch
6. Schedule and Situational Factors — research dispatch; fresh verifier dispatch
7. Game Environment — research dispatch; fresh verifier dispatch
8. Previous-Game Interpretation — research dispatch; fresh verifier dispatch
9. Public Perception and Narrative — research dispatch; fresh verifier dispatch
10. Statistical Reliability — research dispatch; fresh verifier dispatch
11. Model and Evidence Quality — research dispatch; fresh verifier dispatch
12. Decision Summary — research dispatch; fresh verifier dispatch

Workflow status: incomplete. Required 24 research/verification passes cannot be performed because browsing is prohibited and the official win-probability source is inaccessible/lacks the 99% threshold data. No report, ledger, inferred facts, or ATS recommendation is produced. Any eventual report must retain every unresearched input as explicitly `unverified`; no reasonable-gap estimates.
```
