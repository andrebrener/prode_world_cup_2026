import { db } from "./index";
import {
  participants,
  matchPredictions,
  extraPredictions,
  matchResults,
  tournamentResult,
  bracketMeta,
  knockoutPredictions,
  knockoutResults,
  pools,
  poolMembers,
} from "./schema";
import { eq, inArray, sql } from "drizzle-orm";
import {
  matchPoints,
  extraPoints,
  knockoutPoints,
  type ExtraPick,
  type KoReal,
} from "../scoring";
import type { Score } from "../scoring";
import { resolveBracket, type KoResult, type ResolvedKoMatch } from "../bracket";
import { allGroupStandings } from "../standings";

// ---------- Prodes ----------

export type Pool = {
  id: string;
  name: string;
  slug: string;
  code: string;
  isPublic: boolean;
  createdBy: string | null;
};

function toPool(row: typeof pools.$inferSelect): Pool {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    code: row.code,
    isPublic: row.isPublic,
    createdBy: row.createdBy,
  };
}

export async function getPoolBySlug(slug: string): Promise<Pool | null> {
  const rows = await db.select().from(pools).where(eq(pools.slug, slug));
  return rows[0] ? toPool(rows[0]) : null;
}

export async function getPoolByCode(code: string): Promise<Pool | null> {
  const rows = await db.select().from(pools).where(eq(pools.code, code.trim().toLowerCase()));
  return rows[0] ? toPool(rows[0]) : null;
}

/** IDs de los participantes que son miembros de un prode. */
export async function getPoolMemberIds(poolId: string): Promise<string[]> {
  const rows = await db
    .select({ id: poolMembers.participantId })
    .from(poolMembers)
    .where(eq(poolMembers.poolId, poolId));
  return rows.map((r) => r.id);
}

export async function isPoolMember(poolId: string, participantId: string): Promise<boolean> {
  const rows = await db
    .select({ id: poolMembers.participantId })
    .from(poolMembers)
    .where(eq(poolMembers.poolId, poolId));
  return rows.some((r) => r.id === participantId);
}

export type PoolSummary = Pool & { memberCount: number };

/** Prodes a los que pertenece un participante, con cantidad de miembros. */
export async function getUserPools(participantId: string): Promise<PoolSummary[]> {
  const memberRows = await db
    .select({ poolId: poolMembers.poolId })
    .from(poolMembers)
    .where(eq(poolMembers.participantId, participantId));
  const ids = memberRows.map((r) => r.poolId);
  if (ids.length === 0) return [];
  const poolRows = await db.select().from(pools).where(inArray(pools.id, ids));
  const counts = await memberCounts(ids);
  return poolRows
    .map((p) => ({ ...toPool(p), memberCount: counts[p.id] ?? 0 }))
    .sort((a, b) => a.name.localeCompare(b.name, "es"));
}

/** Prodes públicos (para el listado de la home). */
export async function getPublicPools(): Promise<PoolSummary[]> {
  const poolRows = await db.select().from(pools).where(eq(pools.isPublic, true));
  const ids = poolRows.map((p) => p.id);
  const counts = await memberCounts(ids);
  return poolRows
    .map((p) => ({ ...toPool(p), memberCount: counts[p.id] ?? 0 }))
    .sort((a, b) => b.memberCount - a.memberCount || a.name.localeCompare(b.name, "es"));
}

async function memberCounts(poolIds: string[]): Promise<Record<string, number>> {
  if (poolIds.length === 0) return {};
  const rows = await db
    .select({ poolId: poolMembers.poolId, n: sql<number>`count(*)` })
    .from(poolMembers)
    .where(inArray(poolMembers.poolId, poolIds))
    .groupBy(poolMembers.poolId);
  return Object.fromEntries(rows.map((r) => [r.poolId, Number(r.n)]));
}

export async function getResultsMap(): Promise<Record<string, Score>> {
  const rows = await db.select().from(matchResults);
  return Object.fromEntries(
    rows.map((r) => [r.matchId, { homeGoals: r.homeGoals, awayGoals: r.awayGoals }]),
  );
}

