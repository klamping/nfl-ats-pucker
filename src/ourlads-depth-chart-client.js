const { load } = require('cheerio');

const TEAM_CODES = {
  ARI: 'ARZ', ATL: 'ATL', BAL: 'BAL', BUF: 'BUF', CAR: 'CAR', CHI: 'CHI', CIN: 'CIN', CLE: 'CLE',
  DAL: 'DAL', DEN: 'DEN', DET: 'DET', GB: 'GB', HOU: 'HOU', IND: 'IND', JAX: 'JAX', KC: 'KC',
  LA: 'RAM', LAC: 'LAC', LV: 'LV', MIA: 'MIA', MIN: 'MIN', NE: 'NE', NO: 'NO', NYG: 'NYG',
  NYJ: 'NYJ', PHI: 'PHI', PIT: 'PIT', SEA: 'SEA', SF: 'SF', TB: 'TB', TEN: 'TEN', WAS: 'WAS',
};
const text = (node) => node.text().replace(/\s+/g, ' ').trim();
function sourceError(message) { return Object.assign(new Error(message), { code: 'LINEUP_SOURCE' }); }

function createOurladsDepthChartClient({ fetchImpl = fetch, now = () => new Date() } = {}) {
  return {
    async fetchDepthChart({ team }) {
      if (!Object.hasOwn(TEAM_CODES, team)) throw sourceError('Unmapped Ourlads team');
      const time = now();
      if (!(time instanceof Date) || !Number.isFinite(time.getTime())) throw new TypeError('Invalid lineup clock');
      const sourceUrl = `https://www.ourlads.com/nfldepthcharts/depthchart/${TEAM_CODES[team]}`;
      let body;
      try {
        const response = await fetchImpl(sourceUrl, { headers: { Accept: 'text/html' }, signal: AbortSignal.timeout(15000) });
        if (!response.ok) throw sourceError('Ourlads request failed');
        body = await response.text();
      } catch (error) { throw sourceError(`Ourlads request failed: ${error.message}`); }
      if (!body?.trim()) throw sourceError('Ourlads returned empty markup');
      const $ = load(body);
      if ($('#ctl00_phContent_hteam').attr('value') !== TEAM_CODES[team]) throw sourceError('Cannot parse Ourlads team');
      const sourceUpdatedAt = parseEasternTimestamp(text($('#ctl00_phContent_DateUpd')));
      const slots = [];
      const seen = new Set();
      for (const id of ['dcTBody', 'dcTBody2', 'dcTBody3']) {
        const unit = $(`#ctl00_phContent_${id}`);
        if (unit.length !== 1 || !unit.children('tr').length) throw sourceError('Cannot parse Ourlads unit markup');
        unit.children('tr').each((_, row) => {
          const cells = $(row).children('td');
          const position = text(cells.eq(0));
          if (!/^[A-Z][A-Z0-9]*$/.test(position) || cells.length < 5) throw sourceError('Cannot parse Ourlads position markup');
          for (const rank of [1, 2]) {
            const playerCell = cells.eq(rank * 2);
            const link = playerCell.children('a');
            if (link.length !== 1) throw sourceError('Cannot parse Ourlads player markup');
            const name = text(link);
            if (!name) continue;
            const parts = name.split(',').map((part) => part.trim());
            const player = parts.length === 2 ? `${parts[1]} ${parts[0]}` : name;
            const key = `${position}:${rank}`;
            if (seen.has(key)) throw sourceError('Cannot parse duplicate Ourlads slot');
            seen.add(key);
            slots.push({ position, rank, player });
          }
        });
      }
      if (!slots.length) throw sourceError('Cannot parse Ourlads slots');
      return { source: 'ourlads', retrievedAt: time.toISOString(), sourceUpdatedAt, slots, rawCapture: { sourceUrl, body } };
    },
  };
}

function parseEasternTimestamp(value) {
  const match = value.match(/^Updated:\s*(\d{2})\/(\d{2})\/(\d{4})\s+(\d{1,2}):(\d{2})(AM|PM) ET$/);
  if (!match) throw sourceError('Cannot parse Ourlads update timestamp');
  const [, month, day, year, hour, minute, period] = match;
  if (Number(hour) < 1 || Number(hour) > 12 || Number(minute) > 59) throw sourceError('Invalid Ourlads update time');
  const wallTime = Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour) % 12 + (period === 'PM' ? 12 : 0), Number(minute));
  const wallDate = new Date(wallTime);
  if (wallDate.getUTCMonth() !== Number(month) - 1 || wallDate.getUTCDate() !== Number(day)) throw sourceError('Invalid Ourlads update date');
  const formatter = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', timeZoneName: 'shortOffset' });
  let utc = wallTime;
  for (let i = 0; i < 2; i += 1) {
    const offset = formatter.formatToParts(new Date(utc)).find((part) => part.type === 'timeZoneName').value;
    const hours = Number(offset.replace('GMT', ''));
    utc = wallTime - hours * 3600000;
  }
  return new Date(utc).toISOString();
}

module.exports = { createOurladsDepthChartClient };
