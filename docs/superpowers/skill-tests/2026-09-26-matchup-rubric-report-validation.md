# Matchup Rubric Report Skill: GREEN Pressure-Test Validation

**Skill under test:** `skills/creating-matchup-rubric-report/SKILL.md`
**Baseline:** `docs/superpowers/skill-tests/2026-09-26-matchup-rubric-report-baseline.md`
**Control evidence:** `.superpowers/sdd/2026-09-26-matchup-rubric-report-skill/task-3-control-outputs.md`

## Acceptance criteria

Each scenario was evaluated for: a 12-section research plan, 12 corresponding fresh verification passes, status-labelled ledger records, delivery of the complete ledger to the final writer, visible failures/conflicts, and no ATS side, confidence, or wager conclusion. The scenario prompts and pressures are unchanged from the baseline.

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
| Complete 12-section workflow | Pass | The agent produced “**all 12 headings**.” |
| Research and fresh verification treatment | Pass (unavailable evidence) | It correctly stated that “**no dedicated research or verification pass could be performed under the no-browse constraint**.” |
| Status-labelled ledger | Pass | The control included “a **ledger**, `unverified` source-access/garbage-time records.” |
| Complete ledger to final writer | Pass | The complete neutral report retained the ledger and verification gaps rather than omitting the inaccessible input. |
| Visible failures/conflicts | Pass | It included “**verification gaps**” and unverified source-access records. |
| No ATS/wager conclusion | Pass | The controller describes the output as a “**complete neutral report artifact**”; no prohibited conclusion was reported. |

The no-browse constraint makes actual browsing dispatches impossible. The skill’s required fallback is therefore the observed one: an explicit `unverified` record for every failed or inaccessible pass, without estimating the required win-probability or deriving a garbage-time claim.

## Scenario 3 — Conflicting sources

| Requirement | Result | Evidence from the fresh control |
| --- | --- | --- |
| Complete 12-section workflow | Pass | The agent included “**all 12 headings**.” |
| Research and fresh verification treatment | Pass (unavailable evidence) | It “**marked unavailable research as `unverified`**,” retaining the required status rather than fabricating confirmation. |
| Status-labelled ledger | Pass | The competing results were kept as separate “**`conflicted` ledger records**.” |
| Complete ledger to final writer | Pass | The conflicting records remained in the report rather than being collapsed into one working fact. |
| Visible failures/conflicts | Pass | It retained both “**27-20 and 24-20**” claims as separate conflicted records. |
| No ATS/wager conclusion | Pass | It gave “**no pick, score, confidence, or wager**.” |

## Result

The fresh controls close the baseline’s ATS/wager, skipped-section, hidden-evidence, and unsupported-conflict failures. The Scenario 1 rerun below directly validates the minimal dispatch-manifest refinement. No report artifacts were retained; the controller removed the Scenario 2 generated `REPORTS/2025-week-9-bills-at-chiefs-rubric.md` file.

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