export async function getTournamentResult(): Promise<ExtraPick> {
  const rows = await db
    .select()
    .from(tournamentResult)
    .where(eq(tournamentResult.id, 1));
  const row = rows[0];
  return {
    champion: row?.champion ?? null,
    runnerUp: row?.runnerUp ?? null,
    topScorer: row?.topScorer ?? null,
    figure: row?.figure ?? null,
  };
}

export async function getParticipant(id: string) {
  const rows = await db.select().from(participants).where(eq(participants.id, id));
  return rows[0] ?? null;
}

export async function getParticipantPredictions(id: string) {
  const rows = await db
    .select()
    .from(matchPredictions)
    .where(eq(matchPredictions.participantId, id));
  const map: Record<string, Score> = {};
  for (const r of rows) map[r.matchId] = { homeGoals: r.homeGoals, awayGoals: r.awayGoals };
  return map;
}

export async function getParticipantExtras(id: string): Promise<ExtraPick> {
  const rows = await db
    .select()
    .from(extraPredictions)
    .where(eq(extraPredictions.participantId, id));
  const row = rows[0];
  return {
    champion: row?.champion ?? null,
    runnerUp: row?.runnerUp ?? null,
    topScorer: row?.topScorer ?? null,
    figure: row?.figure ?? null,
  };
}

export type LeaderboardRow = {
  id: string;
  name: string;
  matchPoints: number;
  koPoints: number;
  extraPoints: number;
  total: number;
  exactCount: number;
  predictionsCount: number;
};

/** Tabla de un prode: calcula puntos de cada miembro contra los resultados reales. */
export async function getLeaderboard(poolId: string): Promise<LeaderboardRow[]> {
  const memberIds = await getPoolMemberIds(poolId);
  if (memberIds.length === 0) return [];

  const [people, allPreds, allExtras, allKoPreds, results, tourney, bracket] =
    await Promise.all([
      db.select().from(participants).where(inArray(participants.id, memberIds)),
      db.select().from(matchPredictions),
      db.select().from(extraPredictions),
      db.select().from(knockoutPredictions),
      getResultsMap(),
      getTournamentResult(),
      getBracketState(),
    ]);

  // Cruces resueltos por id (para saber home/away y resultado de cada knockout).
  const koByMatch = Object.fromEntries(bracket.matches.map((m) => [m.id, m]));
  const koPredsByPerson: Record<
    string,
    Record<string, { homeGoals: number; awayGoals: number; advance: string }>
  > = {};
  for (const k of allKoPreds) {
    (koPredsByPerson[k.participantId] ??= {})[k.matchId] = {
      homeGoals: k.homeGoals,
      awayGoals: k.awayGoals,
      advance: k.advance,
    };
  }

  const predsByPerson: Record<string, Record<string, Score>> = {};
  const countByPerson: Record<string, number> = {};
  for (const p of allPreds) {
    (predsByPerson[p.participantId] ??= {})[p.matchId] = {
      homeGoals: p.homeGoals,
      awayGoals: p.awayGoals,
    };
    countByPerson[p.participantId] = (countByPerson[p.participantId] ?? 0) + 1;
  }
  const extrasByPerson: Record<string, ExtraPick> = {};
  for (const e of allExtras) {
    extrasByPerson[e.participantId] = {
      champion: e.champion,
      runnerUp: e.runnerUp,
      topScorer: e.topScorer,
      figure: e.figure,
    };
  }

  const rows: LeaderboardRow[] = people.map((person) => {
    const preds = predsByPerson[person.id] ?? {};
    let mp = 0;
    let exact = 0;
    for (const [matchId, pred] of Object.entries(preds)) {
      const real = results[matchId];
      const pts = matchPoints(pred, real);
      mp += pts;
      if (pts === 5) exact++;
    }
    const ep = extraPoints(extrasByPerson[person.id] ?? {}, tourney);

    // Puntos de knockout
    let kp = 0;
    const koPreds = koPredsByPerson[person.id] ?? {};
    for (const [matchId, pred] of Object.entries(koPreds)) {
      const m = koByMatch[matchId];
      if (!m || !m.result || !m.home || !m.away) continue;
      kp += knockoutPoints(pred, m.result as KoReal, m.home, m.away);
    }

    return {
      id: person.id,
      name: person.name,
      matchPoints: mp,
      koPoints: kp,
      extraPoints: ep,
      total: mp + kp + ep,
      exactCount: exact,
      predictionsCount: countByPerson[person.id] ?? 0,
    };
  });

  return rows.sort((a, b) => b.total - a.total || b.exactCount - a.exactCount || a.name.localeCompare(b.name));
}

