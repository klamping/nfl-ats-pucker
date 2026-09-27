const { parse } = require('csv-parse/sync');

const NFLVERSE_GAMES_URL = 'https://raw.githubusercontent.com/nflverse/nfldata/master/data/games.csv';

async function downloadNflverseGames(fetchImpl = globalThis.fetch) {
  if (typeof fetchImpl !== 'function') {
    throw new Error('A fetch implementation is required');
  }

  const response = await fetchImpl(NFLVERSE_GAMES_URL, {
    headers: {
      accept: 'text/csv',
    },
  });

  if (!response.ok) {
    throw new Error(`nflverse games download failed with status ${response.status}`);
  }

  const csv = await response.text();
  let rows;
  try {
    rows = parse(csv, {
      columns: true,
      skip_empty_lines: true,
    });
  } catch (error) {
    throw new Error('nflverse games CSV could not be parsed');
  }

  return {
    csv,
    rows,
    retrievedAt: new Date().toISOString(),
    sourceUrl: NFLVERSE_GAMES_URL,
  };
}

module.exports = { downloadNflverseGames };
