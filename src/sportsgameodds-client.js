const EVENTS_ENDPOINT = 'https://api.sportsgameodds.com/v2/events';
const REQUIRED_QUERY = {
  leagueID: 'NFL',
  finalized: 'true',
  bookmakerID: 'pinnacle',
};

function appendOptionalQuery(searchParams, name, value) {
  if (value === undefined || value === null || value === '') {
    return;
  }
  searchParams.set(name, String(value));
}

function buildFinalizedNflEventsUrl(filters) {
  const url = new URL(EVENTS_ENDPOINT);
  for (const [name, value] of Object.entries(REQUIRED_QUERY)) {
    url.searchParams.set(name, value);
  }

  appendOptionalQuery(url.searchParams, 'startsAfter', filters.startsAfter);
  appendOptionalQuery(url.searchParams, 'startsBefore', filters.startsBefore);
  appendOptionalQuery(url.searchParams, 'cursor', filters.cursor);
  appendOptionalQuery(url.searchParams, 'limit', filters.limit);

  return url.toString();
}

function createSportsGameOddsClient(apiKey, fetchImpl = globalThis.fetch) {
  if (typeof apiKey !== 'string' || apiKey.trim() === '') {
    throw new Error('SportsGameOdds API key is required');
  }
  if (typeof fetchImpl !== 'function') {
    throw new Error('A fetch implementation is required');
  }

  return {
    async fetchFinalizedNflEvents(filters = {}) {
      const response = await fetchImpl(buildFinalizedNflEventsUrl(filters), {
        headers: {
          accept: 'application/json',
          'x-api-key': apiKey,
        },
      });

      if (!response.ok) {
        throw new Error(`SportsGameOdds request failed with status ${response.status}`);
      }

      try {
        return await response.json();
      } catch (error) {
        throw new Error('SportsGameOdds response was not valid JSON');
      }
    },
  };
}

module.exports = { createSportsGameOddsClient };
