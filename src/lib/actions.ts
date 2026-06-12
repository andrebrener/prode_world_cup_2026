"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { db } from "./db";
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
} from "./db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { getParticipantId, setParticipantId } from "./session";
import { MATCHES, predictionsLocked } from "./fixtures";
import { allGroupStandings } from "./standings";
import { computeR32, KO_MATCHES_BY_ID } from "./bracket";
import {
  getResultsMap,
  getBracketState,
  getParticipantDetail,
  getPoolBySlug,
  getPoolByCode,
  isPoolMember,
  getPlayContext,
  type ParticipantDetail,
} from "./db/queries";
import {
  CARD_CATALOG,
  MAX_APODO_CHARS,
  MAX_MENSAJE_CHARS,
  MAX_FOTO_CHARS,
  type CardDef,
  type CardType,
  type PoolMode,
} from "./cardCatalog";
import { bindDay, dailyCard, funToday, resolvePlay } from "./cards";

const VALID_MATCH_IDS = new Set(MATCHES.map((m) => m.id));
const VALID_KO_IDS = new Set(Object.keys(KO_MATCHES_BY_ID));

function clampGoals(n: unknown): number {
  const v = Math.trunc(Number(n));
  if (!Number.isFinite(v) || v < 0) return 0;
  return Math.min(v, 99);
}

/** ¿El participante no tiene nada cargado? (para limpiar duplicados vacíos) */
async function isEmptyParticipant(id: string): Promise<boolean> {
  const [mp, ep, ko, mem] = await Promise.all([
    db.select().from(matchPredictions).where(eq(matchPredictions.participantId, id)),
    db.select().from(extraPredictions).where(eq(extraPredictions.participantId, id)),
    db.select().from(knockoutPredictions).where(eq(knockoutPredictions.participantId, id)),
    db.select().from(poolMembers).where(eq(poolMembers.participantId, id)),
  ]);
  return mp.length === 0 && ep.length === 0 && ko.length === 0 && mem.length === 0;
}

/**
 * Entra al prode. El NOMBRE es la identidad:
 *  - si ya existe un jugador con ese nombre, reclama ese jugador (con sus predicciones);
 *  - si no, renombra tu jugador actual o crea uno nuevo.
 * Sirve para recuperar tu sesión en otro dispositivo/dominio (la cookie no viaja entre dominios).
 */
export async function joinAction(name: string): Promise<{ ok: boolean; error?: string }> {
  const clean = name.trim().slice(0, 40);
  if (clean.length < 2) return { ok: false, error: "Poné un nombre (mín. 2 letras)." };

  const currentId = await getParticipantId();
  const all = await db.select().from(participants);

  // 1) ¿Ya existe un jugador con ese nombre? -> reclamarlo (con sus predicciones).
  const match = all.find((p) => p.name.trim().toLowerCase() === clean.toLowerCase());
  if (match) {
    // Si tu sesión actual era un jugador vacío distinto, borralo (evita duplicados huérfanos).
    if (currentId && currentId !== match.id && (await isEmptyParticipant(currentId))) {
      await db.delete(participants).where(eq(participants.id, currentId));
    }
    await setParticipantId(match.id);
    return { ok: true };
  }

  // 2) Nombre nuevo. Si tengo sesión válida, renombro mi jugador.
  if (currentId && all.some((p) => p.id === currentId)) {
    await db.update(participants).set({ name: clean }).where(eq(participants.id, currentId));
    return { ok: true };
  }

  // 3) Crear jugador nuevo.
  const id = randomUUID();
  await db.insert(participants).values({ id, name: clean, createdAt: new Date() });
  await setParticipantId(id);
  return { ok: true };
}

/** Tamaño máximo del data URL del avatar (~200 KB). El cliente ya lo comprime. */
const MAX_AVATAR_CHARS = 280_000;

/**
 * Actualiza la foto de perfil del participante actual.
 * `avatar` es un data URL (image/*) o `null` para quitarla.
 */
