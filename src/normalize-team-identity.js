const { aliasesForRange, findFranchiseAlias } = require('./franchise-aliases');

const REQUIRED_IDENTITY_FIELDS = [
  'season', 'team', 'nfl_team_id', 'full', 'location', 'nickname', 'conference', 'division',
  'team_color', 'team_color2', 'team_logo_espn', 'team_logo_wikipedia',
];

function buildTeamIdentity({ teamRows, startSeason, endSeason, sourceUrl, sourceUrls, retrievedAt }) {
  if (!Array.isArray(teamRows)) {
    throw new Error('teamRows are required to build team identity');
  }

  const acceptedRows = [];
  const rejected = [];
  const seenKeys = new Set();

  for (const row of teamRows) {
    const normalizedRow = normalizeRow(row);
    const key = `${normalizedRow.season ?? 'unknown'}:${normalizedRow.teamAlias ?? 'unknown'}`;

    if (hasMissingRequiredField(row)) {
      rejected.push(rejection('missing_identity_field', normalizedRow, row));
      continue;
    }

    if (normalizedRow.season === undefined) {
      rejected.push(rejection('invalid_identity_season', normalizedRow, row));
      continue;
    }

    if (normalizedRow.season < startSeason || normalizedRow.season > endSeason) {
      continue;
    }

    const resolved = findFranchiseAlias(normalizedRow.teamAlias, normalizedRow.season);
    if (!resolved) {
      rejected.push(rejection('unknown_team_alias', normalizedRow, row));
      continue;
    }

    if (normalizedRow.nflTeamId !== resolved.franchiseDefinition.nflTeamId) {
      rejected.push(rejection('nfl_team_id_conflict', normalizedRow, row, {
        expectedNflTeamId: resolved.franchiseDefinition.nflTeamId,
      }));
      continue;
    }

    if (seenKeys.has(key)) {
      rejected.push(rejection('duplicate_team_identity', normalizedRow, row));
      continue;
    }

    seenKeys.add(key);
    acceptedRows.push({ ...normalizedRow, row, franchiseDefinition: resolved.franchiseDefinition });
  }

  const accepted = buildAcceptedIdentities({ acceptedRows, startSeason, endSeason, sourceUrl, sourceUrls, retrievedAt });
  const lookup = buildLookup(acceptedRows);

  return { accepted, rejected, lookup };
}

function normalizeRow(row = {}) {
  return {
    season: toInteger(row.season),
    teamAlias: typeof row.team === 'string' ? row.team.trim() : row.team,
    nflTeamId: row.nfl_team_id == null ? row.nfl_team_id : String(row.nfl_team_id),
    full: row.full,
    location: row.location,
    nickname: row.nickname,
    conference: row.conference,
    division: row.division,
    teamColor: row.team_color,
    teamColor2: row.team_color2,
    teamLogoEspn: row.team_logo_espn,
    teamLogoWikipedia: row.team_logo_wikipedia,
  };
}

function hasMissingRequiredField(row = {}) {
  return REQUIRED_IDENTITY_FIELDS.some((field) => row[field] == null || String(row[field]).trim() === '');
}

function toInteger(value) {
  if (!/^\d+$/.test(String(value))) {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : undefined;
}

function rejection(reason, normalizedRow, row, extras = {}) {
  return {
    reason,
    season: normalizedRow.season,
    teamAlias: normalizedRow.teamAlias,
    nflTeamId: normalizedRow.nflTeamId,
    raw: row,
    ...extras,
  };
}

function buildAcceptedIdentities({ acceptedRows, startSeason, endSeason, sourceUrl, sourceUrls, retrievedAt }) {
  const rowsByFranchise = new Map();

  for (const acceptedRow of acceptedRows) {
    const { franchiseId } = acceptedRow.franchiseDefinition;
    if (!rowsByFranchise.has(franchiseId)) {
      rowsByFranchise.set(franchiseId, []);
    }
    rowsByFranchise.get(franchiseId).push(acceptedRow);
  }

  return Array.from(rowsByFranchise.values())
    .map((franchiseRows) => {
      const sortedRows = [...franchiseRows].sort((left, right) => left.season - right.season);
      const currentRow = sortedRows[sortedRows.length - 1];
      const { franchiseDefinition } = currentRow;

      return {
        franchiseId: franchiseDefinition.franchiseId,
        nflTeamId: franchiseDefinition.nflTeamId,
        current: currentMetadata(currentRow),
        aliases: aliasesForRange(franchiseDefinition, startSeason, endSeason),
        seasons: sortedRows.map((row) => seasonalMetadata(row)),
        source: { sourceUrl, sourceUrls: sourceUrls || (sourceUrl ? [sourceUrl] : []), retrievedAt },
      };
    })
    .sort((left, right) => left.franchiseId.localeCompare(right.franchiseId));
}

function currentMetadata(row) {
  return {
    season: row.season,
    teamAlias: row.teamAlias,
    full: row.full,
    location: row.location,
    nickname: row.nickname,
    conference: row.conference,
    division: row.division,
    teamColor: row.teamColor,
    teamColor2: row.teamColor2,
    teamLogoEspn: row.teamLogoEspn,
    teamLogoWikipedia: row.teamLogoWikipedia,
  };
}

function seasonalMetadata(row) {
  return {
    season: row.season,
    teamAlias: row.teamAlias,
    full: row.full,
    location: row.location,
    nickname: row.nickname,
    conference: row.conference,
    division: row.division,
    teamColor: row.teamColor,
    teamColor2: row.teamColor2,
    teamLogoEspn: row.teamLogoEspn,
    teamLogoWikipedia: row.teamLogoWikipedia,
    raw: row.row,
  };
}

function buildLookup(acceptedRows) {
  const lookup = new Map();

  for (const row of acceptedRows) {
    lookup.set(`${row.season}:${row.teamAlias}`, {
      franchiseId: row.franchiseDefinition.franchiseId,
      teamAlias: row.teamAlias,
      season: row.season,
    });
  }

  return lookup;
}

module.exports = { buildTeamIdentity };
