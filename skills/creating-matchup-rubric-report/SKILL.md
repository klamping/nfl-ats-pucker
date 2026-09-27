---
name: creating-matchup-rubric-report
description: Use when a user needs a neutral evidence report for one NFL matchup, a rubric report with sourced evidence, garbage-time analysis, claim verification, conflicting sources, inaccessible evidence, or a no-pick request.
---

# Creating a Matchup Rubric Report

Produce an evidence report, not a betting analysis. Every factual statement remains traceable to a source and an explicit verification status; missing evidence stays visible.

## Required inputs

Collect before dispatching:

- away team and home team
- season and week **or** game date
- spread to evaluate and market timestamp
- optional output path; default: `REPORTS/<season>-week-<week>-<away>-at-<home>-rubric.md`

## Claim ledger

Create the ledger before research. Use one record for every claim, including missing, inaccessible, failed, and conflicting evidence. Each record has exactly these fields:

| rubric section | claim | supporting value or quote | source URL | source date | uncertainty | verification status | verification evidence | failure reason |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |

`verification status` is only `verified`, `conflicted`, or `unverified`. Leave source fields empty only when unavailable and explain why in `failure reason`.

## Mandatory dispatch protocol

1. Read `PICK_RUBRIC.md` and enumerate all sections before dispatching:
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
2. Dispatch one dedicated research subagent for **each** section. Its prompt includes the matchup inputs, the relevant rubric section, and the ledger fields. It returns claim records with source URLs, dates, supporting values/quotes, and limitations. For section 8, research the game state and timing behind any garbage-time claim rather than infer it from the final score.
3. When each research response completes, dispatch a **fresh** verifier for that same section. Give it the research records and cited URLs; it independently inspects the source evidence. Its response contains **only** ledger records, each labelled `verified`, `conflicted`, or `unverified`, with verification evidence.
4. If research, verification, or a source fails, append an `unverified` record for that section with the failure reason. Do not skip the section.

## Evidence rules

- Deadline pressure does not reduce, combine, or bypass any of the 12 research and verification passes.
- Record inaccessible or incomplete sources as `unverified`; never substitute an estimate or an inference.
- Retain both source records for conflicting facts and label them `conflicted`. Do not select the more plausible record as a working fact unless independent evidence verifies it.
- Unknown facts remain unknown. Do not infer availability, weather, line movement, injuries, a previous-game state, or a narrative from final scores or general knowledge.

## Final-writer prompt contract

Give a separate final writer **every ledger record**, grouped into `verified`, `conflicted`, and `unverified`. Require this report shape, in order:

1. Matchup and market context (teams, season/week or date, spread, market timestamp, report timestamp)
2. Market and Spread Context
3. Team Strength
4. Current Player and Roster Status
5. Player Development and Team Cohesion
6. Matchup and Scheme
7. Schedule and Situational Factors
8. Game Environment
9. Previous-Game Interpretation
10. Public Perception and Narrative
11. Statistical Reliability
12. Model and Evidence Quality
13. Decision Summary (evidence and unresolved inputs only)
14. **Verification gaps and conflicts**
15. Source support
16. Neutral synthesis

Within every rubric subsection, every factual claim renders its source URL, supporting quote/value, source publication or retrieval date, uncertainty or limitation, and verification status. The gaps section lists every inaccessible, missing, failed, unverified, and conflicted record. The neutral synthesis states only what the evidence establishes and does not establish.

The final writer must not score the rubric, select an ATS side, assign confidence, recommend a bet or wager, conceal a failed pass, or replace a gap with an assumption.

## Completion check

Before writing the output path, confirm all 12 headings have research and fresh-verification results or explicit `unverified` failure records, all conflicts retain both source records, and the writer received the complete status-grouped ledger.