export async function updateAvatarAction(
  avatar: string | null,
): Promise<{ ok: boolean; error?: string }> {
  const id = await getParticipantId();
  if (!id) return { ok: false, error: "Primero ingresá tu nombre." };
  const found = await db.select().from(participants).where(eq(participants.id, id));
  if (!found[0]) return { ok: false, error: "Sesión inválida, volvé a ingresar tu nombre." };

  let value: string | null = null;
  if (avatar) {
    if (!avatar.startsWith("data:image/")) {
      return { ok: false, error: "La foto no es válida." };
    }
    if (avatar.length > MAX_AVATAR_CHARS) {
      return { ok: false, error: "La foto es muy pesada. Probá con una más chica." };
    }
    value = avatar;
  }

  await db.update(participants).set({ avatar: value }).where(eq(participants.id, id));
  revalidatePath("/", "layout");
  return { ok: true };
}

// ---------- Prodes (grupos) ----------

function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // saca acentos
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
}

async function uniqueSlug(base: string): Promise<string> {
  const root = base || "prode";
  let slug = root;
  while (await getPoolBySlug(slug)) {
    slug = `${root}-${randomUUID().slice(0, 4)}`;
  }
  return slug;
}

async function uniqueCode(): Promise<string> {
  let code = randomUUID().replace(/-/g, "").slice(0, 6);
  while (await getPoolByCode(code)) {
    code = randomUUID().replace(/-/g, "").slice(0, 6);
  }
  return code;
}

/** Crea un prode y suma al participante actual como primer miembro. */
export async function createPoolAction(
  name: string,
  isPublic: boolean,
  mode: PoolMode = "normal",
): Promise<{ ok: boolean; error?: string; slug?: string }> {
  const id = await getParticipantId();
  if (!id) return { ok: false, error: "Primero ingresá tu nombre." };
  const found = await db.select().from(participants).where(eq(participants.id, id));
  if (!found[0]) return { ok: false, error: "Sesión inválida, volvé a ingresar tu nombre." };

  const clean = name.trim().slice(0, 40);
  if (clean.length < 2) return { ok: false, error: "Poné un nombre para el prode (mín. 2 letras)." };

  const slug = await uniqueSlug(slugify(clean));
  const code = await uniqueCode();
  const poolId = randomUUID();
  const now = new Date();

  await db.insert(pools).values({
    id: poolId,
    name: clean,
    slug,
    code,
    isPublic: !!isPublic,
    mode: mode === "fun" ? "fun" : "normal",
    createdBy: id,
    createdAt: now,
  });
  await db
    .insert(poolMembers)
    .values({ poolId, participantId: id, joinedAt: now })
    .onConflictDoNothing();

  revalidatePath("/", "layout");
  return { ok: true, slug };
}

/** Suma al participante actual a un prode existente (por código o slug). */
export async function joinPoolAction(
  codeOrSlug: string,
): Promise<{ ok: boolean; error?: string; slug?: string }> {
  const id = await getParticipantId();
  if (!id) return { ok: false, error: "Primero ingresá tu nombre." };
  const found = await db.select().from(participants).where(eq(participants.id, id));
  if (!found[0]) return { ok: false, error: "Sesión inválida, volvé a ingresar tu nombre." };

  const key = codeOrSlug.trim().toLowerCase();
  if (!key) return { ok: false, error: "Poné el código o link del prode." };

  const pool = (await getPoolByCode(key)) ?? (await getPoolBySlug(key));
  if (!pool) return { ok: false, error: "No encontramos ese prode. Revisá el código." };

  await db
    .insert(poolMembers)
    .values({ poolId: pool.id, participantId: id, joinedAt: new Date() })
    .onConflictDoNothing();

  revalidatePath("/", "layout");
  return { ok: true, slug: pool.slug };
}

export type PredictionInput = {
  matches: { matchId: string; home: number; away: number }[];
  extras: {
    champion?: string | null;
    runnerUp?: string | null;
    topScorer?: string | null;
    figure?: string | null;
  };
};

