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
    noEffectShare: number;
    weightComun: number;
    weightRara: number;
    weightLegendaria: number;
    weightMaldicion: number;
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
      effect: CARD_CATALOG[d.mechanic as CardType] ? outcomeLabel(CARD_CATALOG[d.mechanic as CardType].spec) : "—",
    })),
    config: {
      noEffectShare: cfg?.noEffectShare ?? DEFAULT_FUN_CONFIG.noEffectShare,
      weightComun: cfg?.weightComun ?? DEFAULT_FUN_CONFIG.weights.comun,
      weightRara: cfg?.weightRara ?? DEFAULT_FUN_CONFIG.weights.rara,
      weightLegendaria: cfg?.weightLegendaria ?? DEFAULT_FUN_CONFIG.weights.legendaria,
      weightMaldicion: cfg?.weightMaldicion ?? DEFAULT_FUN_CONFIG.weights.maldicion,
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
  // (2-1 cuenta como 1-2). Misma mecánica upstream que el Caldeador: no muta el
  // pronóstico guardado (global entre prodes), solo recalcula la base de este prode.
  const flippedBy: Record<string, string> = {};
  for (const c of funCardRows) {
    if (c.cardType !== "piedrambre" || c.status !== "played" || !c.playedAt || !c.effectDate)
      continue;
    const affected = c.reflected ? c.participantId : c.targetParticipantId;
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
              cardDelta: funInfo.cardDelta + saibamba,
              pureTotal: (pureByMember[person.id] ?? 0) + ep,
            },
          }
        : {}),
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
};

export type FunState = {
  today: string;
  /** Ya reclamó la carta de hoy en este prode. */
  claimedToday: boolean;
  canClaim: boolean;
  /** Carta sin resolver (pidió víctima/apodo/foto al salir): bloquea el sorteo. */
  pending: HeldCard | null;
  /** Historial completo de jugadas, más nuevas primero (la UI agrupa por día). */
  feed: FunFeedItem[];
};

// 15 personas × ~1 jugada/día × 39 días ≈ 600, más maldiciones y bloqueos:
// margen amplio para no truncar el historial a mitad de torneo.
const FEED_LIMIT = 1500;

/** Estado del modo Diversión para el visitante: mano, sorteo del día y actividad. */
export async function getFunState(pool: Pool, viewerId: string): Promise<FunState> {
  const [cards, memberIds, defsById] = await Promise.all([
    db.select().from(funCards).where(eq(funCards.poolId, pool.id)),
    getPoolMemberIds(pool.id),
    loadDefsById(pool.id),
  ]);
  const people = memberIds.length
    ? await db.select().from(participants).where(inArray(participants.id, memberIds))
    : [];
  const nameById = Object.fromEntries(people.map((p) => [p.id, p.name]));

  const today = funToday();
  const mine = cards.filter((c) => c.participantId === viewerId);
  // Cartas pendientes de resolver (las "held" que quedaron de la era con mano
  // también caen acá y se resuelven de a una).
  const pending: HeldCard | null =
    mine
      .filter((c) => c.status === "held" && CARD_CATALOG[c.cardType as CardType])
      .sort((a, b) => a.drawnAt.getTime() - b.drawnAt.getTime())
      .map((c) => ({
        id: c.id,
        def: viewOf(c, defsById) ?? CARD_CATALOG[c.cardType as CardType],
        drawDate: c.drawDate,
      }))[0] ?? null;

  const claimedToday = mine.some((c) => c.drawDate === today);

  const feed: FunFeedItem[] = cards
    .filter((c) => c.status !== "held" && c.playedAt)
    .sort((a, b) => b.playedAt!.getTime() - a.playedAt!.getTime())
    .slice(0, FEED_LIMIT)
    .map((c) => {
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
        ownerName: nameById[c.participantId] ?? "—",
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

  return { today, claimedToday, canClaim: !claimedToday && !pending, pending, feed };
}

export type PlayContext = {
  memberIds: string[];
  /** Tabla actual (para resolver target y mostrar nombres). */
  rows: LeaderboardRow[];
  targetShieldCardId: string | null;
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
