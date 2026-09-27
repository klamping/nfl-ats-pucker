const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const { downloadNflverseTeams, downloadNflverseWeeklyTeamStats } = require('../src/nflverse-team-client');

const teamsUrl = 'https://raw.githubusercontent.com/nflverse/nfldata/master/data/teams.csv';
const statsUrl2005 = 'https://github.com/nflverse/nflverse-data/releases/download/stats_team/stats_team_week_2005.csv';
const teamsCsv = readFileSync(path.join(__dirname, 'fixtures', 'nflverse-teams.csv'), 'utf8');
const teamStatsCsv = readFileSync(path.join(__dirname, 'fixtures', 'nflverse-team-stats-2005.csv'), 'utf8');

function getHeader(headers, name) {
  return Object.entries(headers || {}).find(([key]) => key.toLowerCase() === name.toLowerCase())?.[1];
}

function assertPublicCsvRequest(options) {
  assert.equal(getHeader(options.headers, 'accept'), 'text/csv');
  assert.equal(getHeader(options.headers, 'authorization'), undefined);
  assert.equal(getHeader(options.headers, 'x-api-key'), undefined);
}

test('downloads nflverse teams metadata CSV without authentication and returns parsed rows with source metadata', async () => {
  const previousKey = process.env.sportsgameodds;
  process.env.sportsgameodds = 'must-not-be-sent';
  let capturedUrl;
  let capturedOptions;

  try {
    const result = await downloadNflverseTeams(async (url, options) => {
      capturedUrl = url;
      capturedOptions = options;
      return {
        ok: true,
        status: 200,
        text: async () => teamsCsv,
      };
    });

    assert.equal(capturedUrl, teamsUrl);
    assertPublicCsvRequest(capturedOptions);
    assert.equal(result.csv, teamsCsv);
    assert.equal(result.sourceUrl, teamsUrl);
    assert.match(result.retrievedAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    assert.deepEqual(result.rows, [
      {
        season: '2025',
        team: 'ARI',
        nfl_team_id: '3800',
        full: 'Arizona Cardinals',
        location: 'Arizona',
        nickname: 'Cardinals',
        conference: 'NFC',
        division: 'NFC West',
        team_color: '#97233F',
        team_color2: '#000000',
        team_logo_espn: 'https://a.espncdn.com/i/teamlogos/nfl/500/ari.png',
      },
      {
        season: '2025',
        team: 'LA',
        nfl_team_id: '2510',
        full: 'Los Angeles Rams',
        location: 'Los Angeles',
        nickname: 'Rams',
        conference: 'NFC',
        division: 'NFC West',
        team_color: '#003594',
        team_color2: '#FFA300',
        team_logo_espn: 'https://a.espncdn.com/i/teamlogos/nfl/500/lar.png',
      },
    ]);
  } finally {
    if (previousKey === undefined) {
      delete process.env.sportsgameodds;
    } else {
      process.env.sportsgameodds = previousKey;
    }
  }
});

test('downloads nflverse weekly team stats for each requested season without authentication and returns source metadata', async () => {
  let capturedUrl;
  let capturedOptions;

  const result = await downloadNflverseWeeklyTeamStats({
    seasons: [2005],
    fetchImpl: async (url, options) => {
      capturedUrl = url;
      capturedOptions = options;
      return {
        ok: true,
        status: 200,
        text: async () => teamStatsCsv,
      };
    },
  });

  assert.equal(capturedUrl, statsUrl2005);
  assertPublicCsvRequest(capturedOptions);
  assert.equal(result.length, 1);
  assert.equal(result[0].season, 2005);
  assert.equal(result[0].csv, teamStatsCsv);
  assert.equal(result[0].sourceUrl, statsUrl2005);
  assert.match(result[0].retrievedAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  assert.deepEqual(result[0].rows, [
    {
      season: '2005',
      week: '1',
      team: 'ARI',
      season_type: 'REG',
      game_id: '2005_01_ARI_NYG',
      opponent_team: 'NYG',
      attempts: '34',
      carries: '23',
      passing_yards: '201',
      rushing_yards: '86',
      passing_epa: '-3.42',
      rushing_epa: '-1.25',
      sacks_suffered: '2',
      completions: '19',
      passing_tds: '1',
      rushing_tds: '0',
      interceptions: '1',
      lost_fumbles: '1',
    },
    {
      season: '2005',
      week: '1',
      team: 'NYG',
      season_type: 'REG',
      game_id: '2005_01_ARI_NYG',
      opponent_team: 'ARI',
      attempts: '28',
      carries: '31',
      passing_yards: '249',
      rushing_yards: '132',
      passing_epa: '6.18',
      rushing_epa: '4.73',
      sacks_suffered: '1',
      completions: '20',
      passing_tds: '2',
      rushing_tds: '1',
      interceptions: '0',
      lost_fumbles: '0',
    },
  ]);
});

test('rejects non-success weekly team-stat responses before reading CSV rows', async () => {
  let textCalled = false;

  await assert.rejects(
    downloadNflverseWeeklyTeamStats({
      seasons: [2005],
      fetchImpl: async () => ({
        ok: false,
        status: 503,
        text: async () => {
          textCalled = true;
          return teamStatsCsv;
        },
      }),
    }),
    /nflverse.*team.*503/i,
  );
  assert.equal(textCalled, false);
});

test('rejects teams metadata CSV missing required columns before returning rows', async () => {
  await assert.rejects(
    downloadNflverseTeams(async () => ({
      ok: true,
      status: 200,
      text: async () => 'season,team,full\n2025,ARI,Arizona Cardinals\n',
    })),
    /nflverse.*team.*(csv|column)/i,
  );
});

test('rejects schedule-shaped weekly team-stat CSV before returning rows', async () => {
  await assert.rejects(
    downloadNflverseWeeklyTeamStats({
      seasons: [2005],
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        text: async () => 'game_id,season,week,game_type,away_team,home_team\n2005_01_ARI_NYG,2005,1,REG,ARI,NYG\n',
      }),
    }),
    /nflverse.*team.*(csv|column)/i,
  );
});
