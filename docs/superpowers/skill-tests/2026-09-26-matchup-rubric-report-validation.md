# Matchup Rubric Report Skill: GREEN Pressure-Test Validation

**Skill under test:** `skills/creating-matchup-rubric-report/SKILL.md`
**Baseline:** `docs/superpowers/skill-tests/2026-09-26-matchup-rubric-report-baseline.md`
**Control evidence:** `.superpowers/sdd/2026-09-26-matchup-rubric-report-skill/task-3-control-outputs.md`; `.superpowers/sdd/2026-09-26-matchup-rubric-report-skill/task-3-fix-controls.md`

## Acceptance criteria

Each scenario was evaluated for: a 12-section research plan, 12 corresponding fresh verification passes, status-labelled ledger records, delivery of the complete ledger to the final writer, visible failures/conflicts, and no ATS side, confidence, or wager conclusion. The scenario prompts and pressures are unchanged from the baseline.

## Validation scope

These pressure-test prompts intentionally prohibit browsing. They test whether the skill produces a complete planned dispatch manifest, status-labelled failure records, and no unsupported inference when execution cannot access evidence. They do **not** test live data research or real tool orchestration; that is an out-of-scope future integration test, not a passed claim in this validation record.

## Fresh skill-loaded control evidence

Each fresh control preserves the exact scenario prompt supplied after the complete skill content and its verbatim response. Scenario 1 has its raw response below. The Scenario 2 and Scenario 3 raw transcripts below are copied verbatim from their final control files.

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

### Exact raw transcript

## Dispatch manifest

1. **Market and Spread Context** — Dedicated research dispatch planned; corresponding fresh verifier dispatch planned.
2. **Team Strength** — Dedicated research dispatch planned; corresponding fresh verifier dispatch planned.
3. **Current Player and Roster Status** — Dedicated research dispatch planned; corresponding fresh verifier dispatch planned.
4. **Player Development and Team Cohesion** — Dedicated research dispatch planned; corresponding fresh verifier dispatch planned.
5. **Matchup and Scheme** — Dedicated research dispatch planned; corresponding fresh verifier dispatch planned.
6. **Schedule and Situational Factors** — Dedicated research dispatch planned; corresponding fresh verifier dispatch planned.
7. **Game Environment** — Dedicated research dispatch planned; corresponding fresh verifier dispatch planned.
8. **Previous-Game Interpretation** — Dedicated research dispatch planned; corresponding fresh verifier dispatch planned.
9. **Public Perception and Narrative** — Dedicated research dispatch planned; corresponding fresh verifier dispatch planned.
10. **Statistical Reliability** — Dedicated research dispatch planned; corresponding fresh verifier dispatch planned.
11. **Model and Evidence Quality** — Dedicated research dispatch planned; corresponding fresh verifier dispatch planned.
12. **Decision Summary** — Dedicated research dispatch planned; corresponding fresh verifier dispatch planned.

No research or verifier dispatch was executed because browsing is prohibited. The records below are explicit execution-failure records, not research findings.

# Buffalo Bills at Kansas City Chiefs — 2025 Week 9 rubric evidence report

## 1. Matchup and market context

- Teams: Buffalo Bills at Kansas City Chiefs (scenario input).
- Season/week: 2025 Week 9 (scenario input).
- Spread evaluated: Chiefs -2.5 (scenario input).
- Market timestamp: 2025-11-02T16:00:00Z (scenario input).
- Report timestamp: unavailable; no report-generation timestamp was supplied.

## 2. Market and Spread Context

Unverified. No market research was performed; opening line, movement, prices, consensus, alternate numbers, and the reason for any movement are unknown.

## 3. Team Strength

Unverified. No sourced offensive, defensive, special-teams, opponent-adjusted, or regression evidence was obtained.

## 4. Current Player and Roster Status

Unverified. No current injury report, active/inactive information, depth-chart evidence, or expected workload evidence was obtained.

## 5. Player Development and Team Cohesion

Unverified. No sourced evidence concerning continuity, roles, player development, execution, or cohesion was obtained.

## 6. Matchup and Scheme

