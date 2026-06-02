// Llaves / eliminatorias del Mundial 2026 (R32 → Final).
// Estructura oficial de cruces (partidos 73-104). Los 8 mejores terceros se asignan
// a sus slots por emparejamiento respetando los grupos permitidos de cada slot.

import type { TeamStanding } from "./standings";

export type KoRound = "R32" | "R16" | "QF" | "SF" | "3P" | "F";

export const ROUND_LABEL: Record<KoRound, string> = {
  R32: "16avos de final",
  R16: "Octavos de final",
  QF: "Cuartos de final",
  SF: "Semifinales",
  "3P": "Tercer puesto",
  F: "Final",
};

export const ROUND_SHORT: Record<KoRound, string> = {
  R32: "16avos",
  R16: "Octavos",
  QF: "Cuartos",
  SF: "Semis",
  "3P": "3er puesto",
  F: "Final",
};

// Referencia a un equipo en un slot del cruce.
type SlotRef =
  | { kind: "winner"; group: string } // 1° de grupo
  | { kind: "runnerup"; group: string } // 2° de grupo
  | { kind: "third"; allowed: string[] } // mejor tercero (uno de estos grupos)
  | { kind: "matchWinner"; match: string } // ganador de otro cruce
  | { kind: "matchLoser"; match: string }; // perdedor (solo 3er puesto)

export type KoMatchDef = {
  id: string;
  round: KoRound;
  home: SlotRef;
  away: SlotRef;
};

const w = (group: string): SlotRef => ({ kind: "winner", group });
const r = (group: string): SlotRef => ({ kind: "runnerup", group });
const t = (allowed: string[]): SlotRef => ({ kind: "third", allowed });
const W = (match: string): SlotRef => ({ kind: "matchWinner", match });
const L = (match: string): SlotRef => ({ kind: "matchLoser", match });

// Cuadro oficial Mundial 2026.
export const KO_MATCHES: KoMatchDef[] = [
  // Round of 32
  { id: "73", round: "R32", home: r("A"), away: r("B") },
  { id: "74", round: "R32", home: w("E"), away: t(["A", "B", "C", "D", "F"]) },
  { id: "75", round: "R32", home: w("F"), away: r("C") },
  { id: "76", round: "R32", home: w("C"), away: r("F") },
  { id: "77", round: "R32", home: w("I"), away: t(["C", "D", "F", "G", "H"]) },
  { id: "78", round: "R32", home: r("E"), away: r("I") },
  { id: "79", round: "R32", home: w("A"), away: t(["C", "E", "F", "H", "I"]) },
  { id: "80", round: "R32", home: w("L"), away: t(["E", "H", "I", "J", "K"]) },
  { id: "81", round: "R32", home: w("D"), away: t(["B", "E", "F", "I", "J"]) },
  { id: "82", round: "R32", home: w("G"), away: t(["A", "E", "H", "I", "J"]) },
  { id: "83", round: "R32", home: r("K"), away: r("L") },
  { id: "84", round: "R32", home: w("H"), away: r("J") },
  { id: "85", round: "R32", home: w("B"), away: t(["E", "F", "G", "I", "J"]) },
  { id: "86", round: "R32", home: w("J"), away: r("H") },
  { id: "87", round: "R32", home: w("K"), away: t(["D", "E", "I", "J", "L"]) },
  { id: "88", round: "R32", home: r("D"), away: r("G") },
  // Round of 16
  { id: "89", round: "R16", home: W("74"), away: W("77") },
  { id: "90", round: "R16", home: W("73"), away: W("75") },
  { id: "91", round: "R16", home: W("76"), away: W("78") },
  { id: "92", round: "R16", home: W("79"), away: W("80") },
  { id: "93", round: "R16", home: W("83"), away: W("84") },
  { id: "94", round: "R16", home: W("81"), away: W("82") },
  { id: "95", round: "R16", home: W("86"), away: W("88") },
  { id: "96", round: "R16", home: W("85"), away: W("87") },
  // Quarter-finals
  { id: "97", round: "QF", home: W("89"), away: W("90") },
  { id: "98", round: "QF", home: W("93"), away: W("94") },
  { id: "99", round: "QF", home: W("91"), away: W("92") },
  { id: "100", round: "QF", home: W("95"), away: W("96") },
  // Semi-finals
  { id: "101", round: "SF", home: W("97"), away: W("98") },
  { id: "102", round: "SF", home: W("99"), away: W("100") },
  // Third place + Final
  { id: "103", round: "3P", home: L("101"), away: L("102") },
  { id: "104", round: "F", home: W("101"), away: W("102") },
];

export const KO_MATCHES_BY_ID: Record<string, KoMatchDef> = Object.fromEntries(
  KO_MATCHES.map((m) => [m.id, m]),
);

export type KoResult = {
  homeGoals: number;
  awayGoals: number;
  penalties: boolean;
  penWinner: string | null; // code del ganador en penales
};

// ---------- Asignación de los 8 mejores terceros ----------

/** Ranking de los 12 terceros; devuelve los grupos de los 8 mejores (ordenados). */
export function bestThirds(standings: Record<string, TeamStanding[]>): string[] {
  const thirds = Object.entries(standings)
    .map(([group, rows]) => ({ group, s: rows[2] }))
    .filter((x) => x.s);
  thirds.sort(
    (a, b) =>
      b.s.points - a.s.points ||
      b.s.goalDiff - a.s.goalDiff ||
      b.s.goalsFor - a.s.goalsFor ||
      a.group.localeCompare(b.group),
  );
  return thirds.slice(0, 8).map((x) => x.group);
}

