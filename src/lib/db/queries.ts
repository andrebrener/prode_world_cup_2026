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
  cardDefs,
  poolFunConfig,
  poolDayRank,
} from "./schema";
import { eq, and, inArray, sql } from "drizzle-orm";
import {
  matchPoints,
  extraPoints,
  knockoutPoints,
  saiBambaBonus,
  type ExtraPick,
  type KoReal,
} from "../scoring";
import type { Score } from "../scoring";
import { resolveBracket, koKickoff, type KoResult, type ResolvedKoMatch } from "../bracket";
import { allGroupStandings } from "../standings";
import { MATCHES } from "../fixtures";
import {
  CARD_CATALOG,
  cardView,
  outcomeLabel,
  pickDecoyMechanic,
  DEFAULT_FUN_CONFIG,
  type CardCosmetic,
  type CardDef,
  type CardType,
  type PoolMode,
} from "../cardCatalog";
import {
  applyCardEffects,
  affectedIdOf,
  bindDay,
  caldeadorScore,
  caldeadorKoPred,
  funToday,
  matchDay,
  type MatchPointsMap,
  type PlayedCardEffect,
} from "../cards";
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

export type PoolRole = "owner" | "admin" | "player";

/** Rol del participante en el prode (null si no es miembro). */
export async function getPoolRole(
  poolId: string,
  participantId: string,
): Promise<PoolRole | null> {
  const [row] = await db
    .select({ role: poolMembers.role })
    .from(poolMembers)
    .where(and(eq(poolMembers.poolId, poolId), eq(poolMembers.participantId, participantId)));
  return (row?.role as PoolRole | undefined) ?? null;
}

/** ¿Puede gestionar el prode (editar mazo/sorteo, cargar resultados)? owner o admin. */
export async function canManagePool(poolId: string, participantId: string): Promise<boolean> {
  const role = await getPoolRole(poolId, participantId);
  return role === "owner" || role === "admin";
}

/** Miembros del prode con su rol y nombre (para la pantalla de admin). */
export async function getPoolMembersWithRoles(
  poolId: string,
): Promise<{ id: string; name: string; role: PoolRole }[]> {
  const rows = await db
    .select({ id: participants.id, name: participants.name, role: poolMembers.role })
    .from(poolMembers)
    .innerJoin(participants, eq(participants.id, poolMembers.participantId))
    .where(eq(poolMembers.poolId, poolId));
  const order: Record<PoolRole, number> = { owner: 0, admin: 1, player: 2 };
  return rows
    .map((r) => ({ id: r.id, name: r.name, role: (r.role as PoolRole) ?? "player" }))
    .sort((a, b) => order[a.role] - order[b.role] || a.name.localeCompare(b.name, "es"));
}

export type PoolAdminData = {
  deck: {
    id: string;
    mechanic: string;
    name: string;
    emoji: string;
    description: string;
    rarity: string;
    enabled: boolean;
    sortOrder: number;
    effect: string;
  }[];
  config: {
    weightComun: number;
    weightRara: number;
    weightLegendaria: number;
    weightMaldicion: number;
    karmaTabla: boolean;
  };
  members: { id: string; name: string; role: PoolRole }[];
};

