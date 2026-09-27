const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ODDS_ENDPOINT = 'https://api.the-odds-api.com/v4/sports/americanfootball_nfl/odds';
const PROVIDER = 'the-odds-api';

function loadTheOddsApiKey({ envPath = path.join(os.homedir(), 'Sites', '.env') } = {}) {
  let contents;
  try {
    contents = fs.readFileSync(envPath, 'utf8');
  } catch {
    throw new Error('theoddsapi key is missing or blank');
  }

  for (const line of contents.split(/\r?\n/)) {
    const match = /^\s*(?:export\s+)?theoddsapi\s*=(.*)$/.exec(line);
    if (!match) continue;
    const value = match[1].replace(/\s+#.*$/, '').trim();
    const quoted = /^(?:"([^"]*)"|'([^']*)')(?:\s*#.*)?$/.exec(value);
    const key = quoted ? quoted[1] ?? quoted[2] : value;
    if (key) return key;
    break;
  }

  throw new Error('theoddsapi key is missing or blank');
}

function createOddsApiClient({ apiKey, fetchImpl = globalThis.fetch } = {}) {
  if (typeof apiKey !== 'string' || !apiKey.trim()) {
    throw new Error('The Odds API key is missing or blank');
  }
  if (typeof fetchImpl !== 'function') {
    throw new Error('A fetch implementation is required');
  }

  return {
    async fetchNflSpreads() {
      const url = new URL(ODDS_ENDPOINT);
      url.searchParams.set('apiKey', apiKey);
      url.searchParams.set('regions', 'us');
      url.searchParams.set('markets', 'spreads');

      let result;
      try {
        result = await fetchImpl(url.toString());
      } catch {
        throw new Error('The Odds API request failed');
      }
      if (!result?.ok) {
        throw new Error('The Odds API request failed');
      }

      let response;
      try {
        const payload = await result.json();
        // A provider or proxy must not be able to echo the query credential into stored raw data.
        response = JSON.parse(JSON.stringify(payload).replaceAll(apiKey, '[REDACTED]'));
      } catch {
        throw new Error('The Odds API response could not be parsed');
      }

      return { response, retrievedAt: new Date().toISOString(), source: PROVIDER };
    },
  };
}

function findConsensusHomeSpread({ response, target } = {}) {
  const events = Array.isArray(response) ? response : response?.response;
  const retrievedAt = Array.isArray(response) ? new Date().toISOString() : response?.retrievedAt;
  const kickoff = Date.parse(target?.kickoff);
  if (!Array.isArray(events) || !target?.homeTeam || !target?.awayTeam || !Number.isFinite(kickoff)) {
    throw new Error('A valid target and NFL odds response are required');
  }

  const matches = events.filter((event) => event?.home_team === target.homeTeam
    && event?.away_team === target.awayTeam
    && Date.parse(event.commence_time) === kickoff);
  if (matches.length !== 1) {
    throw new Error('No unique matching event for the target teams and kickoff');
  }

  const homeSpreads = [];
  const seenBooks = new Set();
  for (const book of Array.isArray(matches[0].bookmakers) ? matches[0].bookmakers : []) {
    if (typeof book?.key !== 'string' || !book.key || seenBooks.has(book.key)) continue;
    for (const market of Array.isArray(book.markets) ? book.markets : []) {
      if (market?.key !== 'spreads' || !Array.isArray(market.outcomes)) continue;
      const home = market.outcomes.filter((outcome) => outcome?.name === target.homeTeam);
      if (home.length !== 1 || typeof home[0].point !== 'number' || !Number.isFinite(home[0].point)) continue;
      homeSpreads.push(home[0].point);
      seenBooks.add(book.key);
      break;
    }
  }

  if (homeSpreads.length === 0) {
    throw new Error('The matching event has no valid home spread quotes');
  }
  homeSpreads.sort((left, right) => left - right);
  const middle = Math.floor(homeSpreads.length / 2);

  return {
    provider: PROVIDER,
    retrievedAt: retrievedAt || new Date().toISOString(),
    contributingBooks: homeSpreads.length,
    homeSpreads,
    consensusSpreadHome: homeSpreads.length % 2 ? homeSpreads[middle] : (homeSpreads[middle - 1] + homeSpreads[middle]) / 2,
  };
}

module.exports = { loadTheOddsApiKey, createOddsApiClient, findConsensusHomeSpread };
