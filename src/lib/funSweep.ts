// Auto-maldición de los que NO sacaron carta. Es la otra mitad del Karma de
// Tabla: el karma le sube la maldición al líder, así que sin esto al líder le
// convenía esconderse (no sacar carta) para esquivarla. Corre en el cron diario
// cuando el día (huso MX) ya cerró.

import { randomUUID } from "crypto";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { funCards } from "@/lib/db/schema";
import { ensureFunPool, getPoolDeckRows, getPoolFunConfig } from "@/lib/db/decks";
import { getDayRankSnapshot, type Pool } from "@/lib/db/queries";
import { fullSchedule, matchDay, pickDailyCard, resolveDeck } from "@/lib/cards";

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
  if (!config.karmaTabla) return 0;

  // Una maldición de día sin partidos no haría nada y un -5 plano (Ramírez) por no
  // jugar en un día de descanso sería arbitrario: solo barremos días con partidos.
  if (!fullSchedule().some((m) => matchDay(m.kickoff) === date)) return 0;

  const deck = resolveDeck(await getPoolDeckRows(pool.id));
  if (deck.length === 0) return 0;

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
    const drawn = pickDailyCard(
      { poolId: pool.id, participantId, date },
      deck,
      config,
      snap.get(participantId),
    );
    // Buffs/ataques/sociales que no jugó: se pierden, no se insertan.
    if (!drawn || drawn.kind !== "curse") continue;
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
        // Maldición de día → atada al día cerrado; Ramírez (-5, sin ventana) → null.
        effectDate: drawn.window === "day" ? date : null,
      })
      .onConflictDoNothing();
    cursed += 1;
  }
  return cursed;
}
