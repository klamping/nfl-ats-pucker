# Task 5 Implementation Report

## Outcome

Implemented the team-data orchestration CLI, immutable accepted/rejected pair publisher, package scripts, documentation, and workflow tests. The implementation consumes existing published market-data pointers and retains the original metadata/statistics CSV captures.

## TDD evidence

- **RED:** `node --test test/ingest-nflverse-team-data.test.js` initially failed because `src/ingest-nflverse-team-data.js` did not exist (`MODULE_NOT_FOUND`), as expected.
- Additional regression test for per-season source provenance failed when multi-season postgame records exposed an array instead of a source URL string (`object !== string`). The workflow was changed to normalize each season against that season's download metadata.
- **GREEN:** focused workflow suite passed: 4 tests, 4 passed, 0 failed.
- **Full suite:** `npm test` passed: 61 tests, 61 passed, 0 failed.
- `git diff --check` passed.

## Live validation

The required market pointer was absent locally, so the public market-data ingestion was run first to publish the existing market manifest consumed by team validation:

- `npm run ingest:market-data -- --start-season 2005 --end-season 2025`: 7,548 fetched schedule rows, 5,698 in-range, 5,698 accepted, 0 rejected.
- `npm run validate:team-data`: completed all five required sample seasons, in order, using one metadata download and one stats download per sample season.

| Season | Identity accepted/rejected | Postgame accepted/rejected | Pregame accepted/rejected | Matchup accepted/rejected |
| --- | ---: | ---: | ---: | ---: |
| 2005 | 32 / 0 | 442 / 46 | 442 / 0 | 221 / 46 |
| 2010 | 32 / 0 | 446 / 44 | 446 / 0 | 223 / 44 |
| 2015 | 32 / 0 | 442 / 46 | 442 / 0 | 221 / 46 |
| 2020 | 32 / 0 | 538 / 0 | 538 / 0 | 269 / 0 |
| 2025 | 32 / 0 | 570 / 0 | 570 / 0 | 285 / 0 |

All postgame rejections in 2005/2010/2015 were `team_mismatch`; the corresponding matchup rejections were `incomplete_team_pair`. There were no identity or pregame rejections, and no rejections in 2020/2025.

## Live source shape

Inspected retained `stats_team_week_<season>` CSV captures from the live source:

| Season | Rows | Columns | `sack_yards_lost` column | Nonempty values |
| --- | ---: | ---: | --- | ---: |
| 2005 | 534 | 138 | present | 534 |
| 2010 | 534 | 138 | present | 534 |
| 2015 | 534 | 138 | present | 534 |
| 2020 | 538 | 138 | present | 538 |
| 2025 | 570 | 138 | present | 570 |

## Changed files

- `src/ingest-nflverse-team-data.js` — validates ranges and client downloads, loads the published market pair, captures source CSVs without overwriting, orchestrates identity/postgame/pregame/matchup normalization, and publishes four immutable JSONL pairs behind atomic pointers. Includes fixed-sample validation and CLI argument handling.
- `test/ingest-nflverse-team-data.test.js` — download counts, inclusive filtering, outputs/pointers, exact five-season validation, unique raw captures, source provenance, and failure preservation coverage.
- `package.json` — `validate:team-data` and `ingest:team-data` scripts.
- `README.md` — team sources, commands, market-manifest prerequisite, franchise continuity, output pointers, null early-season values, and rejection behavior.

## Commit

`8430895` — `feat: ingest nflverse team data`.

## Concerns

- Live historical source/market disagreements reject 44–46 games in each of 2005, 2010, and 2015 (`team_mismatch`); those games consequently have no matchup pair. This behavior is explicit and non-fabricating, but the rejections should be reviewed before using those seasons.
- Team ingestion requires the exact published `nflverse-lines-<start>-<end>.current.json` market pointer for a requested range. Validation specifically requires the published 2005–2025 pointer and will fail rather than downloading/replacing market data if it is missing.
- No paid sources or credentials are used.

