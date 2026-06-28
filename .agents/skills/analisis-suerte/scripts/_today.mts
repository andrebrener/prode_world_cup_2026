import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createClient } from "@libsql/client";

const REPO = "/Users/andrebrener/git-repos/prode_word_cup_2026";
for (const line of fs.readFileSync(path.join(REPO, ".env.local"), "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
  if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
process.env.USE_REMOTE_DB = "1";

const { funToday, resolveDeck, pickPositionalCard } = await import(pathToFileURL(path.join(REPO, "src/lib/cards.ts")).href);
const { getPoolFunConfig } = await import(pathToFileURL(path.join(REPO, "src/lib/db/decks.ts")).href);

const c = createClient({ url: process.env.TURSO_DATABASE_URL!, authToken: process.env.TURSO_AUTH_TOKEN });
const slug = process.argv[2] ?? "kbarulo-fun";

const pool = (await c.execute({ sql: "select id from pools where slug=? or name=?", args: [slug, slug] })).rows[0] as any;
const poolId = pool.id as string;
const today = funToday();
console.log("HOY (huso MX):", today, "\n");

// deck rows desde card_defs
const defRows = (await c.execute({
  sql: "select id, mechanic, name, emoji, description, rarity, restricted_target_id from card_defs where pool_id=? and enabled=1 order by sort_order",
  args: [poolId],
})).rows as any[];
const config = await getPoolFunConfig(poolId);
const deck = resolveDeck(
  defRows.map((r) => ({ id: r.id, mechanic: r.mechanic, name: r.name, emoji: r.emoji, description: r.description, rarity: r.rarity, restrictedTargetId: r.restricted_target_id })),
  config,
);
console.log("caparazonOdds (1 en X):", config.positional.caparazonOdds);

// snapshot del día (LECTURA CRUDA, sin escribir)
const snap = (await c.execute({
  sql: "select participant_id, rank, total, seed from pool_day_rank where pool_id=? and date=? order by rank",
  args: [poolId, today],
})).rows as any[];

if (snap.length === 0) {
  console.log("\n⚠️ Todavía NO hay snapshot congelado para hoy (nadie reclamó carta aún).");
  console.log("El resultado se fija cuando el primero del prode saca su carta del día.");
  process.exit(0);
}

const salt = snap[0].seed as string | null;
const names = new Map((await c.execute({ sql: "select id, name from participants where id in (" + snap.map(() => "?").join(",") + ")", args: snap.map((r) => r.participant_id) })).rows.map((r: any) => [r.id, r.name]));

const leaderRow = snap[0];
console.log("Líder de hoy (rank 0):", names.get(leaderRow.participant_id), "\n");

// Reproducir el sorteo posicional para CADA jugador (solo el líder puede sacar caparazón)
let capHit: string | null = null;
for (const r of snap) {
  const seed = { poolId, participantId: r.participant_id, date: today, salt };
  const pos = { rank: Number(r.rank), total: Number(r.total) };
  const drawn = pickPositionalCard(seed, deck, pos);
  if (drawn?.type === "caparazon") capHit = names.get(r.participant_id) as string;
}

console.log("==============================");
if (capHit) {
  console.log(`🐚 HOY SÍ TOCA CAPARAZÓN → le cae a ${capHit} (el líder).`);
} else {
  console.log("🐚 HOY NO TOCA. El líder tiró el dado y no salió el", `1/${config.positional.caparazonOdds}.`);
}
console.log("==============================");