/** Todo lo que la pantalla de admin necesita: mazo (incl. deshabilitadas), config y miembros. */
export async function getPoolAdmin(poolId: string): Promise<PoolAdminData> {
  const [deckRows, cfgRows, members] = await Promise.all([
    db.select().from(cardDefs).where(eq(cardDefs.poolId, poolId)).orderBy(cardDefs.sortOrder),
    db.select().from(poolFunConfig).where(eq(poolFunConfig.poolId, poolId)),
    getPoolMembersWithRoles(poolId),
  ]);
  const cfg = cfgRows[0];
  return {
    deck: deckRows.map((d) => ({
      id: d.id,
      mechanic: d.mechanic,
      name: d.name,
      emoji: d.emoji,
      description: d.description,
      rarity: d.rarity,
      enabled: d.enabled,
      sortOrder: d.sortOrder,
      effect: CARD_CATALOG[d.mechanic as CardType]
        ? outcomeLabel(CARD_CATALOG[d.mechanic as CardType].spec, CARD_CATALOG[d.mechanic as CardType].target)
        : "—",
    })),
    config: {
      weightComun: cfg?.weightComun ?? DEFAULT_FUN_CONFIG.weights.comun,
      weightRara: cfg?.weightRara ?? DEFAULT_FUN_CONFIG.weights.rara,
      weightLegendaria: cfg?.weightLegendaria ?? DEFAULT_FUN_CONFIG.weights.legendaria,
      weightMaldicion: cfg?.weightMaldicion ?? DEFAULT_FUN_CONFIG.weights.maldicion,
      karmaTabla: cfg?.karmaTabla ?? DEFAULT_FUN_CONFIG.karmaTabla,
    },
    members,
  };
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

/** Overlays sociales activos sobre un jugador (apodo, foto trucha, micrófono). */
export type FunOverlay = {
  nickname?: { text: string; byName: string };
  avatar?: { dataUrl: string; byName: string };
  message?: { text: string; byName: string };
};

/** Info extra de cada fila en prodes modo Diversión. */
export type FunLeaderboardInfo = {
  /** Delta total por cartas (modificadores + planos + snapshots). */
  cardDelta: number;
  streakCurrent: number;
  streakBest: number;
  streakBonus: number;
  /** Partidos en 0 salvados (Fernet de Fernemo o cartas de día). */
  protectedMatchIds: string[];
  /**
   * Defensas/buffs del día activos del jugador (escudo / espejito / aguante / var
   * cuya jornada es hoy o futura). Llevan el nombre/emoji del mazo del prode
   * (re-skin), no los del catálogo.
   */
  activeDayCards: { cardType: CardType; name: string; emoji: string; rarity: CardCosmetic["rarity"] }[];
  /** Efectos pendientes: atados a un partido sin jugar o al día en curso. */
  pendingEffects: {
    cardType: CardType;
    name: string;
    emoji: string;
    matchId: string | null;
    day: string | null;
    fromName: string | null;
  }[];
  /** Apodo / foto trucha / micrófono colgados sobre este jugador. */
  overlay?: FunOverlay;
  /** Total "puro": solo resultados reales, sin cartas ni hitos de racha. */
  pureTotal: number;
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

/** Construye la base de puntos + la resolución de cartas de un prode. Compartido
 *  por getLeaderboard (la tabla) y getResolvedMatchPoints (el push de resultados). */
async function computePoolScores(pool: Pool) {
  const poolId = pool.id;
  const memberIds = await getPoolMemberIds(poolId);

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

  // Cartas del prode (solo modo Diversión): se traen antes porque el Caldeador
  // reemplaza pronósticos al construir la base de puntos.
  const funCardRows =
    pool.mode === "fun"
      ? await db.select().from(funCards).where(eq(funCards.poolId, poolId))
      : [];

  // (miembro, partido) → id de la carta Caldeador que le pisa el pronóstico.
  const caldeadoBy: Record<string, string> = {};
  for (const c of funCardRows) {
    if (c.cardType !== "caldeador" || c.status !== "played" || !c.playedAt || !c.effectDate)
      continue;
    const affected = c.reflected ? c.participantId : c.targetParticipantId;
    if (!affected) continue;
    for (const id of Object.keys(results)) {
      const k = KICKOFF_BY_ID[id];
      if (k && matchDay(k) === c.effectDate) {
        caldeadoBy[`${affected}:${id}`] = c.id;
      }
    }
    for (const km of bracket.matches) {
      const k = koKickoff(km.id);
      if (km.result && k && matchDay(k) === c.effectDate) {
        caldeadoBy[`${affected}:${km.id}`] = c.id;
      }
    }
  }

  // (miembro, partido) → id de la Piedrambre que le da vuelta el marcador del día
  // (2-1 cuenta como 1-2). Misma mecánica upstream que el Caldeador, pero es una
  // maldición self: te toca a vos al reclamar la carta del día (no muta el
  // pronóstico guardado, global entre prodes; solo recalcula la base de este prode).
  const flippedBy: Record<string, string> = {};
  for (const c of funCardRows) {
    if (c.cardType !== "piedrambre" || c.status !== "played" || !c.playedAt || !c.effectDate)
      continue;
    const affected = c.participantId; // maldición self: siempre el dueño
    if (!affected) continue;
    for (const id of Object.keys(results)) {
      const k = KICKOFF_BY_ID[id];
      if (k && matchDay(k) === c.effectDate) {
        flippedBy[`${affected}:${id}`] = c.id;
      }
    }
    for (const km of bracket.matches) {
      const k = koKickoff(km.id);
      if (km.result && k && matchDay(k) === c.effectDate) {
        flippedBy[`${affected}:${km.id}`] = c.id;
      }
    }
  }

  // Puntos por partido por miembro (todo partido CON resultado tiene entrada,
  // aunque sea 0). Es la base sobre la que el modo Diversión aplica cartas.
  const groupResultIds = new Set(Object.keys(results));
  const ptsByMember: Record<string, MatchPointsMap> = {};
  const exactByMember: Record<string, number> = {};
  // Puntos "puros" (pronósticos reales, sin Caldeador): para la columna sin cartas.
  const pureByMember: Record<string, number> = {};
  for (const person of people) {
    const preds = predsByPerson[person.id] ?? {};
    const koPreds = koPredsByPerson[person.id] ?? {};
    const m: MatchPointsMap = {};
    let exact = 0;
    let pure = 0;
    for (const [matchId, real] of Object.entries(results)) {
      const caldeador = caldeadoBy[`${person.id}:${matchId}`];
      const flipped = flippedBy[`${person.id}:${matchId}`];
      const purePts = matchPoints(preds[matchId], real);
      pure += purePts;
      // Caldeador pisa el pronóstico con uno random; la Piedrambre da vuelta el
      // que quede en juego (el real, o el del Caldeador si stackean).
      let pred = caldeador ? caldeadorScore(caldeador, matchId) : preds[matchId];
      if (pred && flipped) pred = { homeGoals: pred.awayGoals, awayGoals: pred.homeGoals };
      m[matchId] = caldeador || flipped ? matchPoints(pred, real) : purePts;
      if (purePts === 5) exact++;
    }
    for (const km of bracket.matches) {
      if (!km.result || !km.home || !km.away) continue;
      const caldeador = caldeadoBy[`${person.id}:${km.id}`];
      const flipped = flippedBy[`${person.id}:${km.id}`];
      const purePts = knockoutPoints(koPreds[km.id], km.result as KoReal, km.home, km.away);
      pure += purePts;
      let pred = caldeador ? caldeadorKoPred(caldeador, km.id, km.home, km.away) : koPreds[km.id];
      if (pred && flipped) pred = { ...pred, homeGoals: pred.awayGoals, awayGoals: pred.homeGoals };
      m[km.id] =
        caldeador || flipped
          ? knockoutPoints(pred, km.result as KoReal, km.home, km.away)
          : purePts;
    }
    ptsByMember[person.id] = m;
    exactByMember[person.id] = exact;
    pureByMember[person.id] = pure;
  }

  const fun =
    pool.mode === "fun"
      ? resolveFun(funCardRows, ptsByMember, bracket, people, await loadDefsById(poolId))
      : null;

  return {
    people,
    ptsByMember,
    pureByMember,
    exactByMember,
    countByPerson,
    extrasByPerson,
    tourney,
    groupResultIds,
    funCardRows,
    fun,
  };
}

/** Todos los partidos (grupos + llaves) de una fecha, jugados o no. */
function matchIdsOnDay(effectDate: string, bracket: BracketState): string[] {
  const ids: string[] = [];
  for (const [mid, k] of Object.entries(KICKOFF_BY_ID)) {
    if (matchDay(k) === effectDate) ids.push(mid);
  }
  for (const km of bracket.matches) {
    const k = koKickoff(km.id);
    if (k && matchDay(k) === effectDate) ids.push(km.id);
  }
  return ids;
}

/**
 * Partidos cuyos puntos quedan anulados para un jugador por un bloqueo/robo que le
 * pega TODO el día (zero_day / robo del día): `${pid}:${matchId}` para cada partido
 * de la jornada, jugado o no. Sirve para avisar "no suma" antes de que haya resultado.
 * Las cartas bloqueadas no entran (status !== "played").
 */
function computeAnnulledMatches(
  funCardRows: FunCardRow[],
  bracket: BracketState,
): Record<string, true> {
  const annulled: Record<string, true> = {};
  for (const c of funCardRows) {
    if (c.status !== "played" || !c.playedAt || !c.effectDate) continue;
    const spec = CARD_CATALOG[c.cardType as CardType]?.spec;
    if (spec?.outcome !== "zero_day" && spec?.outcome !== "steal_day_points") continue;
    const affected = affectedIdOf(toEffect(c));
    if (!affected) continue;
    for (const mid of matchIdsOnDay(c.effectDate, bracket)) annulled[`${affected}:${mid}`] = true;
  }
  return annulled;
}

/**
 * Puntos por partido por miembro DESPUÉS de aplicar las cartas (`resolved`), más
 * la base sin cartas (`base`). Lo usa el push de resultados para avisar lo que
 * REALMENTE sumaste en este prode (multiplicadores, VAR, robos, ceros, etc.).
 * `annulled` marca los partidos del día con puntos anulados (bloqueo/robo), incluso
 * sin resultado todavía, para mostrar el "no suma" de antemano.
 */
export async function getResolvedMatchPoints(pool: Pool): Promise<{
  base: Record<string, MatchPointsMap>;
  resolved: Record<string, MatchPointsMap>;
  annulled: Record<string, true>;
}> {
  const [s, bracket] = await Promise.all([computePoolScores(pool), getBracketState()]);
  const resolved: Record<string, MatchPointsMap> = {};
  for (const p of s.people)
    resolved[p.id] = s.fun?.effects.points[p.id] ?? s.ptsByMember[p.id] ?? {};
  const annulled = computeAnnulledMatches(s.funCardRows, bracket);
  return { base: s.ptsByMember, resolved, annulled };
}

/** Tabla de un prode: calcula puntos de cada miembro contra los resultados reales. */
export async function getLeaderboard(pool: Pool, viewerId?: string): Promise<LeaderboardRow[]> {
  const {
    people,
    ptsByMember,
    pureByMember,
    exactByMember,
    countByPerson,
    extrasByPerson,
    tourney,
    groupResultIds,
    funCardRows,
    fun,
  } = await computePoolScores(pool);
  if (people.length === 0) return [];

  // Sai Bamba: el vidente le garantiza al que la jugó los puntos del campeón.
  const saibambaIds = new Set(
    funCardRows
      .filter((c) => c.cardType === "saibamba" && c.status === "played")
      .map((c) => c.participantId),
  );

  const rows: LeaderboardRow[] = people.map((person) => {
    const pts = (fun?.effects.points[person.id] ?? ptsByMember[person.id]) ?? {};
    let mp = 0;
    let kp = 0;
    for (const [matchId, p] of Object.entries(pts)) {
      if (groupResultIds.has(matchId)) mp += p;
      else kp += p;
    }
    const extras = extrasByPerson[person.id] ?? {};
    const ep = extraPoints(extras, tourney);
    const saibamba = saibambaIds.has(person.id) ? saiBambaBonus(extras, tourney) : 0;

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
      total: mp + kp + ep + flat + streakBonus + saibamba,
      exactCount: exactByMember[person.id] ?? 0,
      predictionsCount: countByPerson[person.id] ?? 0,
      ...(funInfo
        ? {
            fun: {
              ...funInfo,
              // Las defensas (escudo/espejito) son secretas: no se muestran como
              // badge en la fila de otro. El dueño sí ve las suyas.
              activeDayCards:
                person.id === viewerId
                  ? funInfo.activeDayCards
                  : funInfo.activeDayCards.filter(
                      (s) => s.cardType !== "escudo" && s.cardType !== "espejito",
                    ),
              cardDelta: funInfo.cardDelta + saibamba,
              pureTotal: (pureByMember[person.id] ?? 0) + ep,
            },
          }
        : {}),
    };
  });

  return rows.sort((a, b) => b.total - a.total || b.exactCount - a.exactCount || a.name.localeCompare(b.name));
}

/**
 * Posición de cada jugador AL ARRANQUE del día (para el karma de tabla). Se congela
 * una sola vez por (prode, fecha): la primera llamada del día calcula la tabla
 * actual y la persiste; las siguientes (de cualquier jugador) reusan ese snapshot.
 * Así el sesgo por posición no depende de quién reclamó primero ni de la propia
 * carta del que reclama (pickDailyCard corre antes de jugarla). Devuelve un mapa
 * participantId → { rank (0-based), total }.
 */
export async function getDayRankSnapshot(
  pool: Pool,
  date: string,
): Promise<Map<string, { rank: number; total: number }>> {
  const read = async () =>
    db
      .select({ participantId: poolDayRank.participantId, rank: poolDayRank.rank, total: poolDayRank.total })
      .from(poolDayRank)
      .where(and(eq(poolDayRank.poolId, pool.id), eq(poolDayRank.date, date)));

  let snap = await read();
  if (snap.length === 0) {
    // Primer reclamo del día en este prode: congelá la tabla actual.
    const rows = await getLeaderboard(pool);
    if (rows.length > 0) {
      await db
        .insert(poolDayRank)
        .values(
          rows.map((r, i) => ({
            poolId: pool.id,
            date,
            participantId: r.id,
            rank: i,
            total: rows.length,
          })),
        )
        .onConflictDoNothing();
    }
    // Releé: si otro reclamo ganó la carrera, mandan sus filas (mismo día).
    snap = await read();
  }
  return new Map(snap.map((r) => [r.participantId, { rank: r.rank, total: r.total }]));
}

// ---------- Modo Diversión ----------

/** Kickoff de cualquier partido del torneo (grupos o llaves). */
const KICKOFF_BY_ID: Record<string, string> = Object.fromEntries(
  MATCHES.map((m) => [m.id, m.kickoff]),
);

function kickoffOf(matchId: string): string | null {
  return KICKOFF_BY_ID[matchId] ?? koKickoff(matchId);
}

type FunCardRow = typeof funCards.$inferSelect;

/** defId → cosmético del mazo del prode (re-skin). */
export type DefsById = Map<string, CardCosmetic>;

/** Carga las defs del mazo de un prode indexadas por id (para resolver el display). */
async function loadDefsById(poolId: string): Promise<DefsById> {
  const rows = await db
    .select({
      id: cardDefs.id,
      name: cardDefs.name,
      emoji: cardDefs.emoji,
      description: cardDefs.description,
      rarity: cardDefs.rarity,
    })
    .from(cardDefs)
    .where(eq(cardDefs.poolId, poolId));
  return new Map(rows.map((r) => [r.id, { ...r, rarity: r.rarity as CardCosmetic["rarity"] }]));
}

/**
 * Resuelve el CardDef de DISPLAY de una carta jugada: mecánica del registro +
 * cosmético del mazo del prode (si la carta apunta a una def). Fallback al catálogo.
 */
function viewOf(
  c: { cardType: string; cardDefId: string | null },
  defsById: DefsById,
): CardDef | null {
  return cardView(c.cardType, c.cardDefId ? (defsById.get(c.cardDefId) ?? null) : null);
}

/** mechanic → cosmético + enabled del mazo del prode (para el señuelo de defensas). */
type DeckByMechanic = Map<string, { name: string; emoji: string; enabled: boolean }>;

async function loadDeckByMechanic(poolId: string): Promise<DeckByMechanic> {
  const rows = await db
    .select({
      mechanic: cardDefs.mechanic,
      name: cardDefs.name,
      emoji: cardDefs.emoji,
      enabled: cardDefs.enabled,
    })
    .from(cardDefs)
    .where(eq(cardDefs.poolId, poolId));
  return new Map(rows.map((r) => [r.mechanic, { name: r.name, emoji: r.emoji, enabled: r.enabled }]));
}

type FunResolution = {
  effects: ReturnType<typeof applyCardEffects>;
  // pureTotal se completa en getLeaderboard (acá no hay extras ni puntos puros).
  infoByMember: Record<string, Omit<FunLeaderboardInfo, "pureTotal">>;
};

/** Payload JSON de las cartas sociales (apodo/mensaje/imagen). */
function parsePayload(raw: string | null): Record<string, string> | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

// Doblete/Diego/Mufa/Yapa pasaron de "próximo partido" a "primer partido del
// día". Las jugadas viejas guardaron effectMatchId; las reinterpretamos como el
// día de ese partido (el motor ya resuelve el primero de la jornada).
const DAY_FIRST_MATCH_CARDS = new Set<CardType>(["doblete", "diego", "mufa", "yapa"]);

function toEffect(c: FunCardRow): PlayedCardEffect {
  let effectMatchId = c.effectMatchId;
  let effectDate = c.effectDate;
  if (!effectDate && effectMatchId && DAY_FIRST_MATCH_CARDS.has(c.cardType as CardType)) {
    const k = kickoffOf(effectMatchId);
    if (k) {
      effectDate = matchDay(k);
      effectMatchId = null;
    }
  }
  return {
    id: c.id,
    cardType: c.cardType as CardType,
    ownerId: c.participantId,
    targetId: c.targetParticipantId,
    effectMatchId,
    effectDate,
    reflected: c.reflected,
    playedAt: c.playedAt!,
  };
}

/**
 * Resuelve cartas + rachas de un prode Diversión sobre los puntos base.
 * Sin estado: todo se deriva de las cartas jugadas y los resultados actuales.
 * (El Caldeador ya vino aplicado en la base, en getLeaderboard.)
 */
function resolveFun(
  cards: FunCardRow[],
  ptsByMember: Record<string, MatchPointsMap>,
  bracket: BracketState,
  people: { id: string; name: string }[],
  defsById: DefsById,
): FunResolution {
  const played = cards.filter((c) => c.status === "played" && c.playedAt);
  // Carta jugada por id, para resolver su nombre/emoji del mazo del prode.
  const rowById = new Map(played.map((c) => [c.id, c]));
  const nameById = Object.fromEntries(people.map((p) => [p.id, p.name]));
  const today = funToday();

  // Partidos con resultado, ordenados por kickoff (grupos + llaves).
  const resolvedIds = [...Object.keys(ptsByMember[people[0]?.id] ?? {})].filter((id) =>
    kickoffOf(id),
  );
  resolvedIds.sort(
    (a, b) => new Date(kickoffOf(a)!).getTime() - new Date(kickoffOf(b)!).getTime(),
  );
  const kickoffById = Object.fromEntries(resolvedIds.map((id) => [id, kickoffOf(id)!]));

  const playedEffects = played.map(toEffect);

  const effects = applyCardEffects({
    cards: playedEffects,
    base: ptsByMember,
    matchOrder: resolvedIds,
    kickoffById,
  });

  // Partidos ya jugados (con resultado): un efecto atado a otro partido sigue pendiente.
  const hasResult = new Set(resolvedIds);

  // Overlays sociales activos: el último de cada tipo por víctima (status played;
  // el Borrón los pasa a consumed al jugarse).
  const overlayByMember: Record<string, FunOverlay> = {};
  const socialKinds: Record<string, keyof FunOverlay> = {
    apodo: "nickname",
    foto: "avatar",
    microfono: "message",
  };
  for (const c of [...played].sort((a, b) => a.playedAt!.getTime() - b.playedAt!.getTime())) {
    const kind = socialKinds[c.cardType];
    if (!kind || !c.targetParticipantId) continue;
    // Si rebotó en un Espejito, el apodo/foto/mensaje se lo come el que lo tiró.
    const victim = c.reflected ? c.participantId : c.targetParticipantId;
    const payload = parsePayload(c.payload);
    const byName = c.reflected
      ? `${nameById[c.targetParticipantId] ?? "—"} (espejito)`
      : (nameById[c.participantId] ?? "—");
    const overlay = (overlayByMember[victim] ??= {});
    if (kind === "nickname" && payload?.apodo)
      overlay.nickname = { text: payload.apodo, byName };
    if (kind === "avatar" && payload?.imagen)
      overlay.avatar = { dataUrl: payload.imagen, byName };
    if (kind === "message" && payload?.mensaje)
      overlay.message = { text: payload.mensaje, byName };
  }

  const infoByMember: FunResolution["infoByMember"] = {};
  // Defensas/buffs del día (escudo, espejito, aguante, var): se muestran como
  // "activos" mientras su jornada sea hoy o futura; nunca van a pendingEffects.
  const dayDefenses = new Set<CardType>(["escudo", "espejito", "aguante", "var"]);
  for (const person of people) {
    const mine = played.filter((c) => c.participantId === person.id);

    // El Fernet de Fernemo (aguante) protege la racha vía overrides de día
    // (applyCardEffects → "protect"), no como protección suelta del próximo 0.
    const streak = computeStreak({
      points: effects.points[person.id] ?? {},
      matchOrder: resolvedIds,
      kickoffById,
      overrides: effects.streakOverrides[person.id],
    });

    const activeDayCards: FunLeaderboardInfo["activeDayCards"] = [];
    const dayCardView = (type: CardType) => {
      const card = mine.find((c) => c.cardType === type);
      const v = (card ? viewOf(card, defsById) : CARD_CATALOG[type]) ?? CARD_CATALOG[type];
      return { cardType: type, name: v?.name ?? type, emoji: v?.emoji ?? "🃏", rarity: v?.rarity ?? "comun" };
    };
    const activeDay = (type: CardType) =>
      mine.some((c) => c.cardType === type && c.effectDate != null && c.effectDate >= today);
    if (activeDay("escudo")) activeDayCards.push(dayCardView("escudo"));
    if (activeDay("espejito")) activeDayCards.push(dayCardView("espejito"));
    if (activeDay("aguante")) activeDayCards.push(dayCardView("aguante"));
    if (activeDay("var")) activeDayCards.push(dayCardView("var"));

    // Efectos pendientes que afectan a esta persona: atados a un partido sin
    // resultado, o al día en curso. Las defensas del día van en activeDayCards.
    const pendingEffects = playedEffects
      .filter((c) => {
        if (dayDefenses.has(c.cardType)) return false;
        if (affectedIdOf(c) !== person.id) return false;
        if (c.effectMatchId) return !hasResult.has(c.effectMatchId);
        if (c.effectDate) return c.effectDate >= today;
        return false;
      })
      .map((c) => {
        const row = rowById.get(c.id);
        const v = row ? viewOf(row, defsById) : CARD_CATALOG[c.cardType];
        return {
          cardType: c.cardType,
          name: v?.name ?? c.cardType,
          emoji: v?.emoji ?? "🃏",
          matchId: c.effectMatchId,
          day: c.effectDate,
          fromName:
            CARD_CATALOG[c.cardType]?.kind === "attack" && c.ownerId !== person.id
              ? (nameById[c.ownerId] ?? null)
              : null,
        };
      });

    infoByMember[person.id] = {
      cardDelta: effects.delta[person.id] ?? 0,
      streakCurrent: streak.current,
      streakBest: streak.best,
      streakBonus: streak.bonus,
      protectedMatchIds: streak.protectedMatchIds,
      activeDayCards,
      pendingEffects,
      ...(overlayByMember[person.id] ? { overlay: overlayByMember[person.id] } : {}),
    };
  }

  return { effects, infoByMember };
}

export type HeldCard = { id: string; def: CardDef; drawDate: string };

export type FunFeedItem = {
  id: string;
  at: Date;
  /** Día (yyyy-mm-dd, huso MX) en que se jugó — para agrupar el historial. */
  day: string;
  ownerName: string;
  targetName: string | null;
  cardType: CardType;
  /** Nombre/emoji del mazo del prode (re-skin), no los del catálogo. */
  name: string;
  emoji: string;
  /** true si el ataque rebotó contra un Anulo mufa. */
  blocked: boolean;
  /** true si rebotó en un Espejito y volvió al que la tiró. */
  reflected: boolean;
  /** true si fue una maldición que le tocó al reclamar. */
  curse: boolean;
  /** Detalle social (el apodo puesto, el mensaje fijado). */
  detail: string | null;
  /**
   * Solo para el dueño de una defensa secreta: la carta real que está detrás del
   * señuelo. El resto (y un screenshot) ve la legendaria falsa; el dueño ve una
   * nota privada con la verdadera.
   */
  secretReal?: { name: string; emoji: string };
};

export type FunState = {
  today: string;
  /** Ya reclamó la carta de hoy en este prode. */
  claimedToday: boolean;
  canClaim: boolean;
  /** Carta sin resolver (pidió víctima/apodo/foto al salir): bloquea el sorteo. */
  pending: HeldCard | null;
  /** Carta que el visitante ya sacó hoy (para poder compartirla tras recargar). */
  myCardToday:
    | (Pick<CardDef, "name" | "emoji" | "rarity" | "description"> & { curse: boolean })
    | null;
  /** Historial completo de jugadas, más nuevas primero (la UI agrupa por día). */
  feed: FunFeedItem[];
};

// 15 personas × ~1 jugada/día × 39 días ≈ 600, más maldiciones y bloqueos:
// margen amplio para no truncar el historial a mitad de torneo.
const FEED_LIMIT = 1500;

/** Estado del modo Diversión para el visitante: mano, sorteo del día y actividad. */
export async function getFunState(pool: Pool, viewerId: string): Promise<FunState> {
  const [cards, memberIds, defsById, deckByMechanic] = await Promise.all([
    db.select().from(funCards).where(eq(funCards.poolId, pool.id)),
    getPoolMemberIds(pool.id),
    loadDefsById(pool.id),
    loadDeckByMechanic(pool.id),
  ]);
  const people = memberIds.length
    ? await db.select().from(participants).where(inArray(participants.id, memberIds))
    : [];
  const nameById = Object.fromEntries(people.map((p) => [p.id, p.name]));

  const today = funToday();
  const mine = cards.filter((c) => c.participantId === viewerId);
  // Carta pendiente de resolver: la "held" del DÍA (un ataque/social que pediste
  // y no elegiste víctima/apodo todavía). Solo vive la jornada en que la sacaste:
  // una held de un día anterior está vencida — ya pasó su día, no la podés jugar
  // hoy (la ataría a la jornada de hoy, no a la suya) ni te bloquea el sorteo.
  const pending: HeldCard | null =
    mine
      .filter((c) => c.status === "held" && c.drawDate === today && CARD_CATALOG[c.cardType as CardType])
      .sort((a, b) => a.drawnAt.getTime() - b.drawnAt.getTime())
      .map((c) => ({
        id: c.id,
        def: viewOf(c, defsById) ?? CARD_CATALOG[c.cardType as CardType],
        drawDate: c.drawDate,
      }))[0] ?? null;

  const claimedToday = mine.some((c) => c.drawDate === today);

  // Carta de hoy del visitante (para compartirla aunque ya haya recargado).
  const myTodayCard = mine.find((c) => c.drawDate === today);
  const myTodayDef = myTodayCard
    ? (viewOf(myTodayCard, defsById) ?? CARD_CATALOG[myTodayCard.cardType as CardType])
    : null;
  const myCardToday = myTodayDef
    ? {
        name: myTodayDef.name,
        emoji: myTodayDef.emoji,
        rarity: myTodayDef.rarity,
        description: myTodayDef.description,
        curse: myTodayDef.kind === "curse",
      }
    : null;

  // Las defensas (escudo/espejito) son SECRETAS mientras dura su jornada: para
  // TODOS (también el dueño, por si saca un screenshot) se muestran con un SEÑUELO
  // — una legendaria auto-buff del mazo, con su efecto y todo, indistinguible de
  // una jugada real — así no se nota el hueco ni se sabe quién está protegido. Al
  // dueño le sumamos una nota privada con la carta real (para que no se confunda).
  // Cuando un ataque la dispara, el rebote/bloqueo del ATAQUE sí aparece en el acto
  // (eso revela que la tenía); y recién al día siguiente aparece "la original".
  //
  // El secreto dura hasta el reset de las 0hs de México (cuando `today` avanza),
  // igual que el badge de la tabla — NO hasta que arranca el último partido (eso
  // haría `bindDay` y revelaría antes de tiempo).
  const feed: FunFeedItem[] = cards
    .filter((c) => c.status !== "held" && c.playedAt)
    .sort((a, b) => b.playedAt!.getTime() - a.playedAt!.getTime())
    .slice(0, FEED_LIMIT)
    .map((c) => {
      const isDefense = c.cardType === "escudo" || c.cardType === "espejito";
      const secretToday = isDefense && c.effectDate != null && c.effectDate >= today;

      const ownerName = nameById[c.participantId] ?? "—";

      // Señuelo: mostramos una carta falsa (cosmético del mazo), nunca la defensa
      // real. Usamos el señuelo GUARDADO al jugarla (estable); si es una defensa
      // vieja sin señuelo guardado, lo derivamos del id (mismo algoritmo). Al dueño
      // le adjuntamos la real como nota privada.
      if (secretToday) {
        const stored = parsePayload(c.payload)?.decoy;
        const decoyMech =
          typeof stored === "string" && CARD_CATALOG[stored as CardType]
            ? (stored as CardType)
            : pickDecoyMechanic(c.id);
        const cos = deckByMechanic.get(decoyMech);
        const real = viewOf(c, defsById) ?? CARD_CATALOG[c.cardType as CardType];
        return {
          id: c.id,
          at: c.playedAt!,
          day: funToday(c.playedAt!),
          ownerName,
          targetName: null,
          cardType: decoyMech,
          name: cos?.name ?? CARD_CATALOG[decoyMech].name,
          emoji: cos?.emoji ?? CARD_CATALOG[decoyMech].emoji,
          blocked: false,
          reflected: false,
          curse: false, // el pool de señuelos es todo positivo: nunca maldición
          detail: null,
          ...(c.participantId === viewerId && real
            ? { secretReal: { name: real.name, emoji: real.emoji } }
            : {}),
        };
      }

      const def = viewOf(c, defsById) ?? CARD_CATALOG[c.cardType as CardType];
      const payload = parsePayload(c.payload);
      const detail =
        c.cardType === "apodo"
          ? (payload?.apodo ?? null)
          : c.cardType === "microfono"
            ? (payload?.mensaje ?? null)
            : null;
      return {
        id: c.id,
        at: c.playedAt!,
        day: funToday(c.playedAt!),
        ownerName,
        targetName: c.targetParticipantId ? (nameById[c.targetParticipantId] ?? "—") : null,
        cardType: c.cardType as CardType,
        name: def?.name ?? c.cardType,
        emoji: def?.emoji ?? "🃏",
        blocked: c.status === "blocked",
        reflected: c.reflected,
        curse: def?.kind === "curse",
        detail,
      };
    });

  return {
    today,
    claimedToday,
    canClaim: !claimedToday && !pending,
    pending,
    myCardToday,
    feed,
  };
}

export type PlayContext = {
  memberIds: string[];
  /** Tabla actual (para resolver target y mostrar nombres). */
  rows: LeaderboardRow[];
  /** id del escudo secreto activo de la víctima (si tiene): anula el ataque. */
  targetShieldCardId: string | null;
  /** id del espejito secreto activo de la víctima (si tiene): rebota el ataque. */
  targetMirrorCardId: string | null;
};

/** Contexto para jugar una carta: tabla actual + defensas de la víctima. */
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

  // Las defensas son del día: un escudo/espejito protege contra los ataques de su
  // misma jornada (effectDate === la jornada del ataque) y NO se consume, así que
  // frena todos los del día. La jornada del ataque es la de jugarlo ahora.
  const jornada = bindDay(new Date());
  const dayShield = (memberId: string, type: CardType) =>
    cards
      .filter(
        (c) =>
          c.participantId === memberId &&
          c.cardType === type &&
          c.status === "played" &&
          c.effectDate != null &&
          c.effectDate === jornada,
      )
      .sort((a, b) => (a.playedAt?.getTime() ?? 0) - (b.playedAt?.getTime() ?? 0))[0]?.id ??
    null;

  return {
    memberIds,
    rows,
    targetShieldCardId: targetId ? dayShield(targetId, "escudo") : null,
    targetMirrorCardId: targetId ? dayShield(targetId, "espejito") : null,
  };
}

