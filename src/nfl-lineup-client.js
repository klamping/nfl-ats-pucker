const { load } = require('cheerio');

const TEAM_NAMES = {
  ARI: 'Cardinals', ATL: 'Falcons', BAL: 'Ravens', BUF: 'Bills', CAR: 'Panthers', CHI: 'Bears',
  CIN: 'Bengals', CLE: 'Browns', DAL: 'Cowboys', DEN: 'Broncos', DET: 'Lions', GB: 'Packers',
  HOU: 'Texans', IND: 'Colts', JAX: 'Jaguars', KC: 'Chiefs', LA: 'Rams', LAC: 'Chargers',
  LV: 'Raiders', MIA: 'Dolphins', MIN: 'Vikings', NE: 'Patriots', NO: 'Saints', NYG: 'Giants',
  NYJ: 'Jets', PHI: 'Eagles', PIT: 'Steelers', SEA: 'Seahawks', SF: '49ers', TB: 'Buccaneers',
  TEN: 'Titans', WAS: 'Commanders',
};
const CATEGORIES = ['trades', 'signings', 'reserve-list', 'waivers', 'terminations', 'other'];
const text = (node) => node.text().replace(/\s+/g, ' ').trim();
function sourceError(message) { return Object.assign(new Error(message), { code: 'LINEUP_SOURCE' }); }

function createNflLineupClient({ fetchImpl = fetch, now = () => new Date() } = {}) {
  // A client belongs to one dashboard build; share league documents, not team results.
  const downloads = new Map();
  async function download(sourceUrl) {
    if (!downloads.has(sourceUrl)) downloads.set(sourceUrl, (async () => {
      let response;
      let body;
      try {
        response = await fetchImpl(sourceUrl, { headers: { Accept: 'text/html' }, signal: AbortSignal.timeout(15000) });
        if (!response.ok) throw sourceError('NFL.com request failed');
        body = await response.text();
      } catch (error) {
        throw sourceError(`NFL.com request failed: ${error.message}`);
      }
      if (!body?.trim()) throw sourceError('NFL.com returned empty markup');
      return { sourceUrl, body };
    })());
    return downloads.get(sourceUrl);
  }
  return {
    async fetchOfficial({ team, now: clock = now }) {
      if (!Object.hasOwn(TEAM_NAMES, team)) throw sourceError('Unmapped NFL.com team');
      const time = clock();
      if (!(time instanceof Date) || !Number.isFinite(time.getTime())) throw new TypeError('Invalid lineup clock');
      const retrievedAt = time.toISOString();
      const months = [new Date(Date.UTC(time.getUTCFullYear(), time.getUTCMonth(), 1)),
        new Date(Date.UTC(time.getUTCFullYear(), time.getUTCMonth() - 1, 1))];
      const injuryCapture = await download('https://www.nfl.com/injuries/');
      const injuries = parseInjuries(injuryCapture.body, team, retrievedAt);
      const transactions = [];
      const rawCaptures = [injuryCapture];
      const seen = new Set();
      for (const month of months) {
        for (const category of CATEGORIES) {
          const capture = await download(`https://www.nfl.com/transactions/league/${category}/${month.getUTCFullYear()}/${month.getUTCMonth() + 1}`);
          rawCaptures.push(capture);
          for (const entry of parseTransactions(capture.body, team, month.getUTCFullYear(), month.getUTCMonth(), time)) {
            const key = JSON.stringify(entry);
            if (!seen.has(key)) { seen.add(key); transactions.push(entry); }
          }
        }
      }
      transactions.sort((a, b) => b.date.localeCompare(a.date) || a.player.localeCompare(b.player));
      return { source: 'nfl.com', retrievedAt, injuries, transactions, rawCaptures };
    },
  };
}

function checkHeaders($, table, expected) {
  const headers = table.find('thead th').map((_, node) => text($(node))).get();
  if (JSON.stringify(headers) !== JSON.stringify(expected) || table.find('tbody').length !== 1) {
    throw sourceError('Cannot parse NFL.com table markup');
  }
}

function parseInjuries(body, team, observedAt) {
  const $ = load(body);
  const tables = $('.d3-o-reports--detailed').filter((_, node) =>
    text($(node).parent().prev('.nfl-t-stats__title').find('.d3-o-section-sub-title')) === TEAM_NAMES[team]);
  if (tables.length !== 1) throw sourceError('Cannot uniquely parse requested injury team');
  checkHeaders($, tables, ['Player', 'Position', 'Injuries', 'Practice Status', 'Game Status']);
  return tables.find('tbody tr').map((_, row) => {
    const cells = $(row).children('td');
    const player = text(cells.eq(0).find('a'));
    const position = text(cells.eq(1));
    if (cells.length !== 5 || !player || !position) throw sourceError('Cannot parse injury row markup');
    const gameStatus = text(cells.eq(4));
    const practiceStatus = text(cells.eq(3));
    return { player, position, status: gameStatus || (practiceStatus ? `Practice: ${practiceStatus}` : 'Not reported'), observedAt };
  }).get();
}

function parseTransactions(body, team, year, month, time) {
  const $ = load(body);
  const table = $('.d3-o-team-stats--detailed');
  if (table.length !== 1) throw sourceError('Cannot parse transaction table markup');
  checkHeaders($, table, ['From', 'To', 'Date', 'Name', 'Position', 'Transaction']);
  const end = Date.UTC(time.getUTCFullYear(), time.getUTCMonth(), time.getUTCDate());
  const start = end - 14 * 86400000;
  const entries = [];
  table.find('tbody tr').each((_, row) => {
    const cells = $(row).children('td');
    const clubs = [0, 1].map((index) => {
      const img = cells.eq(index).find('.d3-o-club-info img');
      if (!img.length) return null;
      const code = (img.attr('data-src') || img.attr('src') || '').match(/\/logos\/([A-Z]+)(?:$|[/?])/)?.[1];
      const alias = ({ AZ: 'ARI', LAR: 'LA', WSH: 'WAS' })[code] || code;
      if (!Object.hasOwn(TEAM_NAMES, alias)) throw sourceError('Cannot parse transaction team');
      return alias;
    });
    const player = text(cells.eq(3).find('a'));
    const detail = text(cells.eq(5));
    const dateParts = text(cells.eq(2)).match(/^(\d{2})\/(\d{2})$/);
    if (cells.length !== 6 || !clubs.some(Boolean) || !player || !detail || !dateParts) throw sourceError('Cannot parse transaction row markup');
    const date = new Date(Date.UTC(year, Number(dateParts[1]) - 1, Number(dateParts[2])));
    if (date.getUTCMonth() !== Number(dateParts[1]) - 1 || date.getUTCDate() !== Number(dateParts[2])) throw sourceError('Cannot parse transaction date');
    if (date.getUTCMonth() !== month || !clubs.includes(team) || date.getTime() < start || date.getTime() > end) return;
    entries.push({ date: date.toISOString().slice(0, 10), player, position: text(cells.eq(4)) || null, detail });
  });
  return entries;
}

module.exports = { createNflLineupClient };