Unverified. No sourced evidence concerning unit matchups, tendencies, personnel, coaching, pace, or scoring interaction was obtained.

## 7. Schedule and Situational Factors

Unverified. No sourced rest, travel, scheduling, motivation, or home-field evidence was obtained.

## 8. Game Environment

Unverified. No sourced weather, venue, field, or expected-pace evidence was obtained.

## 9. Previous-Game Interpretation

Unverified. The official prior-game win-probability source is inaccessible and lacks the requested 99% threshold data. No game-state or timing evidence was available to identify garbage-time scoring, the margin before either prior game became effectively decided, late starter rest, or injury timing. No inference is made from a final score.

## 10. Public Perception and Narrative

Unverified. No sourced media, sentiment, betting-popularity, or market-effect evidence was obtained.

## 11. Statistical Reliability

Unverified. No statistical dataset or methodological evidence was obtained to assess sample size, opponent adjustment, variance, garbage time, or market incorporation.

## 12. Model and Evidence Quality

Unverified. No model, data provenance, backtest, or evidence-quality material was obtained.

## 13. Decision Summary

No side, confidence, or wager recommendation is provided. The supplied spread is Chiefs -2.5 as of 2025-11-02T16:00:00Z, but the evidence required to evaluate it was not available.

## 14. Verification gaps and conflicts

All twelve required research and fresh-verification passes are unavailable because browsing is prohibited. In addition, the official prior-game win-probability source is inaccessible and does not contain 99% threshold data. There are no conflicts to resolve because no competing factual source records were obtained.

## 15. Source support

No external sources were accessed. The only available details are the scenario inputs stated in the matchup and market context. The official prior-game win-probability source could not be accessed and, as specified, lacks 99% threshold data.

## 16. Neutral synthesis

The scenario establishes only the matchup, week, spread, and market timestamp. It does not establish a market edge, team-strength difference, roster status, matchup advantage, situational effect, game-environment effect, previous-game interpretation, public narrative effect, statistical reliability assessment, or model conclusion. No ATS selection can be supported from the available evidence.

## Complete claim ledger

| rubric section | claim | supporting value or quote | source URL | source date | uncertainty | verification status | verification evidence | failure reason |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Market and Spread Context | Market context beyond the supplied Chiefs -2.5 spread and timestamp | No research value or quote available. |  |  | Opening line, movement, pricing, consensus, and causes of movement are unknown. | unverified | No fresh verifier executed. | Browsing prohibited; required research and verification could not access sources. |
| Team Strength | Current comparative team strength | No research value or quote available. |  |  | Offensive, defensive, special-teams, opponent-adjusted, and regression evidence is unknown. | unverified | No fresh verifier executed. | Browsing prohibited; required research and verification could not access sources. |
| Current Player and Roster Status | Current availability and expected contribution | No research value or quote available. |  |  | Injuries, active status, depth charts, and workload are unknown. | unverified | No fresh verifier executed. | Browsing prohibited; required research and verification could not access sources. |
| Player Development and Team Cohesion | Development, continuity, and cohesion | No research value or quote available. |  |  | Familiarity, continuity, roles, execution, and organizational conditions are unknown. | unverified | No fresh verifier executed. | Browsing prohibited; required research and verification could not access sources. |
| Matchup and Scheme | Scheme and unit interaction | No research value or quote available. |  |  | Unit matchups, tendencies, personnel, coaching effects, pace, and scoring interaction are unknown. | unverified | No fresh verifier executed. | Browsing prohibited; required research and verification could not access sources. |
| Schedule and Situational Factors | Rest, travel, and scheduling circumstances | No research value or quote available. |  |  | Rest, travel, scheduling, motivation, and home-field evidence are unknown. | unverified | No fresh verifier executed. | Browsing prohibited; required research and verification could not access sources. |
| Game Environment | Weather, venue, field, and environmental conditions | No research value or quote available. |  |  | Weather, venue configuration, field conditions, and expected pace are unknown. | unverified | No fresh verifier executed. | Browsing prohibited; required research and verification could not access sources. |
| Previous-Game Interpretation | Prior-game state and garbage-time assessment using 99% win-probability threshold data | Official prior-game win-probability source is inaccessible and lacks 99% threshold data. |  |  | Margin before effective decision, garbage-time points, late scoring, starter rest, and injury timing are unknown. | unverified | No fresh verifier executed; the designated official source is inaccessible. | Browsing prohibited; official prior-game win-probability source inaccessible and lacks 99% threshold data. |
| Public Perception and Narrative | Narrative, sentiment, popularity, and any market effect | No research value or quote available. |  |  | Media coverage, public sentiment, betting popularity, and impact on the spread are unknown. | unverified | No fresh verifier executed. | Browsing prohibited; required research and verification could not access sources. |
| Statistical Reliability | Reliability of relevant performance statistics | No research value or quote available. |  |  | Sample size, recency, opponent adjustment, variance, garbage time, and market incorporation are unknown. | unverified | No fresh verifier executed. | Browsing prohibited; required research and verification could not access sources. |
| Model and Evidence Quality | Quality and applicability of any model or evidence | No research value or quote available. |  |  | Data availability, provenance, validation, and incremental value over the market are unknown. | unverified | No fresh verifier executed. | Browsing prohibited; required research and verification could not access sources. |
| Decision Summary | Evidence-supported ATS decision | No evidence-supported selection, confidence, or recommendation is available. |  |  | All substantive rubric inputs remain unresolved. | unverified | No fresh verifier executed. | Browsing prohibited; the prerequisite research and verification records are unavailable. |

