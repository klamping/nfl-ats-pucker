const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { parse } = require('csv-parse/sync');
const { nflverseKickoffToUtc } = require('./gather-pregame');

const ROOT = 'https://github.com/nflverse/nflverse-data/releases/download';
const DATASETS = [
  ['playerStats', 'player_stats/player_stats_{season}.csv', ['player_id', 'player_display_name', 'position', 'recent_team', 'season', 'week', 'season_type', 'attempts', 'sacks', 'passing_epa', 'carries', 'rushing_epa', 'targets', 'receiving_epa']],
  ['defensivePlayerStats', 'player_stats/player_stats_def_{season}.csv', ['season', 'week', 'season_type', 'player_id', 'player_display_name', 'position', 'team', 'def_sacks', 'def_interceptions']],
  ['snapCounts', 'snap_counts/snap_counts_{season}.csv', ['game_id', 'season', 'game_type', 'week', 'player', 'position', 'team', 'opponent', 'offense_snaps', 'defense_snaps']],
  ['teamStats', 'stats_team/stats_team_week_{season}.csv', ['season', 'week', 'team', 'season_type', 'game_id', 'opponent_team', 'attempts', 'carries', 'passing_epa', 'rushing_epa', 'sacks_suffered']],
];

function createNflverseRosterDataClient({ fetchImpl = fetch, now = () => new Date(), fileSystem = fs } = {}) {
  if (typeof fetchImpl !== 'function') throw new TypeError('A fetch implementation is required');
  return { async loadSeasons({ seasons, scheduleRows, outputRoot = process.cwd() } = {}) {
    if (!Array.isArray(seasons) || !seasons.length || new Set(seasons).size !== seasons.length || seasons.some((season) => !Number.isInteger(season) || season < 2005)) throw new Error('Invalid roster data seasons');
    const kickoffsByTeamWeek = buildKickoffs(scheduleRows, seasons);
    const retrievedAt = validClock(now);
    const downloaded = [];
    for (const season of seasons) {
      const dataset = { season, kickoffsByTeamWeek: Object.fromEntries(Object.entries(kickoffsByTeamWeek).filter(([, value]) => value.season === season).map(([key, value]) => [key, value.kickoff])) };
      for (const [key, template, required] of DATASETS) {
        const sourceUrl = `${ROOT}/${template.replace('{season}', season)}`;
        const response = await fetchImpl(sourceUrl, { headers: { Accept: 'text/csv' }, signal: AbortSignal.timeout(30000) });
        if (!response.ok) throw new Error(`nflverse roster ${key} download failed with status ${response.status}`);
        const csv = await response.text();
        const rows = parseCsv(csv, key, required, season);
        dataset[key] = rows;
        downloaded.push({ season, key, sourceUrl, csv });
      }
      downloaded.push({ season, dataset });
    }
    const seasonData = downloaded.filter((entry) => entry.dataset).map(({ dataset }) => dataset);
    await publish({ fileSystem, outputRoot, seasons, retrievedAt, downloaded: downloaded.filter((entry) => entry.csv), seasonData });
    return { seasons: seasonData, retrievedAt };
  } };
}

function validClock(now) { const value = now(); if (!(value instanceof Date) || !Number.isFinite(value.getTime())) throw new TypeError('Invalid roster data clock'); return value.toISOString(); }
function parseCsv(csv, name, required, season) {
  let rows;
  try { rows = parse(csv, { columns: true, skip_empty_lines: true }); } catch { throw new Error(`nflverse roster ${name} CSV could not be parsed`); }
  if (!rows.length || required.some((column) => !Object.hasOwn(rows[0], column))) throw new Error(`nflverse roster ${name} CSV missing required columns`);
  if (rows.some((row) => String(row.season) !== String(season) || !row.week || !(row.season_type || row.game_type))) throw new Error(`nflverse roster ${name} CSV has invalid rows`);
  return rows;
}
function buildKickoffs(rows, seasons) {
  if (!Array.isArray(rows)) throw new Error('Roster data schedule rows are required');
  const values = {};
  for (const row of rows) {
    const season = Number(row.season); if (!seasons.includes(season) || !['REG', 'POST'].includes(row.game_type)) continue;
    const kickoff = nflverseKickoffToUtc({ date: row.gameday, time: row.gametime });
    for (const team of [row.away_team, row.home_team]) {
      const key = `${team}:${season}:${row.week}`;
      if (!/^[A-Z]{2,3}$/.test(team || '') || !Number.isInteger(Number(row.week)) || values[key]) throw new Error('Roster data schedule has ambiguous team-week kickoff');
      values[key] = { season, kickoff };
    }
  }
  if (seasons.some((season) => !Object.values(values).some((entry) => entry.season === season))) throw new Error('Roster data schedule has no season kickoff');
  return values;
}
async function publish({ fileSystem, outputRoot, seasons, retrievedAt, downloaded, seasonData }) {
  const rawDirectory = path.join(outputRoot, 'data/raw/nflverse/roster-impact');
  const currentDirectory = path.join(outputRoot, 'data/current/roster-impact');
  await fileSystem.mkdir(rawDirectory, { recursive: true }); await fileSystem.mkdir(currentDirectory, { recursive: true });
  const stem = `${retrievedAt.replace(/[:.]/g, '-')}-${seasons.join('-')}`;
  for (const entry of downloaded) await uniqueWrite(fileSystem, rawDirectory, `${stem}-${entry.season}-${entry.key}.csv`, entry.csv);
  const dataName = `nflverse-roster-data-${seasons[0]}-${seasons.at(-1)}-${stem}.json`;
  await atomicWrite(fileSystem, currentDirectory, dataName, JSON.stringify({ seasons: seasonData }));
  await atomicWrite(fileSystem, currentDirectory, `nflverse-roster-data-${seasons[0]}-${seasons.at(-1)}.current.json`, JSON.stringify({ retrievedAt, data: dataName, seasons: seasonData.map(({ season }) => ({ season })) }));
}
async function uniqueWrite(fileSystem, directory, name, body) { for (let number = 1; ; number++) { const file = path.join(directory, number === 1 ? name : name.replace(/\.csv$/, `-${number}.csv`)); try { await fileSystem.writeFile(file, body, { flag: 'wx' }); return; } catch (error) { if (error.code !== 'EEXIST') throw error; } } }
async function atomicWrite(fileSystem, directory, name, body) { const pending = path.join(directory, `.${randomUUID()}.pending`); await fileSystem.writeFile(pending, body, { flag: 'wx' }); await fileSystem.rename(pending, path.join(directory, name)); }
module.exports = { createNflverseRosterDataClient };
