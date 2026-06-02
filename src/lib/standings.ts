import { GROUPS, MATCHES } from "./fixtures";

export type Score = { homeGoals: number; awayGoals: number };

export type TeamStanding = {
  code: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDiff: number;
  points: number;
};

/** Calcula la tabla de un grupo a partir de los resultados reales cargados. */
export function groupStandings(
  groupLetter: string,
  results: Record<string, Score>,
): TeamStanding[] {
  const group = GROUPS.find((g) => g.letter === groupLetter);
  if (!group) return [];

  const table: Record<string, TeamStanding> = {};
  for (const team of group.teams) {
    table[team.code] = {
      code: team.code,
      played: 0,
      won: 0,
      drawn: 0,
      lost: 0,
      goalsFor: 0,
      goalsAgainst: 0,
      goalDiff: 0,
      points: 0,
    };
  }

  const groupMatches = MATCHES.filter((m) => m.group === groupLetter);
  for (const match of groupMatches) {
    const r = results[match.id];
    if (!r) continue;
    const home = table[match.homeCode];
    const away = table[match.awayCode];
    if (!home || !away) continue;

    home.played++;
    away.played++;
    home.goalsFor += r.homeGoals;
    home.goalsAgainst += r.awayGoals;
    away.goalsFor += r.awayGoals;
    away.goalsAgainst += r.homeGoals;

    if (r.homeGoals > r.awayGoals) {
      home.won++;
      away.lost++;
      home.points += 3;
    } else if (r.homeGoals < r.awayGoals) {
      away.won++;
      home.lost++;
      away.points += 3;
    } else {
      home.drawn++;
      away.drawn++;
      home.points += 1;
      away.points += 1;
    }
  }

  for (const code of Object.keys(table)) {
    table[code].goalDiff = table[code].goalsFor - table[code].goalsAgainst;
  }

  // Orden: puntos, diferencia de gol, goles a favor, alfabético (desempate simple).
  return Object.values(table).sort(
    (a, b) =>
      b.points - a.points ||
      b.goalDiff - a.goalDiff ||
      b.goalsFor - a.goalsFor ||
      a.code.localeCompare(b.code),
  );
}

export function allGroupStandings(
  results: Record<string, Score>,
): Record<string, TeamStanding[]> {
  return Object.fromEntries(
    GROUPS.map((g) => [g.letter, groupStandings(g.letter, results)]),
  );
}
