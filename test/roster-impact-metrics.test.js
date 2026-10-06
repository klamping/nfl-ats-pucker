const test = require('node:test');
const assert = require('node:assert/strict');
const { summarizeComparison } = require('../src/roster-impact-metrics');

const row = (id, week, attempts, epa) => ({ player_id: id, season: '2026', week: String(week), season_type: 'REG', attempts: String(attempts), sacks: '0', passing_epa: String(epa) });
const season = { season: 2026, kickoffsByTeamWeek: { 'ARI:2026:1': '2026-09-01T00:00:00Z', 'ARI:2026:2': '2026-09-08T00:00:00Z', 'ARI:2026:3': '2026-09-15T00:00:00Z' }, playerStats: [row('out', 1, 10, 2), row('out', 2, 10, 4), row('in', 1, 10, 1), row('in', 2, 10, 2)] };
test('compares QB EPA per dropback using only pre-kickoff games', () => {
  const result = summarizeComparison({ unavailablePlayer: { player_id: 'out' }, replacementPlayer: { player_id: 'in' }, position: 'QB', team: 'ARI', targetSeason: 2026, kickoff: '2026-09-10T00:00:00Z', seasons: [season] });
  assert.equal(result.evidenceType, 'direct');
  assert.deepEqual(result.metrics[0], { key: 'passingEpaPerDropback', label: 'Passing EPA / dropback', unavailableValue: 0.3, replacementValue: 0.15, delta: 0.15, direction: 'higher', unavailableSample: 20, replacementSample: 20 });
});
