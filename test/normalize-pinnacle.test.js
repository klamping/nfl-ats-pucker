const assert = require('node:assert/strict');
const test = require('node:test');

const fixtureEvent = require('./fixtures/sportsgameodds-event.json');
const { normalizePinnacleEvent } = require('../src/normalize-pinnacle');

test('normalizes Pinnacle opening and closing away-team spreads with explicit orientation', () => {
  const result = normalizePinnacleEvent(fixtureEvent);

  assert.equal(result.rejected, undefined);
  assert.equal(result.accepted.providerEventID, 'sgo-nfl-2025-week-01-dal-sea');
  assert.equal(result.accepted.providerID, 'sportsgameodds');
  assert.equal(result.accepted.bookmakerID, 'pinnacle');
  assert.equal(result.accepted.awayTeam.name, 'Dallas Cowboys');
  assert.equal(result.accepted.homeTeam.name, 'Seattle Seahawks');
  assert.equal(result.accepted.awayScore, 24);
  assert.equal(result.accepted.homeScore, 21);
  assert.equal(result.accepted.spreadOrientation, 'away_team');
  assert.equal(result.accepted.spreadTeam, fixtureEvent.awayTeam.name);
  assert.equal(result.accepted.openingSpread, 3.5);
  assert.equal(result.accepted.closingSpread, 2.5);
  assert.equal(result.accepted.openingSpreadTimestamp, '2025-05-15T16:00:00.000Z');
  assert.equal(result.accepted.closingSpreadTimestamp, '2025-09-07T20:24:00.000Z');
  assert.equal(result.accepted.lineMovement, -1);
});

test('rejects an event without Pinnacle or without both spreads', () => {
  const noPinnacleEvent = structuredClone(fixtureEvent);
  delete noPinnacleEvent.odds['points-away-game-sp-away'].byBookmaker.pinnacle;
  noPinnacleEvent.odds['points-away-game-sp-away'].byBookmaker.draftkings.openSpread = '1.5';
  noPinnacleEvent.odds['points-away-game-sp-away'].byBookmaker.draftkings.closeSpread = '1.0';

  const missingCloseSpreadEvent = structuredClone(fixtureEvent);
  delete missingCloseSpreadEvent.odds['points-away-game-sp-away'].byBookmaker.pinnacle.closeSpread;

  assert.equal(normalizePinnacleEvent(noPinnacleEvent).rejected.reason, 'missing_pinnacle_spread');
  assert.equal(normalizePinnacleEvent(missingCloseSpreadEvent).rejected.reason, 'missing_pinnacle_spread');
});

test('converts a Pinnacle home spread to the away-team perspective', () => {
  const homeSpreadEvent = structuredClone(fixtureEvent);
  const awayMarket = homeSpreadEvent.odds['points-away-game-sp-away'];
  delete homeSpreadEvent.odds['points-away-game-sp-away'];
  homeSpreadEvent.odds['points-home-game-sp-home'] = {
    ...awayMarket,
    oddID: 'points-home-game-sp-home',
    statEntityID: 'home',
    sideID: 'home',
    byBookmaker: {
      pinnacle: {
        ...awayMarket.byBookmaker.pinnacle,
        openSpread: '-3.5',
        closeSpread: '-2.5',
      },
    },
  };

  const result = normalizePinnacleEvent(homeSpreadEvent);

  assert.equal(result.accepted.spreadOrientation, 'away_team');
  assert.equal(result.accepted.spreadTeam, 'Dallas Cowboys');
  assert.equal(result.accepted.openingSpread, 3.5);
  assert.equal(result.accepted.closingSpread, 2.5);
  assert.equal(result.accepted.lineMovement, -1);
});

test('accepts postseason games with complete Pinnacle spreads', () => {
  const postseason = { ...fixtureEvent, seasonType: 'postseason' };
  const result = normalizePinnacleEvent(postseason);

  assert.equal(result.accepted.seasonType, 'postseason');
  assert.equal(result.rejected, undefined);
});

test('rejects preseason and other season types even when Pinnacle spreads are complete', () => {
  for (const seasonType of ['preseason', 'offseason', 'exhibition']) {
    const result = normalizePinnacleEvent({ ...fixtureEvent, seasonType });

    assert.equal(result.accepted, undefined);
    assert.equal(result.rejected.providerEventID, fixtureEvent.eventID);
    assert.equal(result.rejected.reason, 'unsupported_season_type');
  }
});
