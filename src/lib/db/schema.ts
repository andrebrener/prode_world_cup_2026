import { sqliteTable, text, integer, primaryKey } from "drizzle-orm/sqlite-core";

export const participants = sqliteTable("participants", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

// ---------- Prodes (grupos) y membresías ----------

// Un "prode" es un grupo con su propia tabla. Las predicciones siguen siendo
// del participante (globales): un participante puede estar en varios prodes.
export const pools = sqliteTable("pools", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(), // para la URL: /p/[slug]
  code: text("code").notNull().unique(), // código corto para invitar
  isPublic: integer("is_public", { mode: "boolean" }).notNull().default(false),
  createdBy: text("created_by").references(() => participants.id),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

// Quién está en qué prode.
export const poolMembers = sqliteTable(
  "pool_members",
  {
    poolId: text("pool_id")
      .notNull()
      .references(() => pools.id, { onDelete: "cascade" }),
    participantId: text("participant_id")
      .notNull()
      .references(() => participants.id, { onDelete: "cascade" }),
    joinedAt: integer("joined_at", { mode: "timestamp" }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.poolId, table.participantId] })],
);

export const matchPredictions = sqliteTable(
  "match_predictions",
  {
    participantId: text("participant_id")
      .notNull()
      .references(() => participants.id, { onDelete: "cascade" }),
    matchId: text("match_id").notNull(),
    homeGoals: integer("home_goals").notNull(),
    awayGoals: integer("away_goals").notNull(),
  },
  (table) => [primaryKey({ columns: [table.participantId, table.matchId] })],
);

// Pronósticos extra: una fila por participante.
export const extraPredictions = sqliteTable("extra_predictions", {
  participantId: text("participant_id")
    .primaryKey()
    .references(() => participants.id, { onDelete: "cascade" }),
  champion: text("champion"), // code de equipo
  runnerUp: text("runner_up"), // code de equipo
  topScorer: text("top_scorer"), // nombre jugador (texto libre)
  figure: text("figure"), // nombre jugador (texto libre)
});

// Resultados reales cargados por el admin.
export const matchResults = sqliteTable("match_results", {
  matchId: text("match_id").primaryKey(),
  homeGoals: integer("home_goals").notNull(),
  awayGoals: integer("away_goals").notNull(),
});

// Resultado final del torneo (una sola fila, id = 1).
export const tournamentResult = sqliteTable("tournament_result", {
  id: integer("id").primaryKey(),
  champion: text("champion"),
  runnerUp: text("runner_up"),
  topScorer: text("top_scorer"),
  figure: text("figure"),
});

// ---------- Llaves / eliminatorias (Fase 2) ----------

// Estado del cuadro: existe cuando se generó ("Actualizar llaves").
// r32_json: snapshot { matchId: { home, away } } de los cruces de R32.
export const bracketMeta = sqliteTable("bracket_meta", {
  id: integer("id").primaryKey(),
  generatedAt: integer("generated_at", { mode: "timestamp" }).notNull(),
  r32Json: text("r32_json").notNull(),
});

// Pronóstico de un participante para un cruce de knockout.
export const knockoutPredictions = sqliteTable(
  "knockout_predictions",
  {
    participantId: text("participant_id")
      .notNull()
      .references(() => participants.id, { onDelete: "cascade" }),
    matchId: text("match_id").notNull(),
    homeGoals: integer("home_goals").notNull(),
    awayGoals: integer("away_goals").notNull(),
    advance: text("advance").notNull(), // code del equipo que pasa
  },
  (table) => [primaryKey({ columns: [table.participantId, table.matchId] })],
);

// Resultado oficial de un cruce de knockout.
export const knockoutResults = sqliteTable("knockout_results", {
  matchId: text("match_id").primaryKey(),
  homeGoals: integer("home_goals").notNull(),
  awayGoals: integer("away_goals").notNull(),
  penalties: integer("penalties", { mode: "boolean" }).notNull().default(false),
  penWinner: text("pen_winner"),
});
