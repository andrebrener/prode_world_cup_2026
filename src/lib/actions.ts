"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
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
  cardDefs,
  deckTombstones,
  poolFunConfig,
} from "./db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { getParticipantId, setParticipantId } from "./session";
import { MATCHES, predictionsLockedForName, teamName } from "./fixtures";
import { allGroupStandings } from "./standings";
import { computeR32, KO_MATCHES_BY_ID } from "./bracket";
import {
  getResultsMap,
  getBracketState,
  getResolvedMatchPoints,
  getParticipantDetail,
  getPoolBySlug,
  getPoolByCode,
  isPoolMember,
  getPlayContext,
  canManagePool,
  getPoolRole,
  type ParticipantDetail,
} from "./db/queries";
import {
  CARD_CATALOG,
  cardView,
  DEFAULT_DECK,
  MAX_APODO_CHARS,
  MAX_MENSAJE_CHARS,
  MAX_FOTO_CHARS,
  type CardDef,
  type CardType,
  type PoolMode,
} from "./cardCatalog";
import {
  bindDay,
  funToday,
  matchDay,
  resolveDeck,
  pickDailyCard,
  resolvePlay,
  BLOCKABLE_ATTACKS,
  retroDefenseTargets,
  type DrawnCard,
} from "./cards";
import { ensureFunPool, getPoolDeckRows, getPoolFunConfig } from "./db/decks";
import { renderAttackEmail } from "./funDigest";
import { sendEmail } from "./mailer";
import { matchPoints } from "./scoring";
import {
  sendPushToParticipants,
  savePushSubscription,
  deletePushSubscription,
  type ClientSubscription,
} from "./push";

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

/**
 * Guarda (o borra con null) el mail del participante actual, para el resumen
 * diario del modo Diversión.
 */
export async function saveEmailAction(
  email: string | null,
): Promise<{ ok: boolean; error?: string }> {
  const id = await getParticipantId();
  if (!id) return { ok: false, error: "Primero ingresá tu nombre." };

  let value: string | null = null;
  if (email !== null) {
    const clean = email.trim().toLowerCase().slice(0, 120);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(clean)) {
      return { ok: false, error: "Ese mail no parece válido." };
    }
    value = clean;
  }

  await db.update(participants).set({ email: value }).where(eq(participants.id, id));
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

  // Un prode fun nuevo arranca con el mazo VACÍO: el admin lo arma desde el
  // catálogo. Tombstoneamos toda mecánica del mazo default para que el top-up
  // (ensurePoolDeck, que corre al abrir admin / reclamar carta) no clone nada.
  // Agregar una carta (addCardDefAction) levanta su tombstone.
  if (mode === "fun") {
    await db
      .insert(deckTombstones)
      .values(DEFAULT_DECK.map((d) => ({ poolId, mechanic: d.mechanic })))
      .onConflictDoNothing();
  }

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

/**
 * Salir de un prode: borra la membresía del participante actual.
 * Las predicciones son globales del jugador, así que no se tocan: salir solo
 * lo saca de la tabla de ese prode (y se puede volver a entrar con el código).
 */
