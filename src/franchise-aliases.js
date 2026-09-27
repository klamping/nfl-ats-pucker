const FRANCHISE_ALIASES = [
  franchise('3800', 'ARI', [{ teamAlias: 'ARI', startSeason: 2005 }]),
  franchise('0200', 'ATL', [{ teamAlias: 'ATL', startSeason: 2005 }]),
  franchise('0325', 'BAL', [{ teamAlias: 'BAL', startSeason: 2005 }]),
  franchise('0610', 'BUF', [{ teamAlias: 'BUF', startSeason: 2005 }]),
  franchise('0750', 'CAR', [{ teamAlias: 'CAR', startSeason: 2005 }]),
  franchise('0810', 'CHI', [{ teamAlias: 'CHI', startSeason: 2005 }]),
  franchise('0920', 'CIN', [{ teamAlias: 'CIN', startSeason: 2005 }]),
  franchise('1050', 'CLE', [{ teamAlias: 'CLE', startSeason: 2005 }]),
  franchise('1200', 'DAL', [{ teamAlias: 'DAL', startSeason: 2005 }]),
  franchise('1400', 'DEN', [{ teamAlias: 'DEN', startSeason: 2005 }]),
  franchise('1540', 'DET', [{ teamAlias: 'DET', startSeason: 2005 }]),
  franchise('1800', 'GB', [{ teamAlias: 'GB', startSeason: 2005 }]),
  franchise('2120', 'HOU', [{ teamAlias: 'HOU', startSeason: 2005 }]),
  franchise('2200', 'IND', [{ teamAlias: 'IND', startSeason: 2005 }]),
  franchise('2250', 'JAX', [{ teamAlias: 'JAX', startSeason: 2005 }]),
  franchise('2310', 'KC', [{ teamAlias: 'KC', startSeason: 2005 }]),
  franchise('2700', 'MIA', [{ teamAlias: 'MIA', startSeason: 2005 }]),
  franchise('3000', 'MIN', [{ teamAlias: 'MIN', startSeason: 2005 }]),
  franchise('3200', 'NE', [{ teamAlias: 'NE', startSeason: 2005 }]),
  franchise('3300', 'NO', [{ teamAlias: 'NO', startSeason: 2005 }]),
  franchise('3410', 'NYG', [{ teamAlias: 'NYG', startSeason: 2005 }]),
  franchise('3430', 'NYJ', [{ teamAlias: 'NYJ', startSeason: 2005 }]),
  franchise('2520', 'LV', [
    { teamAlias: 'OAK', startSeason: 2005, endSeason: 2019 },
    { teamAlias: 'LV', startSeason: 2020 },
  ]),
  franchise('3700', 'PHI', [{ teamAlias: 'PHI', startSeason: 2005 }]),
  franchise('3900', 'PIT', [{ teamAlias: 'PIT', startSeason: 2005 }]),
  franchise('4400', 'LAC', [
    { teamAlias: 'SD', startSeason: 2005, endSeason: 2016 },
    { teamAlias: 'LAC', startSeason: 2017 },
  ]),
  franchise('4600', 'SEA', [{ teamAlias: 'SEA', startSeason: 2005 }]),
  franchise('4500', 'SF', [{ teamAlias: 'SF', startSeason: 2005 }]),
  franchise('2510', 'LA', [
    { teamAlias: 'STL', startSeason: 2005, endSeason: 2015 },
    { teamAlias: 'LA', startSeason: 2016 },
  ]),
  franchise('4900', 'TB', [{ teamAlias: 'TB', startSeason: 2005 }]),
  franchise('2100', 'TEN', [{ teamAlias: 'TEN', startSeason: 2005 }]),
  franchise('5110', 'WAS', [
    { teamAlias: 'WAS', startSeason: 2005, endSeason: 2019 },
    { teamAlias: 'WAS', startSeason: 2020, endSeason: 2021 },
    { teamAlias: 'WAS', startSeason: 2022 },
  ]),
];

function franchise(nflTeamId, currentAlias, aliases) {
  return {
    franchiseId: `nflverse-${nflTeamId}`,
    nflTeamId,
    currentAlias,
    aliases,
  };
}

function findFranchiseAlias(teamAlias, season) {
  for (const franchiseDefinition of FRANCHISE_ALIASES) {
    const alias = franchiseDefinition.aliases.find(
      (candidate) => candidate.teamAlias === teamAlias
        && candidate.startSeason <= season
        && season <= (candidate.endSeason ?? Number.MAX_SAFE_INTEGER),
    );

    if (alias) {
      return { franchiseDefinition, alias };
    }
  }

  return null;
}

function findFranchiseAliasAnySeason(teamAlias) {
  for (const franchiseDefinition of FRANCHISE_ALIASES) {
    const alias = franchiseDefinition.aliases.find((candidate) => candidate.teamAlias === teamAlias);
    if (alias) return { franchiseDefinition, alias };
  }
  return null;
}

function aliasesForRange(franchiseDefinition, startSeason, endSeason) {
  return franchiseDefinition.aliases
    .map((alias) => ({
      teamAlias: alias.teamAlias,
      startSeason: Math.max(alias.startSeason, startSeason),
      endSeason: Math.min(alias.endSeason ?? endSeason, endSeason),
    }))
    .filter((alias) => alias.startSeason <= alias.endSeason);
}

module.exports = { FRANCHISE_ALIASES, aliasesForRange, findFranchiseAlias, findFranchiseAliasAnySeason };
