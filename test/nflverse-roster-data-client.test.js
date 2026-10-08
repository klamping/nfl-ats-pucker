const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { createNflverseRosterDataClient } = require('../src/nflverse-roster-data-client');

const playerStats = `player_id,player_display_name,position,team,season,week,season_type,opponent_team,attempts,sacks_suffered,passing_epa,carries,rushing_epa,targets,receiving_epa\np1,Quarterback,QB,ARI,2026,1,REG,BUF,20,1,4,0,0,0,0\n`;
const snapCounts = `game_id,season,game_type,week,player,position,team,opponent,offense_snaps,defense_snaps\n2026_01_ARI_BUF,2026,REG,1,Quarterback,QB,ARI,BUF,60,0\n`;
const teamStats = `season,week,team,season_type,game_id,opponent_team,attempts,carries,passing_epa,rushing_epa,sacks_suffered\n2026,1,ARI,REG,2026_01_ARI_BUF,BUF,20,25,4,1,1\n`;
const rows = [{ game_id: '2026_01_ARI_BUF', season: '2026', week: '1', game_type: 'REG', gameday: '2026-09-10', gametime: '20:20', away_team: 'ARI', home_team: 'BUF' }];

async function root(t) { const value = await fs.mkdtemp('/tmp/opencode/roster-data-'); t.after(() => fs.rm(value, { recursive: true, force: true })); return value; }
function fetchFor(csv = {}) { return async (url) => csv[url] ? { ok: true, text: async () => csv[url] } : { ok: false, status: 404, text: async () => '' }; }

test('publishes validated season data with a team-week kickoff index and immutable raw captures', async (t) => {
  const outputRoot = await root(t);
  const base = 'https://github.com/nflverse/nflverse-data/releases/download';
  const client = createNflverseRosterDataClient({ now: () => new Date('2026-09-12T12:00:00Z'), fetchImpl: fetchFor({
    [`${base}/stats_player/stats_player_week_2026.csv`]: playerStats,
    [`${base}/snap_counts/snap_counts_2026.csv`]: snapCounts,
    [`${base}/stats_team/stats_team_week_2026.csv`]: teamStats,
  }) });
  const result = await client.loadSeasons({ seasons: [2026], scheduleRows: rows, outputRoot });
  assert.equal(result.seasons[0].playerStats[0].player_id, 'p1');
  assert.equal(result.seasons[0].kickoffsByTeamWeek['ARI:2026:1'], '2026-09-11T00:20:00.000Z');
  assert.equal((await fs.readdir(path.join(outputRoot, 'data/raw/nflverse/roster-impact'))).length, 3);
  const manifest = JSON.parse(await fs.readFile(path.join(outputRoot, 'data/current/roster-impact/nflverse-roster-data-2026-2026.current.json'), 'utf8'));
  assert.equal(manifest.seasons[0].season, 2026);
});

test('rejects malformed data before writing raw captures or a manifest', async (t) => {
  const outputRoot = await root(t);
  const base = 'https://github.com/nflverse/nflverse-data/releases/download';
  const client = createNflverseRosterDataClient({ fetchImpl: fetchFor({
    [`${base}/stats_player/stats_player_week_2026.csv`]: 'player_id\nmissing\n',
    [`${base}/snap_counts/snap_counts_2026.csv`]: snapCounts,
    [`${base}/stats_team/stats_team_week_2026.csv`]: teamStats,
  }), now: () => new Date('2026-09-12T12:00:00Z') });
  await assert.rejects(client.loadSeasons({ seasons: [2026], scheduleRows: rows, outputRoot }), /missing required/i);
  await assert.rejects(fs.access(path.join(outputRoot, 'data/current/roster-impact/nflverse-roster-data-2026-2026.current.json')));
});
