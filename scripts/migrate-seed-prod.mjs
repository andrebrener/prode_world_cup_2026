// Migración + seed de prod (Turso). IDEMPOTENTE y NO destructivo:
// - CREATE TABLE/INDEX IF NOT EXISTS (no DROP, no ALTER).
// - Crea el prode "Lo Forro" y mete a los participantes actuales como miembros,
//   solo si todavía no existe.
import { createClient } from "@libsql/client";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";

function loadEnv(path) {
  const out = {};
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m) out[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
  return out;
}

// Override solo para testing local: node migrate-seed-prod.mjs file:local.db
const override = process.argv[2];
// Para prod, lee credenciales de un archivo .env (prod-bak o .env.local).
function readProdEnv() {
  for (const f of ["../.env.local.prod-bak", "../.env.local"]) {
    try {
      return loadEnv(new URL(f, import.meta.url).pathname);
    } catch {
      /* probar el siguiente */
    }
  }
  return {};
}
const env = override ? {} : readProdEnv();
const url = override || env.TURSO_DATABASE_URL;
const authToken = override ? undefined : env.TURSO_AUTH_TOKEN;
if (!url) {
  console.error("Falta TURSO_DATABASE_URL");
  process.exit(1);
}
console.log("Target:", url);

const client = createClient({ url, authToken });
const now = Math.floor(Date.now() / 1000);

// --- 1) Tablas (orden: pools antes que pool_members por la FK) ---
console.log("\n[1/3] Creando tablas si no existen…");
await client.execute(`CREATE TABLE IF NOT EXISTS \`pools\` (
	\`id\` text PRIMARY KEY NOT NULL,
	\`name\` text NOT NULL,
	\`slug\` text NOT NULL,
	\`code\` text NOT NULL,
	\`is_public\` integer DEFAULT false NOT NULL,
	\`created_by\` text,
	\`created_at\` integer NOT NULL,
	FOREIGN KEY (\`created_by\`) REFERENCES \`participants\`(\`id\`) ON UPDATE no action ON DELETE no action
)`);
await client.execute(`CREATE TABLE IF NOT EXISTS \`pool_members\` (
	\`pool_id\` text NOT NULL,
	\`participant_id\` text NOT NULL,
	\`joined_at\` integer NOT NULL,
	PRIMARY KEY(\`pool_id\`, \`participant_id\`),
	FOREIGN KEY (\`pool_id\`) REFERENCES \`pools\`(\`id\`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (\`participant_id\`) REFERENCES \`participants\`(\`id\`) ON UPDATE no action ON DELETE cascade
)`);
await client.execute(
  "CREATE UNIQUE INDEX IF NOT EXISTS `pools_slug_unique` ON `pools` (`slug`)",
);
await client.execute(
  "CREATE UNIQUE INDEX IF NOT EXISTS `pools_code_unique` ON `pools` (`code`)",
);
// El nombre del jugador es único sin distinguir mayúsculas/minúsculas.
await client.execute(
  "CREATE UNIQUE INDEX IF NOT EXISTS `participants_name_lower_unique` ON `participants` (lower(`name`))",
);
console.log("  ✓ pools, pool_members + índices (incluye nombre único case-insensitive)");

// --- 2) Seed del prode "Lo Forro" ---
console.log("\n[2/3] Sembrando prode 'Lo Forro'…");
const existing = await client.execute({
  sql: "SELECT id FROM pools WHERE slug = ?",
  args: ["lo-forro"],
});

let poolId;
if (existing.rows.length > 0) {
  poolId = existing.rows[0].id;
  console.log("  • Ya existía el prode 'lo-forro', no lo recreo. id:", poolId);
} else {
  poolId = randomUUID();
  // código único de 6 chars
  let code;
  for (;;) {
    code = randomUUID().replace(/-/g, "").slice(0, 6);
    const dup = await client.execute({
      sql: "SELECT 1 FROM pools WHERE code = ?",
      args: [code],
    });
    if (dup.rows.length === 0) break;
  }
  await client.execute({
    sql: "INSERT INTO pools (id, name, slug, code, is_public, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    args: [poolId, "Lo Forro", "lo-forro", code, 1, null, now],
  });
  console.log(`  ✓ creado 'Lo Forro' (slug: lo-forro, código: ${code})`);
}

// --- 3) Miembros: todos los participantes actuales ---
console.log("\n[3/3] Agregando participantes como miembros…");
const people = await client.execute("SELECT id, name FROM participants");
let added = 0;
for (const p of people.rows) {
  const res = await client.execute({
    sql: "INSERT OR IGNORE INTO pool_members (pool_id, participant_id, joined_at) VALUES (?, ?, ?)",
    args: [poolId, p.id, now],
  });
  if (res.rowsAffected > 0) {
    added++;
    console.log(`  ✓ ${p.name}`);
  } else {
    console.log(`  • ${p.name} (ya era miembro)`);
  }
}

const total = await client.execute({
  sql: "SELECT count(*) n FROM pool_members WHERE pool_id = ?",
  args: [poolId],
});
console.log(
  `\nListo. Participantes: ${people.rows.length} · nuevos miembros: ${added} · miembros del prode: ${total.rows[0].n}`,
);
client.close();
