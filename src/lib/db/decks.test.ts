import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { eq } from "drizzle-orm";
import * as schema from "./schema";
import { cardDefs, poolFunConfig, poolMembers, pools, participants } from "./schema";
import { ensureFunPool, ensurePoolDeck } from "./decks";
import { ALL_CARDS, CARD_CATALOG, DEFAULT_DECK, DEFAULT_FUN_CONFIG } from "../cardCatalog";

// DB en memoria con el schema real (aplicando las migraciones de ./drizzle).
function freshDb() {
  const client = createClient({ url: ":memory:" });
  const dir = join(process.cwd(), "drizzle");
  const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  return (async () => {
    for (const f of files) {
      const sql = readFileSync(join(dir, f), "utf8");
      for (const stmt of sql.split("--> statement-breakpoint")) {
        const s = stmt.trim();
        if (s) await client.execute(s);
      }
    }
    return drizzle(client, { schema });
  })();
}

type Db = Awaited<ReturnType<typeof freshDb>>;

async function seedPool(db: Db, opts: { mode?: string; createdBy?: string } = {}) {
  const now = new Date();
  await db.insert(participants).values([
    { id: "p-owner", name: "Owner", createdAt: now },
    { id: "p-member", name: "Member", createdAt: now },
  ]);
  await db.insert(pools).values({
    id: "pool1",
    name: "Test",
    slug: "test",
    code: "ABC123",
    mode: opts.mode ?? "fun",
    createdBy: opts.createdBy ?? "p-owner",
    createdAt: now,
  });
  await db.insert(poolMembers).values([
    { poolId: "pool1", participantId: "p-owner", joinedAt: now },
    { poolId: "pool1", participantId: "p-member", joinedAt: now },
  ]);
}

describe("DEFAULT_DECK (mazo oficial derivado del catálogo)", () => {
  it("tiene una entrada por carta del catálogo, con su mecánica resoluble", () => {
    expect(DEFAULT_DECK.length).toBe(ALL_CARDS.length);
    for (const d of DEFAULT_DECK) {
      expect(CARD_CATALOG[d.mechanic]).toBeDefined();
      expect(d.name.length).toBeGreaterThan(0);
      expect(d.emoji.length).toBeGreaterThan(0);
    }
  });
});

describe("ensureFunPool", () => {
  let db: Db;
  beforeEach(async () => {
    db = await freshDb();
  });

  it("clona el mazo default, crea la config y marca al owner", async () => {
    await seedPool(db, { mode: "fun" });
    await ensureFunPool("pool1", db);

    const defs = await db.select().from(cardDefs).where(eq(cardDefs.poolId, "pool1"));
    expect(defs.length).toBe(DEFAULT_DECK.length);

    const [cfg] = await db.select().from(poolFunConfig).where(eq(poolFunConfig.poolId, "pool1"));
    expect(cfg.noEffectShare).toBe(DEFAULT_FUN_CONFIG.noEffectShare);
    expect(cfg.weightLegendaria).toBe(DEFAULT_FUN_CONFIG.weights.legendaria);

    const members = await db.select().from(poolMembers).where(eq(poolMembers.poolId, "pool1"));
    const owner = members.find((m) => m.participantId === "p-owner");
    const member = members.find((m) => m.participantId === "p-member");
    expect(owner?.role).toBe("owner");
    expect(member?.role).toBe("player");
  });

  it("es idempotente: correrlo dos veces no duplica ni pisa ediciones", async () => {
    await seedPool(db, { mode: "fun" });
    await ensureFunPool("pool1", db);

    // El admin renombra una carta y deshabilita otra.
    await db.update(cardDefs).set({ name: "La Tractora" }).where(eq(cardDefs.mechanic, "doblete"));
    await db.update(cardDefs).set({ enabled: false }).where(eq(cardDefs.mechanic, "diego"));

    await ensureFunPool("pool1", db); // segunda corrida

    const defs = await db.select().from(cardDefs).where(eq(cardDefs.poolId, "pool1"));
    expect(defs.length).toBe(DEFAULT_DECK.length); // no duplicó
    const tractora = defs.find((d) => d.mechanic === "doblete");
    const diego = defs.find((d) => d.mechanic === "diego");
    expect(tractora?.name).toBe("La Tractora"); // no pisó el rename
    expect(diego?.enabled).toBe(false); // no re-habilitó
  });

  it("ensurePoolDeck completa solo las cartas faltantes (no borra cartas nuevas)", async () => {
    await seedPool(db, { mode: "fun" });
    await ensurePoolDeck("pool1", db);
    const before = await db.select().from(cardDefs).where(eq(cardDefs.poolId, "pool1"));

    // Simulo que falta una mecánica en el mazo (la borro) y agrego una carta nueva.
    await db.delete(cardDefs).where(eq(cardDefs.mechanic, "papas"));
    await ensurePoolDeck("pool1", db); // debe reponer solo "papas"

    const after = await db.select().from(cardDefs).where(eq(cardDefs.poolId, "pool1"));
    expect(after.length).toBe(before.length);
    expect(after.some((d) => d.mechanic === "papas")).toBe(true);
  });
});
