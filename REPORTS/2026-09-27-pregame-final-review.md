# Pregame Final Review Fixes

## Changes

- Normalized The Odds API's provider-native home quotes at the consensus boundary: historical-schema `closingSpreadHome` is positive when the home team is favored. Provider-native individual quotes remain available in `currentOdds.homeSpreads`, while `currentOdds.consensusSpreadHome` and snapshot `closingSpreadHome` use the repository convention.
- Added regression coverage for home-favorite and home-underdog quotes.
- Added `data/current/` to `.gitignore` and documented timestamped snapshots as local-only artifacts. The gatherer test confirms the output location is ignored.
- Redacted literal and URL/form-encoded credential echoes, including keys with special characters, before provider responses can be serialized to captures. Request failures remain generic and do not expose provider error details or request URLs.
- Kept The Odds API limited to current U.S. NFL spreads; feature inputs still use only prior final games and do not include target postgame information.

## Verification

- Focused: `node --test test/odds-api-client.test.js test/gather-pregame.test.js` — 26 passed.
- Full: `npm test` — 102 passed.
