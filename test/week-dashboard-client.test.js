const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

class Element {
  constructor(tag = 'div') { this.tagName = tag; this.children = []; this.value = ''; this.attributes = {}; this.listeners = {}; }
  set textContent(value) { this.value = String(value); this.children = []; }
  get textContent() { return this.value + this.children.map((child) => child.textContent).join(''); }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.value = ''; this.children = children; }
  setAttribute(key, value) { this.attributes[key] = String(value); }
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
  assert.equal(rows[1].children[7].textContent, '—');
  assert.equal(rows[1].children[8].textContent, '0');
  assert.equal(rows[2].children[0].attributes.colspan, '10');
  assert.match(elements['slate-body'].textContent, /Unable to gather game/);
  const link = elements['slate-body'].children[0].children[0].find?.(() => false);
  assert.equal(elements['slate-body'].children[0].children.some((cell) => cell.children.some((node) => node.tagName === 'a' && node.attributes.href === '/games/2026_03_LA_DEN/')), true);
  assert.equal(elements['slate-body'].textContent.includes('pick'), false);
  const points = elements['slate-body'].find((node) => node.tagName === 'input' && node.attributes.type === 'number');
  assert.ok(points);
  assert.equal(points.value, '2');
  assert.equal(points.attributes['aria-label'], 'Points LA at DEN');
  points.value = '1';
  points.listeners.change({ target: points });
  assert.equal(stored.get('nfl-ats-pucker:week-ranks:2026:3'), JSON.stringify(['2026_03_DAL_PHI', '2026_03_LA_DEN']));
});
