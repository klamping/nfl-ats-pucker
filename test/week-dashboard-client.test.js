const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

class Element {
  constructor(tag = 'div') { this.tagName = tag; this.children = []; this.value = ''; this.attributes = {}; this.listeners = {}; }
  set textContent(value) { this.value = String(value); this.children = []; }
  set innerHTML(value) { throw new Error('Dynamic markup must not use innerHTML'); }
  get textContent() { return this.value + this.children.map((child) => child.textContent).join(''); }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.value = ''; this.children = children; }
  setAttribute(key, value) { this.attributes[key] = String(value); }
  removeAttribute(key) { delete this.attributes[key]; }
  addEventListener(event, callback) { this.listeners[event] = callback; }
  find(predicate) { if (predicate(this)) return this; for (const child of this.children) { const found = child.find(predicate); if (found) return found; } return null; }
}

test('renders compact successful and unavailable weekly rows', async () => {
  const elements = { status: new Element(), 'slate-body': new Element() };
  let requested;
  const stored = new Map();
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../public/week-dashboard/app.js'), 'utf8'), {
    document: { getElementById: (id) => elements[id], createElement: (tag) => new Element(tag) },
    fetch: async (url) => { requested = url; return { ok: true, json: async () => ({ season: 2026, week: 3, games: [
      { status: 'ready', gameId: '2026_03_LA_DEN', matchup: 'LA at DEN', kickoff: { date: '2026-09-27', time: '20:20' },
        currentOdds: { provider: 'nflverse', consensusSpreadHome: 1.5 }, candidateCount: 4, coverSplit: 0, weightedConfidence: 12, recommendedPick: null,
        decidedGameCount: 2, coverSplitInterval: { lower: -40.5469, upper: 40.5469 } },
      { status: 'ready', gameId: '2026_03_DAL_PHI', matchup: 'DAL at PHI', kickoff: { date: '2026-09-27', time: '17:00' },
        currentOdds: { provider: 'nflverse', consensusSpreadHome: -2 }, candidateCount: 2, coverSplit: null, weightedConfidence: null, recommendedPick: null,
        decidedGameCount: 0, coverSplitInterval: null },
      { status: 'unavailable', gameId: 'broken', message: 'Unable to gather game' },
    ] }) }; },
    localStorage: { getItem: (key) => stored.get(key) || null, setItem: (key, value) => stored.set(key, value) },
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(requested, '/api/slate');
  assert.match(elements['slate-body'].textContent, /LA at DEN.*4.*0 pp.*12\/100/);
  const rows = elements['slate-body'].children;
  assert.equal(rows[0].children[7].textContent, '-40.5 to +40.5 pp');
  assert.equal(rows[0].children[8].textContent, '2');
  assert.equal(rows[2].children[7].textContent, '—');
  assert.equal(rows[2].children[8].textContent, '0');
  assert.equal(rows[4].children[0].attributes.colspan, '11');
  assert.match(elements['slate-body'].textContent, /Unable to gather game/);
  const link = elements['slate-body'].children[0].children[0].find?.(() => false);
  assert.equal(elements['slate-body'].children[0].children.some((cell) => cell.children.some((node) => node.tagName === 'a' && node.attributes.href === '/games/2026_03_LA_DEN/')), true);
  assert.equal(elements['slate-body'].textContent.includes('pick'), false);
   const points = elements['slate-body'].find((node) => node.tagName === 'input' && node.attributes.type === 'number');
   assert.ok(points);
   assert.equal(points.value, '2');
   assert.equal(points.attributes['aria-label'], 'Points LA at DEN');
   assert.equal(rows[0].children[0].children.length, 1, 'points cell has no arrow controls');
   assert.equal(points.attributes.class, 'points-value');
  points.value = '1';
  points.listeners.change({ target: points });
  assert.equal(stored.get('nfl-ats-pucker:week-ranks:2026:3'), JSON.stringify(['2026_03_DAL_PHI', '2026_03_LA_DEN']));
});

test('expands team context in a row beneath its game', async () => {
  const elements = { status: new Element(), 'slate-body': new Element() };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../public/week-dashboard/app.js'), 'utf8'), {
    document: { getElementById: (id) => elements[id], createElement: (tag) => new Element(tag) },
    fetch: async () => ({ ok: true, json: async () => ({ season: 2026, week: 3, games: [
      { status: 'ready', gameId: 'game', matchup: 'AWY at HME', kickoff: { date: '2026-09-27', time: '17:00' },
        currentOdds: { provider: 'nflverse', consensusSpreadHome: -3 }, candidateCount: 1, coverSplit: 0,
        decidedGameCount: 1, coverSplitInterval: null, weightedConfidence: 5, recommendedPick: null,
        lineup: { home: { team: 'HME', official: { status: 'unavailable' }, depthChart: { status: 'unavailable' } },
          away: { team: 'AWY', official: { status: 'unavailable' }, depthChart: { status: 'unavailable' } } } },
    ] }) }),
    localStorage: { getItem: () => null, setItem() {} },
  });
  await new Promise((resolve) => setImmediate(resolve));

  const [gameRow, contextRow] = elements['slate-body'].children;
  assert.equal(gameRow.children.length, 11);
  assert.equal(contextRow.children.length, 1);
  assert.equal(contextRow.children[0].attributes.colspan, '11');
  assert.equal(Object.hasOwn(contextRow.attributes, 'hidden'), true);
  const control = gameRow.children[10].find((node) => node.tagName === 'button');
  assert.equal(control.attributes['aria-label'], 'View team context for AWY at HME');
  assert.equal(control.attributes['aria-expanded'], 'false');
  control.listeners.click();
  assert.equal(Object.hasOwn(contextRow.attributes, 'hidden'), false);
  assert.equal(control.attributes['aria-expanded'], 'true');
  assert.match(contextRow.textContent, /HME.*AWY.*Official source unavailable/);
});

