const { parse } = require('csv-parse/sync');

const NFLVERSE_TEAMS_URL = 'https://raw.githubusercontent.com/nflverse/nfldata/master/data/teams.csv';
const NFLVERSE_TEAM_STATS_URL_PREFIX = 'https://github.com/nflverse/nflverse-data/releases/download/stats_team/stats_team_week_';
const TEAM_METADATA_REQUIRED_COLUMNS = ['season', 'team', 'nfl_team_id', 'full', 'location', 'nickname'];
const WEEKLY_TEAM_STATS_REQUIRED_COLUMNS = [
  'season',
  'week',
  'team',
  'season_type',
  'game_id',
  'opponent_team',
  'attempts',
  'carries',
  'passing_yards',
  'rushing_yards',
  'passing_epa',
  'rushing_epa',
  'sacks_suffered',
];

async function downloadNflverseTeams(fetchImpl = globalThis.fetch) {
  return downloadCsv({
    fetchImpl,
    requiredColumns: TEAM_METADATA_REQUIRED_COLUMNS,
    sourceName: 'nflverse team metadata',
    sourceUrl: NFLVERSE_TEAMS_URL,
  });
}

async function downloadNflverseWeeklyTeamStats({ seasons, fetchImpl = globalThis.fetch } = {}) {
  if (!Array.isArray(seasons)) {
    throw new Error('nflverse weekly team stats seasons are required');
  }

  const results = [];
  for (const season of seasons) {
    const sourceUrl = `${NFLVERSE_TEAM_STATS_URL_PREFIX}${season}.csv`;
    const result = await downloadCsv({
      fetchImpl,
      requiredColumns: WEEKLY_TEAM_STATS_REQUIRED_COLUMNS,
      sourceName: 'nflverse weekly team stats',
      sourceUrl,
    });
    results.push({ season, ...result });
  }
  return results;
}

async function downloadCsv({ fetchImpl, requiredColumns, sourceName, sourceUrl }) {
  if (typeof fetchImpl !== 'function') {
    throw new Error('A fetch implementation is required');
  }

  const response = await fetchImpl(sourceUrl, {
    headers: {
      accept: 'text/csv',
    },
  });

  if (!response.ok) {
    throw new Error(`${sourceName} download failed with status ${response.status}`);
  }

  const csv = await response.text();
  const rows = parseRows(csv, sourceName);
  assertRequiredColumns(rows, requiredColumns, sourceName);

  return {
    csv,
    rows,
    sourceUrl,
    retrievedAt: new Date().toISOString(),
  };
}

function parseRows(csv, sourceName) {
  try {
    return parse(csv, {
      columns: true,
      skip_empty_lines: true,
    });
  } catch (error) {
    throw new Error(`${sourceName} CSV could not be parsed`);
  }
}

function assertRequiredColumns(rows, requiredColumns, sourceName) {
  if (rows.length === 0 || requiredColumns.some((column) => !Object.hasOwn(rows[0], column))) {
    throw new Error(`${sourceName} CSV is missing required columns or rows`);
  }
}

module.exports = { downloadNflverseTeams, downloadNflverseWeeklyTeamStats };
