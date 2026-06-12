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
  funCards,
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
import { resolveBracket, koKickoff, type KoResult, type ResolvedKoMatch } from "../bracket";
import { allGroupStandings } from "../standings";
import { MATCHES } from "../fixtures";
import { CARD_CATALOG, MAX_HELD_CARDS, type CardDef, type CardType, type PoolMode } from "../cardCatalog";
import { applyCardEffects, funToday, type MatchPointsMap, type PlayedCardEffect } from "../cards";
import { computeStreak } from "../streaks";

// ---------- Prodes ----------

export type Pool = {
  id: string;
  name: string;
  slug: string;
  code: string;
  isPublic: boolean;
  mode: PoolMode;
  createdBy: string | null;
};

function toPool(row: typeof pools.$inferSelect): Pool {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    code: row.code,
    isPublic: row.isPublic,
    mode: row.mode === "fun" ? "fun" : "normal",
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

/** Info extra de cada fila en prodes modo Diversión. */
export type FunLeaderboardInfo = {
  /** Delta total por cartas (modificadores de partido + afanos). */
  cardDelta: number;
  streakCurrent: number;
  streakBest: number;
  streakBonus: number;
  /** Partidos en 0 salvados por un Aguante. */
  protectedMatchIds: string[];
  /** Standings activos del jugador (escudo / aguante / var sin consumir). */
  activeStandings: CardType[];
  /** Efectos atados a partidos que todavía no se jugaron. */
  pendingEffects: { cardType: CardType; matchId: string; fromName: string | null }[];
};

export type LeaderboardRow = {
  id: string;
  name: string;
  avatar: string | null;
  matchPoints: number;
  koPoints: number;
  extraPoints: number;
  total: number;
  exactCount: number;
  predictionsCount: number;
  /** Solo en prodes modo Diversión. */
  fun?: FunLeaderboardInfo;
};

/** Tabla de un prode: calcula puntos de cada miembro contra los resultados reales. */
export async function getLeaderboard(pool: Pool): Promise<LeaderboardRow[]> {
  const poolId = pool.id;
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

  // Puntos por partido por miembro (todo partido CON resultado tiene entrada,
  // aunque sea 0). Es la base sobre la que el modo Diversión aplica cartas.
  const groupResultIds = new Set(Object.keys(results));
  const ptsByMember: Record<string, MatchPointsMap> = {};
  const exactByMember: Record<string, number> = {};
  for (const person of people) {
    const preds = predsByPerson[person.id] ?? {};
    const koPreds = koPredsByPerson[person.id] ?? {};
    const m: MatchPointsMap = {};
    let exact = 0;
    for (const [matchId, real] of Object.entries(results)) {
      const pts = matchPoints(preds[matchId], real);
      m[matchId] = pts;
      if (pts === 5) exact++;
    }
    for (const km of bracket.matches) {
      if (!km.result || !km.home || !km.away) continue;
      m[km.id] = knockoutPoints(koPreds[km.id], km.result as KoReal, km.home, km.away);
    }
    ptsByMember[person.id] = m;
    exactByMember[person.id] = exact;
  }

  const fun = pool.mode === "fun" ? await resolveFun(poolId, ptsByMember, bracket, people) : null;

  const rows: LeaderboardRow[] = people.map((person) => {
    const pts = (fun?.effects.points[person.id] ?? ptsByMember[person.id]) ?? {};
    let mp = 0;
    let kp = 0;
    for (const [matchId, p] of Object.entries(pts)) {
      if (groupResultIds.has(matchId)) mp += p;
      else kp += p;
    }
    const ep = extraPoints(extrasByPerson[person.id] ?? {}, tourney);

    const funInfo = fun?.infoByMember[person.id];
    const flat = fun?.effects.flat[person.id] ?? 0;
    const streakBonus = funInfo?.streakBonus ?? 0;

    return {
      id: person.id,
      name: person.name,
      avatar: person.avatar ?? null,
      matchPoints: mp,
      koPoints: kp,
      extraPoints: ep,
      total: mp + kp + ep + flat + streakBonus,
      exactCount: exactByMember[person.id] ?? 0,
      predictionsCount: countByPerson[person.id] ?? 0,
      ...(funInfo ? { fun: funInfo } : {}),
    };
  });

  return rows.sort((a, b) => b.total - a.total || b.exactCount - a.exactCount || a.name.localeCompare(b.name));
}

// ---------- Modo Diversión ----------

/** Kickoff de cualquier partido del torneo (grupos o llaves). */
const KICKOFF_BY_ID: Record<string, string> = Object.fromEntries(
  MATCHES.map((m) => [m.id, m.kickoff]),
);

function kickoffOf(matchId: string): string | null {
  return KICKOFF_BY_ID[matchId] ?? koKickoff(matchId);
}

type FunResolution = {
  effects: ReturnType<typeof applyCardEffects>;
  infoByMember: Record<string, FunLeaderboardInfo>;
  cards: (typeof funCards.$inferSelect)[];
};

/**
 * Resuelve cartas + rachas de un prode Diversión sobre los puntos base.
 * Sin estado: todo se deriva de las cartas jugadas y los resultados actuales.
 */
async function resolveFun(
  poolId: string,
  ptsByMember: Record<string, MatchPointsMap>,
  bracket: BracketState,
  people: { id: string; name: string }[],
): Promise<FunResolution> {
  const cards = await db.select().from(funCards).where(eq(funCards.poolId, poolId));
  const played = cards.filter((c) => c.status === "played" && c.playedAt);
  const nameById = Object.fromEntries(people.map((p) => [p.id, p.name]));

  // Partidos con resultado, ordenados por kickoff (grupos + llaves).
  const resolvedIds = [
    ...Object.keys(ptsByMember[people[0]?.id] ?? {}),
  ].filter((id) => kickoffOf(id));
  resolvedIds.sort(
    (a, b) => new Date(kickoffOf(a)!).getTime() - new Date(kickoffOf(b)!).getTime(),
  );
  const kickoffById = Object.fromEntries(resolvedIds.map((id) => [id, kickoffOf(id)!]));

  const playedEffects: PlayedCardEffect[] = played.map((c) => ({
    id: c.id,
    cardType: c.cardType as CardType,
    ownerId: c.participantId,
    targetId: c.targetParticipantId,
    effectMatchId: c.effectMatchId,
    playedAt: c.playedAt!,
  }));

  const effects = applyCardEffects({
    cards: playedEffects,
    base: ptsByMember,
    matchOrder: resolvedIds,
    kickoffById,
  });

  // Partidos ya jugados (con resultado): un efecto atado a otro partido sigue pendiente.
  const hasResult = new Set(resolvedIds);

  const infoByMember: Record<string, FunLeaderboardInfo> = {};
  for (const person of people) {
    const mine = played.filter((c) => c.participantId === person.id);
    const aguantes = mine.filter((c) => c.cardType === "aguante").map((c) => c.playedAt!);

    const streak = computeStreak({
      points: effects.points[person.id] ?? {},
      matchOrder: resolvedIds,
      kickoffById,
      protections: aguantes,
    });

    const activeStandings: CardType[] = [];
    if (mine.some((c) => c.cardType === "escudo")) activeStandings.push("escudo");
    if (aguantes.length > streak.protectedMatchIds.length) activeStandings.push("aguante");
    if (mine.some((c) => c.cardType === "var") && !effects.varAppliedTo[person.id])
      activeStandings.push("var");

    // Efectos atados a partidos futuros que afectan a esta persona.
    const pendingEffects = played
      .filter((c) => {
        if (!c.effectMatchId || hasResult.has(c.effectMatchId)) return false;
        const def = CARD_CATALOG[c.cardType as CardType];
        const affected = def?.kind === "attack" ? c.targetParticipantId : c.participantId;
        return affected === person.id;
      })
      .map((c) => ({
        cardType: c.cardType as CardType,
        matchId: c.effectMatchId!,
        fromName:
          CARD_CATALOG[c.cardType as CardType]?.kind === "attack"
            ? (nameById[c.participantId] ?? null)
            : null,
      }));

    infoByMember[person.id] = {
      cardDelta: effects.delta[person.id] ?? 0,
      streakCurrent: streak.current,
      streakBest: streak.best,
      streakBonus: streak.bonus,
      protectedMatchIds: streak.protectedMatchIds,
      activeStandings,
      pendingEffects,
    };
  }

  return { effects, infoByMember, cards };
}

export type HeldCard = { id: string; def: CardDef; drawDate: string };

export type FunFeedItem = {
  id: string;
  at: Date;
  ownerName: string;
  targetName: string | null;
  cardType: CardType;
  /** true si el ataque rebotó contra un Escudo. */
  blocked: boolean;
};

export type FunState = {
  today: string;
  /** Ya reclamó la carta de hoy en este prode. */
  claimedToday: boolean;
  handFull: boolean;
  canClaim: boolean;
  held: HeldCard[];
  feed: FunFeedItem[];
};

/** Estado del modo Diversión para el visitante: mano, sorteo del día y actividad. */
export async function getFunState(pool: Pool, viewerId: string): Promise<FunState> {
  const [cards, memberIds] = await Promise.all([
    db.select().from(funCards).where(eq(funCards.poolId, pool.id)),
    getPoolMemberIds(pool.id),
  ]);
  const people = memberIds.length
    ? await db.select().from(participants).where(inArray(participants.id, memberIds))
    : [];
  const nameById = Object.fromEntries(people.map((p) => [p.id, p.name]));

  const today = funToday();
  const mine = cards.filter((c) => c.participantId === viewerId);
  const held: HeldCard[] = mine
    .filter((c) => c.status === "held")
    .sort((a, b) => a.drawnAt.getTime() - b.drawnAt.getTime())
    .map((c) => ({ id: c.id, def: CARD_CATALOG[c.cardType as CardType], drawDate: c.drawDate }))
    .filter((c) => c.def);

  const claimedToday = mine.some((c) => c.drawDate === today);
  const handFull = held.length >= MAX_HELD_CARDS;

  const feed: FunFeedItem[] = cards
    .filter((c) => (c.status === "played" || c.status === "blocked") && c.playedAt)
    .sort((a, b) => b.playedAt!.getTime() - a.playedAt!.getTime())
    .slice(0, 30)
    .map((c) => ({
      id: c.id,
      at: c.playedAt!,
      ownerName: nameById[c.participantId] ?? "—",
      targetName: c.targetParticipantId ? (nameById[c.targetParticipantId] ?? "—") : null,
      cardType: c.cardType as CardType,
      blocked: c.status === "blocked",
    }));

  return { today, claimedToday, handFull, canClaim: !claimedToday && !handFull, held, feed };
}

export type PlayContext = {
  memberIds: string[];
  occupiedEffects: Set<string>;
  ownerActiveStandings: Set<CardType>;
  targetShieldCardId: string | null;
};

/** Contexto para validar una jugada (regla de 1 efecto, standings activos, escudo). */
export async function getPlayContext(
  pool: Pool,
  ownerId: string,
  targetId: string | null,
): Promise<PlayContext> {
  const [rows, cards, memberIds] = await Promise.all([
    getLeaderboard(pool),
    db.select().from(funCards).where(eq(funCards.poolId, pool.id)),
    getPoolMemberIds(pool.id),
  ]);

  const occupiedEffects = new Set<string>();
  for (const c of cards) {
    if (c.status !== "played" || !c.effectMatchId) continue;
    const def = CARD_CATALOG[c.cardType as CardType];
    const affected = def?.kind === "attack" ? c.targetParticipantId : c.participantId;
    if (affected) occupiedEffects.add(`${c.effectMatchId}:${affected}`);
  }

  const ownerActiveStandings = new Set<CardType>(
    rows.find((r) => r.id === ownerId)?.fun?.activeStandings ?? [],
  );

  const targetShieldCardId = targetId
    ? (cards.find(
        (c) =>
          c.participantId === targetId && c.cardType === "escudo" && c.status === "played",
      )?.id ?? null)
    : null;

  return { memberIds, occupiedEffects, ownerActiveStandings, targetShieldCardId };
}

export type MatchPredictionRow = {
  id: string;
  name: string;
  homeGoals: number;
  awayGoals: number;
};

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
      id: p.participantId,
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