## Scenario 3 rerun — conflicting sources after ledger-preserving hard-gate refinement

### Exact raw transcript

## Dispatch manifest

1. **Market and Spread Context** — dedicated research dispatch planned; corresponding fresh verifier dispatch planned.
2. **Team Strength** — dedicated research dispatch planned; corresponding fresh verifier dispatch planned.
3. **Current Player and Roster Status** — dedicated research dispatch planned; corresponding fresh verifier dispatch planned.
4. **Player Development and Team Cohesion** — dedicated research dispatch planned; corresponding fresh verifier dispatch planned.
5. **Matchup and Scheme** — dedicated research dispatch planned; corresponding fresh verifier dispatch planned.
6. **Schedule and Situational Factors** — dedicated research dispatch planned; corresponding fresh verifier dispatch planned.
7. **Game Environment** — dedicated research dispatch planned; corresponding fresh verifier dispatch planned.
8. **Previous-Game Interpretation** — dedicated research dispatch planned; corresponding fresh verifier dispatch planned.
9. **Public Perception and Narrative** — dedicated research dispatch planned; corresponding fresh verifier dispatch planned.
10. **Statistical Reliability** — dedicated research dispatch planned; corresponding fresh verifier dispatch planned.
11. **Model and Evidence Quality** — dedicated research dispatch planned; corresponding fresh verifier dispatch planned.
12. **Decision Summary** — dedicated research dispatch planned; corresponding fresh verifier dispatch planned.

Browsing is prohibited. None of the planned research or fresh-verifier passes executed; the ledger records the resulting evidence gaps.

# Buffalo Bills at Kansas City Chiefs — 2025 Week 9 Rubric Report

## 1. Matchup and market context

| field | value | source / limitation | verification status |
| --- | --- | --- | --- |
| Matchup | Buffalo Bills at Kansas City Chiefs | User-provided scenario; no URL or source date supplied. | unverified |
| Season/week | 2025 Week 9 | User-provided scenario; no URL or source date supplied. | unverified |
| Spread | Chiefs -2.5 | User-provided scenario; no URL or source date supplied. | unverified |
| Market timestamp | 2025-11-02T16:00:00Z | User-provided scenario; no URL or source date supplied. | unverified |
| Report timestamp | Not supplied | No report-generation timestamp was provided. | unverified |

## Complete claim ledger