/** Guarda/actualiza todos los pronósticos del participante actual. */
export async function savePredictionsAction(
  input: PredictionInput,
): Promise<{ ok: boolean; error?: string }> {
  const id = await getParticipantId();
  if (!id) return { ok: false, error: "Primero ingresá tu nombre." };
  if (predictionsLocked()) {
    return { ok: false, error: "El Mundial ya empezó: los pronósticos están cerrados." };
  }
  const found = await db.select().from(participants).where(eq(participants.id, id));
  if (!found[0]) return { ok: false, error: "Sesión inválida, volvé a ingresar tu nombre." };

  for (const m of input.matches) {
    if (!VALID_MATCH_IDS.has(m.matchId)) continue;
    const home = clampGoals(m.home);
    const away = clampGoals(m.away);
    await db
      .insert(matchPredictions)
      .values({ participantId: id, matchId: m.matchId, homeGoals: home, awayGoals: away })
      .onConflictDoUpdate({
        target: [matchPredictions.participantId, matchPredictions.matchId],
        set: { homeGoals: home, awayGoals: away },
      });
  }

  const e = input.extras;
  await db
    .insert(extraPredictions)
    .values({
      participantId: id,
      champion: e.champion ?? null,
      runnerUp: e.runnerUp ?? null,
      topScorer: e.topScorer?.trim().slice(0, 60) ?? null,
      figure: e.figure?.trim().slice(0, 60) ?? null,
    })
    .onConflictDoUpdate({
      target: extraPredictions.participantId,
      set: {
        champion: e.champion ?? null,
        runnerUp: e.runnerUp ?? null,
        topScorer: e.topScorer?.trim().slice(0, 60) ?? null,
        figure: e.figure?.trim().slice(0, 60) ?? null,
      },
    });

  revalidatePath("/", "layout");
  return { ok: true };
}

/** Carga/actualiza el resultado real de un partido (cualquier participante puede). */
export async function updateResultAction(
  matchId: string,
  home: number,
  away: number,
): Promise<{ ok: boolean; error?: string }> {
  const id = await getParticipantId();
  if (!id) return { ok: false, error: "Ingresá tu nombre para poder cargar resultados." };
  if (!VALID_MATCH_IDS.has(matchId)) return { ok: false, error: "Partido inválido." };

  const h = clampGoals(home);
  const a = clampGoals(away);
  await db
    .insert(matchResults)
    .values({ matchId, homeGoals: h, awayGoals: a })
    .onConflictDoUpdate({
      target: matchResults.matchId,
      set: { homeGoals: h, awayGoals: a },
    });

  revalidatePath("/", "layout");
  return { ok: true };
}

/** Borra el resultado real de un partido. */
export async function clearResultAction(matchId: string): Promise<{ ok: boolean }> {
  const id = await getParticipantId();
  if (!id) return { ok: false };
  await db.delete(matchResults).where(eq(matchResults.matchId, matchId));
  revalidatePath("/", "layout");
  return { ok: true };
}

/** Guarda en lote varios resultados + borra los vaciados + resultado del torneo. */
export async function saveResultsBatchAction(input: {
  results: { matchId: string; home: number; away: number }[];
  cleared: string[];
  tournament: {
    champion?: string | null;
    runnerUp?: string | null;
    topScorer?: string | null;
    figure?: string | null;
  };
}): Promise<{ ok: boolean; error?: string }> {
  const id = await getParticipantId();
  if (!id) return { ok: false, error: "Ingresá tu nombre para poder cargar resultados." };

  for (const r of input.results) {
    if (!VALID_MATCH_IDS.has(r.matchId)) continue;
    const h = clampGoals(r.home);
    const a = clampGoals(r.away);
    await db
      .insert(matchResults)
      .values({ matchId: r.matchId, homeGoals: h, awayGoals: a })
      .onConflictDoUpdate({ target: matchResults.matchId, set: { homeGoals: h, awayGoals: a } });
  }
  for (const matchId of input.cleared) {
    await db.delete(matchResults).where(eq(matchResults.matchId, matchId));
  }

  const t = input.tournament;
  const values = {
    id: 1,
    champion: t.champion ?? null,
    runnerUp: t.runnerUp ?? null,
    topScorer: t.topScorer?.trim().slice(0, 60) ?? null,
    figure: t.figure?.trim().slice(0, 60) ?? null,
  };
  await db
    .insert(tournamentResult)
    .values(values)
    .onConflictDoUpdate({ target: tournamentResult.id, set: values });

  revalidatePath("/", "layout");
  return { ok: true };
}

