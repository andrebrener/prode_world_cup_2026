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
} from "./db/schema";
import { eq } from "drizzle-orm";
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
  type ParticipantDetail,
} from "./db/queries";

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
