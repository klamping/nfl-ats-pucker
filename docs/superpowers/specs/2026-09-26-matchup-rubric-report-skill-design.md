# Matchup Rubric Report Skill Design

## Purpose

Create a reusable project-local skill that produces a neutral research report for one NFL matchup. The report uses every section of `PICK_RUBRIC.md`, but it must not assign scores, choose an ATS side, give confidence, or recommend a wager.

## Inputs

The skill requires:

- Away and home teams
- Season and week, or game date
- Spread and market timestamp to evaluate
- Requested output path, defaulting to `REPORTS/<season>-week-<week>-<away>-at-<home>-rubric.md`

## Research Workflow

1. Create a claim ledger with one entry set for each of the 12 sections in `PICK_RUBRIC.md`.
2. Dispatch one research subagent per section. Each response must provide structured claims containing:
   - Claim text
   - Supporting value or direct quote
   - Source URL
   - Source publication or retrieval date
   - Uncertainty or limitation
3. Dispatch a fresh verification subagent for each completed section. It must independently inspect the cited sources and label every claim:
   - `verified`
   - `conflicted`
   - `unverified`
4. Give the report-writing subagent the complete ledger, including verified, conflicted, and unverified claims with their source evidence and statuses.
5. Write the final report even if parts of the research fail, but explicitly identify it as incomplete and retain every gap or conflict.

## Report Contract

The final report includes:

- Matchup, market/spread context, and report timestamp
- A neutral evidence subsection for every rubric section
- A source URL and supporting quote/value for every factual claim
- A **Verification gaps and conflicts** section with all unverified, conflicted, missing, or inaccessible evidence
- A concise neutral synthesis of what the evidence does and does not establish

The report writer must not infer missing facts, conceal a failed research or verification pass, score the rubric, make a pick, or recommend a wager.

## Error Handling

- Inaccessible, incomplete, or conflicting sources are recorded in the claim ledger with their status and reason.
- A failed research or verification subagent is recorded as a failure for its rubric section; it is not silently skipped.
- The final report may contain only evidence with its explicit verification status. It must not replace gaps with assumptions.

## Skill Location

Create the skill at `skills/creating-matchup-rubric-report/SKILL.md`.

## Validation

Before writing the skill, establish a baseline by running at least three pressure scenarios against fresh subagents without the skill. The scenarios must include:

1. A tight-deadline request.
2. Missing or inaccessible sources.
3. Conflicting game data.

Record baseline failures verbatim, including skipped rubric sections, unsupported inference, betting recommendations, or lost verification status. Then run the same scenarios with the skill. It passes only if it delegates each rubric section, independently verifies every claim, gives the writer the complete status-labeled ledger, reports all gaps and conflicts, and never makes a pick or wagering recommendation.
