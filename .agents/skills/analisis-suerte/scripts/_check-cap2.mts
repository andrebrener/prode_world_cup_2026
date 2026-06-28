import fs from "node:fs";
import { createClient } from "@libsql/client";

for (const line of fs.readFileSync("/Users/andrebrener/git-repos/prode_word_cup_2026/.env.local", "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
  if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

const db = createClient({ url: process.env.TURSO_DATABASE_URL!, authToken: process.env.TURSO_AUTH_TOKEN });
const slug = process.argv[2] ?? "kbarulo-fun";
const pools = await db.execute({ sql: "select id from pools where slug = ? or name = ?", args: [slug, slug] });
const poolId = pools.rows[0].id as string;

const cap = await db.execute({
  sql: "select id, name, enabled, weight, restricted_target_id, created_at from card_defs where pool_id = ? and mechanic = 'caparazon'",
  args: [poolId],
});
for (const r of cap.rows) {
  const created = new Date(Number(r.created_at) * 1000);
  console.log("Caparazón def:", r.name);
  console.log("  enabled:", r.enabled, " weight:", r.weight, " restricted:", r.restricted_target_id ?? "no");
  console.log("  creada:", created.toISOString().slice(0, 10), "(", created.toISOString(), ")");
}

// participantes del prode (via pool_members o participants.pool ? probemos participants)
try {
  const np = await db.execute({ sql: "select count(*) as n from participants where pool_id = ?", args: [poolId] });
  console.log("Participantes:", np.rows[0].n);
} catch {
  const np = await db.execute({ sql: "select count(*) as n from pool_members where pool_id = ?", args: [poolId] });
  console.log("Miembros:", np.rows[0].n);
}
