const test = require('node:test');
const assert = require('node:assert/strict');
const { gatherRosterImpacts } = require('../src/roster-impact-service');

const lineup = { official: { injuries: [{ player: 'Starter QB', position: 'QB', status: 'Out', observedAt: '2026-09-01T00:00:00Z' }, { player: 'Questionable QB', position: 'QB', status: 'Questionable', observedAt: '2026-09-01T00:00:00Z' }] }, depthChart: { slots: [{ player: 'Starter QB', position: 'QB', rank: 1 }, { player: 'Backup QB', position: 'QB', rank: 2 }] } };
const rosterData = [{ season: 2026, playerStats: [{ player_id: 'out', player_display_name: 'Starter QB', recent_team: 'ARI', position: 'QB' }, { player_id: 'in', player_display_name: 'Backup QB', recent_team: 'ARI', position: 'QB' }] }];
test('compares an official Out starter with the next projected depth player', async () => {
  const result = await gatherRosterImpacts({ team: 'ARI', kickoff: '2026-09-10T00:00:00Z', targetSeason: 2026, lineup, rosterData, summarize: () => ({ evidenceType: 'direct', confidence: 'medium', metrics: [{ delta: 0.12 }], teamContext: null, sample: {} }) });
  assert.equal(result.status, 'ready');
  assert.deepEqual(result.playerImpacts[0].replacement, 'Backup QB');
  assert.equal(result.playerImpacts[0].verdict, 'material downgrade');
  assert.equal(result.playerImpacts.length, 1);
});