| rubric section | claim | supporting value or quote | source URL | source date | uncertainty | verification status | verification evidence | failure reason |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Market and Spread Context | Opening/current movement, prices, alternate numbers, consensus, and cause of movement | No research evidence available. |  |  | These market details cannot be inferred from Chiefs -2.5 alone. | unverified | No independent source inspection occurred because browsing is prohibited. | Browsing prohibited. |
| Team Strength | Current offensive, defensive, special-teams, and opponent-adjusted team strength | No research evidence available. |  |  | Team strength cannot be inferred from team names, the spread, or general knowledge. | unverified | No independent source inspection occurred because browsing is prohibited. | Browsing prohibited. |
| Current Player and Roster Status | Player availability, health, roles, and expected workload | No research evidence available. |  |  | Availability and workload remain unknown. | unverified | No independent source inspection occurred because browsing is prohibited. | Browsing prohibited. |
| Player Development and Team Cohesion | Continuity, development, execution, and organizational conditions | No research evidence available. |  |  | No development or cohesion conclusion is supported. | unverified | No independent source inspection occurred because browsing is prohibited. | Browsing prohibited. |
| Matchup and Scheme | Unit-versus-unit matchup, tendencies, and coaching interaction | No research evidence available. |  |  | No scheme or matchup inference is supported. | unverified | No independent source inspection occurred because browsing is prohibited. | Browsing prohibited. |
| Schedule and Situational Factors | Rest, travel, scheduling, motivation, and situational context | No research evidence available. |  |  | These circumstances remain unknown. | unverified | No independent source inspection occurred because browsing is prohibited. | Browsing prohibited. |
| Game Environment | Weather, stadium, surface, field conditions, and expected pace | No research evidence available. |  |  | No environment or pace assumption is supported. | unverified | No independent source inspection occurred because browsing is prohibited. | Browsing prohibited. |
| Previous-Game Interpretation | Prior-game final score reported by Source A | “27-20” |  |  | Source A's URL and date were not supplied; this conflicts with Source B. | conflicted | No independent source inspection occurred; the two supplied scores disagree. | Browsing prohibited; no source URL or date supplied. |
| Previous-Game Interpretation | Prior-game final score reported by Source B | “24-20” |  |  | Source B's URL and date were not supplied; this conflicts with Source A. | conflicted | No independent source inspection occurred; the two supplied scores disagree. | Browsing prohibited; no source URL or date supplied. |
| Previous-Game Interpretation | Game state, timing, garbage-time scoring, turnover context, starter usage, and injury timing | No research evidence available. |  |  | Neither final-score assertion establishes game state or garbage time. | unverified | No independent source inspection occurred because browsing is prohibited. | Browsing prohibited. |
| Public Perception and Narrative | Media narrative, betting popularity, sentiment, and measurable market effect | No research evidence available. |  |  | No narrative or pricing effect is established. | unverified | No independent source inspection occurred because browsing is prohibited. | Browsing prohibited. |
| Statistical Reliability | Sample size, adjusted metrics, variance, game-script effects, and stability | No research evidence available. |  |  | No reliability assessment is supported. | unverified | No independent source inspection occurred because browsing is prohibited. | Browsing prohibited. |
| Model and Evidence Quality | Model inputs, validation, market baseline, and evidence quality | No research evidence available. |  |  | No model conclusion or evidence-quality finding is supported. | unverified | No independent source inspection occurred because browsing is prohibited. | Browsing prohibited. |
| Decision Summary | ATS side, confidence, or wager recommendation | No selection made. |  |  | The required evidence is unavailable and the prior-game score is conflicted. | unverified | No independently verified evidence supports a decision. | Browsing prohibited; report contract forbids replacing gaps with assumptions. |

## 2. Market and Spread Context

**Claim:** Chiefs -2.5 was supplied as of 2025-11-02T16:00:00Z. **Source URL:** unavailable. **Source date:** unavailable. **Uncertainty:** opening line, movement, prices, alternate numbers, consensus, and movement drivers are unknown. **Verification status:** unverified. No market conclusion follows from the supplied number alone.

## 3. Team Strength

**Claim:** No current team-strength evidence is available. **Source URL:** unavailable. **Source date:** unavailable. **Uncertainty:** offense, defense, special teams, opponent adjustment, and regression indicators are unknown. **Verification status:** unverified.

## 4. Current Player and Roster Status