## Round 1 follow-up: diagnosis and fixes

### Finding 1 — historical team abbreviation reconciliation

The original 2005/2010/2015 `team_mismatch` records all traced to three source-vs-market alias differences. The weekly stats release used the franchise's current team abbreviation for historical rows, while published market games used the abbreviation valid in that season:

- market `OAK` ↔ weekly-stats `LV` (Raiders)
- market `SD` ↔ weekly-stats `LAC` (Chargers)
- market `STL` ↔ weekly-stats `LA` (Rams)

The game IDs from the prior live rejections, grouped by the mismatching franchise alias, were:

**2005**

- `OAK`/`LV`: `2005_01_OAK_NE`, `2005_02_KC_OAK`, `2005_03_OAK_PHI`, `2005_04_DAL_OAK`, `2005_06_SD_OAK`, `2005_07_BUF_OAK`, `2005_08_OAK_TEN`, `2005_09_OAK_KC`, `2005_10_DEN_OAK`, `2005_11_OAK_WAS`, `2005_12_MIA_OAK`, `2005_13_OAK_SD`, `2005_14_OAK_NYJ`, `2005_15_CLE_OAK`, `2005_16_OAK_DEN`, `2005_17_NYG_OAK`.
- `SD`/`LAC`: `2005_01_DAL_SD`, `2005_02_SD_DEN`, `2005_03_NYG_SD`, `2005_04_SD_NE`, `2005_05_PIT_SD`, `2005_06_SD_OAK`, `2005_07_SD_PHI`, `2005_08_KC_SD`, `2005_09_SD_NYJ`, `2005_11_BUF_SD`, `2005_12_SD_WAS`, `2005_13_OAK_SD`, `2005_14_MIA_SD`, `2005_15_SD_IND`, `2005_16_SD_KC`, `2005_17_DEN_SD`.
- `STL`/`LA`: `2005_01_STL_SF`, `2005_02_STL_ARI`, `2005_03_TEN_STL`, `2005_04_STL_NYG`, `2005_05_SEA_STL`, `2005_06_STL_IND`, `2005_07_NO_STL`, `2005_08_JAX_STL`, `2005_10_STL_SEA`, `2005_11_ARI_STL`, `2005_12_STL_HOU`, `2005_13_WAS_STL`, `2005_14_STL_MIN`, `2005_15_PHI_STL`, `2005_16_SF_STL`, `2005_17_STL_DAL`.

**2010**

- `OAK`/`LV`: `2010_01_OAK_TEN`, `2010_02_STL_OAK`, `2010_03_OAK_ARI`, `2010_04_HOU_OAK`, `2010_05_SD_OAK`, `2010_06_OAK_SF`, `2010_07_OAK_DEN`, `2010_08_SEA_OAK`, `2010_09_KC_OAK`, `2010_11_OAK_PIT`, `2010_12_MIA_OAK`, `2010_13_OAK_SD`, `2010_14_OAK_JAX`, `2010_15_DEN_OAK`, `2010_16_IND_OAK`, `2010_17_OAK_KC`.
- `SD`/`LAC`: `2010_01_SD_KC`, `2010_02_JAX_SD`, `2010_03_SD_SEA`, `2010_04_ARI_SD`, `2010_05_SD_OAK`, `2010_06_SD_STL`, `2010_07_NE_SD`, `2010_08_TEN_SD`, `2010_09_SD_HOU`, `2010_11_DEN_SD`, `2010_12_SD_IND`, `2010_13_OAK_SD`, `2010_14_KC_SD`, `2010_15_SF_SD`, `2010_16_SD_CIN`, `2010_17_SD_DEN`.
- `STL`/`LA`: `2010_01_ARI_STL`, `2010_02_STL_OAK`, `2010_03_WAS_STL`, `2010_04_SEA_STL`, `2010_05_STL_DET`, `2010_06_SD_STL`, `2010_07_STL_TB`, `2010_08_CAR_STL`, `2010_10_STL_SF`, `2010_11_ATL_STL`, `2010_12_STL_DEN`, `2010_13_STL_ARI`, `2010_14_STL_NO`, `2010_15_KC_STL`, `2010_16_SF_STL`, `2010_17_STL_SEA`.