/**
 * Genera/actualiza las llaves a partir de las posiciones finales de grupos.
 * Requiere que estén los 72 resultados oficiales de la fase de grupos.
 */
export async function updateBracketAction(): Promise<{ ok: boolean; error?: string }> {
  const id = await getParticipantId();
  if (!id) return { ok: false, error: "Ingresá tu nombre para actualizar las llaves." };

  const results = await getResultsMap();
  if (Object.keys(results).length < MATCHES.length) {
    return {
      ok: false,
      error: `Faltan resultados: ${Object.keys(results).length}/${MATCHES.length} de la fase de grupos.`,
    };
  }

  const standings = allGroupStandings(results);
  const r32 = computeR32(standings);
  const now = new Date();
  await db
    .insert(bracketMeta)
    .values({ id: 1, generatedAt: now, r32Json: JSON.stringify(r32) })
    .onConflictDoUpdate({
      target: bracketMeta.id,
      set: { generatedAt: now, r32Json: JSON.stringify(r32) },
    });

  revalidatePath("/", "layout");
  return { ok: true };
}

/** Trae el detalle de pronósticos de un participante (para el drawer de la tabla). */
export async function fetchParticipantDetailAction(
  id: string,
): Promise<ParticipantDetail | null> {
  return getParticipantDetail(id);
}

export type KoPredictionInput = {
  matchId: string;
  home: number;
  away: number;
  advance: string;
}[];

/** Guarda los pronósticos de knockout del participante (solo cruces aún sin resultado). */
export async function saveKnockoutPredictionsAction(
  input: KoPredictionInput,
): Promise<{ ok: boolean; error?: string }> {
  const id = await getParticipantId();
  if (!id) return { ok: false, error: "Primero ingresá tu nombre." };

  const bracket = await getBracketState();
  if (!bracket.generated) return { ok: false, error: "Las llaves todavía no están." };
  const byId = Object.fromEntries(bracket.matches.map((m) => [m.id, m]));

  for (const p of input) {
    const m = byId[p.matchId];
    if (!m || !m.home || !m.away) continue; // cruce no resuelto
    if (m.result) continue; // ya se jugó: cerrado
    if (p.advance !== m.home && p.advance !== m.away) continue; // avance inválido
    const home = clampGoals(p.home);
    const away = clampGoals(p.away);
    await db
      .insert(knockoutPredictions)
      .values({ participantId: id, matchId: p.matchId, homeGoals: home, awayGoals: away, advance: p.advance })
      .onConflictDoUpdate({
        target: [knockoutPredictions.participantId, knockoutPredictions.matchId],
        set: { homeGoals: home, awayGoals: away, advance: p.advance },
      });
  }

  revalidatePath("/", "layout");
  return { ok: true };
}

/** Carga/actualiza resultados oficiales de knockout (score + penales). */
export async function saveKnockoutResultsAction(input: {
  results: {
    matchId: string;
    home: number;
    away: number;
    penalties: boolean;
    penWinner: string | null;
  }[];
  cleared: string[];
}): Promise<{ ok: boolean; error?: string }> {
  const id = await getParticipantId();
  if (!id) return { ok: false, error: "Ingresá tu nombre para cargar resultados." };

  for (const r of input.results) {
    if (!VALID_KO_IDS.has(r.matchId)) continue;
    const h = clampGoals(r.home);
    const a = clampGoals(r.away);
    const penalties = !!r.penalties;
    const penWinner = penalties ? (r.penWinner ?? null) : null;
    await db
      .insert(knockoutResults)
      .values({ matchId: r.matchId, homeGoals: h, awayGoals: a, penalties, penWinner })
      .onConflictDoUpdate({
        target: knockoutResults.matchId,
        set: { homeGoals: h, awayGoals: a, penalties, penWinner },
      });
  }
  for (const matchId of input.cleared) {
    await db.delete(knockoutResults).where(eq(knockoutResults.matchId, matchId));
  }

  revalidatePath("/", "layout");
  return { ok: true };
}

