const { parse } = require('csv-parse/sync');

const NFLVERSE_TEAMS_URL = 'https://raw.githubusercontent.com/nflverse/nfldata/master/data/teams.csv';
const NFLVERSE_TEAM_BRANDING_URL = 'https://github.com/nflverse/nflverse-data/releases/download/teams/teams_colors_logos.csv';
const NFLVERSE_TEAM_STATS_URL_PREFIX = 'https://github.com/nflverse/nflverse-data/releases/download/stats_team/stats_team_week_';
const TEAM_METADATA_REQUIRED_COLUMNS = ['season', 'team', 'nfl_team_id', 'full', 'location', 'nickname'];
const TEAM_BRANDING_REQUIRED_COLUMNS = [
  'team_abbr', 'team_id', 'team_conf', 'team_division', 'team_color', 'team_color2',
  'team_logo_espn', 'team_logo_wikipedia',
];
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
  const [teams, branding] = await Promise.all([
    downloadCsv({
      fetchImpl,
      requiredColumns: TEAM_METADATA_REQUIRED_COLUMNS,
      sourceName: 'nflverse team metadata',
      sourceUrl: NFLVERSE_TEAMS_URL,
    }),
    downloadCsv({
      fetchImpl,
      requiredColumns: TEAM_BRANDING_REQUIRED_COLUMNS,
      sourceName: 'nflverse team branding',
      sourceUrl: NFLVERSE_TEAM_BRANDING_URL,
    }),
  ]);

  return {
    ...teams,
    rows: enrichTeamMetadata(teams.rows, branding.rows),
    sourceUrls: [teams.sourceUrl, branding.sourceUrl],
    enrichmentSourceUrl: branding.sourceUrl,
    rawSources: [
      { name: 'teams', ...teams },
      { name: 'teams_colors_logos', ...branding },
    ],
  };
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

function enrichTeamMetadata(teamRows, brandingRows) {
  const brandingByTeamAlias = new Map();
  for (const row of brandingRows) {
    const key = teamAliasKey(row.team_id, row.team_abbr);
    if (!key || brandingByTeamAlias.has(key)) {
      throw new Error('nflverse team branding CSV contains invalid or duplicate team IDs and aliases');
    }
    brandingByTeamAlias.set(key, row);
  }

  return teamRows.map((row) => {
    const branding = brandingByTeamAlias.get(teamAliasKey(row.nfl_team_id, row.team));
    if (!branding || [
      branding.team_conf, branding.team_division, branding.team_color, branding.team_color2,
      branding.team_logo_espn, branding.team_logo_wikipedia,
    ].some((value) => value == null || String(value).trim() === '')) {
      throw new Error(`nflverse team branding CSV is missing metadata for franchise ${row.nfl_team_id}`);
    }
    return {
      ...row,
      conference: branding.team_conf,
      division: branding.team_division,
      team_color: branding.team_color,
      team_color2: branding.team_color2,
      team_logo_espn: branding.team_logo_espn,
      team_logo_wikipedia: branding.team_logo_wikipedia,
    };
  });
}

function normalizeTeamId(value) {
  const id = String(value ?? '').trim();
  if (!/^\d+$/.test(id)) return id;
  return String(Number(id));
}

function teamAliasKey(teamId, teamAlias) {
  const id = normalizeTeamId(teamId);
  const alias = String(teamAlias ?? '').trim().toUpperCase();
  return id && alias ? `${id}:${alias}` : null;
}

module.exports = { downloadNflverseTeams, downloadNflverseWeeklyTeamStats };