**2015**

- `OAK`/`LV`: `2015_01_CIN_OAK`, `2015_02_BAL_OAK`, `2015_03_OAK_CLE`, `2015_04_OAK_CHI`, `2015_05_DEN_OAK`, `2015_07_OAK_SD`, `2015_08_NYJ_OAK`, `2015_09_OAK_PIT`, `2015_10_MIN_OAK`, `2015_11_OAK_DET`, `2015_12_OAK_TEN`, `2015_13_KC_OAK`, `2015_14_OAK_DEN`, `2015_15_GB_OAK`, `2015_16_SD_OAK`, `2015_17_OAK_KC`.
- `SD`/`LAC`: `2015_01_DET_SD`, `2015_02_SD_CIN`, `2015_03_SD_MIN`, `2015_04_CLE_SD`, `2015_05_PIT_SD`, `2015_06_SD_GB`, `2015_07_OAK_SD`, `2015_08_SD_BAL`, `2015_09_CHI_SD`, `2015_11_KC_SD`, `2015_12_SD_JAX`, `2015_13_DEN_SD`, `2015_14_SD_KC`, `2015_15_MIA_SD`, `2015_16_SD_OAK`, `2015_17_SD_DEN`.
- `STL`/`LA`: `2015_01_SEA_STL`, `2015_02_STL_WAS`, `2015_03_PIT_STL`, `2015_04_STL_ARI`, `2015_05_STL_GB`, `2015_07_CLE_STL`, `2015_08_SF_STL`, `2015_09_STL_MIN`, `2015_10_CHI_STL`, `2015_11_STL_BAL`, `2015_12_STL_CIN`, `2015_13_ARI_STL`, `2015_14_DET_STL`, `2015_15_TB_STL`, `2015_16_STL_SEA`, `2015_17_STL_SF`.

The reconciliation uses the existing franchise definitions to resolve the raw source alias to a franchise, then requires a matching identity for that franchise in the game's season and converts to that season's alias. Pair validation still requires exactly the two market franchises and matching opponent franchise; unrelated or conflicting teams remain rejected. Published postgame fields use season-valid aliases, while `sourceTeamAlias`, `sourceOpponentAlias`, and unmodified `rawStats` preserve the source codes.

### Finding 2 — rejected market rows entering the matchup join

`readMarketGames` had parsed and concatenated both JSONL files from the market pointer. It now consumes only the pointer's accepted JSONL for downstream processing; the rejected path is still validated as part of the published pair pointer but its records do not enter postgame or matchup derivation. The regression fixture adds a rejected market row missing `closingSpreadHome`, plus matching weekly stats that would otherwise have produced a joinable matchup. Before the fix, focused validation failed because `2025_02_DAL_PHI` appeared as an accepted matchup; after the fix it is absent.

### Round 1 TDD and verification

- **RED — alias issue:** `node --test test/normalize-team-postgame.test.js` failed on the added `OAK`/`SD` market vs `LV`/`LAC` source regression with `team_mismatch`.
- **GREEN — alias issue:** focused normalization suite passed after franchise-based, season-aware alias resolution; assertions also verify `STL` vs `LA`, true mismatches stay rejected, and source aliases remain traceable.
- **RED — market rejected-row issue:** `node --test test/ingest-nflverse-team-data.test.js` failed as expected because the missing-spread rejected market row was emitted as `2025_02_DAL_PHI` in accepted matchups.
- **GREEN — market rejected-row issue:** focused ingestion + postgame suites passed: 15 tests, 15 passed, 0 failed.
- **Full suite:** `npm test` passed: 62 tests, 62 passed, 0 failed.
- **Live validation:** `npm run validate:team-data` passed on exactly 2005, 2010, 2015, 2020, and 2025. The former alias-driven rejections are resolved; all remaining rejection counts are zero:

