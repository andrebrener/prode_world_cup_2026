// Modo Diversión — mazo de cartas por prode (re-skin) y config del sorteo.
//
// El mazo oficial (las cartas de kbarulo) vive en el catálogo en código
// (cardCatalog). Acá lo derivamos a un "mazo default" que se CLONA a cada prode
// fun como punto de partida; después cada prode lo edita por su cuenta
// (renombrar, cambiar emoji/rareza/peso, habilitar/deshabilitar).
//
// La MECÁNICA (puntos, ventana, target…) NO se copia: sigue en código, indexada
// por `mechanic` (un CardType). Re-skinear no puede romper el cálculo.

import { randomUUID } from "crypto";
import { and, eq } from "drizzle-orm";
import { db as defaultDb } from "./index";
import { cardDefs, deckTombstones, poolFunConfig, poolMembers, pools } from "./schema";
import { DEFAULT_DECK, DEFAULT_FUN_CONFIG, type FunConfig } from "../cardCatalog";

type Db = typeof defaultDb;

/** Columnas de config en la DB derivadas del default (FunConfig → fila plana). */
const DEFAULT_CONFIG_ROW = {
  weightComun: DEFAULT_FUN_CONFIG.weights.comun,
  weightRara: DEFAULT_FUN_CONFIG.weights.rara,
  weightLegendaria: DEFAULT_FUN_CONFIG.weights.legendaria,
  weightMaldicion: DEFAULT_FUN_CONFIG.weights.maldicion,
  posRemontadaBottom: DEFAULT_FUN_CONFIG.positional.remontadaBottomN,
  posGolpePodio: DEFAULT_FUN_CONFIG.positional.golpePodioN,
  posCaparazonOdds: DEFAULT_FUN_CONFIG.positional.caparazonOdds,
  posGolpeOdds: DEFAULT_FUN_CONFIG.positional.golpeOdds,
  posRemontadaOdds: DEFAULT_FUN_CONFIG.positional.remontadaOdds,
};

/**
 * Garantiza que el prode tenga su mazo: inserta las cartas del mazo default que
 * todavía no tenga (por `mechanic`). Idempotente: no pisa ni duplica lo existente,
 * así que no le borra al admin sus ediciones ni sus cartas nuevas. Tampoco repone
 * las mecánicas que el admin borró a propósito (deckTombstones).
 */
export async function ensurePoolDeck(poolId: string, db: Db = defaultDb): Promise<void> {
  const existing = await db
    .select({ mechanic: cardDefs.mechanic })
    .from(cardDefs)
    .where(eq(cardDefs.poolId, poolId));
  const tombstoned = await db
    .select({ mechanic: deckTombstones.mechanic })
    .from(deckTombstones)
    .where(eq(deckTombstones.poolId, poolId));
  const have = new Set(existing.map((r) => r.mechanic));
  const buried = new Set(tombstoned.map((r) => r.mechanic));
  const missing = DEFAULT_DECK.filter((d) => !have.has(d.mechanic) && !buried.has(d.mechanic));
  if (missing.length === 0) return;
  const now = new Date();
  await db.insert(cardDefs).values(
    missing.map((d) => ({
      id: randomUUID(),
      poolId,
      mechanic: d.mechanic,
      name: d.name,
      emoji: d.emoji,
      description: d.description,
      rarity: d.rarity,
      enabled: d.enabled,
      sortOrder: d.sortOrder,
      createdAt: now,
    })),
  );
}

/** Garantiza la fila de config de sorteo del prode (con los defaults). Idempotente. */
export async function ensurePoolFunConfig(poolId: string, db: Db = defaultDb): Promise<void> {
  await db.insert(poolFunConfig).values({ poolId, ...DEFAULT_CONFIG_ROW }).onConflictDoNothing();
}

/** Filas del mazo HABILITADAS de un prode (las que entran al sorteo), ordenadas. */
export async function getPoolDeckRows(poolId: string, db: Db = defaultDb) {
  return db
    .select()
    .from(cardDefs)
    .where(and(eq(cardDefs.poolId, poolId), eq(cardDefs.enabled, true)))
    .orderBy(cardDefs.sortOrder);
}

/** Config de sorteo del prode (FunConfig). Si no hay fila, devuelve el default. */
export async function getPoolFunConfig(poolId: string, db: Db = defaultDb): Promise<FunConfig> {
  const [row] = await db.select().from(poolFunConfig).where(eq(poolFunConfig.poolId, poolId));
  if (!row) return DEFAULT_FUN_CONFIG;
  return {
    weights: {
      comun: row.weightComun,
      rara: row.weightRara,
      legendaria: row.weightLegendaria,
      maldicion: row.weightMaldicion,
      // "extra" no tiene columna ni peso: las posicionales no se sortean por rareza.
      extra: 0,
    },
    karmaTabla: row.karmaTabla,
    positional: {
      remontadaBottomN: row.posRemontadaBottom,
      golpePodioN: row.posGolpePodio,
      caparazonOdds: row.posCaparazonOdds,
      golpeOdds: row.posGolpeOdds,
      remontadaOdds: row.posRemontadaOdds,
    },
  };
}

/**
 * Fija el rol de owner al creador del prode (si es miembro) sin pisar admins ya
 * asignados. El resto queda en su rol actual (default "player"). Idempotente.
 */
export async function ensurePoolOwner(poolId: string, db: Db = defaultDb): Promise<void> {
  const [pool] = await db
    .select({ createdBy: pools.createdBy })
    .from(pools)
    .where(eq(pools.id, poolId));
  if (!pool?.createdBy) return;
  await db
    .update(poolMembers)
    .set({ role: "owner" })
    .where(and(eq(poolMembers.poolId, poolId), eq(poolMembers.participantId, pool.createdBy)));
}

/** Prepara todo lo de modo fun de un prode: mazo + config + owner. Idempotente. */
export async function ensureFunPool(poolId: string, db: Db = defaultDb): Promise<void> {
  await ensurePoolDeck(poolId, db);
  await ensurePoolFunConfig(poolId, db);
  await ensurePoolOwner(poolId, db);
}