export async function leavePoolAction(
  slug: string,
): Promise<{ ok: boolean; error?: string }> {
  const id = await getParticipantId();
  if (!id) return { ok: false, error: "Primero ingresá tu nombre." };

  const pool = await getPoolBySlug(slug.trim().toLowerCase());
  if (!pool) return { ok: false, error: "No encontramos ese prode." };

  await db
    .delete(poolMembers)
    .where(and(eq(poolMembers.poolId, pool.id), eq(poolMembers.participantId, id)));

  revalidatePath("/", "layout");
  return { ok: true };
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
  const found = await db.select().from(participants).where(eq(participants.id, id));
  if (!found[0]) return { ok: false, error: "Sesión inválida, volvé a ingresar tu nombre." };
  if (predictionsLockedForName(found[0].name)) {
    return { ok: false, error: "El Mundial ya empezó: los pronósticos están cerrados." };
  }

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

/**
 * Texto (medio troll) de la push según los puntos base (`base`) y los que
 * realmente quedaron después de las cartas (`net`). `nullified` = el jugador
 * tenía una carta "hoy no suma" activa (para chicanearlo aunque no hubiese sumado).
 */
function resultsBody(base: number, net: number, nullified: boolean): string {
  const plural = (n: number) => (n === 1 ? "punto" : "puntos");

  // No sumaste nada… y encima estabas bloqueado: doble consuelo.
  if (nullified && base === 0)
    return `No sumaste nada… pero igual hoy no sumabas, así que no te preocupes 😌`;
  // Habías sumado pero una carta te dejó en cero (te bloquearon / robaron / mufaron).
  if (net === 0 && base > 0)
    return `¡Sumaste ${base} ${plural(base)}! … ah, no. Hoy no sumabas, es verdad 🤡 Te quedaste en cero. Mirá la tabla.`;
  // Las cartas te potenciaron.
  if (net > base)
    return `¡Sumaste ${net} ${plural(net)}! 🔥 Tus cartas la rompieron (+${net - base}). Mirá la tabla.`;
  // Una carta te recortó, pero algo quedó.
  if (net < base)
    return `¡Sumaste ${net} ${plural(net)}! …bueno, te clavaron una carta y perdiste ${base - net} 😈 Mirá la tabla.`;
  // Sin cartas de por medio.
  if (net > 0) return `¡Sumaste ${net} ${plural(net)}! Mirá la tabla.`;
  return `Esta vez no sumaste. ¡A remontar! 💪`;
}

/**
 * Push a cada jugador que pronosticó alguno de los partidos recién cargados.
 * En prodes modo Diversión avisa los puntos YA resueltos por cartas (no los
 * crudos) y nombra el prode; manda un push por prode fun (tag propio) más uno
 * crudo para quien no juega en ninguno. Corre en after() para no demorar al admin.
 */
function notifyResults(changed: { matchId: string; home: number; away: number }[]) {
  if (changed.length === 0) return;
  after(() => sendResultNotifications(changed));
}

/**
 * El trabajo de notifyResults, sin el wrapper de after(): arma y manda los push
 * de resultados (puntos ya resueltos por cartas en prodes fun). Exportado para
 * poder reenviar a mano la notificación de un partido (scripts/resend-result-notif.ts).
 */
export async function sendResultNotifications(
  changed: { matchId: string; home: number; away: number }[],
): Promise<void> {
  if (changed.length === 0) return;
  try {
      const ids = changed.map((c) => c.matchId);
      const preds = await db
        .select()
        .from(matchPredictions)
        .where(inArray(matchPredictions.matchId, ids));
      if (preds.length === 0) return;

      const realById = new Map(
        changed.map((c) => [c.matchId, { homeGoals: c.home, awayGoals: c.away }]),
      );
      const predParts = [...new Set(preds.map((p) => p.participantId))];

      // Encabezado: si fue un solo partido lo nombramos; si varios, resumen.
      const single = changed.length === 1 ? changed[0] : null;
      const mm = single ? MATCHES.find((x) => x.id === single.matchId) : null;
      const head = mm
        ? `⚽ ${teamName(mm.homeCode)} ${single!.home}–${single!.away} ${teamName(mm.awayCode)}`
        : `⚽ Se cargaron ${changed.length} resultados`;

      // Días (huso MX) cubiertos por los partidos cargados.
      const dayByMatch = new Map<string, string | null>();
      for (const id of ids) {
        const m = MATCHES.find((x) => x.id === id);
        dayByMatch.set(id, m ? matchDay(m.kickoff) : null);
      }
      const changedDays = [...new Set([...dayByMatch.values()])].filter(
        (d): d is string => d != null,
      );

      // Cartas "hoy no suma" (zero_day) jugadas en esos días, por prode → a quién
      // dejan bloqueado. Cubre ataques (caído/filtro, que rebotan con un espejito)
      // y maldiciones self (nemo/heladera/matambrito). Solo para chicanear.
      const blockedByPool = new Map<string, Set<string>>();
      if (changedDays.length > 0) {
        const zcards = await db
          .select()
          .from(funCards)
          .where(and(eq(funCards.status, "played"), inArray(funCards.effectDate, changedDays)));
        for (const card of zcards) {
          const def = CARD_CATALOG[card.cardType as CardType];
          if (def?.spec.outcome !== "zero_day" || !card.playedAt || !card.effectDate) continue;
          const affected =
            def.kind === "attack"
              ? card.reflected
                ? card.participantId
                : card.targetParticipantId
              : card.participantId;
          if (!affected) continue;
          const set = blockedByPool.get(card.poolId) ?? new Set<string>();
          set.add(affected);
          blockedByPool.set(card.poolId, set);
        }
      }

      // Prodes modo Diversión que tienen a alguno de estos jugadores: el push de
      // un prode fun muestra los puntos YA resueltos por cartas y lleva su nombre.
      const funRows = await db
        .select({
          poolId: pools.id,
          name: pools.name,
          slug: pools.slug,
          code: pools.code,
          isPublic: pools.isPublic,
          mode: pools.mode,
          createdBy: pools.createdBy,
          participantId: poolMembers.participantId,
        })
        .from(poolMembers)
        .innerJoin(pools, eq(poolMembers.poolId, pools.id))
        .where(and(eq(pools.mode, "fun"), inArray(poolMembers.participantId, predParts)));

      type FunPool = { pool: Parameters<typeof getResolvedMatchPoints>[0]; parts: Set<string> };
      const funPools = new Map<string, FunPool>();
      for (const r of funRows) {
        let entry = funPools.get(r.poolId);
        if (!entry) {
          entry = {
            pool: {
              id: r.poolId,
              name: r.name,
              slug: r.slug,
              code: r.code,
              isPublic: r.isPublic,
              mode: r.mode as PoolMode,
              createdBy: r.createdBy,
            },
            parts: new Set<string>(),
          };
          funPools.set(r.poolId, entry);
        }
        entry.parts.add(r.participantId);
      }

      const pushes: Promise<unknown>[] = [];
      const coveredByFun = new Set<string>();

      // Un push por prode fun (con su nombre), agrupando por (base, net, bloqueado).
      for (const [poolId, { pool, parts }] of funPools) {
        const { base, resolved } = await getResolvedMatchPoints(pool);
        const blocked = blockedByPool.get(poolId) ?? new Set<string>();
        const byKey = new Map<
          string,
          { base: number; net: number; nullified: boolean; pids: string[] }
        >();
        for (const pid of parts) {
          coveredByFun.add(pid);
          let b = 0;
          let n = 0;
          for (const id of ids) {
            b += base[pid]?.[id] ?? 0;
            n += resolved[pid]?.[id] ?? 0;
          }
          const nullified = blocked.has(pid);
          const key = `${b}|${n}|${nullified ? 1 : 0}`;
          const g = byKey.get(key) ?? { base: b, net: n, nullified, pids: [] };
          g.pids.push(pid);
          byKey.set(key, g);
        }
        for (const g of byKey.values()) {
          pushes.push(
            sendPushToParticipants(g.pids, {
              title: head,
              body: `${pool.name} · ${resultsBody(g.base, g.net, g.nullified)}`,
              url: "/",
              tag: `resultados-${poolId}`,
            }),
          );
        }
      }

      // Jugadores que no están en ningún prode fun: puntos crudos, sin cartas.
      const rawByPart = new Map<string, number>();
      for (const p of preds) {
        if (coveredByFun.has(p.participantId)) continue;
        const pts = matchPoints(
          { homeGoals: p.homeGoals, awayGoals: p.awayGoals },
          realById.get(p.matchId),
        );
        rawByPart.set(p.participantId, (rawByPart.get(p.participantId) ?? 0) + pts);
      }
      const byPts = new Map<number, string[]>();
      for (const [pid, pts] of rawByPart) {
        const arr = byPts.get(pts) ?? [];
        arr.push(pid);
        byPts.set(pts, arr);
      }
      for (const [pts, pids] of byPts) {
        pushes.push(
          sendPushToParticipants(pids, {
            title: head,
            body: resultsBody(pts, pts, false),
            url: "/",
            tag: "resultados",
          }),
        );
      }

      await Promise.all(pushes);
  } catch (e) {
    console.error("[sendResultNotifications]", e);
  }
}

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
  const prev = (await getResultsMap())[matchId];
  await db
    .insert(matchResults)
    .values({ matchId, homeGoals: h, awayGoals: a })
    .onConflictDoUpdate({
      target: matchResults.matchId,
      set: { homeGoals: h, awayGoals: a },
    });

  // Solo avisamos si el resultado es nuevo o cambió (no en re-guardados iguales).
  if (!prev || prev.homeGoals !== h || prev.awayGoals !== a) {
    notifyResults([{ matchId, home: h, away: a }]);
  }

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

  const prevResults = await getResultsMap();
  const changed: { matchId: string; home: number; away: number }[] = [];
  for (const r of input.results) {
    if (!VALID_MATCH_IDS.has(r.matchId)) continue;
    const h = clampGoals(r.home);
    const a = clampGoals(r.away);
    await db
      .insert(matchResults)
      .values({ matchId: r.matchId, homeGoals: h, awayGoals: a })
      .onConflictDoUpdate({ target: matchResults.matchId, set: { homeGoals: h, awayGoals: a } });
    const p = prevResults[r.matchId];
    if (!p || p.homeGoals !== h || p.awayGoals !== a) {
      changed.push({ matchId: r.matchId, home: h, away: a });
    }
  }
  for (const matchId of input.cleared) {
    await db.delete(matchResults).where(eq(matchResults.matchId, matchId));
  }

  // Push de puntos solo para los partidos nuevos o que cambiaron.
  notifyResults(changed);

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
  poolId?: string,
): Promise<ParticipantDetail | null> {
  return getParticipantDetail(id, poolId);
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

// ---------- Administración del prode (owner/admin) ----------

const RARITIES = new Set(["comun", "rara", "legendaria", "maldicion"]);

/** Gate de gestión: el visitante debe ser owner o admin del prode. */
async function manageGate(slug: string) {
  const id = await getParticipantId();
  if (!id) return { error: "Primero ingresá tu nombre." } as const;
  const pool = await getPoolBySlug(slug);
  if (!pool) return { error: "No encontramos ese prode." } as const;
  if (!(await canManagePool(pool.id, id)))
    return { error: "No tenés permiso para administrar este prode." } as const;
  return { id, pool } as const;
}

export type CardDefPatch = {
  name?: string;
  emoji?: string;
  description?: string;
  rarity?: string;
  weight?: number;
  enabled?: boolean;
};

/** Edita una carta del mazo del prode (re-skin cosmético + peso/habilitada). */
export async function saveCardDefAction(
  slug: string,
  defId: string,
  patch: CardDefPatch,
): Promise<{ ok: boolean; error?: string }> {
  const gate = await manageGate(slug);
  if ("error" in gate) return { ok: false, error: gate.error };
  const [row] = await db.select().from(cardDefs).where(eq(cardDefs.id, defId));
  if (!row || row.poolId !== gate.pool.id) return { ok: false, error: "Carta no encontrada." };

  const set: Record<string, unknown> = {};
  if (patch.name !== undefined) {
    const v = patch.name.trim().slice(0, 40);
    if (v.length < 1) return { ok: false, error: "El nombre no puede quedar vacío." };
    set.name = v;
  }
  if (patch.emoji !== undefined) {
    const v = patch.emoji.trim().slice(0, 8);
    if (!v) return { ok: false, error: "Poné un emoji." };
    set.emoji = v;
  }
  if (patch.description !== undefined) set.description = patch.description.trim().slice(0, 240);
  if (patch.rarity !== undefined) {
    if (!RARITIES.has(patch.rarity)) return { ok: false, error: "Rareza inválida." };
    set.rarity = patch.rarity;
  }
  if (patch.weight !== undefined) set.weight = Math.max(0, Math.min(99, Math.trunc(patch.weight)));
  if (patch.enabled !== undefined) set.enabled = !!patch.enabled;
  if (Object.keys(set).length === 0) return { ok: true };

  await db.update(cardDefs).set(set).where(eq(cardDefs.id, defId));
  revalidatePath(`/p/${gate.pool.slug}`, "layout");
  return { ok: true };
}

/**
 * Agrega una carta al mazo: elegís la mecánica (reward) y le ponés nombre, emoji,
 * descripción y rareza. Lo que falte cae al default de esa mecánica.
 */
export async function addCardDefAction(
  slug: string,
  mechanic: string,
  cosmetic?: { name?: string; emoji?: string; description?: string; rarity?: string },
): Promise<{ ok: boolean; error?: string; id?: string }> {
  const gate = await manageGate(slug);
  if ("error" in gate) return { ok: false, error: gate.error };
  const base = CARD_CATALOG[mechanic as CardType];
  if (!base) return { ok: false, error: "Elegí un reward válido." };

  const name = (cosmetic?.name?.trim() || base.name).slice(0, 40);
  const emoji = (cosmetic?.emoji?.trim() || base.emoji).slice(0, 8);
  const description = (cosmetic?.description?.trim() || base.description).slice(0, 240);
  const rarity = cosmetic?.rarity && RARITIES.has(cosmetic.rarity) ? cosmetic.rarity : base.rarity;

  const existing = await db
    .select({ sortOrder: cardDefs.sortOrder })
    .from(cardDefs)
    .where(eq(cardDefs.poolId, gate.pool.id));
  const nextOrder = existing.reduce((m, r) => Math.max(m, r.sortOrder), -1) + 1;
  const id = randomUUID();
  await db.insert(cardDefs).values({
    id,
    poolId: gate.pool.id,
    mechanic: base.type,
    name,
    emoji,
    description,
    rarity,
    enabled: true,
    sortOrder: nextOrder,
    createdAt: new Date(),
  });
  // El admin re-agrega esta mecánica: levantá el tombstone si lo había borrado.
  await db
    .delete(deckTombstones)
    .where(and(eq(deckTombstones.poolId, gate.pool.id), eq(deckTombstones.mechanic, base.type)));
  revalidatePath(`/p/${gate.pool.slug}`, "layout");
  return { ok: true, id };
}

/** Borra una carta del mazo. Las jugadas que la referencian quedan con su mecánica (card_def_id → null). */
export async function deleteCardDefAction(
  slug: string,
  defId: string,
): Promise<{ ok: boolean; error?: string }> {
  const gate = await manageGate(slug);
  if ("error" in gate) return { ok: false, error: gate.error };
  const [row] = await db.select().from(cardDefs).where(eq(cardDefs.id, defId));
  if (!row || row.poolId !== gate.pool.id) return { ok: false, error: "Carta no encontrada." };
  await db.delete(cardDefs).where(eq(cardDefs.id, defId));
  // Tombstone: que ensurePoolDeck no reponga esta mecánica en la próxima carga
  // si era una carta del mazo default (si no, "borrar" no pega). Si quedan otras
  // cartas con la misma mecánica, igual no la repone (have la tiene) — inofensivo.
  await db
    .insert(deckTombstones)
    .values({ poolId: gate.pool.id, mechanic: row.mechanic })
    .onConflictDoNothing();
  revalidatePath(`/p/${gate.pool.slug}`, "layout");
  return { ok: true };
}

export type FunConfigPatch = {
  noEffectShare: number;
  weightComun: number;
  weightRara: number;
  weightLegendaria: number;
  weightMaldicion: number;
};

/** Edita la config de sorteo del prode (% sin efecto + pesos de rareza). */
export async function updateFunConfigAction(
  slug: string,
  cfg: FunConfigPatch,
): Promise<{ ok: boolean; error?: string }> {
  const gate = await manageGate(slug);
  if ("error" in gate) return { ok: false, error: gate.error };
  const clamp = (n: number, max: number) => Math.max(0, Math.min(max, Math.trunc(Number(n) || 0)));
  const values = {
    poolId: gate.pool.id,
    noEffectShare: clamp(cfg.noEffectShare, 100),
    weightComun: clamp(cfg.weightComun, 1000),
    weightRara: clamp(cfg.weightRara, 1000),
    weightLegendaria: clamp(cfg.weightLegendaria, 1000),
    weightMaldicion: clamp(cfg.weightMaldicion, 1000),
  };
  await db
    .insert(poolFunConfig)
    .values(values)
    .onConflictDoUpdate({ target: poolFunConfig.poolId, set: values });
  revalidatePath(`/p/${gate.pool.slug}`, "layout");
  return { ok: true };
}

/**
 * Guarda en lote los roles que cambiaron. Solo un owner puede, y el prode no puede
 * quedar sin ningún owner tras aplicar todos los cambios.
 */
export async function setMemberRolesAction(
  slug: string,
  changes: { participantId: string; role: string }[],
): Promise<{ ok: boolean; error?: string }> {
  const id = await getParticipantId();
  if (!id) return { ok: false, error: "Primero ingresá tu nombre." };
  const pool = await getPoolBySlug(slug);
  if (!pool) return { ok: false, error: "No encontramos ese prode." };
  if ((await getPoolRole(pool.id, id)) !== "owner")
    return { ok: false, error: "Solo un owner puede cambiar roles." };
  if (changes.length === 0) return { ok: true };
  for (const c of changes) {
    if (!["owner", "admin", "player"].includes(c.role)) return { ok: false, error: "Rol inválido." };
  }

  const members = await db
    .select({ pid: poolMembers.participantId, role: poolMembers.role })
    .from(poolMembers)
    .where(eq(poolMembers.poolId, pool.id));
  const finalRole = new Map(members.map((m) => [m.pid, m.role as string]));
  for (const c of changes) {
    if (!finalRole.has(c.participantId)) return { ok: false, error: "Alguien no es miembro del prode." };
    finalRole.set(c.participantId, c.role);
  }
  if (![...finalRole.values()].some((r) => r === "owner"))
    return { ok: false, error: "No podés dejar el prode sin ningún owner." };

  for (const c of changes) {
    await db
      .update(poolMembers)
      .set({ role: c.role })
      .where(and(eq(poolMembers.poolId, pool.id), eq(poolMembers.participantId, c.participantId)));
  }
  revalidatePath(`/p/${pool.slug}`, "layout");
  return { ok: true };
}
export type PlayCardExtra = {
  /** Apodo para "Los apodos del Droco". */
  apodo?: string;
  /** Declaración para "Micrófono abierto". */
  mensaje?: string;
  /** Data URL (ya comprimida en el cliente) para "Foto trucha". */
  imagen?: string;
  /** Partido elegido para "Honguito" (input "partido"). */
  matchId?: string;
};

type PlayResult = {
  ok: boolean;
  error?: string;
  blocked?: boolean;
  reflected?: boolean;
  targetName?: string;
  /** Ataques de hoy que la defensa recién jugada anuló/rebotó retroactivamente. */
  retro?: number;
  /** El ataque se jugó al vacío porque todos los rivales estaban defendidos hoy. */
  allDefended?: boolean;
};

/**
 * Defensa retroactiva: al jugar un escudo/espejito, agarra los ataques
 * bloqueables que YA te tiraron esa jornada y los anula (escudo → "blocked") o
 * los rebota al que los mandó (espejito → reflected). Cubre TODOS los del día.
 * La jornada de un ataque es su effectDate; los instantáneos sin día (pedo) se
 * atan por la jornada en que se jugaron (bindDay del playedAt). Devuelve cuántos
 * tocó. Idempotente: solo mira ataques en estado "played".
 */
async function applyRetroDefense(
  poolId: string,
  defenderId: string,
  jornada: string,
  reflect: boolean,
): Promise<number> {
  const incoming = await db
    .select()
    .from(funCards)
    .where(
      and(
        eq(funCards.poolId, poolId),
        eq(funCards.targetParticipantId, defenderId),
        eq(funCards.status, "played"),
        inArray(funCards.cardType, BLOCKABLE_ATTACKS),
      ),
    );
  const hits = retroDefenseTargets(
    incoming.map((c) => ({
      id: c.id,
      cardType: c.cardType as CardType,
      status: c.status,
      reflected: c.reflected,
      effectDate: c.effectDate,
      playedAt: c.playedAt,
      targetParticipantId: c.targetParticipantId,
    })),
    defenderId,
    jornada,
  );
  for (const id of hits) {
    await db
      .update(funCards)
      .set(reflect ? { reflected: true } : { status: "blocked" })
      .where(eq(funCards.id, id));
  }
  return hits.length;
}

/**
 * Aviso instantáneo a la víctima (si dejó su mail): te jugaron una carta, tu
 * escudo te salvó, o tu espejito la devolvió. Corre después de responder
 * (next/server `after`) para no demorar la jugada del atacante.
 */
function notifyVictim(opts: {
  pool: NonNullable<Awaited<ReturnType<typeof getPoolBySlug>>>;
  attackerName: string;
  victimId: string;
  victimName: string;
  cardType: CardType;
  /** Nombre/emoji/descripción del mazo del prode (re-skin). */
  cardName: string;
  cardEmoji: string;
  cardDescription: string;
  detail: string | null;
  blocked: boolean;
  reflected: boolean;
}) {
  after(async () => {
    try {
      // Push instantánea (si tiene notificaciones activadas).
      const cardLabel = `${opts.cardEmoji} ${opts.cardName}`;
      const body = opts.blocked
        ? `${opts.attackerName} te tiró ${cardLabel} pero tu escudo la frenó 🛡️`
        : opts.reflected
          ? `${opts.attackerName} te tiró ${cardLabel}… ¡y tu espejito se la devolvió! 🪞`
          : `${opts.attackerName} te jugó ${cardLabel}`;
      await sendPushToParticipants([opts.victimId], {
        title: `Libro de pases · ${opts.pool.name}`,
        body,
        url: `/p/${opts.pool.slug}`,
        tag: `carta-${opts.pool.id}`,
      });

      // Mail (si dejó su mail).
      const [victim] = await db
        .select({ email: participants.email })
        .from(participants)
        .where(eq(participants.id, opts.victimId));
      if (!victim?.email) return;
      const mail = renderAttackEmail({
        pool: opts.pool,
        attackerName: opts.attackerName,
        victimName: opts.victimName,
        cardType: opts.cardType,
        cardName: opts.cardName,
        cardEmoji: opts.cardEmoji,
        cardDescription: opts.cardDescription,
        detail: opts.detail,
        blocked: opts.blocked,
        reflected: opts.reflected,
      });
      await sendEmail({ to: victim.email, subject: mail.subject, html: mail.html });
    } catch (e) {
      console.error("[notifyVictim]", e);
    }
  });
}

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
  // Honguito: el dueño elige a qué partido se ata. resolvePlay valida que exista
  // y que no haya arrancado.
  let chosenMatchId: string | null = null;
  if (def.input === "partido") {
    if (!extra?.matchId) return { ok: false, error: "Elegí un partido." };
    chosenMatchId = extra.matchId;
  }

  const ctx = await getPlayContext(pool, ownerId, targetId);
  const finalTargetId = targetId;

  // Sin rivales no hay a quién atacar: la carta sale jugada al vacío.
  if (def.target === "other" && ctx.memberIds.length < 2) {
    await db
      .update(funCards)
      .set({ status: "played", playedAt: new Date() })
      .where(eq(funCards.id, cardId));
    return { ok: true };
  }

  // Ataque bloqueable con TODOS los rivales defendidos hoy: no hay a quién
  // tirarle (a un defendido no le entra nada), así que con la jugada obligada la
  // carta se va al vacío en vez de dejar el modal trabado.
  if (def.kind === "attack" && def.blockable && def.target === "other") {
    const attackables = ctx.memberIds.filter(
      (id) => id !== ownerId && !ctx.defendedIds.includes(id),
    );
    if (attackables.length === 0) {
      await db
        .update(funCards)
        .set({ status: "played", playedAt: new Date(), targetParticipantId: null })
        .where(eq(funCards.id, cardId));
      return { ok: true, allDefended: true };
    }
  }

  const outcome = resolvePlay({
    cardType: def.type,
    ownerId,
    targetId: finalTargetId,
    now: new Date(),
    memberIds: ctx.memberIds,
    targetShieldCardId: ctx.targetShieldCardId,
    targetMirrorCardId: ctx.targetMirrorCardId,
    chosenMatchId,
  });
  if (!outcome.ok) return { ok: false, error: outcome.error };

  const now = new Date();
  const targetName = finalTargetId
    ? (ctx.rows.find((r) => r.id === finalTargetId)?.name ?? undefined)
    : undefined;

  await db
    .update(funCards)
    .set({
      status: "played",
      playedAt: now,
      targetParticipantId: finalTargetId,
      effectMatchId: outcome.effectMatchId,
      effectDate: outcome.effectDate,
      payload: Object.keys(payload).length ? JSON.stringify(payload) : null,
      reflected: false,
    })
    .where(eq(funCards.id, cardId));

  // Defensa retroactiva: al poner el escudo/espejito frena los ataques que YA te
  // tiraron esa misma jornada. El escudo los anula (status "blocked"); el
  // espejito los rebota al que los mandó (reflected). Cubre TODOS los del día y
  // no se consume — de paso te vuelve intocable para lo que venga, porque
  // resolvePlay no deja atacar a alguien defendido.
  let retro = 0;
  if (def.kind === "shield" && outcome.effectDate) {
    retro = await applyRetroDefense(pool.id, ownerId, outcome.effectDate, def.type === "espejito");
  }

  // Aviso a la víctima (ataques y sociales contra otro).
  if (finalTargetId && finalTargetId !== ownerId) {
    notifyVictim({
      pool,
      attackerName: ctx.rows.find((r) => r.id === ownerId)?.name ?? "Alguien",
      victimId: finalTargetId,
      victimName: targetName ?? "vos",
      cardType: def.type,
      cardName: def.name,
      cardEmoji: def.emoji,
      cardDescription: def.description,
      detail:
        typeof payload.apodo === "string"
          ? payload.apodo
          : typeof payload.mensaje === "string"
            ? payload.mensaje
            : null,
      blocked: false,
      reflected: false,
    });
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

  return { ok: true, blocked: false, reflected: false, targetName, retro };
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
  def: DrawnCard,
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
      cardDefId: def.defId,
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

  // Una carta pendiente de resolver bloquea el sorteo (jugada obligada). Solo la
  // del DÍA: una held de un día anterior está vencida (ya pasó su jornada), no
  // bloquea ni se puede jugar.
  const [pendingRow] = await db
    .select({ id: funCards.id })
    .from(funCards)
    .where(
      and(
        eq(funCards.poolId, pool.id),
        eq(funCards.participantId, id),
        eq(funCards.status, "held"),
        eq(funCards.drawDate, funToday()),
      ),
    )
    .limit(1);
  if (pendingRow) {
    return { ok: false, error: "Tenés una carta sin resolver. Elegí la víctima primero." };
  }

  // El mazo del prode (re-skin) y su config de sorteo mandan acá: qué cartas
  // salen, con qué probabilidad y cómo se llaman. La mecánica sigue en código.
  await ensureFunPool(pool.id); // idempotente: clona el mazo oficial si falta
  const [deckRows, config] = await Promise.all([
    getPoolDeckRows(pool.id),
    getPoolFunConfig(pool.id),
  ]);
  const deck = resolveDeck(deckRows);
  const today = funToday();
  const drawn = pickDailyCard({ poolId: pool.id, participantId: id, date: today }, deck, config);
  if (!drawn) {
    return { ok: false, error: "Este prode no tiene cartas habilitadas." };
  }
  return drawAndPlay(pool, id, today, drawn);
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
  // Una held solo se juega el día que se sacó: si quedó de un día anterior, venció.
  if (row.drawDate !== funToday())
    return { ok: false, error: "Esa carta venció: era de otro día." };
  const baseDef = CARD_CATALOG[row.cardType as CardType];
  if (!baseDef) return { ok: false, error: "Carta desconocida." };
  // Re-skin del prode: si la carta apunta a una def del mazo, usamos su nombre/
  // emoji/descripción (la mecánica igual sale del registro por cardType).
  let def: CardDef = baseDef;
  if (row.cardDefId) {
    const [d] = await db
      .select({
        name: cardDefs.name,
        emoji: cardDefs.emoji,
        description: cardDefs.description,
        rarity: cardDefs.rarity,
      })
      .from(cardDefs)
      .where(eq(cardDefs.id, row.cardDefId));
    if (d) def = cardView(row.cardType, { ...d, rarity: d.rarity as CardDef["rarity"] }) ?? baseDef;
  }

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

// ---------- Notificaciones push (PWA) ----------

/** Guarda la suscripción del navegador para mandarle push a este jugador. */
export async function subscribeToPushAction(
  sub: ClientSubscription,
): Promise<{ ok: boolean; error?: string }> {
  const id = await getParticipantId();
  if (!id) return { ok: false, error: "Primero ingresá tu nombre." };
  try {
    await savePushSubscription(id, sub, randomUUID());
    return { ok: true };
  } catch (e) {
    console.error("[subscribeToPush]", e);
    return { ok: false, error: "No se pudo activar las notificaciones." };
  }
}

/** Borra la suscripción de este navegador (desactivar notificaciones). */
export async function unsubscribeFromPushAction(
  endpoint: string,
): Promise<{ ok: boolean }> {
  try {
    await deletePushSubscription(endpoint);
  } catch (e) {
    console.error("[unsubscribeFromPush]", e);
  }
  return { ok: true };
}