| Season | Identity accepted/rejected | Postgame accepted/rejected | Pregame accepted/rejected | Matchup accepted/rejected |
| --- | ---: | ---: | ---: | ---: |
| 2005 | 32 / 0 | 534 / 0 | 534 / 0 | 267 / 0 |
| 2010 | 32 / 0 | 534 / 0 | 534 / 0 | 267 / 0 |
| 2015 | 32 / 0 | 534 / 0 | 534 / 0 | 267 / 0 |
| 2020 | 32 / 0 | 538 / 0 | 538 / 0 | 269 / 0 |
| 2025 | 32 / 0 | 570 / 0 | 570 / 0 | 285 / 0 |

For 2005/2010/2015, 48 postgame team rows per season had one of the legacy/current aliases (`LV`, `LAC`, `LA`); all retain their original alias in `sourceTeamAlias` and `rawStats.team` while publishing the season-valid team alias. No genuine mismatches remained in the live five-season validation.

### Round 1 changed files

- `src/franchise-aliases.js` — added lookup of a known alias across franchise alias eras.
- `src/normalize-team-postgame.js` — maps recognized stats aliases by franchise back to a season-valid identity alias, retains source aliases/raw stats, and keeps strict pair validation.
- `src/ingest-nflverse-team-data.js` — reads only the market accepted JSONL for team processing.
- `test/normalize-team-postgame.test.js` — regressions for Raiders/Chargers and Rams historical source aliases, retained raw aliases, and existing genuine mismatch rejection.
- `test/ingest-nflverse-team-data.test.js` — rejected market row missing `closingSpreadHome` cannot create an accepted matchup.

### Round 1 commit

`99fd50f` — `fix: reconcile historical team source aliases`.

### Remaining concerns

- The five live sample seasons had zero rejected team records after reconciliation. Other seasons or future source versions may expose additional alias forms; unknown aliases remain rejected rather than guessed.
- No credentials/paid sources were introduced, and the immutable pair/atomic pointer publication behavior was unchanged.

## Final review follow-up

### Findings and root causes

1. **Signed live sack losses were increasing yards per play.** Live `sack_yards_lost` values are negative (for example `-33`), while the normalizer subtracted the raw field as though it were positive. It now calculates `(passing_yards + rushing_yards - abs(sack_yards_lost)) / (attempts + carries + sacks_suffered)`, applying the sack loss once for either sign. Since defensive YPP is computed from the paired opponent row, both offensive and defensive YPP are corrected; the existing pregame net-YPP aggregation inherits those corrected postgame values.
2. **Live turnover columns did not match the normalizer's legacy names.** Weekly source rows use `passing_interceptions` and `fumbles_lost_total`, not `interceptions` and `lost_fumbles`. The normalizer now prefers a nonblank legacy/canonical value and falls back to the live field, while `rawStats` continues to preserve the untouched source row. Regression input uses only the live names (with blank legacy fields) and asserts non-null turnover margins.
3. **The original `nfldata` teams CSV does not provide all requested identity metadata.** A live header inspection confirmed it supplies season/team IDs and names only. The no-cost public nflverse release `https://github.com/nflverse/nflverse-data/releases/download/teams/teams_colors_logos.csv` supplies conference, division, colors, and logo URLs. The client now merges by normalized `team_id` plus exact `team_abbr` and rejects absent or incomplete branding metadata; the compound key is necessary because that release intentionally includes multiple historical/current abbreviations for stable team IDs (for example `STL`/`LA`/`LAR`, `SD`/`LAC`, and `OAK`/`LV`). The output records both source URLs, and ingestion preserves both identity source CSVs as separate raw captures. The spec, implementation plan, and README now identify the two sources and the actual merge contract.
4. **The source-client ledger's metadata failure test gap was straightforward to close.** Added an explicit non-success team-metadata response test that proves the body is not read, plus required-column validation for the branding source.