// ---------- Modo Diversión: cartas ----------

/** Valida sesión + prode Diversión + membresía. */
async function funGate(slug: string) {
  const id = await getParticipantId();
  if (!id) return { error: "Primero ingresá tu nombre." } as const;
  const pool = await getPoolBySlug(slug);
  if (!pool) return { error: "No encontramos ese prode." } as const;
  if (pool.mode !== "fun") return { error: "Este prode no es modo Diversión." } as const;
  if (!(await isPoolMember(pool.id, id)))
    return { error: "No estás en este prode." } as const;
  return { id, pool } as const;
}
export type PlayCardExtra = {
  /** Apodo para "Los apodos del Droco". */
  apodo?: string;
  /** Declaración para "Micrófono abierto". */
  mensaje?: string;
  /** Data URL (ya comprimida en el cliente) para "Foto trucha". */
  imagen?: string;
};

type PlayResult = {
  ok: boolean;
  error?: string;
  blocked?: boolean;
  reflected?: boolean;
  targetName?: string;
};

/**
 * Núcleo de jugar una carta (la usan el claim con auto-jugada y la resolución
 * de cartas pendientes). Asume fila propia en estado "held".
 */
async function executePlay(
  pool: NonNullable<Awaited<ReturnType<typeof getPoolBySlug>>>,
  ownerId: string,
  cardId: string,
  def: CardDef,
  targetId: string | null,
  extra?: PlayCardExtra,
): Promise<PlayResult> {
  // Inputs sociales: validar acá (resolvePlay es puro, no ve payloads).
  const payload: Record<string, unknown> = {};
  if (def.input === "apodo") {
    const apodo = extra?.apodo?.trim().slice(0, MAX_APODO_CHARS);
    if (!apodo || apodo.length < 2) return { ok: false, error: "Poné un apodo (mín. 2 letras)." };
    payload.apodo = apodo;
  }
  if (def.input === "mensaje") {
    const mensaje = extra?.mensaje?.trim().slice(0, MAX_MENSAJE_CHARS);
    if (!mensaje || mensaje.length < 2)
      return { ok: false, error: "Poné una declaración (mín. 2 letras)." };
    payload.mensaje = mensaje;
  }
  if (def.input === "imagen") {
    const imagen = extra?.imagen;
    if (!imagen?.startsWith("data:image/"))
      return { ok: false, error: "Subí una foto para la víctima." };
    if (imagen.length > MAX_FOTO_CHARS)
      return { ok: false, error: "La foto es muy pesada. Probá con una más chica." };
    payload.imagen = imagen;
  }

  // El caparazón apunta solo: va directo al líder actual del prode, así que el
  // contexto (defensas de la víctima incluidas) se arma con el target final.
  let ctx = await getPlayContext(pool, ownerId, targetId);
  let finalTargetId = targetId;
  if (def.target === "leader") {
    finalTargetId = ctx.rows[0]?.id ?? null;
    if (finalTargetId && finalTargetId !== targetId) {
      ctx = await getPlayContext(pool, ownerId, finalTargetId);
    }
  }

  // Sin rivales no hay a quién atacar: la carta sale jugada al vacío.
  if (def.target === "other" && ctx.memberIds.length < 2) {
    await db
      .update(funCards)
      .set({ status: "played", playedAt: new Date() })
      .where(eq(funCards.id, cardId));
    return { ok: true };
  }

  const outcome = resolvePlay({
    cardType: def.type,
    ownerId,
    targetId: finalTargetId,
    now: new Date(),
    memberIds: ctx.memberIds,
    targetShieldCardId: ctx.targetShieldCardId,
    targetMirrorCardId: ctx.targetMirrorCardId,
  });
  if (!outcome.ok) return { ok: false, error: outcome.error };

  const now = new Date();
  const targetName = finalTargetId
    ? (ctx.rows.find((r) => r.id === finalTargetId)?.name ?? undefined)
    : undefined;

  if (outcome.blockedByShieldId) {
    // El ataque rebota contra el Anulo mufa: queda en el feed y el escudo se consume.
    await db
      .update(funCards)
      .set({ status: "blocked", playedAt: now, targetParticipantId: finalTargetId })
      .where(eq(funCards.id, cardId));
    await db
      .update(funCards)
      .set({ status: "consumed" })
      .where(eq(funCards.id, outcome.blockedByShieldId));
    return { ok: true, blocked: true, targetName };
  }

  // Snapshots de puntos: el efecto queda congelado al momento de jugarse.
  if (def.type === "caparazon" && finalTargetId) {
    // Si rebotó en un Espejito, el caparazón vuelve y te baja a VOS.
    const hitId = outcome.reflectedByMirrorId ? ownerId : finalTargetId;
    const hit = ctx.rows.find((r) => r.id === hitId);
    const last = ctx.rows[ctx.rows.length - 1];
    if (hit && last) {
      payload.deltas = { [hitId]: -(hit.total - (last.total - 1)) };
    }
  }
  if (def.type === "swap" && finalTargetId) {
    const me = ctx.rows.find((r) => r.id === ownerId);
    const victim = ctx.rows.find((r) => r.id === finalTargetId);
    if (me && victim) {
      const diff = victim.total - me.total;
      payload.deltas = { [ownerId]: diff, [finalTargetId]: -diff };
    }
  }

  const reflected = !!outcome.reflectedByMirrorId;
  await db
    .update(funCards)
    .set({
      status: "played",
      playedAt: now,
      targetParticipantId: finalTargetId,
      effectMatchId: outcome.effectMatchId,
      effectDate: outcome.effectDate,
      payload: Object.keys(payload).length ? JSON.stringify(payload) : null,
      reflected,
    })
    .where(eq(funCards.id, cardId));

  if (outcome.reflectedByMirrorId) {
    await db
      .update(funCards)
      .set({ status: "consumed" })
      .where(eq(funCards.id, outcome.reflectedByMirrorId));
  }

  // Borrón y cuenta nueva: limpia todos los overlays sociales colgados sobre mí.
  if (def.type === "borron") {
    const socialTypes = ["apodo", "foto", "microfono"];
    await db
      .update(funCards)
      .set({ status: "consumed" })
      .where(
        and(
          eq(funCards.poolId, pool.id),
          eq(funCards.targetParticipantId, ownerId),
          eq(funCards.status, "played"),
          inArray(funCards.cardType, socialTypes),
        ),
      );
  }

  return { ok: true, blocked: false, reflected, targetName };
}

