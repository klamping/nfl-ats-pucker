# NFL ATS Project Journal

## Purpose

- This is a machine-learning project for fun and is not intended for gambling purposes.
- The goal is to exceed 52% correct against the NFL point spread.
- Each week, every game receives a unique confidence value from 1 through the number of games that week. The most confident pick receives the highest value.

## Market Context

- The Vegas spread is already fairly accurate, so beating it consistently will be difficult.
- The project should focus on finding situations where the market may be wrong, rather than simply predicting which teams will win.
- Possible weaknesses to investigate include overrated or underrated teams and line movement that goes too far in one direction.
- The closing market spread is an important benchmark because it reflects information incorporated by sportsbooks and bettors over time.

## Data Direction

- nflverse full play-by-play data was used in the past through the `nfl-pbp` project.
- The new direction is to use individual player and roster information, rather than relying only on team statistics.
- Player and roster information could be used to estimate how strong a team should be at a given time.
- Player-level performance should be interpreted in context because football results involve teammates, opponents, roles, and schemes.

## Initial Research Goal

- The first phase should determine what actually matters in a game and which combinations of factors matter.
- An example question is whether home-field advantage has a different effect in divisional games played in primetime.
- A factor matters only if it adds information beyond what the spread already reflects.
- Interesting historical patterns should not automatically be treated as useful predictive signals.

## Changing Team Strength

- Teams get better or worse as the season progresses.
- Teammates may work through early problems and improve as they gain experience together.
- Teams may also experience turmoil, lose confidence, or stop playing with the same level of effort.
- A model should account for changing team strength instead of treating a team as having one fixed season-long ability.
- Recent results need to be interpreted carefully because they can reflect genuine improvement, opponent quality, injuries, or luck.

## Final-Score Context

- The final score of a previous game may influence the next spread.
- A blowout loser can score several meaningless late touchdowns, making the final score appear much closer than the game actually was.
- A key research question is whether the market overreacts to that misleading final score and makes the team too favorable in its next game.
- The project should distinguish the final score from how competitive the game was before garbage time.
- The useful question is whether that distinction improves understanding of the next spread and the next game’s result against the spread.

## Historical Similarity

- The model should be able to find historically similar games and matchups.
- Similarity should consider the matchup profile, not just the teams involved or their records.
- Relevant examples include divisional games where the offense and defense of each team resemble the corresponding favorite and underdog in past games.
- Historical comparisons could help show how similar combinations of team strength, matchup, spread, and context performed against the spread.
- Similar games should be used as supporting evidence while accounting for changes across eras, teams, players, and league conditions.

## Current Working Direction

- Treat the spread as the starting point and look for additional information in player availability, roster composition, team development, game context, and underlying performance.
- Favor explanations that distinguish genuine team strength from narratives, luck, and misleading summary statistics.
- Begin with research into factors and relationships before committing to a complex prediction model.
