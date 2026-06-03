// Backup READ-ONLY de la base de prod (Turso) -> archivos locales .sql y .json
// No escribe nada en prod: solo SELECT y lectura de sqlite_master.
import { createClient } from "@libsql/client";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";

// Cargar credenciales del archivo de prod apartado.
function loadEnv(path) {
  const out = {};
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m) out[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
  return out;
}

const env = loadEnv(new URL("../.env.local.prod-bak", import.meta.url).pathname);
const url = env.TURSO_DATABASE_URL;
const authToken = env.TURSO_AUTH_TOKEN;
if (!url) {
  console.error("No TURSO_DATABASE_URL en .env.local.prod-bak");
  process.exit(1);
}

const client = createClient({ url, authToken });

function sqlVal(v) {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "number") return String(v);
  if (typeof v === "bigint") return String(v);
  if (v instanceof Uint8Array) {
    return "X'" + Buffer.from(v).toString("hex") + "'";
  }
  return "'" + String(v).replace(/'/g, "''") + "'";
}

const stamp = process.argv[2] || "backup";
const dir = new URL("../backups/", import.meta.url).pathname;
if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

const tablesRes = await client.execute(
  "SELECT name, sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_litestream%' AND name NOT LIKE 'libsql%' ORDER BY name",
);

let sqlOut = `-- Backup prod ${url}\n-- generado ${stamp}\nPRAGMA foreign_keys=OFF;\nBEGIN TRANSACTION;\n`;
const jsonOut = {};
let totalRows = 0;

for (const t of tablesRes.rows) {
  const name = t.name;
  if (t.sql) sqlOut += `\n${t.sql};\n`;
  const data = await client.execute(`SELECT * FROM "${name}"`);
  jsonOut[name] = data.rows.map((r) => ({ ...r }));
  totalRows += data.rows.length;
  for (const row of data.rows) {
    const cols = data.columns.map((c) => `"${c}"`).join(", ");
    const vals = data.columns.map((c) => sqlVal(row[c])).join(", ");
    sqlOut += `INSERT INTO "${name}" (${cols}) VALUES (${vals});\n`;
  }
  console.log(`  ${name}: ${data.rows.length} filas`);
}

sqlOut += "\nCOMMIT;\n";

const sqlPath = `${dir}prod-${stamp}.sql`;
const jsonPath = `${dir}prod-${stamp}.json`;
writeFileSync(sqlPath, sqlOut);
writeFileSync(jsonPath, JSON.stringify(jsonOut, null, 2));

console.log(`\nTablas: ${tablesRes.rows.length} · Filas totales: ${totalRows}`);
console.log(`SQL  -> ${sqlPath}`);
console.log(`JSON -> ${jsonPath}`);
client.close();