export type MatchPredictionRow = { name: string; homeGoals: number; awayGoals: number };

/** Pronósticos de los miembros del prode agrupados por partido (matchId → filas). */
export async function getPredictionsByMatch(
  poolId: string,
): Promise<Record<string, MatchPredictionRow[]>> {
  const memberIds = await getPoolMemberIds(poolId);
  if (memberIds.length === 0) return {};
  const [people, preds] = await Promise.all([
    db.select().from(participants).where(inArray(participants.id, memberIds)),
    db.select().from(matchPredictions),
  ]);
  const nameById: Record<string, string> = Object.fromEntries(
    people.map((p) => [p.id, p.name]),
  );
  const byMatch: Record<string, MatchPredictionRow[]> = {};
  for (const p of preds) {
    if (!(p.participantId in nameById)) continue;
    (byMatch[p.matchId] ??= []).push({
      name: nameById[p.participantId] ?? "—",
      homeGoals: p.homeGoals,
      awayGoals: p.awayGoals,
    });
  }
  for (const rows of Object.values(byMatch)) {
    rows.sort((a, b) => a.name.localeCompare(b.name, "es"));
  }
  return byMatch;
}

export async function getParticipantCount(poolId: string): Promise<number> {
  const ids = await getPoolMemberIds(poolId);
  return ids.length;
}

/** Total de jugadores en toda la plataforma (para la portada). */
export async function getTotalParticipantCount(): Promise<number> {
  const rows = await db.select({ id: participants.id }).from(participants);
  return rows.length;
}

export type MatchDetail = {
  id: string;
  group: string;
  homeCode: string;
  awayCode: string;
  date: string;
  pred: { home: number; away: number } | null;
  real: { home: number; away: number } | null;
  points: number;
};

export type KoDetail = {
  id: string;
  round: string;
  home: string | null;
  away: string | null;
  homeLabel: string;
  awayLabel: string;
  pred: { home: number; away: number; advance: string } | null;
  real: { home: number; away: number; penalties: boolean } | null;
  winner: string | null;
  points: number;
};

export type ParticipantDetail = {
  name: string;
  extras: ExtraPick;
  realExtras: ExtraPick;
  matches: MatchDetail[];
  ko: KoDetail[];
  bracketGenerated: boolean;
};

