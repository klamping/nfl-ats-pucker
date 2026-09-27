const assert = require('node:assert/strict');
const test = require('node:test');

const { buildTeamIdentity } = require('../src/normalize-team-identity');

const sourceUrl = 'https://raw.githubusercontent.com/nflverse/nfldata/master/data/teams.csv';
const retrievedAt = '2026-09-27T00:00:00.000Z';

function teamRow(overrides = {}) {
  return {
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
    ...overrides,
  };
}

function build(teamRows) {
  return buildTeamIdentity({
    teamRows,
    startSeason: 2005,
    endSeason: 2025,
    sourceUrl,
    retrievedAt,
  });
}

test('resolves Rams historical and current aliases to one stable franchise identity', () => {
  const result = build([
    teamRow({
      season: '2015',
      team: 'STL',
      nfl_team_id: '2510',
      full: 'St Louis Rams',
      location: 'St Louis',
      nickname: 'Rams',
    }),
    teamRow(),
  ]);

  assert.deepEqual(result.rejected, []);
  assert.equal(result.accepted.length, 1);

  const rams = result.accepted[0];
  assert.equal(rams.nflTeamId, '2510');
  assert.equal(rams.current.teamAlias, 'LA');
  assert.equal(rams.current.full, 'Los Angeles Rams');
  assert.equal(rams.source.sourceUrl, sourceUrl);
  assert.equal(rams.source.retrievedAt, retrievedAt);
  assert.deepEqual(rams.aliases.filter(({ teamAlias }) => ['STL', 'LA'].includes(teamAlias)), [
    { teamAlias: 'STL', startSeason: 2005, endSeason: 2015 },
    { teamAlias: 'LA', startSeason: 2016, endSeason: 2025 },
  ]);

  assert.equal(result.lookup.get('2015:STL').franchiseId, rams.franchiseId);
  assert.equal(result.lookup.get('2015:STL').teamAlias, 'STL');
  assert.equal(result.lookup.get('2015:STL').season, 2015);
  assert.equal(result.lookup.get('2025:LA').franchiseId, rams.franchiseId);
});

test('resolves Raiders relocation aliases to one stable franchise identity', () => {
  const result = build([
    teamRow({
      season: '2019',
      team: 'OAK',
      nfl_team_id: '2520',
      full: 'Oakland Raiders',
      location: 'Oakland',
      nickname: 'Raiders',
      conference: 'AFC',
      division: 'AFC West',
    }),
    teamRow({
      season: '2025',
      team: 'LV',
      nfl_team_id: '2520',
      full: 'Las Vegas Raiders',
      location: 'Las Vegas',
      nickname: 'Raiders',
      conference: 'AFC',
      division: 'AFC West',
    }),
  ]);

  assert.deepEqual(result.rejected, []);
  assert.equal(result.accepted.length, 1);

  const raiders = result.accepted[0];
  assert.equal(raiders.nflTeamId, '2520');
  assert.equal(raiders.current.teamAlias, 'LV');
  assert.deepEqual(raiders.aliases.filter(({ teamAlias }) => ['OAK', 'LV'].includes(teamAlias)), [
    { teamAlias: 'OAK', startSeason: 2005, endSeason: 2019 },
    { teamAlias: 'LV', startSeason: 2020, endSeason: 2025 },
  ]);
  assert.equal(result.lookup.get('2019:OAK').franchiseId, raiders.franchiseId);
  assert.equal(result.lookup.get('2025:LV').franchiseId, raiders.franchiseId);
});

test('resolves Chargers relocation and Washington rebrand ranges without changing franchise IDs', () => {
  const result = build([
    teamRow({
      season: '2016',
      team: 'SD',
      nfl_team_id: '4400',
      full: 'San Diego Chargers',
      location: 'San Diego',
      nickname: 'Chargers',
      conference: 'AFC',
      division: 'AFC West',
    }),
    teamRow({
      season: '2025',
      team: 'LAC',
      nfl_team_id: '4400',
      full: 'Los Angeles Chargers',
      location: 'Los Angeles Chargers',
      nickname: 'Chargers',
      conference: 'AFC',
      division: 'AFC West',
    }),
    teamRow({
      season: '2019',
      team: 'WAS',
      nfl_team_id: '5110',
      full: 'Washington Redskins',
      location: 'Washington',
      nickname: 'Redskins',
      conference: 'NFC',
      division: 'NFC East',
    }),
    teamRow({
      season: '2020',
      team: 'WAS',
      nfl_team_id: '5110',
      full: 'Washington Football Team',
      location: 'Washington',
      nickname: 'Football Team',
      conference: 'NFC',
      division: 'NFC East',
    }),
    teamRow({
      season: '2025',
      team: 'WAS',
      nfl_team_id: '5110',
      full: 'Washington Commanders',
      location: 'Washington',
      nickname: 'Commanders',
      conference: 'NFC',
      division: 'NFC East',
    }),
  ]);

  assert.deepEqual(result.rejected, []);

  const chargers = result.accepted.find(({ nflTeamId }) => nflTeamId === '4400');
  assert.equal(result.lookup.get('2016:SD').franchiseId, chargers.franchiseId);
  assert.equal(result.lookup.get('2025:LAC').franchiseId, chargers.franchiseId);
  assert.deepEqual(chargers.aliases.filter(({ teamAlias }) => ['SD', 'LAC'].includes(teamAlias)), [
    { teamAlias: 'SD', startSeason: 2005, endSeason: 2016 },
    { teamAlias: 'LAC', startSeason: 2017, endSeason: 2025 },
  ]);

  const washington = result.accepted.find(({ nflTeamId }) => nflTeamId === '5110');
  assert.equal(result.lookup.get('2019:WAS').franchiseId, washington.franchiseId);
  assert.equal(result.lookup.get('2020:WAS').franchiseId, washington.franchiseId);
  assert.equal(result.lookup.get('2025:WAS').franchiseId, washington.franchiseId);
  assert.deepEqual(washington.aliases, [
    { teamAlias: 'WAS', startSeason: 2005, endSeason: 2019 },
    { teamAlias: 'WAS', startSeason: 2020, endSeason: 2021 },
    { teamAlias: 'WAS', startSeason: 2022, endSeason: 2025 },
  ]);
});

test('rejects missing, unknown, duplicate, and conflicting identity rows without guessing a franchise', () => {
  const validRams = teamRow();
  const result = build([
    validRams,
    teamRow({ full: '' }),
    teamRow({ team: 'ABC', nfl_team_id: '9999', full: 'Mystery Team', location: 'Mystery', nickname: 'Team' }),
    teamRow({ team: 'LA', nfl_team_id: '9999' }),
    { ...validRams },
  ]);

  assert.deepEqual(
    result.rejected.map(({ reason }) => reason),
    ['missing_identity_field', 'unknown_team_alias', 'nfl_team_id_conflict', 'duplicate_team_identity'],
  );
  assert.deepEqual(
    result.rejected.map(({ season, teamAlias }) => `${season}:${teamAlias}`),
    ['2025:LA', '2025:ABC', '2025:LA', '2025:LA'],
  );
  assert.equal(result.accepted.length, 1);
  assert.equal(result.accepted[0].nflTeamId, '2510');
  assert.equal(result.lookup.get('2025:ABC'), undefined);
});

test('rejects non-numeric seasons rather than parsing a partial value', () => {
  const result = build([
    teamRow({ season: '2025x' }),
  ]);

  assert.deepEqual(result.rejected.map(({ reason }) => reason), ['invalid_identity_season']);
  assert.equal(result.accepted.length, 0);
  assert.equal(result.lookup.size, 0);
});