// Slots de tercero por id de partido, con sus grupos permitidos.
const THIRD_SLOTS: { match: string; allowed: string[] }[] = KO_MATCHES.filter(
  (m) => m.away.kind === "third",
).map((m) => ({
  match: m.id,
  allowed: (m.away as Extract<SlotRef, { kind: "third" }>).allowed,
}));

/**
 * Empareja los grupos de los 8 mejores terceros con los 8 slots respetando los grupos
 * permitidos de cada slot (matching bipartito por caminos aumentantes, determinista).
 * Devuelve match id de slot → letra de grupo.
 */
export function assignThirds(qualifiedGroups: string[]): Record<string, string> {
  const groups = [...qualifiedGroups].sort();
  // slotGroup[match] = group asignado
  const slotToGroup: Record<string, string> = {};
  const groupToSlot: Record<string, string> = {};

  function tryAssign(slotIdx: number, visited: Set<string>): boolean {
    const slot = THIRD_SLOTS[slotIdx];
    for (const g of groups) {
      if (!slot.allowed.includes(g)) continue;
      if (visited.has(g)) continue;
      visited.add(g);
      const occupiedBy = groupToSlot[g];
      if (!occupiedBy || tryAssignSlotByMatch(occupiedBy, visited)) {
        slotToGroup[slot.match] = g;
        groupToSlot[g] = slot.match;
        return true;
      }
    }
    return false;
  }
  function tryAssignSlotByMatch(matchId: string, visited: Set<string>): boolean {
    const idx = THIRD_SLOTS.findIndex((s) => s.match === matchId);
    return tryAssign(idx, visited);
  }

  for (let i = 0; i < THIRD_SLOTS.length; i++) {
    tryAssign(i, new Set());
  }
  return slotToGroup;
}

// ---------- Resolución del cuadro ----------

/**
 * Calcula los equipos de cada cruce de R32 a partir de las posiciones finales de grupos.
 * Devuelve { matchId: { home, away } } con los códigos de equipo (R32, partidos 73-88).
 */
export function computeR32(
  standings: Record<string, TeamStanding[]>,
): Record<string, { home: string; away: string }> {
  const thirdGroups = bestThirds(standings);
  const slotToGroup = assignThirds(thirdGroups);
  const snap: Record<string, { home: string; away: string }> = {};

  function resolveSlot(ref: SlotRef, matchId: string): string {
    if (ref.kind === "winner") return standings[ref.group]?.[0]?.code ?? "";
    if (ref.kind === "runnerup") return standings[ref.group]?.[1]?.code ?? "";
    if (ref.kind === "third") {
      const g = slotToGroup[matchId];
      return g ? (standings[g]?.[2]?.code ?? "") : "";
    }
    return "";
  }

  for (const m of KO_MATCHES) {
    if (m.round !== "R32") continue;
    snap[m.id] = {
      home: resolveSlot(m.home, m.id),
      away: resolveSlot(m.away, m.id),
    };
  }
  return snap;
}

function winnerOf(res: KoResult | undefined, home: string, away: string): string | null {
  if (!res || !home || !away) return null;
  if (res.penalties) return res.penWinner || null;
  if (res.homeGoals > res.awayGoals) return home;
  if (res.awayGoals > res.homeGoals) return away;
  return null; // empate sin penales: indefinido
}

export type ResolvedKoMatch = {
  id: string;
  round: KoRound;
  home: string | null;
  away: string | null;
  homeLabel: string;
  awayLabel: string;
  result?: KoResult;
  winner: string | null;
};

function labelFor(ref: SlotRef, slotToGroup: Record<string, string>, matchId: string): string {
  switch (ref.kind) {
    case "winner":
      return `1° ${ref.group}`;
    case "runnerup":
      return `2° ${ref.group}`;
    case "third": {
      const g = slotToGroup[matchId];
      return g ? `3° ${g}` : `3° (${ref.allowed.join("/")})`;
    }
    case "matchWinner":
      return `Ganador ${ref.match}`;
    case "matchLoser":
      return `Perdedor ${ref.match}`;
  }
}

/**
 * Resuelve todo el cuadro a partir del snapshot de R32 + los resultados oficiales de
 * knockout cargados (que van llenando las rondas siguientes).
 */
export function resolveBracket(
  r32: Record<string, { home: string; away: string }>,
  results: Record<string, KoResult>,
  standings?: Record<string, TeamStanding[]>,
): ResolvedKoMatch[] {
  const slotToGroup = standings ? assignThirds(bestThirds(standings)) : {};
  const teams: Record<string, { home: string | null; away: string | null }> = {};
  const winners: Record<string, string | null> = {};
  const losers: Record<string, string | null> = {};

  for (const m of KO_MATCHES) {
    let home: string | null = null;
    let away: string | null = null;

    if (m.round === "R32") {
      home = r32[m.id]?.home || null;
      away = r32[m.id]?.away || null;
    } else {
      const resolveAdv = (ref: SlotRef): string | null => {
        if (ref.kind === "matchWinner") return winners[ref.match] ?? null;
        if (ref.kind === "matchLoser") return losers[ref.match] ?? null;
        return null;
      };
      home = resolveAdv(m.home);
      away = resolveAdv(m.away);
    }

    teams[m.id] = { home, away };
    const res = results[m.id];
    const win = winnerOf(res, home ?? "", away ?? "");
    winners[m.id] = win;
    losers[m.id] = win ? (win === home ? away : home) : null;
  }

  return KO_MATCHES.map((m) => ({
    id: m.id,
    round: m.round,
    home: teams[m.id].home,
    away: teams[m.id].away,
    homeLabel: labelFor(m.home, slotToGroup, m.id),
    awayLabel: labelFor(m.away, slotToGroup, m.id),
    result: results[m.id],
    winner: winners[m.id],
  }));
}
