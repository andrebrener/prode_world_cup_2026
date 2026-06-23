// Auto-maldición de los que NO sacaron carta. Es la otra mitad del Karma de
// Tabla: el karma le sube la maldición al líder, así que sin esto al líder le
// convenía esconderse (no sacar carta) para esquivarla. Corre en el cron diario
// cuando el día (huso MX) ya cerró.

import { randomUUID } from "crypto";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { funCards } from "@/lib/db/schema";
import { ensureFunPool, getPoolDeckRows, getPoolFunConfig } from "@/lib/db/decks";
import { caparazonPenalty, getDayRankSnapshot, type Pool } from "@/lib/db/queries";
import { fullSchedule, matchDay, pickDailyCard, pickPositionalCard, resolveDeck } from "@/lib/cards";
import { CARD_CATALOG, ALL_CARDS, type CardType } from "@/lib/cardCatalog";

/**
 * A los que no sacaron carta el `date` cerrado les recalcula su sorteo
 * determinístico (por (prode, jugador, fecha)) y, si les tocaba maldición, se la
 * aplica igual — retroactivo al día, como el motor ya resuelve las cartas de día.
 * Las cartas que NO son maldición se pierden (no las jugaron): sacar carta sigue
 * siendo estrictamente conveniente (te quedás con los buffs y elegís a quién
 * atacar), pero NO sacarla ya no te salva de la maldición que el karma te hace
 * más probable estando primero.
 *
 * Solo para prodes con Karma de Tabla prendido (sin karma no hay sesgo por
 * posición ni incentivo a esconderse, así que no maldecimos a los distraídos) y
 * solo en días con partidos. Idempotente: solo inserta filas de maldición y el
 * índice único (prode, jugador, fecha) corta doble pasada o carrera con un
 * reclamo tardío.
 *
 * Devuelve cuántas maldiciones aplicó.
 */
export async function autoCurseUnclaimed(
  pool: Pool,
  date: string,
  memberIds: string[],
): Promise<number> {
  if (memberIds.length === 0) return 0;

  await ensureFunPool(pool.id); // idempotente: clona el mazo oficial si falta
  const config = await getPoolFunConfig(pool.id);

  const deck = resolveDeck(await getPoolDeckRows(pool.id), config);
  if (deck.length === 0) return 0;
  const hasPositional = deck.some((c) => c.positional);

  // Sin Karma de Tabla NI cartas posicionales no hay nada que aplicarle al que no
  // sacó: sin sesgo por posición no hay incentivo a esconderse. Con cualquiera de
  // los dos sí (el karma le sube la maldición al líder; las posicionales —Caparazón/
  // Golpe— le caen igual al puesto aunque se esconda).
  if (!config.karmaTabla && !hasPositional) return 0;

  // Una maldición de día sin partidos no haría nada y un -5 plano (Ramírez) por no
  // jugar en un día de descanso sería arbitrario: solo barremos días con partidos.
  if (!fullSchedule().some((m) => matchDay(m.kickoff) === date)) return 0;

  // Quién ya tiene carta de ese día (reclamada o ya barrida): no se toca.
  const existing = await db
    .select({ participantId: funCards.participantId })
    .from(funCards)
    .where(and(eq(funCards.poolId, pool.id), eq(funCards.drawDate, date)));
  const claimed = new Set(existing.map((r) => r.participantId));

  // Posición congelada del día: la misma que usó el sorteo de los que sí jugaron.
  const snap = await getDayRankSnapshot(pool, date);

  const now = new Date();
  let cursed = 0;
  for (const participantId of memberIds) {
    if (claimed.has(participantId)) continue;
    const seed = { poolId: pool.id, participantId, date };
    const pos = snap.get(participantId);
    // Las posicionales corren primero (con o sin karma); si no pega ninguna y hay
    // karma, va el sorteo normal por rareza.
    const drawn =
      (pos ? pickPositionalCard(seed, deck, pos) : null) ??
      (config.karmaTabla ? pickDailyCard(seed, deck, config, pos) : null);
    // Buffs/ataques/sociales que no jugó: se pierden, no se insertan.
    if (!drawn || drawn.kind !== "curse") continue;
    // Caparazón Azul: congelá el monto contra la tabla al cierre del día.
    const payload =
      drawn.spec.outcome === "frozen_penalty"
        ? { shell: await caparazonPenalty(pool, participantId) }
        : undefined;
    await db
      .insert(funCards)
      .values({
        id: randomUUID(),
        poolId: pool.id,
        participantId,
        drawDate: date,
        cardType: drawn.type,
        cardDefId: drawn.defId,
        status: "played",
        drawnAt: now,
        playedAt: now,
        // Maldición de día → atada al día cerrado; las planas (Ramírez/Caparazón/Golpe) → null.
        effectDate: drawn.window === "day" ? date : null,
        payload: payload ? JSON.stringify(payload) : null,
      })
      .onConflictDoNothing();
    cursed += 1;
  }
  return cursed;
}

/** Mecánicas de ataque: si las sacás y no las jugás, te rebotan. */
const ATTACK_TYPES = new Set<CardType>(ALL_CARDS.filter((c) => c.kind === "attack").map((c) => c.type));

/**
 * Autotiro: los ataques que alguien SACÓ pero no le jugó a nadie (quedaron en
 * "held" al cerrar el `date`) en vez de evaporarse le rebotan a su dueño. Marca la
 * carta como jugada, reflejada (`reflected`) y apuntada a sí mismo
 * (targetParticipantId = dueño), atada al día cerrado: el motor ya resuelve eso
 * como "te la mandaste solo" (affectedIdOf devuelve el dueño; duelo/pedo se vuelven
 * daño puro). Es la contracara de la jugada obligada: sacar un ataque y acobardarse
 * (o distraerse) ahora cuesta.
 *
 * Corre en TODOS los prodes fun (no depende de Karma de Tabla) y solo en días con
 * partidos (un autotiro de día sin partidos no haría nada). Idempotente: solo toca
 * filas que siguen en "held" de ese día.
 *
 * Devuelve cuántos ataques rebotaron.
 */
export async function backfireUnplayedAttacks(pool: Pool, date: string): Promise<number> {
  // Un autotiro de día sin partidos no haría nada; el -5 de pedo en un día de
  // descanso sería arbitrario. Igual que la auto-maldición: solo días con partidos.
  if (!fullSchedule().some((m) => matchDay(m.kickoff) === date)) return 0;

  const held = await db
    .select({
      id: funCards.id,
      participantId: funCards.participantId,
      cardType: funCards.cardType,
    })
    .from(funCards)
    .where(
      and(
        eq(funCards.poolId, pool.id),
        eq(funCards.drawDate, date),
        eq(funCards.status, "held"),
      ),
    );

  const now = new Date();
  let backfired = 0;
  for (const row of held) {
    const type = row.cardType as CardType;
    if (!ATTACK_TYPES.has(type)) continue; // honguito/sociales no jugados se pierden
    await db
      .update(funCards)
      .set({
        status: "played",
        playedAt: now,
        reflected: true,
        targetParticipantId: row.participantId,
        // Ataques de día → atados al día cerrado; pedo (-5, sin ventana) → null.
        effectDate: CARD_CATALOG[type]?.window === "day" ? date : null,
      })
      .where(and(eq(funCards.id, row.id), eq(funCards.status, "held")));
    backfired += 1;
  }
  return backfired;
}
