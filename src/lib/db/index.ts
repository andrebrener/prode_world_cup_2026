import { drizzle } from "drizzle-orm/libsql";
import { createClient } from "@libsql/client";
import * as schema from "./schema";

// Local: usa un archivo SQLite (file:local.db) sin configurar nada.
// Producción (Vercel): definí TURSO_DATABASE_URL + TURSO_AUTH_TOKEN.
const url = process.env.TURSO_DATABASE_URL ?? "file:local.db";
const authToken = process.env.TURSO_AUTH_TOKEN;

const client = createClient({ url, authToken });

export const db = drizzle(client, { schema });
export { schema };
