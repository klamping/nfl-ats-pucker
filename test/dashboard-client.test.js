const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const directory = path.join(__dirname, '../public/dashboard');

test('local analysis board contains accessible controls and no remote resources or sensitive fields', () => {
  const html = fs.readFileSync(path.join(directory, 'index.html'), 'utf8');
  const js = fs.readFileSync(path.join(directory, 'app.js'), 'utf8');
  const css = fs.readFileSync(path.join(directory, 'styles.css'), 'utf8');
  assert.match(html, /<main\b/);
  assert.match(html, /<table\b/);
  assert.match(html, /<button\b/);
  assert.match(html, /aria-live=/);
  assert.match(html, /src="\/app\.js"/);
  assert.match(html, /href="\/styles\.css"/);
  assert.match(js, /\/api\/comparison/);
  assert.match(js, /aria-sort/);
  assert.match(js, /aria-pressed/);
  assert.match(js, /Home cover/);
  assert.match(js, /Away cover/);
  assert.match(js, /Push/);
  assert.match(js, /No historical games match/);
  assert.match(js, /Unable to load/);
  assert.match(js, /distanceContributions/);
  assert.match(css, /focus-visible/);
  for (const asset of [html, js, css]) {
    assert.doesNotMatch(asset, /theoddsapi|homeSpreads|https?:\/\//i);
  }
});

class Element {
  constructor(tagName = 'div') {
    this.tagName = tagName;
    this.children = [];
    this.attributes = {};
    this.listeners = {};
    this.value = '';
  }
  set textContent(value) { this.value = String(value); this.children = []; }
  get textContent() { return this.value + this.children.map((child) => child.textContent).join(''); }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.value = ''; this.children = children; }
  setAttribute(key, value) { this.attributes[key] = String(value); }
  addEventListener(event, callback) { this.listeners[event] = callback; }
  click() { this.listeners.click?.(); }
  keydown(key) { this.listeners.keydown?.({ key, preventDefault() {} }); }
  find(predicate) {
    if (predicate(this)) return this;
    for (const child of this.children) {
      const found = child.find(predicate);
      if (found) return found;
    }
    return null;
  }
}

const IDS = ['status', 'target-title', 'target-meta', 'target-line', 'scope', 'summary',
  'candidate-body', 'detail', 'sort-score', 'sort-season', 'sort-outcome',
  'sort-coverage', 'count-label'];

function runClient(reply) {
  const elements = Object.fromEntries(IDS.map((id) => [id, new Element()]));
  for (const id of IDS.filter((name) => name.startsWith('sort-'))) {
    elements[id].parentElement = new Element('th');
  }
  const document = {
    getElementById: (id) => elements[id],
    createElement: (tag) => new Element(tag),
  };
  let requested;
  const fetch = async (url) => { requested = url; return reply; };
  vm.runInNewContext(fs.readFileSync(path.join(directory, 'app.js'), 'utf8'), { document, fetch });
  return { elements, requested, settled: new Promise((resolve) => setImmediate(resolve)) };
}

const sample = {
  target: { gameId: 'target', season: 2026, week: 3, gameType: 'REG', homeTeam: 'PHI',
    awayTeam: 'CHI', kickoff: { date: '2026-09-20', time: '13:00' },
    currentOdds: { consensusSpreadHome: 3, contributingBooks: 2 } },
  filters: { gameType: 'REG', weekWindow: { startWeek: 2, endWeek: 5 }, spreadBand: 3,
    featureWeights: { 'home.restDays': 0.05, closingSpreadHome: 0.05 },
    minimumFeatureCoverage: 0.7, limit: 10 },
  summary: { candidateCount: 2, homeCovers: 1, awayCovers: 1, pushes: 0, homeCoverRate: 0.5 },
  candidates: [
    { gameId: 'one', season: 2020, week: 2, gameType: 'REG', homeTeam: 'GB', awayTeam: 'MIN',
      homeScore: 24, awayScore: 20, closingSpreadHome: 3, similarityScore: 0.1,
      distanceContributions: { 'home.restDays': 0.04, closingSpreadHome: 0.06 },
      featureCoverage: 0.9, omittedFeatures: ['away.netEpaPerPlay'], homeAtsMargin: 1, outcome: 'home_cover' },
    { gameId: 'two', season: 2018, week: 5, gameType: 'REG', homeTeam: 'LAR', awayTeam: 'SF',
      homeScore: 17, awayScore: 20, closingSpreadHome: 1, similarityScore: 0.3,
      distanceContributions: { 'home.restDays': 0.1 }, featureCoverage: 0.8,
      omittedFeatures: [], homeAtsMargin: -4, outcome: 'away_cover' },
  ],
};

test('renders target, summary, ATS text, details and keyboard-usable sort and selection', async () => {
  const { elements, requested, settled } = runClient(Promise.resolve({ ok: true, json: async () => sample }));
  await settled;
  assert.equal(requested, '/api/comparison');
  assert.match(elements['target-title'].textContent, /CHI.*PHI/);
  assert.match(elements.summary.textContent, /Home covers.*Away covers.*Pushes/);
  assert.match(elements['candidate-body'].textContent, /Home cover.*Away cover/);
  assert.match(elements.detail.textContent, /MIN 20.*GB 24/);
  assert.match(elements.detail.textContent, /ATS margin.*\+1/);
  assert.match(elements.detail.textContent, /Home · Rest days/);
  assert.match(elements.detail.textContent, /Omitted.*Away · Net EPA per play/);
  const first = elements['candidate-body'].children[0];
  assert.equal(first.attributes.tabindex, '0');
  assert.equal(first.find((node) => node.tagName === 'button').attributes['aria-pressed'], 'true');
  elements['sort-season'].click();
  assert.equal(elements['sort-season'].parentElement.attributes['aria-sort'], 'ascending');
  assert.match(elements['candidate-body'].children[0].textContent, /2018/);
  const selectedRow = elements['candidate-body'].children[0];
  selectedRow.keydown('Enter');
  assert.equal(elements['candidate-body'].children[0], selectedRow, 'selection keeps the focused row mounted');
  assert.match(elements.detail.textContent, /SF 20.*LAR 17/);
  assert.equal(elements['candidate-body'].children[0].find((node) => node.tagName === 'button').attributes['aria-pressed'], 'true');
});

test('empty candidates and failed fetch have explicit states without stale details', async () => {
  const empty = runClient(Promise.resolve({ ok: true, json: async () => ({ ...sample,
    summary: { candidateCount: 0, homeCovers: 0, awayCovers: 0, pushes: 0, homeCoverRate: null },
    candidates: [] }) }));
  await empty.settled;
  assert.match(empty.elements.status.textContent, /No historical games match/);
  assert.equal(empty.elements.detail.textContent, '');
  const failed = runClient(Promise.resolve({ ok: false, status: 500 }));
  await failed.settled;
  assert.match(failed.elements.status.textContent, /Unable to load/);
  assert.equal(failed.elements['candidate-body'].children.length, 0);
});