type DrawResult = {
  ok: boolean;
  error?: string;
  card?: CardDef;
  cardId?: string;
  curse?: boolean;
  /** La carta necesita que elijas víctima (y/o apodo/foto): quedó pendiente. */
  needsTarget?: boolean;
};

/** Saca una carta y la juega en el acto (jugada obligada). */
async function drawAndPlay(
  pool: NonNullable<Awaited<ReturnType<typeof getPoolBySlug>>>,
  participantId: string,
  drawDate: string,
  def: CardDef,
): Promise<DrawResult> {
  const isCurse = def.kind === "curse";
  const now = new Date();
  const cardId = randomUUID();

  try {
    await db.insert(funCards).values({
      id: cardId,
      poolId: pool.id,
      participantId,
      drawDate,
      cardType: def.type,
      // Maldición: se juega sola al reclamar, atada al día (o próximo día con partidos).
      status: isCurse ? "played" : "held",
      drawnAt: now,
      playedAt: isCurse ? now : null,
      effectDate: isCurse && def.window === "day" ? (bindDay(now) ?? funToday(now)) : null,
    });
  } catch {
    // Índice único: ya reclamó hoy (doble click / doble pestaña).
    return { ok: false, error: "Ya reclamaste la carta de hoy. Mañana hay otra." };
  }

  if (isCurse) {
    revalidatePath("/", "layout");
    return { ok: true, card: def, cardId, curse: true };
  }

  // Jugada obligada: las que no piden elección salen jugadas en el acto.
  // Las que piden víctima/apodo/foto quedan pendientes hasta que las resuelvas.
  const needsChoice = def.target === "other" || !!def.input;
  if (!needsChoice) {
    await executePlay(pool, participantId, cardId, def, null);
  }

  revalidatePath("/", "layout");
  return { ok: true, card: def, cardId, needsTarget: needsChoice };
}