### Regression and TDD results

- **RED:** Before implementation, the focused review suite had 7 expected failures for the missing branding download/enrichment, missing metadata validation, negative sack values, live turnover aliases, and the additional raw capture expectations.
- The first live validation attempt also exposed that branding `team_id` is not unique across historical aliases. Inspection of all 36 live branding rows confirmed shared IDs are intentional; joining with the exact source team abbreviation fixed the issue without dropping historical records.
- **GREEN targeted suites:** `node --test test/nflverse-team-client.test.js test/normalize-team-identity.test.js test/normalize-team-postgame.test.js test/derive-team-pregame.test.js test/ingest-nflverse-team-data.test.js` — 38 passed, 0 failed. This includes the explicit failed-response and malformed-metadata-CSV regressions.
- **GREEN full suite:** `npm test` — 67 passed, 0 failed.
- `git diff --check` passed.

### Live source validation

`npm run validate:team-data` passed against both live nflverse identity sources, live weekly stats, and the published market data for exactly the five planned seasons. Identity output had 32/32 franchises with conference, division, both colors, and both logo URLs. Raw identity captures include `teams.csv` and `teams_colors_logos.csv`; live weekly raw rows contain `passing_interceptions`, `fumbles_lost_total`, and negative `sack_yards_lost` values.

| Season | Identity accepted/rejected | Postgame accepted/rejected | Pregame accepted/rejected | Matchup accepted/rejected | Rows with negative sack yards lost | Non-null offensive YPP / defensive YPP / turnover margin |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 2005 | 32 / 0 | 534 / 0 | 534 / 0 | 267 / 0 | 449 | 534 / 534 / 534 |
| 2010 | 32 / 0 | 534 / 0 | 534 / 0 | 267 / 0 | 457 | 534 / 534 / 534 |
| 2015 | 32 / 0 | 534 / 0 | 534 / 0 | 267 / 0 | 460 | 534 / 534 / 534 |
| 2020 | 32 / 0 | 538 / 0 | 538 / 0 | 269 / 0 | 455 | 538 / 538 / 538 |
| 2025 | 32 / 0 | 570 / 0 | 570 / 0 | 285 / 0 | 491 | 570 / 570 / 570 |

There were no new live-validation rejections. The public branding source has 36 rows because historical/current aliases are included; all requested identity fields were populated for all 32 published franchises.

### Final review changed files

- `src/nflverse-team-client.js` — fetches and validates public team branding source, merges historical aliases safely, and returns both raw source descriptors.
- `src/normalize-team-identity.js` — requires conference/division/colors/logos and publishes both source URLs plus current and seasonal metadata.
- `src/normalize-team-postgame.js` — normalizes live turnover aliases and signed sack-yard losses.
- `src/ingest-nflverse-team-data.js` — retains both identity source files in raw storage and publishes both raw paths with identity output.
- `test/fixtures/nflverse-team-branding.csv`, `test/fixtures/nflverse-teams.csv`, `test/fixtures/nflverse-team-stats-2005.csv` — fixtures model observed live source headers, negative sack yards, turnover aliases, and duplicate franchise IDs across eras.
- `test/nflverse-team-client.test.js`, `test/normalize-team-identity.test.js`, `test/normalize-team-postgame.test.js`, `test/ingest-nflverse-team-data.test.js` — regression coverage for enrichment, failure handling, signed yards, turnover aliases, pregame inheritance, and raw source retention.
- `docs/superpowers/specs/2026-09-27-nflverse-team-data-design.md`, `docs/superpowers/plans/2026-09-27-nflverse-team-data.md`, `README.md` — corrected sources, output metadata contract, and metric normalization semantics.

### Remaining concerns

- Validation covers the five required sample seasons, not every season in the 2005–2025 range; no full-range team ingestion was requested.
- No paid sources, credentials, or scraping were introduced. Historical/current brand aliases are retained and matched explicitly rather than collapsed by team ID alone.
