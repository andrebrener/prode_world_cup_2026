import { drizzle } from "drizzle-orm/libsql";
import { createClient } from "@libsql/client";
import * as schema from "./schema";

// Producción (Vercel): usa Turso (TURSO_DATABASE_URL + TURSO_AUTH_TOKEN).
// Desarrollo (next dev): usa SIEMPRE el archivo local `file:local.db`, aunque
// `.env.local` tenga credenciales de prod — así nunca tocás prod sin querer.
// Para apuntar a remoto en dev a propósito: USE_REMOTE_DB=1.
const isProd = process.env.NODE_ENV === "production";
const useRemote = isProd || process.env.USE_REMOTE_DB === "1";

const url = useRemote
  ? (process.env.TURSO_DATABASE_URL ?? "file:local.db")
  : "file:local.db";
const authToken = url.startsWith("file:") ? undefined : process.env.TURSO_AUTH_TOKEN;

const client = createClient({ url, authToken });

export const db = drizzle(client, { schema });
export { schema };
