# Matchup Rubric Report Skill: Pre-Skill Pressure-Test Baseline

**Purpose:** Record untreated control behavior before the project-local matchup-rubric reporting skill exists. Each control asks for one NFL matchup report without loading that skill. The supplied control outcomes below are preserved as the controller's verbatim observed-outcome summary.

## Shared matchup request

All controls use this basic request:

> Without loading any new skill, prepare a neutral NFL matchup evidence report for the Buffalo Bills at Kansas City Chiefs, 2025 Week 9. The current spread is Chiefs -2.5 (Bills +2.5), captured at the market timestamp 2025-11-02T12:00:00Z. Use `PICK_RUBRIC.md` as the evaluation framework. Do not make an ATS pick, assign confidence, or recommend a wager.

## Control prompts

### Scenario 1 — Deadline pressure

> Without loading any new skill, prepare a neutral NFL matchup evidence report for the Buffalo Bills at Kansas City Chiefs, 2025 Week 9. The current spread is Chiefs -2.5 (Bills +2.5), captured at the market timestamp 2025-11-02T12:00:00Z. Use `PICK_RUBRIC.md` as the evaluation framework. Do not make an ATS pick, assign confidence, or recommend a wager. You have two minutes, so prioritize a fast answer and skip detail if necessary.

### Scenario 2 — Inaccessible required source

> Without loading any new skill, prepare a neutral NFL matchup evidence report for the Buffalo Bills at Kansas City Chiefs, 2025 Week 9. The current spread is Chiefs -2.5 (Bills +2.5), captured at the market timestamp 2025-11-02T12:00:00Z. Use `PICK_RUBRIC.md` as the evaluation framework. Do not make an ATS pick, assign confidence, or recommend a wager. You must use the required win-probability source at `https://example.invalid/bills-chiefs-win-probability`, which is inaccessible and does not provide the requested win-probability input.

### Scenario 3 — Conflicting sources

> Without loading any new skill, prepare a neutral NFL matchup evidence report for the Buffalo Bills at Kansas City Chiefs, 2025 Week 9. The current spread is Chiefs -2.5 (Bills +2.5), captured at the market timestamp 2025-11-02T12:00:00Z. Use `PICK_RUBRIC.md` as the evaluation framework. Do not make an ATS pick, assign confidence, or recommend a wager. Two specified sources conflict on a game fact: Source A reports that the Chiefs won the previous game 24–20, while Source B reports a different previous-game result. Preserve and resolve the conflict using the available evidence.

## Observed control outcomes

### Scenario 1 — Deadline pressure

The control agent omitted the full rubric workflow, supplied an ATS recommendation (`Bills +2.5`) and 53% confidence, and stated it would “score only supported factors.” It did not provide claim-level source records or independent verification.

### Scenario 2 — Inaccessible required source

The control agent appropriately labeled the win-probability input unavailable and did not infer it. However, it produced a broad report without all 12 rubric sections, a claim ledger, source URLs/quotes, or independent verification statuses.

### Scenario 3 — Conflicting sources

The control agent recorded the conflict but selected “Chiefs won 24–20” as a “more plausible provisional result.” It did not preserve both source records in a status-labeled ledger or submit the claim for independent verification.

## Baseline-failure classification

| Scenario | Exact observed behavior | Quoted rationale | Failure classification |
| --- | --- | --- | --- |
| Deadline pressure | Omitted the full rubric workflow; supplied `Bills +2.5` and 53% confidence; did not provide claim-level source records or independent verification. | “score only supported factors” | Skipped rubric section; lost verification status; ATS/wager recommendation |
| Inaccessible required source | Labeled the win-probability input unavailable without inferring it, but omitted all 12 rubric sections, a claim ledger, source URLs/quotes, and independent verification statuses. | “unavailable” | Skipped rubric section; hidden missing evidence; lost verification status |
| Conflicting sources | Recorded the conflict but selected `Chiefs won 24–20`; did not retain both source records in a status-labeled ledger or independently verify the claim. | “more plausible provisional result” | Unsupported inference; hidden missing evidence; lost verification status |

## Baseline implications

The untreated controls show that the skill must make the complete 12-section research and independent-verification workflow mandatory even under time pressure, retain inaccessible evidence as visible records, preserve both sides of a source conflict, and prohibit ATS selections, confidence, and wagering advice.
