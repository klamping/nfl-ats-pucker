const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { tmpdir } = require('node:os');
const { execFileSync } = require('node:child_process');
const { buildDashboardPayload } = require('../src/dashboard-server');
const { compareHistorical } = require('../src/compare-historical');

const browser = ['/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome']
  .find(file => require('node:fs').existsSync(file));

test('summary cards and their contents stay within an adaptive grid at narrow and wide widths', {
  skip: !browser && 'Chromium is required for the layout regression',
}, async (t) => {
  const temporaryRoot = path.join(tmpdir(), 'opencode');
  await fs.mkdir(temporaryRoot, { recursive: true });
  const root = await fs.mkdtemp(path.join(temporaryRoot, 'summary-layout-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const directory = path.join(__dirname, '../public/dashboard');
  const features = Object.fromEntries(['gamesPlayed', 'winPercentage', 'pointsScoredPerGame', 'pointsAllowedPerGame',
    'netYardsPerPlay', 'netEpaPerPlay', 'turnoverMarginPerGame', 'offensiveSackRate', 'defensiveSackRate',
    'restDays', 'passingEpaPerDropback', 'rushingEpaPerCarry', 'explosivePlayRate', 'passingCpoe',
    'interceptionRate', 'rushingYardsPerCarry', 'passingExplosiveRate', 'rushingExplosiveRate',
    'penaltyYardsPerGame'].map(field => [field, 1]));
  const input = { gameId: 'target', season: 2026, week: 3, gameType: 'REG', homeTeam: 'PHI', awayTeam: 'CHI',
    kickoff: { date: '2026-09-20', time: '13:00' }, closingSpreadHome: -3,
    currentOdds: { provider: 'nflverse', retrievedAt: '2026-09-20T12:00:00Z', consensusSpreadHome: -3 },
    homePregame: features, awayPregame: features };
  const historical = { ...input, gameId: 'old', season: 2020, homeScore: 24, awayScore: 20 };
  const payload = buildDashboardPayload(input, compareHistorical({ input, historicalMatchups: [historical] }));
  const [markup, css, app] = await Promise.all(['index.html', 'styles.css', 'app.js'].map(file => fs.readFile(path.join(directory, file), 'utf8')));
  const html = markup.replace(/<link[^>]+href="\/styles\.css"[^>]*>/, `<style>${css}</style>`)
    .replace(/<script[^>]+src="[^"]+"[^>]*><\/script>/g, '')
    .replace('</body>', `<script>
      window.fetch = async () => ({ ok: true, json: async () => (${JSON.stringify(payload)}) });
      window.Chart = class {};
      ${app}
      window.addEventListener('load', () => {
        const summary = document.getElementById('summary');
        const shell = document.querySelector('.shell');
        const results = [320, 600, 900, 1400].map(width => {
          shell.style.width = width + 'px'; shell.style.maxWidth = 'none'; shell.style.padding = '0';
          const bounds = summary.getBoundingClientRect();
          const escaping = Array.from(summary.querySelectorAll('*')).filter(node => {
            const rect = node.getBoundingClientRect();
            return rect.right > bounds.right + 1 || rect.left < bounds.left - 1 || node.scrollWidth > node.clientWidth + 1;
          }).map(node => node.tagName + ':' + node.textContent);
          const distribution = document.getElementById('margin-distribution');
          const panels = Array.from(distribution.children).map(node => {
            const rect = node.getBoundingClientRect();
            return { left: rect.left, top: rect.top, right: rect.right };
          });
          return { width, panels, distributionWidth: distribution.clientWidth, distributionScrollWidth: distribution.scrollWidth,
            display: getComputedStyle(summary).display, clientWidth: summary.clientWidth,
            scrollWidth: summary.scrollWidth, columns: getComputedStyle(summary).gridTemplateColumns.split(' ').length, escaping };
        });
        const output = document.createElement('pre'); output.id = 'layout-result';
        output.textContent = JSON.stringify({ status: document.getElementById('status').textContent, results });
        document.body.append(output);
      });
    </script></body>`);
  const file = path.join(root, 'layout.html');
  await fs.writeFile(file, html);
  const output = execFileSync(browser, ['--headless', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
    '--no-first-run', '--no-default-browser-check', '--window-size=1500,1000',
    `--user-data-dir=${path.join(root, 'profile')}`, '--dump-dom', `file://${file}`],
  { encoding: 'utf8', timeout: 30000, stdio: ['ignore', 'pipe', 'pipe'] });
  const measurement = output.match(/<pre id="layout-result">([\s\S]*?)<\/pre>/);
  assert.ok(measurement, 'browser completed the layout measurement');
  const { status, results } = JSON.parse(measurement[1].replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&amp;/g, '&'));
  assert.doesNotMatch(status, /Unable to load/);
  for (const result of results) {
    assert.equal(result.display, 'grid');
    assert.equal(result.scrollWidth, result.clientWidth, `${result.width}px summary stays within its container`);
    assert.deepEqual(result.escaping, [], `${result.width}px summary content does not escape its cards`);
  }
  assert.equal(results[0].columns, 1, 'narrow summary stacks into one column');
  assert.ok(results.at(-1).columns > 1, 'wide summary uses multiple columns');
  assert.equal(results[0].panels.length, 3);
  assert.ok(results[0].panels[1].top > results[0].panels[0].top, 'narrow pies stack');
  const wide = results.at(-1).panels;
  assert.equal(wide[0].top, wide[1].top, 'wide pies sit side-by-side');
  assert.equal(wide[1].top, wide[2].top);
  assert.ok(wide[0].right <= wide[1].left && wide[1].right <= wide[2].left, 'pie panels do not overlap');
  for (const result of results) {
    assert.equal(result.distributionScrollWidth, result.distributionWidth, `${result.width}px pies do not overflow`);
  }
});
