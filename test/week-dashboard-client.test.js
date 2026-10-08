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
  focus() {}
  querySelector(selector) { return this.find(node => (node.attributes.class || '').split(' ').includes(selector.slice(1))); }
  find(predicate) { if (predicate(this)) return this; for (const child of this.children) { const found = child.find(predicate); if (found) return found; } return null; }
}

const createElements = () => Object.fromEntries(['status', 'slate-body', 'slate-heading', 'reset-order'].map(id => [id, new Element()]));
const documentFor = elements => ({ getElementById: id => elements[id], createElement: tag => new Element(tag), addEventListener() {} });

const slateGames = [
  ['a', 'PHI at CHI', 'CHI', 80], ['b', 'BUF at MIA', 'BUF', 70],
  ['c', 'KC at BAL', 'BAL', 60], ['d', 'DAL at NYG', 'DAL', 50],
].map(([gameId, matchup, recommendedPick, weightedConfidence]) => ({
  status: 'ready', gameId, matchup, recommendedPick, weightedConfidence,
  kickoff: { utc: '2026-10-11T17:00:00.000Z' }, currentOdds: { provider: 'nflverse', consensusSpreadHome: -3.5 },
  candidateCount: 100, decidedGameCount: 95, coverSplit: 20, coverSplitInterval: { lower: 4.5, upper: 32.1 },
}));
async function loadSlate({ stored = new Map(), season = 2026, week = 3, games = slateGames, failStorage = false } = {}) {
  const elements = createElements();
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../public/week-dashboard/app.js'), 'utf8'), {
    document: documentFor(elements),
    fetch: async () => ({ ok: true, json: async () => ({ season, week, games }) }),
    localStorage: {
      getItem: key => { if (failStorage) throw new Error('Storage unavailable'); return stored.get(key) || null; },
      setItem: (key, value) => { if (failStorage) throw new Error('Storage unavailable'); stored.set(key, value); },
    },
  });
  await new Promise(resolve => setImmediate(resolve));
  const cards = () => elements['slate-body'].children;
  const card = id => cards().find(node => node.attributes['data-game-id'] === id);
  return { elements, cards, card, stored, order: () => cards().map(node => node.attributes['data-game-id']) };
}

test('changing points inserts the card and shifts intervening cards in either direction', async () => {
  const slate = await loadSlate();
  const input = slate.card('d')?.find(node => node.tagName === 'input');
  assert.ok(input, 'each card has an editable points value');
  input.value = '3'; input.listeners.change({ target: input });
  assert.deepEqual(slate.order(), ['a', 'd', 'b', 'c']);
  const first = slate.card('a').find(node => node.tagName === 'input');
  first.value = '1'; first.listeners.change({ target: first });
  assert.deepEqual(slate.order(), ['d', 'b', 'c', 'a']);
  assert.equal(slate.stored.get('nfl-ats-pucker:week-ranks:2026:3'), '["d","b","c","a"]');
  assert.deepEqual(slate.cards().map(card => card.find(node => node.tagName === 'input').value), ['4', '3', '2', '1']);
});

test('invalid points never reorder cards or persist invalid rankings', async () => {
  const slate = await loadSlate();
  for (const value of ['', '0', '5', '2.5', 'invalid']) {
    const input = slate.card('a')?.find(node => node.tagName === 'input');
    assert.ok(input);
    input.value = value; input.listeners.change({ target: input });
    assert.deepEqual(slate.order(), ['a', 'b', 'c', 'd']);
    assert.equal(slate.card('a').find(node => node.tagName === 'input').value, '4');
  }
  assert.equal(slate.stored.has('nfl-ats-pucker:week-ranks:2026:3'), false);
});

test('clickable teams set a named personal pick without changing the historical lean', async () => {
  const slate = await loadSlate();
  assert.ok(slate.card('a'));
  const pick = () => slate.card('a').find(node => node.attributes.class === 'my-pick-value');
  assert.equal(pick().textContent, '—');
  const away = () => slate.card('a').find(node => node.attributes['data-team'] === 'PHI');
  const home = () => slate.card('a').find(node => node.attributes['data-team'] === 'CHI');
  away().listeners.click(); assert.equal(pick().textContent, 'Eagles');
  assert.equal(away().attributes['aria-pressed'], 'true');
  home().listeners.click(); assert.equal(pick().textContent, 'Bears');
  assert.equal(away().attributes['aria-pressed'], 'false');
  assert.equal(home().attributes['aria-pressed'], 'true');
  assert.equal(slate.card('a').find(node => node.attributes.class === 'history-lean-value').textContent, 'Bears -3.5');
  assert.equal(slate.card('b').find(node => node.attributes.class === 'history-lean-value').textContent, 'Bills +3.5');
  assert.equal(slate.elements.status.textContent, '', 'picking a team does not add a page-top banner');
  assert.equal(slate.stored.get('nfl-ats-pucker:week-picks:2026:3'), '{"a":"CHI"}');
});

