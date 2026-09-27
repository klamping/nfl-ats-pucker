const { findFranchiseAliasAnySeason } = require('./franchise-aliases');

function normalizeTeamPostgame({ marketGames, weeklyStats, franchiseLookup, sourceMetadata = {} }) {
  if (!Array.isArray(marketGames) || !Array.isArray(weeklyStats) || !(franchiseLookup instanceof Map)) {
    throw new Error('marketGames, weeklyStats, and franchiseLookup are required');
  }

  const accepted = [];
  const rejected = [];
  const gamesById = groupByGameId(marketGames, 'gameId');
  const statsById = groupByGameId(weeklyStats, 'game_id');

  for (const [gameId, games] of gamesById) {
    const game = games[0];
    const rows = (statsById.get(gameId) || []).map((row) => normalizeStatsAliases(row, game.season, franchiseLookup));
    const reason = validatePair(games, rows, franchiseLookup);
    if (reason) {
      rejected.push({ gameId, reason, season: game.season, week: game.week });
      continue;
    }

    const awayRow = rows.find((row) => row.team === game.awayTeam);
    const homeRow = rows.find((row) => row.team === game.homeTeam);
    const awayIdentity = franchiseLookup.get(`${game.season}:${game.awayTeam}`);
    const homeIdentity = franchiseLookup.get(`${game.season}:${game.homeTeam}`);

    accepted.push(buildPostgame(game, awayRow, homeRow, awayIdentity, homeIdentity, sourceMetadata, true));
    accepted.push(buildPostgame(game, homeRow, awayRow, homeIdentity, awayIdentity, sourceMetadata, false));
  }

  for (const gameId of statsById.keys()) {
    if (!gamesById.has(gameId)) {
      rejected.push({ gameId, reason: 'missing_market_game' });
    }
  }

  return { accepted, rejected };
}

function groupByGameId(records, field) {
  const grouped = new Map();
  for (const record of records) {
    const gameId = record?.[field];
    if (!grouped.has(gameId)) grouped.set(gameId, []);
    grouped.get(gameId).push(record);
  }
  return grouped;
}

function normalizeStatsAliases(row, season, franchiseLookup) {
  return {
    ...row,
    team: seasonalTeamAlias(row.team, season, franchiseLookup) || row.team,
    opponent_team: seasonalTeamAlias(row.opponent_team, season, franchiseLookup) || row.opponent_team,
    sourceTeamAlias: row.team,
    sourceOpponentAlias: row.opponent_team,
    sourceRawStats: row,
  };
}

function seasonalTeamAlias(alias, season, franchiseLookup) {
  const historical = findFranchiseAliasAnySeason(alias);
  if (!historical) return null;
  for (const identity of franchiseLookup.values()) {
    if (identity.season === season && identity.franchiseId === historical.franchiseDefinition.franchiseId) {
      return identity.teamAlias;
    }
  }
  return null;
}

function validatePair(games, rows, franchiseLookup) {
  if (games.length !== 1) return 'duplicate_market_game';

  const game = games[0];
  if (game.gameType !== 'REG' && game.gameType !== 'POST') return 'unsupported_game_type';
  if (number(game.awayScore) === null || number(game.homeScore) === null) return 'missing_score';
  if (rows.length !== 2) {
    return rows.length > 2 ? 'duplicate_team_row' : 'incomplete_team_pair';
  }
  if (rows.some((row) => row?.season_type !== 'REG' && row?.season_type !== 'POST')) {
    return 'unsupported_season_type';
  }
  if (rows.some((row) => row.season_type !== game.gameType)) return 'game_type_mismatch';
  if (rows.some((row) => number(row.season) !== game.season || number(row.week) !== game.week)) {
    return 'game_metadata_mismatch';
  }
  if (game.awayTeam === game.homeTeam ||
      rows.some((row) => row.team !== game.awayTeam && row.team !== game.homeTeam)) {
    return 'team_mismatch';
  }
  if (rows[0].team === rows[1].team) return 'duplicate_team_row';
  if (rows.some((row) => row.opponent_team !== (row.team === game.awayTeam ? game.homeTeam : game.awayTeam))) {
    return 'opponent_mismatch';
  }
  if (!franchiseLookup.get(`${game.season}:${game.awayTeam}`)?.franchiseId ||
      !franchiseLookup.get(`${game.season}:${game.homeTeam}`)?.franchiseId) {
    return 'unknown_team_alias';
  }
  return null;
}

function buildPostgame(game, row, opponentRow, identity, opponentIdentity, sourceMetadata, isAway) {
  const pointsFor = number(isAway ? game.awayScore : game.homeScore);
  const pointsAgainst = number(isAway ? game.homeScore : game.awayScore);
  const ownTurnovers = total(row.interceptions, row.lost_fumbles);
  const opponentTurnovers = total(opponentRow.interceptions, opponentRow.lost_fumbles);

  return {
    gameId: game.gameId,
    season: game.season,
    week: game.week,
    gameType: game.gameType,
    kickoff: game.kickoff,
    team: row.team,
    opponent: opponentRow.team,
    franchiseId: identity.franchiseId,
    opponentFranchiseId: opponentIdentity.franchiseId,
    pointsFor,
    pointsAgainst,
    result: pointsFor > pointsAgainst ? 'win' : pointsFor < pointsAgainst ? 'loss' : 'tie',
    offensiveYardsPerPlay: yardsPerPlay(row),
    defensiveYardsPerPlay: yardsPerPlay(opponentRow),
    offensiveEpaPerPlay: epaPerPlay(row),
    defensiveEpaPerPlay: epaPerPlay(opponentRow),
    turnoverMargin: ownTurnovers === null || opponentTurnovers === null
      ? null : opponentTurnovers - ownTurnovers,
    offensiveSackRate: sackRate(row),
    defensiveSackRate: sackRate(opponentRow),
    sourceTeamAlias: row.sourceTeamAlias,
    sourceOpponentAlias: row.sourceOpponentAlias,
    rawStats: { ...(row.sourceRawStats || row) },
    source: 'nflverse',
    sourceUrl: sourceMetadata.sourceUrl,
    retrievedAt: sourceMetadata.retrievedAt,
  };
}

function yardsPerPlay(row) {
  const yards = total(row.passing_yards, row.rushing_yards);
  const sackYards = number(row.sack_yards_lost);
  const plays = total(row.attempts, row.carries, row.sacks_suffered);
  return yards === null || sackYards === null || plays === null || plays <= 0
    ? null : (yards - sackYards) / plays;
}

function epaPerPlay(row) {
  const epa = total(row.passing_epa, row.rushing_epa);
  const plays = total(row.attempts, row.carries, row.sacks_suffered);
  return epa === null || plays === null || plays <= 0 ? null : epa / plays;
}

function sackRate(row) {
  const sacks = number(row.sacks_suffered);
  const attempts = number(row.attempts);
  return sacks === null || attempts === null || sacks + attempts <= 0
    ? null : sacks / (attempts + sacks);
}

function total(...values) {
  const parsed = values.map(number);
  return parsed.includes(null) ? null : parsed.reduce((sum, value) => sum + value, 0);
}

function number(value) {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

module.exports = { normalizeTeamPostgame };