test('renders labeled build-time sources, changes, initial baselines and unavailable states as text only', async () => {
  const elements = { status: new Element(), 'slate-body': new Element() };
  const requested = [];
  const retrievedAt = '2026-10-04T12:00:00.000Z';
  const ready = { status: 'ready', source: 'ourlads', retrievedAt, sourceUpdatedAt: '2026-10-04T11:00:00.000Z', baseline: 'available', changes: [
    { position: 'QB', rank: 1, outgoingPlayer: 'Old Starter', incomingPlayer: 'New Starter' },
    { position: 'WR', rank: 2, outgoingPlayer: null, incomingPlayer: 'New Reserve' },
    { position: 'RB', rank: 2, outgoingPlayer: 'Old Reserve', incomingPlayer: null },
  ] };
  const lineup = {
    home: { team: 'HME', official: { status: 'ready', source: 'nfl.com', retrievedAt,
      injuries: [{ player: '<img src=x onerror=alert(1)>', position: 'QB', status: 'Questionable', observedAt: retrievedAt }],
      transactions: [{ date: '2026-10-03', player: 'New Reserve', position: null, detail: 'Signed' }] }, depthChart: ready },
    away: { team: 'AWY', official: { status: 'unavailable', source: 'nfl.com' },
      depthChart: { ...ready, baseline: 'unavailable', changes: [] } },
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../public/week-dashboard/app.js'), 'utf8'), {
    document: { getElementById: id => elements[id], createElement: tag => new Element(tag) },
    fetch: async url => { requested.push(url); return { ok: true, json: async () => ({ season: 2026, week: 3, games: [
      { status: 'ready', gameId: 'game', matchup: 'AWY at HME', kickoff: { date: '2026-10-04', time: '17:00' },
        currentOdds: { provider: 'nflverse', consensusSpreadHome: -3 }, candidateCount: 1, coverSplit: 0, decidedGameCount: 1,
        coverSplitInterval: null, weightedConfidence: 5, recommendedPick: null, lineup },
      { status: 'ready', gameId: 'unchanged', matchup: 'Same at Same', kickoff: { date: '2026-10-04', time: '17:00' },
        currentOdds: { provider: 'nflverse', consensusSpreadHome: -3 }, candidateCount: 1, coverSplit: 0, decidedGameCount: 1,
        coverSplitInterval: null, weightedConfidence: 0, recommendedPick: null,
        lineup: { home: { team: 'SAME', official: { status: 'unavailable' }, depthChart: { ...ready, changes: [] } },
          away: { team: 'NONE', official: { status: 'unavailable' }, depthChart: { status: 'unavailable' } } } },
    ] }) }; },
    localStorage: { getItem: () => null, setItem() {} },
  });
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(requested, ['/api/slate']);
  const cells = [elements['slate-body'].children[1].children[0], elements['slate-body'].children[3].children[0]];
  assert.match(cells[0].textContent, /Official — NFL\.com.*Current status as of build.*Questionable.*Transactions \(14 days\).*Projected depth chart — Ourlads.*QB starter: Old Starter → New Starter/);
  assert.match(cells[0].textContent, /WR second string: — → New Reserve/);
  assert.match(cells[0].textContent, /RB second string: Old Reserve → —/);
  assert.match(cells[0].textContent, /No prior depth chart baseline/);
  assert.match(cells[0].textContent, /Official source unavailable/);
  assert.match(cells[0].textContent, /2026-10-04T12:00:00.000Z/);
  assert.match(cells[0].textContent, /2026-10-04T11:00:00.000Z/);
  assert.match(cells[0].textContent, /<img src=x onerror=alert\(1\)>/);
  assert.equal(cells[0].find(node => node.tagName === 'img'), null);
  assert.match(cells[1].textContent, /No first- or second-string changes/);
  assert.match(cells[1].textContent, /Projected depth chart unavailable/);
  const firstControl = elements['slate-body'].children[0].children[10].find(node => node.tagName === 'button');
  assert.equal(firstControl.attributes['aria-label'], 'View team context for AWY at HME');
  assert.equal(firstControl.attributes['aria-expanded'], 'false');
  for (const cell of cells) assert.doesNotMatch(cell.textContent, /pick|confidence|recommend/i);
});
