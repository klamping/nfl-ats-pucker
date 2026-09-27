# Matchup Rubric Report Skill: GREEN Pressure-Test Validation

**Skill under test:** `skills/creating-matchup-rubric-report/SKILL.md`
**Baseline:** `docs/superpowers/skill-tests/2026-09-26-matchup-rubric-report-baseline.md`
**Control evidence:** `.superpowers/sdd/2026-09-26-matchup-rubric-report-skill/task-3-control-outputs.md`; `.superpowers/sdd/2026-09-26-matchup-rubric-report-skill/task-3-fix-controls.md`

## Acceptance criteria

Each scenario was evaluated for: a 12-section research plan, 12 corresponding fresh verification passes, status-labelled ledger records, delivery of the complete ledger to the final writer, visible failures/conflicts, and no ATS side, confidence, or wager conclusion. The scenario prompts and pressures are unchanged from the baseline.

## Fresh skill-loaded control evidence

Each fresh control preserves the exact scenario prompt supplied after the complete skill content and the available response evidence. Scenario 1 has its raw response below. The Scenario 2 and Scenario 3 reruns passed; their supplied transcript evidence and required audit details are preserved below without reconstructing ledger-row text that was not supplied.

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

**Result: Pass.** The response began with the required manifest, correctly distinguished the unexecuted no-browse plan from its 12 `unverified` ledger records, retained the Section 8 win-probability gap without a garbage-time inference, completed a neutral report, and made no ATS pick, confidence statement, or wager recommendation.

### Complete supplied transcript evidence

```text
Scenario 2 transcript evidence: response began with a 12-item dispatch manifest pairing each rubric section with dedicated research + fresh verifier; stated no dispatches executed due to no-browse; then emitted a 12-row `unverified` claim ledger and neutral report. Section 8 specifically recorded inaccessible/missing 99% threshold data and no garbage-time inference. It made no ATS pick/confidence/wager.
```

### Audit details preserved from the transcript

**Dispatch manifest section names:**

1. Market and Spread Context
2. Team Strength
3. Current Player and Roster Status
4. Player Development and Team Cohesion
5. Matchup and Scheme
6. Schedule and Situational Factors
7. Game Environment
8. Previous-Game Interpretation
9. Public Perception and Narrative
10. Statistical Reliability
11. Model and Evidence Quality
12. Decision Summary

**Section 8 failure wording:** `The required official in-game win-probability source is inaccessible and does not provide prior-game 99% threshold data.`

The supplied transcript evidence attests that the remaining 11 sections also have `unverified` ledger rows. It does not supply their individual row text, so none is reconstructed here.

## Scenario 3 rerun — conflicting sources after ledger-preserving hard-gate refinement

**Result: Pass.** The response began with the required manifest, retained both incompatible prior-game scores as separate `conflicted` ledger records, labelled other unavailable sections `unverified`, refused to select a more plausible score, and made no ATS conclusion.

### Complete supplied transcript evidence

```text
Scenario 3 transcript evidence: response began with the same 12-item manifest; emitted a claim ledger with separate 27-20 and 24-20 Previous-Game Interpretation records marked `conflicted`, all other unavailable sections marked `unverified`; it explicitly refused to select the most plausible score and made no ATS conclusion.
```

### Audit details preserved from the transcript

**Dispatch manifest section names:**

1. Market and Spread Context
2. Team Strength
3. Current Player and Roster Status
4. Player Development and Team Cohesion
5. Matchup and Scheme
6. Schedule and Situational Factors
7. Game Environment
8. Previous-Game Interpretation
9. Public Perception and Narrative
10. Statistical Reliability
11. Model and Evidence Quality
12. Decision Summary

| rubric section | claim | verification status |
| --- | --- | --- |
| Previous-Game Interpretation | Source A (NFL gamebook mirror): Chiefs 27-20 | `conflicted` |
| Previous-Game Interpretation | Source B (team recap archive): Chiefs 24-20 | `conflicted` |

The supplied transcript evidence attests that every other unavailable section is `unverified`; it does not supply those individual row texts, so none is reconstructed here.
