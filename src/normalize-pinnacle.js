const PROVIDER_ID = 'sportsgameodds';
const BOOKMAKER_ID = 'pinnacle';

function normalizePinnacleEvent(event) {
  if (!event || typeof event !== 'object' || Array.isArray(event)) {
    return { rejected: buildRejectedGame({}, 'invalid_event') };
  }

  const metadata = extractMetadata(event);
  const missingMetadata = [
    metadata.providerEventID,
    metadata.kickoffTimestamp,
    metadata.awayTeam && metadata.awayTeam.name,
    metadata.homeTeam && metadata.homeTeam.name,
    metadata.season,
    metadata.week,
    metadata.seasonType,
  ].some(isMissing);

  if (missingMetadata || !isFiniteNumber(metadata.awayScore) || !isFiniteNumber(metadata.homeScore)) {
    return { rejected: buildRejectedGame(metadata, 'missing_required_game_fields') };
  }

  if (!['regular', 'postseason'].includes(metadata.seasonType)) {
    return { rejected: buildRejectedGame(metadata, 'unsupported_season_type') };
  }

  const spread = findPinnacleGameSpread(event);
  if (!spread) {
    return { rejected: buildRejectedGame(metadata, 'missing_pinnacle_spread') };
  }

  const direction = spread.sideID === 'home' ? -1 : 1;
  const openingSpread = spread.openingSpread * direction;
  const closingSpread = spread.closingSpread * direction;

  return {
    accepted: {
      providerEventID: metadata.providerEventID,
      providerID: PROVIDER_ID,
      bookmakerID: BOOKMAKER_ID,
      season: metadata.season,
      week: metadata.week,
      seasonType: metadata.seasonType,
      kickoffTimestamp: metadata.kickoffTimestamp,
      awayTeam: metadata.awayTeam,
      homeTeam: metadata.homeTeam,
      awayScore: metadata.awayScore,
      homeScore: metadata.homeScore,
      spreadOrientation: 'away_team',
      spreadTeam: metadata.awayTeam.name,
      spreadMarketID: spread.marketID,
      openingSpread,
      closingSpread,
      openingSpreadTimestamp: spread.openingSpreadTimestamp,
      closingSpreadTimestamp: spread.closingSpreadTimestamp,
      lineMovement: closingSpread - openingSpread,
    },
  };
}

function extractMetadata(event) {
  return {
    providerEventID: firstPresent(event.eventID, event.eventId, event.id),
    season: event.season,
    week: event.week,
    seasonType: firstPresent(event.seasonType, event.season_type),
    kickoffTimestamp: firstPresent(event.startsAt, event.startTime, event.startTimestamp, event.commenceTime),
    awayTeam: normalizeTeam(firstPresent(event.awayTeam, event.teams && event.teams.away)),
    homeTeam: normalizeTeam(firstPresent(event.homeTeam, event.teams && event.teams.home)),
    awayScore: parseNumber(firstPresent(event.awayScore, event.score && event.score.away, event.scores && event.scores.away)),
    homeScore: parseNumber(firstPresent(event.homeScore, event.score && event.score.home, event.scores && event.scores.home)),
  };
}

function normalizeTeam(team) {
  if (typeof team === 'string') {
    return { name: team };
  }
  if (!team || typeof team !== 'object' || Array.isArray(team)) {
    return undefined;
  }

  return {
    teamID: firstPresent(team.teamID, team.teamId, team.id),
    name: firstPresent(team.name, team.displayName, team.fullName),
    abbreviation: firstPresent(team.abbreviation, team.abbrev, team.shortName),
  };
}

function findPinnacleGameSpread(event) {
  const markets = Object.values(event.odds || event.markets || {});
  const spreadMarkets = markets
    .filter((market) => market && typeof market === 'object')
    .filter(isFullGameSpreadMarket)
    .sort(preferAwayMarket);

  for (const market of spreadMarkets) {
    const pinnacle = market.byBookmaker && market.byBookmaker[BOOKMAKER_ID];
    if (!pinnacle || typeof pinnacle !== 'object') {
      continue;
    }

    const openingSpread = parseNumber(pinnacle.openSpread);
    const closingSpread = parseNumber(pinnacle.closeSpread);
    const openingSpreadTimestamp = firstPresent(
      pinnacle.openTimestamp,
      pinnacle.openedAt,
      pinnacle.openTime,
      pinnacle.openDateTime,
      pinnacle.openUpdatedAt,
      pinnacle.openLastUpdated,
      pinnacle.openSpreadTimestamp,
      pinnacle.openSpreadUpdatedAt,
    );
    const closingSpreadTimestamp = firstPresent(
      pinnacle.closeTimestamp,
      pinnacle.closedAt,
      pinnacle.closeTime,
      pinnacle.closeDateTime,
      pinnacle.closeUpdatedAt,
      pinnacle.closeLastUpdated,
      pinnacle.closeSpreadTimestamp,
      pinnacle.closeSpreadUpdatedAt,
    );

    if (
      !isFiniteNumber(openingSpread)
      || !isFiniteNumber(closingSpread)
      || isMissing(openingSpreadTimestamp)
      || isMissing(closingSpreadTimestamp)
    ) {
      continue;
    }

    return {
      marketID: firstPresent(market.oddID, market.id),
      sideID: marketSide(market),
      openingSpread,
      closingSpread,
      openingSpreadTimestamp,
      closingSpreadTimestamp,
    };
  }

  return undefined;
}

function isFullGameSpreadMarket(market) {
  return marketPeriod(market) === 'game' && marketBetType(market) === 'sp' && ['away', 'home'].includes(marketSide(market));
}

function marketPeriod(market) {
  return firstPresent(market.periodID, parseOddID(market.oddID).periodID);
}

function marketBetType(market) {
  return firstPresent(market.betTypeID, parseOddID(market.oddID).betTypeID);
}

function marketSide(market) {
  return firstPresent(market.sideID, parseOddID(market.oddID).sideID);
}

function parseOddID(oddID) {
  if (typeof oddID !== 'string') {
    return {};
  }

  const parts = oddID.split('-');
  return {
    periodID: parts[2],
    betTypeID: parts[3],
    sideID: parts[4],
  };
}

function preferAwayMarket(left, right) {
  if (marketSide(left) === marketSide(right)) {
    return 0;
  }
  return marketSide(left) === 'away' ? -1 : 1;
}

function buildRejectedGame(metadata, reason) {
  return {
    providerEventID: metadata.providerEventID,
    kickoffTimestamp: metadata.kickoffTimestamp,
    awayTeam: metadata.awayTeam,
    homeTeam: metadata.homeTeam,
    reason,
  };
}

function firstPresent(...values) {
  return values.find((value) => !isMissing(value));
}

function isMissing(value) {
  return value === undefined || value === null || value === '';
}

function parseNumber(value) {
  if (isMissing(value)) {
    return undefined;
  }
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

module.exports = { normalizePinnacleEvent };