**Claim:** No roster-status evidence is available. **Source URL:** unavailable. **Source date:** unavailable. **Uncertainty:** quarterback, line, skill-position, defensive, and special-teams availability and workload are unknown. **Verification status:** unverified.

## 5. Player Development and Team Cohesion

**Claim:** No development or cohesion evidence is available. **Source URL:** unavailable. **Source date:** unavailable. **Uncertainty:** continuity, role changes, execution, and organizational conditions are unknown. **Verification status:** unverified.

## 6. Matchup and Scheme

**Claim:** No matchup or scheme evidence is available. **Source URL:** unavailable. **Source date:** unavailable. **Uncertainty:** unit matchups, tendencies, personnel interactions, and coaching adjustments are unknown. **Verification status:** unverified.

## 7. Schedule and Situational Factors

**Claim:** No schedule or situational evidence is available. **Source URL:** unavailable. **Source date:** unavailable. **Uncertainty:** rest, travel, home-field conditions, motivation, and scheduling context are unknown. **Verification status:** unverified.

## 8. Game Environment

**Claim:** No game-environment evidence is available. **Source URL:** unavailable. **Source date:** unavailable. **Uncertainty:** weather, venue, surface, field condition, and expected pace are unknown. **Verification status:** unverified.

## 9. Previous-Game Interpretation

**Claim:** Source A reports a prior-game score of 27-20. **Source URL:** unavailable. **Source date:** unavailable. **Uncertainty:** it conflicts with Source B and cannot establish game state. **Verification status:** conflicted.

**Claim:** Source B reports a prior-game score of 24-20. **Source URL:** unavailable. **Source date:** unavailable. **Uncertainty:** it conflicts with Source A and cannot establish game state. **Verification status:** conflicted.

**Claim:** No evidence establishes the margin before the game was effectively decided, timing of scores, garbage-time points, turnovers, starter usage, or injury timing. **Source URL:** unavailable. **Source date:** unavailable. **Uncertainty:** a final score alone cannot establish these facts. **Verification status:** unverified.

Neither score is selected as plausible or used as a working fact.

## 10. Public Perception and Narrative

**Claim:** No public-perception or narrative evidence is available. **Source URL:** unavailable. **Source date:** unavailable. **Uncertainty:** media coverage, betting popularity, and any effect on the spread are unknown. **Verification status:** unverified.

## 11. Statistical Reliability

**Claim:** No statistical-reliability evidence is available. **Source URL:** unavailable. **Source date:** unavailable. **Uncertainty:** sample size, opponent adjustment, variance, garbage-time effects, and metric stability are unknown. **Verification status:** unverified.

## 12. Model and Evidence Quality

**Claim:** No model or evidence-quality evaluation is available. **Source URL:** unavailable. **Source date:** unavailable. **Uncertainty:** input provenance, validation, market-baseline comparison, and double counting cannot be assessed. **Verification status:** unverified.

## 13. Decision Summary

No ATS side, confidence, wager recommendation, or score-based conclusion is made. The spread supplied is Chiefs -2.5, but the market context, team and roster evidence, matchup evidence, environment, and prior-game interpretation are unverified. The only prior-game score assertions conflict: Source A says 27-20 and Source B says 24-20.

## 14. Verification gaps and conflicts

- All 12 planned research and fresh-verifier passes are unexecuted because browsing is prohibited.
- Every rubric section has an explicit unverified failure record in the ledger.
- The previous-game score is conflicted: Source A says 27-20; Source B says 24-20. Neither source supplied a URL or date, and no independent verification occurred.
- No game-state or garbage-time conclusion is supported.

## 15. Source support

The only supplied support is the scenario input: Buffalo Bills at Kansas City Chiefs, 2025 Week 9, Chiefs -2.5 as of 2025-11-02T16:00:00Z, plus the conflicting prior-game assertions attributed to Source A and Source B. No source URLs or source dates were supplied. No external sources were accessed.

## 16. Neutral synthesis

The supplied scenario identifies the matchup, week, spread, and market timestamp, but it does not provide verifiable evidence for the rubric. The two prior-game score assertions conflict, and the available information does not establish which one is correct or whether either reflects garbage-time scoring or game state. The evidence does not establish an ATS conclusion.