test('personal picks and the existing weekly rank key survive reloading and stay week-specific', async () => {
  const stored = new Map([
    ['nfl-ats-pucker:week-ranks:2026:3', '["d","b","a","c"]'],
    ['nfl-ats-pucker:week-picks:2026:3', '{"a":"CHI","b":"BUF"}'],
  ]);
  const slate = await loadSlate({ stored });
  assert.deepEqual(slate.order(), ['d', 'b', 'a', 'c']);
  assert.equal(slate.card('a').find(node => node.attributes.class === 'my-pick-value').textContent, 'Bears');
  const nextWeek = await loadSlate({ stored, week: 4 });
  assert.deepEqual(nextWeek.order(), ['a', 'b', 'c', 'd']);
  assert.equal(nextWeek.card('a').find(node => node.attributes.class === 'my-pick-value').textContent, '—');
});

test('malformed or unavailable local storage leaves the slate usable and rejects unrelated picks', async () => {
  for (const bad of ['null', '{}', '"text"', '{bad', '["a","a","b","c"]']) {
    const slate = await loadSlate({ stored: new Map([
      ['nfl-ats-pucker:week-ranks:2026:3', bad], ['nfl-ats-pucker:week-picks:2026:3', bad],
    ]) });
    assert.deepEqual(slate.order(), ['a', 'b', 'c', 'd']);
    assert.equal(slate.card('a').find(node => node.attributes.class === 'my-pick-value').textContent, '—');
  }
  const unrelated = await loadSlate({ stored: new Map([['nfl-ats-pucker:week-picks:2026:3', '{"a":"DAL","unknown":"CHI"}']]) });
  assert.equal(unrelated.card('a').find(node => node.attributes.class === 'my-pick-value').textContent, '—');
  const blocked = await loadSlate({ failStorage: true });
  assert.ok(blocked.card('a'));
  blocked.card('a').find(node => node.attributes['data-team'] === 'CHI').listeners.click();
  assert.equal(blocked.card('a').find(node => node.attributes.class === 'my-pick-value').textContent, 'Bears');
});

test('resetting order restores historical sorting without discarding personal picks or expanded context', async () => {
  const slate = await loadSlate();
  assert.ok(slate.card('a'));
  slate.card('a').find(node => node.attributes['data-team'] === 'CHI').listeners.click();
  slate.card('a').find(node => node.attributes['aria-controls'] === 'lineup-a').listeners.click();
  const input = slate.card('a').find(node => node.tagName === 'input');
  input.value = '1'; input.listeners.change({ target: input });
  assert.equal(Object.hasOwn(slate.card('a').find(node => node.attributes.class === 'lineup-context').attributes, 'hidden'), false);
  slate.elements['reset-order'].listeners.click();
  assert.deepEqual(slate.order(), ['a', 'b', 'c', 'd']);
  assert.equal(slate.card('a').find(node => node.attributes.class === 'my-pick-value').textContent, 'Bears');
  assert.equal(Object.hasOwn(slate.card('a').find(node => node.attributes.class === 'lineup-context').attributes, 'hidden'), false);
});

test('keyboard arrows on the grip reorder without visible arrow controls', async () => {
  const slate = await loadSlate();
  const handle = slate.card('a')?.find(node => node.attributes.class === 'drag-handle');
  assert.ok(handle);
  let prevented = false;
  handle.listeners.keydown({ key: 'ArrowDown', preventDefault: () => { prevented = true; } });
  assert.equal(prevented, true);
  assert.deepEqual(slate.order(), ['b', 'a', 'c', 'd']);
});

test('an unsuccessful slate request clears cards and presents a load error', async () => {
  const elements = createElements();
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../public/week-dashboard/app.js'), 'utf8'), {
    document: documentFor(elements), fetch: async () => ({ ok: false }),
  });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(elements.status.textContent, 'Unable to load.');
  assert.equal(elements.status.attributes.class, 'load-error');
  assert.equal(elements['slate-body'].children.length, 0);
});

test('an empty weekly slate shows a visible empty state rather than a blank board', async () => {
  const slate = await loadSlate({ games: [] });
  assert.equal(slate.elements.status.textContent, 'No games available.');
  assert.equal(slate.elements.status.attributes.class, 'empty-state');
});

