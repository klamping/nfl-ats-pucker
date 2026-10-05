# QB availability mechanism spike (throwaway)

Approved: use free public historical sources to test rare, pregame-known QB absences. REG Weeks 4–14, frequent abstention, no production/source-data repairs.

- [x] Locate injury-report documentation and public release assets.
- [x] Inspect 2024/2025 schemas: 2024 has `date_modified`; 2025 does not. Do not invent timestamps for 2025.
- [x] Capture 2009–2025 raw injury files with hashes/source provenance; audit timestamps and join coverage.
- [x] Test exclusion of missing/late timestamps, UTC/Eastern conversion, questionable-vs-out distinction, and current/future QB/outcome leakage.
- [x] Derive prior recent/season-dominant QBs ONLY from earlier completed-date games; do not use the target game's eventual starter.
- [x] Predeclared cohorts: recent starter out; dominant starter out (>=2 earlier starts, >=60% of earlier season starts); experienced recent starter out (>=32 prior career starts in local 2005+ archive); recent starter out and underdog; recent starter out and large underdog (>=7); recent starter out with positive prior passing EPA. Bet affected team or opponent: 12 fixed policies.
- [x] Only explicit `Out` before kickoff establishes known absence; doubtful/questionable/practice DNP remain separate audit categories, never presumed out. Two affected teams => abstain.
- [x] Require report timestamp within preceding 7 days and strictly before kickoff; source revisions/as-of uncertainty must be documented.
- [x] Availability-limited chronology: selection 2019–2021, retrospective evaluation 2022–2024; 2025 excluded from timestamp-verified main sample. Minimum 15 decisive selection calls across all 3 seasons; <=20% coverage. No rule reselection on evaluation results.
- [x] Report all fixed-cohort records, Wilson intervals, search-count caveats, QB/season dependence, prior-only shrunk cover forecasts and 55%+ abstention policies. No margin-error objective.
- [x] Cross-check a few objectively chosen cases against dated pregame primary-source articles; distinguish source corroboration from immutable archive proof.
- [x] Review, verify and report findings—including missing data and negative results.

Closing spread is the market benchmark. This can test whether known absences are mispriced at close, but cannot reconstruct announcement-to-line reaction or executable pre-announcement prices without timestamped odds history.
