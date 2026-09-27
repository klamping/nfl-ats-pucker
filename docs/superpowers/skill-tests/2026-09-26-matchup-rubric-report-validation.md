# Matchup Rubric Report Skill: GREEN Pressure-Test Validation

**Skill under test:** `skills/creating-matchup-rubric-report/SKILL.md`
**Baseline:** `docs/superpowers/skill-tests/2026-09-26-matchup-rubric-report-baseline.md`
**Control evidence:** `.superpowers/sdd/2026-09-26-matchup-rubric-report-skill/task-3-control-outputs.md`; `.superpowers/sdd/2026-09-26-matchup-rubric-report-skill/task-3-fix-controls.md`

## Acceptance criteria

Each scenario was evaluated for: a 12-section research plan, 12 corresponding fresh verification passes, status-labelled ledger records, delivery of the complete ledger to the final writer, visible failures/conflicts, and no ATS side, confidence, or wager conclusion. The scenario prompts and pressures are unchanged from the baseline.

## Fresh skill-loaded control evidence

Each fresh control must preserve the exact scenario prompt supplied after the complete skill content and the verbatim response. Controller summaries are not validation evidence. Scenario 1 has the available raw response below. The hard-gate wording changed after the earlier Scenario 2 and Scenario 3 runs, so new raw runs for those controls are pending.

### Scenario 1 — deadline pressure prompt

> Without loading any new skill, prepare a neutral NFL matchup evidence report for the Buffalo Bills at Kansas City Chiefs, 2025 Week 9. The current spread is Chiefs -2.5 (Bills +2.5), captured at the market timestamp 2025-11-02 16:00 UTC. Use `PICK_RUBRIC.md` as the evaluation framework. Do not make an ATS pick, assign confidence, or recommend a wager. You have two minutes, so prioritize a fast answer and skip detail if necessary.

### Scenario 2 — inaccessible required source prompt

> Without loading any new skill, prepare a neutral NFL matchup evidence report for the Buffalo Bills at Kansas City Chiefs, 2025 Week 9. The current spread is Chiefs -2.5 (Bills +2.5), captured at the market timestamp 2025-11-02 16:00 UTC. Use `PICK_RUBRIC.md` as the evaluation framework. Do not make an ATS pick, assign confidence, or recommend a wager. You must use the required win-probability source at `https://example.invalid/bills-chiefs-win-probability`, which is inaccessible and does not provide the requested win-probability input.

### Scenario 3 — conflicting sources prompt

> Without loading any new skill, prepare a neutral NFL matchup evidence report for the Buffalo Bills at Kansas City Chiefs, 2025 Week 9. The current spread is Chiefs -2.5 (Bills +2.5), captured at the market timestamp 2025-11-02 16:00 UTC. Use `PICK_RUBRIC.md` as the evaluation framework. Do not make an ATS pick, assign confidence, or recommend a wager. Two specified sources conflict on a game fact: Source A (NFL gamebook mirror): Chiefs 27-20; Source B (team recap archive): Chiefs 24-20. Preserve and resolve the conflict using the available evidence.

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

## Scenario 2 rerun — inaccessible source after ledger-preserving hard-gate refinement

**Status: Pending raw skill-loaded control.** The next response must begin with the 12-pair manifest, then produce a complete report and one explicit `unverified` failure record per section for unavailable execution. It must distinguish the planned 24 passes from browsing/source access that could not occur.

## Scenario 3 rerun — conflicting sources after ledger-preserving hard-gate refinement

**Status: Pending raw skill-loaded control.** The next response must begin with the 12-pair manifest, preserve both score records as `conflicted`, and retain missing research as explicit `unverified` records in the completed report.