test('renders ranked cards with compact evidence, team picks and a matchup icon link', async () => {
  const elements = createElements();
  let requested;
  const stored = new Map();
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../public/week-dashboard/app.js'), 'utf8'), {
    document: documentFor(elements),
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
   const cards = elements['slate-body'].children;
   assert.equal(cards.length, 3);
   assert.equal(cards[0].tagName, 'article');
   assert.equal(cards[0].attributes['aria-label'], 'LA at DEN');
   assert.match(cards[0].textContent, /My Pick.*—.*Leans.*—.*Deviation.*12\/100/);
   assert.match(cards[0].textContent, /Similar games4.*Cover split0 pp.*95% CI.*-40.5 to \+40.5 pp/);
   assert.doesNotMatch(cards[0].textContent, /Line source|Decided games|Historical pick|Confidence/);
   assert.match(cards[1].textContent, /Deviation—/);
   assert.match(elements['slate-body'].textContent, /Unable to gather game/);
   const rail = cards[0].find(node => node.attributes.class === 'rank-rail');
   const link = rail.find(node => node.tagName === 'a');
   assert.equal(link.attributes.href, '/games/2026_03_LA_DEN/');
   assert.equal(link.attributes['aria-label'], 'Open matchup for LA at DEN');
   assert.equal(link.textContent, '');
   assert.equal(rail.find(node => node.attributes['data-direction']), null);
   const points = elements['slate-body'].find((node) => node.tagName === 'input' && node.attributes.type === 'number');
   assert.ok(points);
   assert.equal(points.value, '2');
   assert.equal(points.attributes['aria-label'], 'Points LA at DEN');
   assert.equal(points.attributes.class, 'points-value');
  points.value = '1';
  points.listeners.change({ target: points });
  assert.equal(stored.get('nfl-ats-pucker:week-ranks:2026:3'), JSON.stringify(['2026_03_DAL_PHI', '2026_03_LA_DEN']));
});

test('formats kickoff weekdays and compact times in Chicago with minutes, daylight saving and date rollover', async () => {
  const cases = [
    ['2026-10-09T00:00:00.000Z', 'Thu 7pm'],
    ['2026-12-18T01:00:00.000Z', 'Thu 7pm'],
    ['2026-10-11T20:25:00.000Z', 'Sun 3:25pm'],
    ['2026-10-11T04:30:00.000Z', 'Sat 11:30pm'],
    ['2026-10-11T17:00:00.000Z', 'Sun 12pm'],
    ['2026-10-11T05:00:00.000Z', 'Sun 12am'],
    ['2026-03-08T07:30:00.000Z', 'Sun 1:30am'],
    ['2026-03-08T08:30:00.000Z', 'Sun 3:30am'],
    ['2026-11-01T06:30:00.000Z', 'Sun 1:30am'],
    ['2026-11-01T07:30:00.000Z', 'Sun 1:30am'],
    [null, '—'],
    ['invalid', '—'],
  ];
  const elements = createElements();
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../public/week-dashboard/app.js'), 'utf8'), {
    document: documentFor(elements),
    fetch: async () => ({ ok: true, json: async () => ({ season: 2026, week: 3, games: cases.map(([utc], index) => ({
      status: 'ready', gameId: `time-${index}`, matchup: `Game ${String(index).padStart(2, '0')}`,
      kickoff: { date: '2026-10-08', time: '20:00', utc }, currentOdds: { provider: 'nflverse', consensusSpreadHome: -3 },
      candidateCount: 1, coverSplit: 0, decidedGameCount: 1, coverSplitInterval: null, weightedConfidence: 0, recommendedPick: null,
    })) }) }),
    localStorage: { getItem: () => null, setItem() {} },
  });
  await new Promise(resolve => setImmediate(resolve));
   assert.equal(elements['slate-body'].children.length, cases.length);
  for (const [index, [, expected]] of cases.entries()) {
     assert.equal(elements['slate-body'].children[index].find(node => node.attributes.class === 'game-kickoff').textContent, expected);
  }
});

test('expands team context inside its card', async () => {
  const elements = createElements();
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../public/week-dashboard/app.js'), 'utf8'), {
    document: documentFor(elements),
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

   const card = elements['slate-body'].children[0];
   const context = card.find(node => node.attributes.class === 'lineup-context');
   assert.equal(Object.hasOwn(context.attributes, 'hidden'), true);
   const control = card.find(node => node.attributes['aria-controls'] === 'lineup-game');
  assert.equal(control.attributes['aria-label'], 'View team context for AWY at HME');
  assert.equal(control.attributes['aria-expanded'], 'false');
  control.listeners.click();
   assert.equal(Object.hasOwn(context.attributes, 'hidden'), false);
  assert.equal(control.attributes['aria-expanded'], 'true');
   assert.match(context.textContent, /HME.*AWY.*Official source unavailable/);
});

test('renders labeled build-time sources, changes, initial baselines and unavailable states as text only', async () => {
  const elements = createElements();
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
    document: documentFor(elements),
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
   const cells = elements['slate-body'].children.map(card => card.find(node => node.attributes.class === 'lineup-context'));
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
   const firstControl = elements['slate-body'].children[0].find(node => node.attributes['aria-controls'] === 'lineup-game');
  assert.equal(firstControl.attributes['aria-label'], 'View team context for AWY at HME');
  assert.equal(firstControl.attributes['aria-expanded'], 'false');
  for (const cell of cells) assert.doesNotMatch(cell.textContent, /pick|confidence|recommend/i);
});