/** Detalle completo de pronósticos de un participante (para el drawer de la tabla). */
export async function getParticipantDetail(id: string): Promise<ParticipantDetail | null> {
  const person = await getParticipant(id);
  if (!person) return null;

  const [preds, extras, koPreds, results, tourney, bracket] = await Promise.all([
    getParticipantPredictions(id),
    getParticipantExtras(id),
    getParticipantKoPredictions(id),
    getResultsMap(),
    getTournamentResult(),
    getBracketState(),
  ]);

  const { MATCHES } = await import("../fixtures");
  const matches: MatchDetail[] = MATCHES.map((m) => {
    const p = preds[m.id];
    const r = results[m.id];
    return {
      id: m.id,
      group: m.group,
      homeCode: m.homeCode,
      awayCode: m.awayCode,
      date: m.date,
      pred: p ? { home: p.homeGoals, away: p.awayGoals } : null,
      real: r ? { home: r.homeGoals, away: r.awayGoals } : null,
      points: matchPoints(p, r),
    };
  });

  const ko: KoDetail[] = bracket.matches.map((m) => {
    const p = koPreds[m.id];
    const pts =
      p && m.result && m.home && m.away
        ? knockoutPoints(p, m.result as KoReal, m.home, m.away)
        : 0;
    return {
      id: m.id,
      round: m.round,
      home: m.home,
      away: m.away,
      homeLabel: m.homeLabel,
      awayLabel: m.awayLabel,
      pred: p ? { home: p.homeGoals, away: p.awayGoals, advance: p.advance } : null,
      real: m.result
        ? { home: m.result.homeGoals, away: m.result.awayGoals, penalties: m.result.penalties }
        : null,
      winner: m.winner,
      points: pts,
    };
  });

  return {
    name: person.name,
    extras,
    realExtras: tourney,
    matches,
    ko,
    bracketGenerated: bracket.generated,
  };
}

// ---------- Llaves / eliminatorias ----------

export async function getKnockoutResultsMap(): Promise<Record<string, KoResult>> {
  const rows = await db.select().from(knockoutResults);
  return Object.fromEntries(
    rows.map((r) => [
      r.matchId,
      {
        homeGoals: r.homeGoals,
        awayGoals: r.awayGoals,
        penalties: r.penalties,
        penWinner: r.penWinner ?? null,
      },
    ]),
  );
}

export type BracketState = {
  generated: boolean;
  matches: ResolvedKoMatch[];
};

/** Estado del cuadro: si fue generado, devuelve los cruces resueltos (con resultados). */
export async function getBracketState(): Promise<BracketState> {
  const [metaRows, koResults, groupResults] = await Promise.all([
    db.select().from(bracketMeta).where(eq(bracketMeta.id, 1)),
    getKnockoutResultsMap(),
    getResultsMap(),
  ]);
  const meta = metaRows[0];
  if (!meta) return { generated: false, matches: [] };

  const r32 = JSON.parse(meta.r32Json) as Record<string, { home: string; away: string }>;
  const standings = allGroupStandings(groupResults);
  return { generated: true, matches: resolveBracket(r32, koResults, standings) };
}

export async function getParticipantKoPredictions(
  id: string,
): Promise<Record<string, { homeGoals: number; awayGoals: number; advance: string }>> {
  const rows = await db
    .select()
    .from(knockoutPredictions)
    .where(eq(knockoutPredictions.participantId, id));
  const map: Record<string, { homeGoals: number; awayGoals: number; advance: string }> = {};
  for (const r of rows)
    map[r.matchId] = { homeGoals: r.homeGoals, awayGoals: r.awayGoals, advance: r.advance };
  return map;
}

export type KoPredictionRow = {
  name: string;
  homeGoals: number;
  awayGoals: number;
  advance: string;
};

/** Pronósticos de knockout de los miembros del prode, agrupados por cruce. */
export async function getKoPredictionsByMatch(
  poolId: string,
): Promise<Record<string, KoPredictionRow[]>> {
  const memberIds = await getPoolMemberIds(poolId);
  if (memberIds.length === 0) return {};
  const [people, preds] = await Promise.all([
    db.select().from(participants).where(inArray(participants.id, memberIds)),
    db.select().from(knockoutPredictions),
  ]);
  const nameById: Record<string, string> = Object.fromEntries(
    people.map((p) => [p.id, p.name]),
  );
  const byMatch: Record<string, KoPredictionRow[]> = {};
  for (const p of preds) {
    if (!(p.participantId in nameById)) continue;
    (byMatch[p.matchId] ??= []).push({
      name: nameById[p.participantId] ?? "—",
      homeGoals: p.homeGoals,
      awayGoals: p.awayGoals,
      advance: p.advance,
    });
  }
  for (const rows of Object.values(byMatch)) rows.sort((a, b) => a.name.localeCompare(b.name, "es"));
  return byMatch;
}
