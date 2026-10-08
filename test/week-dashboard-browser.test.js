const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');
const { spawn } = require('node:child_process');

const hasBrowser = ['/usr/bin/chromium', '/usr/bin/chromedriver'].every(file => require('node:fs').existsSync(file));
const games = [
  ['a', 'PHI at CHI', 'CHI', 82], ['b', 'BUF at MIA', 'BUF', 75],
  ['c', 'KC at BAL', 'BAL', 69], ['d', 'DAL at NYG', 'DAL', 51],
].map(([gameId, matchup, recommendedPick, weightedConfidence]) => ({
  status: 'ready', gameId, matchup, recommendedPick, weightedConfidence,
  kickoff: { utc: '2026-10-11T17:00:00.000Z' }, currentOdds: { provider: 'nflverse', consensusSpreadHome: -3.5 },
  candidateCount: 100, coverSplit: 24, decidedGameCount: 96, coverSplitInterval: { lower: 8.1, upper: 38.6 },
}));

test('weekly cards support real pointer dragging, cancellation, persistent picks and responsive layout', {
  skip: !hasBrowser && 'Chromium and ChromeDriver are required', timeout: 90000,
}, async (t) => {
  const { remote } = require('webdriverio');
  const assets = Object.fromEntries(await Promise.all([
    ['/', 'index.html', 'text/html'], ['/week-app.js', 'app.js', 'text/javascript'], ['/week-styles.css', 'styles.css', 'text/css'],
  ].map(async ([route, file, type]) => [route, { body: await fs.readFile(path.join(__dirname, '../public/week-dashboard', file)), type }])));
  const server = http.createServer((request, response) => {
    if (request.url === '/api/slate') { response.setHeader('Content-Type', 'application/json'); response.end(JSON.stringify({ season: 2026, week: 3, games })); return; }
    if (assets[request.url]) { response.setHeader('Content-Type', assets[request.url].type); response.end(assets[request.url].body); return; }
    response.writeHead(404); response.end();
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  let driver;
  t.after(async () => {
    try { if (browser) await browser.deleteSession(); }
    finally {
      if (driver?.exitCode === null) driver.kill();
      server.closeAllConnections();
      await new Promise(resolve => server.close(resolve));
    }
  });
  driver = spawn('/usr/bin/chromedriver', ['--port=0'], { stdio: ['ignore', 'pipe', 'pipe'] });
  const port = await new Promise((resolve, reject) => {
    let output = '';
    driver.stdout.on('data', chunk => { output += chunk; const match = output.match(/started successfully on port (\d+)/); if (match) resolve(Number(match[1])); });
    driver.on('error', reject);
    driver.on('exit', code => reject(new Error(`ChromeDriver exited with ${code}`)));
  });
  browser = await remote({ hostname: '127.0.0.1', port, logLevel: 'error', capabilities: {
    browserName: 'chrome', 'goog:chromeOptions': { binary: '/usr/bin/chromium', args: ['--headless', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'] },
  } });
  await browser.setWindowSize(1280, 1100);
  await browser.url(`http://127.0.0.1:${server.address().port}/`);
  await browser.waitUntil(async () => (await browser.$$('.week-game')).length === 4);
  const order = () => browser.execute(() => [...document.querySelectorAll('.week-game')].map(card => card.dataset.gameId));
  const reset = async () => { await (await browser.$('#reset-order')).click(); await browser.execute(() => window.scrollTo(0, 0)); };
  const coordinates = (id, targetId, after = false) => browser.execute((gameId, target, below) => {
    const handle = document.querySelector(`[data-game-id="${gameId}"] .drag-handle`).getBoundingClientRect();
    const card = document.querySelector(`[data-game-id="${target}"]`).getBoundingClientRect();
    return { x: Math.round(handle.left + handle.width / 2), y: Math.round(handle.top + handle.height / 2), targetY: Math.round(below ? card.bottom - 3 : card.top + 3) };
  }, id, targetId, after);
  const pointer = (type, actions) => browser.performActions([{ type: 'pointer', id: 'grip', parameters: { pointerType: type }, actions }]);
  const startDrag = async (type, id, target, after = false) => {
    const point = await coordinates(id, target, after);
    await pointer(type, [
      { type: 'pointerMove', duration: 0, x: point.x, y: point.y }, { type: 'pointerDown', button: 0 },
      { type: 'pointerMove', duration: 150, x: point.x, y: point.targetY },
    ]);
  };
  const release = async (type) => { await pointer(type, [{ type: 'pointerUp', button: 0 }]); await browser.releaseActions(); };

  await (await browser.$('[data-game-id="a"] .points-value')).setValue('1');
  await (await browser.$('[data-game-id="a"] [data-team="CHI"]')).click();
  assert.equal(await (await browser.$('[data-game-id="a"] .my-pick-value')).getText(), 'Bears', 'a points blur must not consume the intended team click');
  assert.deepEqual(await order(), ['b', 'c', 'd', 'a']);
  await reset();
  await (await browser.$('[data-game-id="a"] .points-value')).setValue('1');
  await (await browser.$('[data-game-id="a"] .matchup-search')).click();
  assert.match(await browser.getUrl(), /\/games\/a\/$/, 'a points blur must not consume matchup navigation');
  await browser.url(`http://127.0.0.1:${server.address().port}/`);
  await browser.waitUntil(async () => (await browser.$$('.week-game')).length === 4);
  await reset();

  await (await browser.$('[data-game-id="a"] .points-value')).setValue('1');
  await browser.keys('Tab');
  await browser.waitUntil(async () => (await order()).join(',') === 'b,c,d,a');
  assert.deepEqual(await order(), ['b', 'c', 'd', 'a']);
  assert.equal(await (await browser.$('[data-game-id="a"] .matchup-search')).isFocused(), true, 'Tab commits points and advances to the next control');
  await reset();

  await startDrag('mouse', 'd', 'a');
  assert.equal(await (await browser.$('.insert-before')).isExisting(), true, 'drag displays an insertion marker');
  await release('mouse');
  assert.deepEqual(await order(), ['d', 'a', 'b', 'c']);
  assert.equal(await browser.execute(() => localStorage.getItem('nfl-ats-pucker:week-ranks:2026:3')), '["d","a","b","c"]');
  assert.equal(await (await browser.$('[data-game-id="d"] .drag-handle')).isFocused(), true);

  await reset();
  await startDrag('mouse', 'a', 'd', true);
  await browser.keys('Escape');
  await release('mouse');
  assert.deepEqual(await order(), ['a', 'b', 'c', 'd']);
  assert.equal(await browser.execute(() => document.querySelectorAll('.insert-before,.insert-after,.is-dragging').length), 0);

  const touch = await coordinates('a', 'd', true);
  await pointer('touch', [
    { type: 'pointerMove', duration: 0, x: touch.x, y: touch.y }, { type: 'pointerDown', button: 0 },
    { type: 'pointerMove', duration: 150, x: touch.x, y: touch.targetY }, { type: 'pointerUp', button: 0 },
  ]);
  await browser.releaseActions();
  assert.deepEqual(await order(), ['b', 'c', 'd', 'a'], 'touch dragging shifts the intervening cards');
  await (await browser.$('[data-game-id="a"] [data-team="CHI"]')).click();
  await browser.refresh();
  await browser.waitUntil(async () => (await browser.$$('.week-game')).length === 4);
  assert.deepEqual(await order(), ['b', 'c', 'd', 'a']);
  assert.equal(await (await browser.$('[data-game-id="a"] .my-pick-value')).getText(), 'Bears');
  assert.equal(await (await browser.$('[data-game-id="a"] .matchup-search')).getAttribute('href'), '/games/a/');

  for (const width of [320, 400, 900, 1280]) {
    const cdp = await fetch(`http://127.0.0.1:${port}/session/${browser.sessionId}/goog/cdp/execute`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cmd: 'Emulation.setDeviceMetricsOverride', params: { width, height: 1000, deviceScaleFactor: 1, mobile: true } }),
    });
    assert.equal(cdp.status, 200);
    const bounds = await browser.execute(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth,
      cards: [...document.querySelectorAll('.week-game')].map(card => ({ right: card.getBoundingClientRect().right, width: card.clientWidth, scroll: card.scrollWidth })),
    }));
    assert.equal(bounds.width, width);
    assert.equal(bounds.scroll, width, 'no horizontal page overflow');
    for (const card of bounds.cards) { assert.ok(card.right <= width); assert.ok(card.scroll <= card.width + 1, 'card content fits'); }
  }

  const shortViewport = await fetch(`http://127.0.0.1:${port}/session/${browser.sessionId}/goog/cdp/execute`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cmd: 'Emulation.setDeviceMetricsOverride', params: { width: 900, height: 450, deviceScaleFactor: 1, mobile: true } }),
  });
  assert.equal(shortViewport.status, 200);
  await reset();
  assert.equal(await browser.execute(() => document.querySelector('[data-game-id="d"]').getBoundingClientRect().top > innerHeight), true, 'last card starts offscreen');
  const firstGrip = await coordinates('a', 'a');
  await pointer('mouse', [
    { type: 'pointerMove', duration: 0, x: firstGrip.x, y: firstGrip.y }, { type: 'pointerDown', button: 0 },
    { type: 'pointerMove', duration: 150, x: firstGrip.x, y: 435 },
  ]);
  await browser.waitUntil(async () => browser.execute(() => document.querySelector('[data-game-id="d"]').getBoundingClientRect().bottom < innerHeight - 25), { timeout: 5000 });
  assert.ok(await browser.execute(() => scrollY) > 0, 'holding near the bottom auto-scrolls');
  await release('mouse');
  assert.deepEqual(await order(), ['b', 'c', 'd', 'a'], 'drag reaches a previously offscreen card');

  await browser.execute(() => document.querySelector('[data-game-id="a"] .drag-handle').scrollIntoView({ block: 'center' }));
  const lastGrip = await coordinates('a', 'a');
  await pointer('mouse', [
    { type: 'pointerMove', duration: 0, x: lastGrip.x, y: lastGrip.y }, { type: 'pointerDown', button: 0 },
    { type: 'pointerMove', duration: 150, x: lastGrip.x, y: 20 },
  ]);
  await browser.waitUntil(async () => browser.execute(() => scrollY === 0), { timeout: 5000 });
  await release('mouse');
  assert.deepEqual(await order(), ['a', 'b', 'c', 'd'], 'holding near the top scrolls back and permits insertion first');
});
