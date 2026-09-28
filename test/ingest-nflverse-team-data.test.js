const assert = require('node:assert/strict');
const { mkdtemp, mkdir, readFile, writeFile } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { runNflverseTeamIngestion, runCli } = require('../src/ingest-nflverse-team-data');

const retrievedAt = '2026-09-26T12:34:56.000Z';
const sourceUrl = 'https://example.test/stats.csv';

function identityRow(season, team, id) {
  return { season: String(season), team, nfl_team_id: id, full: team, location: team,
    nickname: team, conference: 'NFC', division: 'East', team_color: '#000000', team_color2: '#FFFFFF',
    team_logo_espn: `https://example.test/${team}.png`, team_logo_wikipedia: `https://example.test/${team}.svg` };
}

function stat(season, team, opponent) {
  return { season: String(season), week: '1', team, opponent_team: opponent,
    season_type: 'REG', game_id: `${season}_01_DAL_PHI`, attempts: '20', carries: '10',
    passing_yards: '200', rushing_yards: '50', passing_epa: '2', rushing_epa: '1',
    sacks_suffered: '1', sack_yards_lost: '5', interceptions: '0', lost_fumbles: '0' };
}

function statForGame(season, team, opponent, gameId, week) {
  return { ...stat(season, team, opponent), game_id: gameId, week: String(week) };
}

function marketGame(season, awayTeam = 'DAL', homeTeam = 'PHI') {
  return { gameId: `${season}_01_${awayTeam}_${homeTeam}`, season, week: 1, gameType: 'REG',
    kickoff: { date: `${season}-09-10`, time: '17:00' }, awayTeam, homeTeam,
    awayScore: 20, homeScore: 24, closingSpreadHome: 3.5 };
}

async function setup() {
  const outputRoot = await mkdtemp(path.join(tmpdir(), 'nflverse-team-ingest-'));
  const directory = path.join(outputRoot, 'data', 'normalized', 'nfl');
  await mkdir(directory, { recursive: true });
  const prefix = 'nflverse-lines-2005-2025';
  const acceptedPath = path.join(directory, `${prefix}.accepted.jsonl`);
  const rejectedPath = path.join(directory, `${prefix}.rejected.jsonl`);
  await writeFile(acceptedPath, [2005, 2010, 2015, 2020, 2025].map((year) => JSON.stringify(marketGame(year))).join('\n') + '\n');
  const rejectedMarket = marketGame(2025);
  rejectedMarket.gameId = '2025_02_DAL_PHI';
  rejectedMarket.week = 2;
  delete rejectedMarket.closingSpreadHome;
  await writeFile(rejectedPath, `${JSON.stringify(rejectedMarket)}\n`);
  const manifestPath = path.join(directory, `${prefix}.current.json`);
  await writeFile(manifestPath, JSON.stringify({ accepted: path.basename(acceptedPath), rejected: path.basename(rejectedPath) }));
  const requestedPrefix = 'nflverse-lines-2010-2020';
  const requestedAccepted = path.join(directory, `${requestedPrefix}.accepted.jsonl`);
  const requestedRejected = path.join(directory, `${requestedPrefix}.rejected.jsonl`);
  await writeFile(requestedAccepted, Array.from({ length: 11 }, (_, index) => JSON.stringify(marketGame(2010 + index))).join('\n') + '\n');
  await writeFile(requestedRejected, '');
  await writeFile(path.join(directory, `${requestedPrefix}.current.json`), JSON.stringify({ accepted: path.basename(requestedAccepted), rejected: path.basename(requestedRejected) }));
  const teamRows = [];
  for (let year = 2005; year <= 2025; year++) teamRows.push(identityRow(year, 'DAL', '1200'), identityRow(year, 'PHI', '3700'));
  const statsBySeason = Array.from({ length: 21 }, (_, index) => 2005 + index).map((year) => ({ season: year, csv: `stats-${year}\n`, rows: [stat(year, 'DAL', 'PHI'), stat(year, 'PHI', 'DAL'), ...(year === 2025 ? [statForGame(year, 'DAL', 'PHI', '2025_02_DAL_PHI', 2), statForGame(year, 'PHI', 'DAL', '2025_02_DAL_PHI', 2)] : [])], sourceUrl, retrievedAt }));
  const calls = { teams: 0, stats: [], market: 0 };
  const client = {
    async downloadNflverseTeams() { calls.teams++; return { rows: teamRows, csv: 'teams\n', sourceUrl: 'https://example.test/teams.csv', sourceUrls: ['https://example.test/teams.csv', 'https://example.test/branding.csv'], rawSources: [{ name: 'teams', csv: 'teams\n' }, { name: 'teams_colors_logos', csv: 'branding\n' }], retrievedAt }; },
    async downloadNflverseWeeklyTeamStats({ seasons }) { calls.stats.push(...seasons); return statsBySeason.filter((entry) => seasons.includes(entry.season)); },
  };
  return { outputRoot, directory, manifestPath, client, calls };
}