export type MatchPredictionRow = {
  id: string;
  name: string;
  homeGoals: number;
  awayGoals: number;
  // Caldeador: marcador al azar (ya con el flip de la Piedrambre aplicado si hubo) que
  // le pisó el pronóstico. Presente solo si la víctima recibió la carta ese día.
  caldeado?: { homeGoals: number; awayGoals: number };
  // Piedrambre: su pronóstico se computa dado vuelta.
  flipped?: boolean;
};

/**
 * Cartas que pisan los pronósticos del día (modo Diversión), por (jugador, partido):
 *  - caldeadoBy[`${pid}:${matchId}`] = id de la carta Caldeador (resultado al azar).
 *  - flippedBy contiene `${pid}:${matchId}` si la Piedrambre lo dio vuelta.
 * En prodes normales no hay funCards, así que devuelve mapas vacíos.
 */
async function loadForecastOverrides(
  poolId: string,
  bracket: BracketState,
): Promise<{ caldeadoBy: Record<string, string>; flippedBy: Set<string> }> {
  const caldeadoBy: Record<string, string> = {};
  const flippedBy = new Set<string>();
  const cards = await db.select().from(funCards).where(eq(funCards.poolId, poolId));
  // El Caldeador/Piedrambre pisa TODOS los partidos del día (jugados o no), para
  // que el marcador al azar se vea también antes de que haya resultado.
  for (const c of cards) {
    if (c.status !== "played" || !c.playedAt || !c.effectDate) continue;
    if (c.cardType === "caldeador") {
      const affected = c.reflected ? c.participantId : c.targetParticipantId;
      if (!affected) continue;
      for (const mid of matchIdsOnDay(c.effectDate, bracket)) caldeadoBy[`${affected}:${mid}`] = c.id;
    } else if (c.cardType === "piedrambre") {
      for (const mid of matchIdsOnDay(c.effectDate, bracket)) flippedBy.add(`${c.participantId}:${mid}`);
    }
  }
  return { caldeadoBy, flippedBy };
}