/**
 * Reclama la carta del día. El sorteo es determinístico por (prode, jugador, fecha):
 * reclamar solo persiste el resultado. Si no la reclamás hoy, mañana ya no está.
 * La carta se JUEGA al salir (no hay mano): las maldiciones se aplican solas, los
 * buffs se activan al toque y los ataques te piden la víctima en el momento.
 */
export async function claimDailyCardAction(slug: string): Promise<DrawResult> {
  const gate = await funGate(slug);
  if ("error" in gate) return { ok: false, error: gate.error };
  const { id, pool } = gate;

  // Una carta pendiente de resolver bloquea el sorteo (jugada obligada).
  const [pendingRow] = await db
    .select({ id: funCards.id })
    .from(funCards)
    .where(
      and(
        eq(funCards.poolId, pool.id),
        eq(funCards.participantId, id),
        eq(funCards.status, "held"),
      ),
    )
    .limit(1);
  if (pendingRow) {
    return { ok: false, error: "Tenés una carta sin resolver. Elegí la víctima primero." };
  }

  const today = funToday();
  return drawAndPlay(pool, id, today, dailyCard(pool.id, id, today));
}

/**
 * SOLO DEV — para probar el mazo: saca una carta extra al azar (respetando las
 * rarezas, maldiciones incluidas), sin límite diario.
 * No existe en producción. Borrar cuando termine la etapa de pruebas.
 */
export async function devDrawCardAction(slug: string): Promise<DrawResult> {
  if (process.env.NODE_ENV === "production") {
    return { ok: false, error: "Solo disponible en desarrollo." };
  }
  const gate = await funGate(slug);
  if ("error" in gate) return { ok: false, error: gate.error };
  const { id, pool } = gate;

  // Sal aleatoria como "fecha" → carta al azar y sin chocar con el índice único.
  const salt = `dev-${randomUUID().slice(0, 8)}`;
  return drawAndPlay(pool, id, salt, dailyCard(pool.id, id, salt));
}

/**
 * Resuelve una carta pendiente (la que pidió víctima/apodo/foto al salir).
 * Un Anulo mufa de la víctima la bloquea; un Espejito rebotín la devuelve.
 */
export async function playCardAction(
  slug: string,
  cardId: string,
  targetId: string | null,
  extra?: PlayCardExtra,
): Promise<PlayResult & { card?: CardDef }> {
  const gate = await funGate(slug);
  if ("error" in gate) return { ok: false, error: gate.error };
  const { id, pool } = gate;

  const [row] = await db.select().from(funCards).where(eq(funCards.id, cardId));
  if (!row || row.poolId !== pool.id || row.participantId !== id) {
    return { ok: false, error: "Esa carta no es tuya." };
  }
  if (row.status !== "held") return { ok: false, error: "Esa carta ya se jugó." };
  const def = CARD_CATALOG[row.cardType as CardType];
  if (!def) return { ok: false, error: "Carta desconocida." };

  const result = await executePlay(pool, id, cardId, def, targetId, extra);
  if (result.ok) revalidatePath("/", "layout");
  return { ...result, card: def };
}


/** Carga/actualiza el resultado final del torneo (campeón, subcampeón, goleador, figura). */
export async function updateTournamentResultAction(extras: {
  champion?: string | null;
  runnerUp?: string | null;
  topScorer?: string | null;
  figure?: string | null;
}): Promise<{ ok: boolean; error?: string }> {
  const id = await getParticipantId();
  if (!id) return { ok: false, error: "Ingresá tu nombre para poder cargar resultados." };

  const values = {
    id: 1,
    champion: extras.champion ?? null,
    runnerUp: extras.runnerUp ?? null,
    topScorer: extras.topScorer?.trim().slice(0, 60) ?? null,
    figure: extras.figure?.trim().slice(0, 60) ?? null,
  };
  await db
    .insert(tournamentResult)
    .values(values)
    .onConflictDoUpdate({ target: tournamentResult.id, set: values });

  revalidatePath("/", "layout");
  return { ok: true };
}