test('downloads sources once, filters inclusively, and atomically publishes four accepted/rejected pairs', async () => {
  const context = await setup();
  const result = await runNflverseTeamIngestion({ startSeason: 2010, endSeason: 2020, outputRoot: context.outputRoot, client: context.client });

  assert.deepEqual(context.calls, { teams: 1, stats: Array.from({ length: 11 }, (_, index) => 2010 + index), market: 0 });
  assert.deepEqual(Object.keys(result), ['identity', 'postgame', 'pregame', 'matchup']);
  for (const [key, prefix] of Object.entries({ identity: 'nflverse-team-identity-2010-2020', postgame: 'nflverse-team-postgame-2010-2020', pregame: 'nflverse-team-pregame-2010-2020', matchup: 'nflverse-team-matchups-2010-2020' })) {
    const summary = result[key];
    assert.equal(summary.accepted, key === 'identity' ? 2 : key === 'postgame' ? 22 : key === 'pregame' ? 22 : 11);
    assert.equal(summary.rejected, 0);
    assert.equal(path.basename(summary.manifestPath), `${prefix}.current.json`);
    assert.match(await readFile(summary.acceptedPath, 'utf8'), /\n$/);
    assert.equal(await readFile(summary.rejectedPath, 'utf8'), '');
    assert.equal(JSON.parse(await readFile(summary.manifestPath, 'utf8')).accepted, path.relative(context.directory, summary.acceptedPath));
    assert.equal(summary.rawPaths.length, key === 'identity' ? 2 : 11);
  }
  const postgameRows = (await readFile(result.postgame.acceptedPath, 'utf8')).trim().split('\n').map(JSON.parse);
  assert.equal(typeof postgameRows[0].sourceUrl, 'string');
});

test('validation processes exactly the five sample seasons from one market manifest', async () => {
  const context = await setup();
  const logs = [];
  const summaries = await runCli(['validate', '--output-root', context.outputRoot], { log: (line) => logs.push(line) }, context.client);

  assert.deepEqual(logs.map((line) => Number(line.match(/^season=(\d+)/)[1])), [2005, 2010, 2015, 2020, 2025]);
  assert.equal(summaries.length, 5);
  assert.equal(context.calls.teams, 1);
  assert.deepEqual(context.calls.stats, [2005, 2010, 2015, 2020, 2025]);
  assert.equal(new Set(summaries.flatMap((summary) => Object.values(summary).flatMap((dataset) => dataset.rawPaths))).size, 7);
  assert.deepEqual(await Promise.all(summaries[0].identity.rawPaths.map((rawPath) => readFile(rawPath, 'utf8'))), ['teams\n', 'branding\n']);
  const finalMatchups = (await readFile(summaries[4].matchup.acceptedPath, 'utf8')).trim().split('\n').filter(Boolean).map(JSON.parse);
  assert.deepEqual(finalMatchups.map((row) => row.gameId), ['2025_01_DAL_PHI']);
  assert.deepEqual(finalMatchups.map(({ homeScore, awayScore }) => ({ homeScore, awayScore })), [
    { homeScore: 24, awayScore: 20 },
  ]);
});

for (const failure of ['write', 'publish']) {
  test(`a ${failure} failure does not replace any previously published pair`, async () => {
    const context = await setup();
    const original = await runNflverseTeamIngestion({ startSeason: 2010, endSeason: 2020, outputRoot: context.outputRoot, client: context.client });
    const pointers = Object.fromEntries(Object.entries(original).map(([key, summary]) => [key, readFile(summary.manifestPath, 'utf8')]));
    const fs = require('node:fs/promises');
    const fileSystem = {
      ...fs,
      async writeFile(file, contents, options) {
        if (failure === 'write' && String(file).endsWith('.rejected.jsonl')) throw new Error('injected write failure');
        return fs.writeFile(file, contents, options);
      },
      async rename(from, to) {
        if (failure === 'publish' && String(to).endsWith('.current.json')) throw new Error('injected publish failure');
        return fs.rename(from, to);
      },
    };
    await assert.rejects(runNflverseTeamIngestion({ startSeason: 2010, endSeason: 2020, outputRoot: context.outputRoot, client: context.client, fileSystem }), /injected/);
    for (const summary of Object.values(original)) assert.equal(await readFile(summary.manifestPath, 'utf8'), await pointers[Object.keys(original).find((key) => original[key] === summary)]);
  });
}