/** Pronósticos de los miembros del prode agrupados por partido (matchId → filas). */
export async function getPredictionsByMatch(
  poolId: string,
  isFun = false,
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
  // Modo Diversión: pisar los pronósticos con el Caldeador / Piedrambre.
  if (isFun) {
    const bracket = await getBracketState();
    const { caldeadoBy, flippedBy } = await loadForecastOverrides(poolId, bracket);
    for (const [matchId, rows] of Object.entries(byMatch)) {
      for (const row of rows) {
        const cId = caldeadoBy[`${row.id}:${matchId}`];
        const flip = flippedBy.has(`${row.id}:${matchId}`);
        if (!cId && !flip) continue;
        let eff: Score = cId
          ? caldeadorScore(cId, matchId)
          : { homeGoals: row.homeGoals, awayGoals: row.awayGoals };
        if (flip) eff = { homeGoals: eff.awayGoals, awayGoals: eff.homeGoals };
        if (cId) row.caldeado = { homeGoals: eff.homeGoals, awayGoals: eff.awayGoals };
        if (flip) row.flipped = true;
      }
    }
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
  // Caldeador: marcador al azar que le reemplazó el pronóstico (con eso se puntúa).
  caldeado?: { home: number; away: number };
  // Piedrambre: su pronóstico se computó dado vuelta.
  flipped?: boolean;
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
  caldeado?: { home: number; away: number; advance: string };
  flipped?: boolean;
};

export type ParticipantDetail = {
  name: string;
  extras: ExtraPick;
  realExtras: ExtraPick;
  matches: MatchDetail[];
  ko: KoDetail[];
  bracketGenerated: boolean;
};

/**
 * Detalle completo de pronósticos de un participante (para el drawer de la tabla).
 * Con `poolId` (modo Diversión) aplica el Caldeador y la Piedrambre: muestra el
 * marcador al azar que le vomitaron y puntúa como en la tabla.
 */
export async function getParticipantDetail(
  id: string,
  poolId?: string,
): Promise<ParticipantDetail | null> {
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

  // Cartas que le pisan los pronósticos a este jugador en este prode (modo Diversión).
  const { caldeadoBy, flippedBy } = poolId
    ? await loadForecastOverrides(poolId, bracket)
    : { caldeadoBy: {} as Record<string, string>, flippedBy: new Set<string>() };

  const { MATCHES } = await import("../fixtures");
  const matches: MatchDetail[] = MATCHES.map((m) => {
    const p = preds[m.id];
    const r = results[m.id];
    const cId = caldeadoBy[`${id}:${m.id}`];
    const flip = flippedBy.has(`${id}:${m.id}`);
    // Pronóstico efectivo: el random del Caldeador (si hay), luego dado vuelta por
    // la Piedrambre (si aplica). Mismo orden que la tabla.
    let eff: Score | undefined = cId ? caldeadorScore(cId, m.id) : p;
    if (eff && flip) eff = { homeGoals: eff.awayGoals, awayGoals: eff.homeGoals };
    return {
      id: m.id,
      group: m.group,
      homeCode: m.homeCode,
      awayCode: m.awayCode,
      date: m.date,
      pred: p ? { home: p.homeGoals, away: p.awayGoals } : null,
      real: r ? { home: r.homeGoals, away: r.awayGoals } : null,
      points: cId || flip ? matchPoints(eff, r) : matchPoints(p, r),
      ...(cId && eff ? { caldeado: { home: eff.homeGoals, away: eff.awayGoals } } : {}),
      ...(flip ? { flipped: true } : {}),
    };
  });

  const ko: KoDetail[] = bracket.matches.map((m) => {
    const p = koPreds[m.id];
    const cId = caldeadoBy[`${id}:${m.id}`];
    const flip = flippedBy.has(`${id}:${m.id}`);
    let eff =
      cId && m.home && m.away ? caldeadorKoPred(cId, m.id, m.home, m.away) : p;
    if (eff && flip) eff = { ...eff, homeGoals: eff.awayGoals, awayGoals: eff.homeGoals };
    const pts =
      eff && m.result && m.home && m.away
        ? knockoutPoints(eff, m.result as KoReal, m.home, m.away)
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
      ...(cId && eff
        ? { caldeado: { home: eff.homeGoals, away: eff.awayGoals, advance: eff.advance } }
        : {}),
      ...(flip ? { flipped: true } : {}),
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
