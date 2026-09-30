const SOURCE_ID = 'nflverse';
const POSTSEASON_GAME_TYPES = new Set(['WC', 'DIV', 'CON', 'SB']);

function normalizeNflverseGame(row, metadata = {}) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) {
    return { rejected: buildRejectedGame({}, metadata, 'invalid_row') };
  }

  const extracted = extractGame(row);
  const missingReason = requiredMissingReason(extracted);
  if (missingReason) {
    return { rejected: buildRejectedGame(extracted, metadata, missingReason) };
  }

  if (extracted.gameType !== 'REG' && !POSTSEASON_GAME_TYPES.has(extracted.gameType)) {
    return { rejected: buildRejectedGame(extracted, metadata, 'unsupported_game_type') };
  }

  const accepted = {
    gameId: extracted.gameId,
    season: extracted.season,
    week: extracted.week,
    gameType: extracted.gameType === 'REG' ? 'REG' : 'POST',
    sourceGameType: extracted.gameType,
    kickoff: extracted.kickoff,
    awayTeam: extracted.awayTeam,
    homeTeam: extracted.homeTeam,
    awayScore: extracted.awayScore,
    homeScore: extracted.homeScore,
    closingSpreadHome: extracted.closingSpreadHome,
    spreadOrientation: 'home_team',
    source: SOURCE_ID,
    sourceUrl: metadata.sourceUrl,
    retrievedAt: metadata.retrievedAt,
  };

  assignIfPresent(accepted, 'closingTotal', parseNumber(row.total_line));
  assignIfPresent(accepted, 'awaySpreadOdds', firstParsedNumber(row.away_spread_odds, row.spread_away_odds));
  assignIfPresent(accepted, 'homeSpreadOdds', firstParsedNumber(row.home_spread_odds, row.spread_home_odds));
  assignIfPresent(accepted, 'awayRest', parseNumber(row.away_rest));
  assignIfPresent(accepted, 'homeRest', parseNumber(row.home_rest));
  assignIfPresent(accepted, 'stadium', row.stadium);
  assignIfPresent(accepted, 'roof', row.roof);
  assignIfPresent(accepted, 'surface', row.surface);
  assignIfPresent(accepted, 'divisionGame', parseBoolean(row.div_game));

  const weather = {};
  assignIfPresent(weather, 'temperature', firstParsedNumber(row.temp, row.temperature));
  assignIfPresent(weather, 'wind', parseNumber(row.wind));
  if (Object.keys(weather).length > 0) {
    accepted.weather = weather;
  }

  return { accepted };
}

function extractGame(row) {
  const sourceSpreadLine = parseNumber(row.spread_line);

  return {
    gameId: firstPresent(row.game_id, row.gameId),
    season: parseNumber(row.season),
    week: parseNumber(row.week),
    gameType: firstPresent(row.game_type, row.season_type, row.gameType),
    kickoff: buildKickoff(row),
    awayTeam: firstPresent(row.away_team, row.awayTeam),
    homeTeam: firstPresent(row.home_team, row.homeTeam),
    awayScore: parseNumber(firstPresent(row.away_score, row.awayScore)),
    homeScore: parseNumber(firstPresent(row.home_score, row.homeScore)),
    closingSpreadHome: isFiniteNumber(sourceSpreadLine) ? -sourceSpreadLine : sourceSpreadLine,
  };
}

function buildKickoff(row) {
  const kickoff = {};
  assignIfPresent(kickoff, 'date', row.gameday);
  assignIfPresent(kickoff, 'time', row.gametime);
  assignIfPresent(kickoff, 'weekday', row.weekday);
  return kickoff;
}

function requiredMissingReason(game) {
  if (isMissing(game.gameId)) {
    return 'missing_game_id';
  }
  if (!isFiniteNumber(game.season)) {
    return 'missing_season';
  }
  if (!isFiniteNumber(game.week)) {
    return 'missing_week';
  }
  if (isMissing(game.gameType)) {
    return 'missing_game_type';
  }
  if (isMissing(game.awayTeam) || isMissing(game.homeTeam)) {
    return 'missing_team';
  }
  if (!isFiniteNumber(game.awayScore) || !isFiniteNumber(game.homeScore)) {
    return 'missing_score';
  }
  if (!isFiniteNumber(game.closingSpreadHome)) {
    return 'missing_spread';
  }
  return undefined;
}

function buildRejectedGame(game, metadata, reason) {
  const rejected = {
    reason,
    source: SOURCE_ID,
    sourceUrl: metadata.sourceUrl,
    retrievedAt: metadata.retrievedAt,
  };

  assignIfPresent(rejected, 'gameId', game.gameId);
  assignIfPresent(rejected, 'season', game.season);
  assignIfPresent(rejected, 'week', game.week);
  assignIfPresent(rejected, 'gameType', game.gameType);
  assignIfPresent(rejected, 'awayTeam', game.awayTeam);
  assignIfPresent(rejected, 'homeTeam', game.homeTeam);

  return rejected;
}

function assignIfPresent(target, key, value) {
  if (!isMissing(value)) {
    target[key] = value;
  }
}

function firstParsedNumber(...values) {
  for (const value of values) {
    const parsed = parseNumber(value);
    if (isFiniteNumber(parsed)) {
      return parsed;
    }
  }
  return undefined;
}

function firstPresent(...values) {
  return values.find((value) => !isMissing(value));
}

function parseNumber(value) {
  if (isMissing(value)) {
    return undefined;
  }
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function parseBoolean(value) {
  if (typeof value === 'boolean') {
    return value;
  }
  if (isMissing(value)) {
    return undefined;
  }
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes'].includes(normalized)) {
    return true;
  }
  if (['0', 'false', 'no'].includes(normalized)) {
    return false;
  }
  return undefined;
}

function isMissing(value) {
  return value === undefined || value === null || (typeof value === 'string' && value.trim() === '');
}

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

module.exports = { normalizeNflverseGame };
