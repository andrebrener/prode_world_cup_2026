import { GROUPS, MATCHES, type Match } from "./fixtures";

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

  return rankGroup(Object.values(table), groupMatches, results);
}

// ---------- Desempates (reglamento FIFA — Mundial 2026) ----------
// Para 2026 el mano a mano va ANTES que la diferencia de gol general.
// Orden de clasificación dentro del grupo:
//   1) puntos (en todos los partidos)
// Si dos o más equipos empatan en puntos, entre ESOS equipos (mano a mano):
//   2) puntos · 3) diferencia de gol · 4) goles a favor   (solo en los partidos entre ellos)
//      Si el mano a mano separa parcialmente, se reaplica SOLO entre los que siguen
//      empatados (procedimiento FIFA).
// Si el mano a mano no separa, se vuelve a los criterios generales:
//   5) diferencia de gol general · 6) goles a favor general
// Si todavía empatan: fair play y ranking FIFA — no son predecibles, así que se usa
// el código alfabético como desempate determinista final.

type Mini = { points: number; goalDiff: number; goalsFor: number };

/** Mini-tabla "mano a mano": solo los partidos jugados entre los equipos `codes`. */
function headToHead(
  codes: Set<string>,
  matches: Match[],
  results: Record<string, Score>,
): Record<string, Mini> {
  const stat: Record<string, Mini> = {};
  for (const c of codes) stat[c] = { points: 0, goalDiff: 0, goalsFor: 0 };
  for (const m of matches) {
    if (!codes.has(m.homeCode) || !codes.has(m.awayCode)) continue;
    const r = results[m.id];
    if (!r) continue;
    const h = stat[m.homeCode];
    const a = stat[m.awayCode];
    h.goalsFor += r.homeGoals;
    a.goalsFor += r.awayGoals;
    h.goalDiff += r.homeGoals - r.awayGoals;
    a.goalDiff += r.awayGoals - r.homeGoals;
    if (r.homeGoals > r.awayGoals) h.points += 3;
    else if (r.homeGoals < r.awayGoals) a.points += 3;
    else {
      h.points += 1;
      a.points += 1;
    }
  }
  return stat;
}

const sameMini = (x: Mini, y: Mini) =>
  x.points === y.points && x.goalDiff === y.goalDiff && x.goalsFor === y.goalsFor;

/**
 * Desempate general (cuando el mano a mano no separa): diferencia de gol general,
 * luego goles a favor general y, como cierre determinista (fair play / ranking FIFA no
 * son predecibles), el código alfabético.
 */
function rankByOverall(
  codes: string[],
  byCode: Record<string, TeamStanding>,
): string[] {
  return [...codes].sort(
    (a, b) =>
      byCode[b].goalDiff - byCode[a].goalDiff ||
      byCode[b].goalsFor - byCode[a].goalsFor ||
      a.localeCompare(b),
  );
}

/**
 * Ordena un conjunto de equipos empatados EN PUNTOS aplicando primero el mano a mano
 * (puntos · diferencia de gol · goles a favor entre ellos). Si el mano a mano separa
 * parcialmente, se reaplica recursivamente SOLO entre los que siguen empatados
 * (procedimiento FIFA). Si no separa a nadie, se pasa a los criterios generales.
 */
function rankCluster(
  codes: string[],
  matches: Match[],
  results: Record<string, Score>,
  byCode: Record<string, TeamStanding>,
): string[] {
  if (codes.length <= 1) return codes;
  const mini = headToHead(new Set(codes), matches, results);
  const sorted = [...codes].sort(
    (a, b) =>
      mini[b].points - mini[a].points ||
      mini[b].goalDiff - mini[a].goalDiff ||
      mini[b].goalsFor - mini[a].goalsFor ||
      0,
  );

  const out: string[] = [];
  let i = 0;
  while (i < sorted.length) {
    let j = i + 1;
    while (j < sorted.length && sameMini(mini[sorted[i]], mini[sorted[j]])) j++;
    const sub = sorted.slice(i, j);
    if (sub.length === codes.length) {
      // El mano a mano no separó a nadie → criterios generales.
      out.push(...rankByOverall(sub, byCode));
    } else if (sub.length > 1) {
      // Separó parcialmente: reaplicar el mano a mano solo entre los que siguen empatados.
      out.push(...rankCluster(sub, matches, results, byCode));
    } else {
      out.push(sub[0]);
    }
    i = j;
  }
  return out;
}

/** Ordena la tabla del grupo: por puntos y, ante empate en puntos, mano a mano (FIFA 2026). */
function rankGroup(
  rows: TeamStanding[],
  matches: Match[],
  results: Record<string, Score>,
): TeamStanding[] {
  const byCode = Object.fromEntries(rows.map((r) => [r.code, r]));
  const base = [...rows].sort(
    (a, b) => b.points - a.points || a.code.localeCompare(b.code),
  );

  const result: TeamStanding[] = [];
  let i = 0;
  while (i < base.length) {
    let j = i + 1;
    while (j < base.length && base[i].points === base[j].points) j++;
    const clusterCodes = base.slice(i, j).map((r) => r.code);
    const ordered =
      clusterCodes.length > 1
        ? rankCluster(clusterCodes, matches, results, byCode)
        : clusterCodes;
    for (const code of ordered) result.push(byCode[code]);
    i = j;
  }
  return result;
}

export function allGroupStandings(
  results: Record<string, Score>,
): Record<string, TeamStanding[]> {
  return Object.fromEntries(
    GROUPS.map((g) => [g.letter, groupStandings(g.letter, results)]),
  );
}
