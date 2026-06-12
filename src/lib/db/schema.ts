import {
  sqliteTable,
  text,
  integer,
  primaryKey,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const participants = sqliteTable(
  "participants",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    // Foto de perfil: data URL (image/jpeg) ya comprimida y recortada en el cliente.
    avatar: text("avatar"),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  },
  // El nombre es la identidad: único sin distinguir mayúsculas/minúsculas.
  (table) => [uniqueIndex("participants_name_lower_unique").on(sql`lower(${table.name})`)],
);

// ---------- Prodes (grupos) y membresías ----------

// Un "prode" es un grupo con su propia tabla. Las predicciones siguen siendo
// del participante (globales): un participante puede estar en varios prodes.
export const pools = sqliteTable("pools", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(), // para la URL: /p/[slug]
  code: text("code").notNull().unique(), // código corto para invitar
  isPublic: integer("is_public", { mode: "boolean" }).notNull().default(false),
  // "normal" | "fun" — se elige al crear y no cambia. Fun = cartas + rachas.
  mode: text("mode").notNull().default("normal"),
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

// ---------- Modo Diversión: cartas ----------

// Una fila por carta sorteada. El sorteo diario es determinístico
// (pool, participante, fecha) → carta; reclamar solo persiste la fila.
// status: held (en mano) | played (jugada, efecto vigente/resuelto) |
//         consumed (standing gastado, ej. escudo que bloqueó) |
//         blocked (ataque anulado por un escudo).
export const funCards = sqliteTable(
  "fun_cards",
  {
    id: text("id").primaryKey(),
    poolId: text("pool_id")
      .notNull()
      .references(() => pools.id, { onDelete: "cascade" }),
    participantId: text("participant_id")
      .notNull()
      .references(() => participants.id, { onDelete: "cascade" }),
    drawDate: text("draw_date").notNull(), // yyyy-mm-dd en huso America/Mexico_City
    cardType: text("card_type").notNull(),
    status: text("status").notNull().default("held"),
    drawnAt: integer("drawn_at", { mode: "timestamp" }).notNull(),
    playedAt: integer("played_at", { mode: "timestamp" }),
    targetParticipantId: text("target_participant_id").references(() => participants.id, {
      onDelete: "cascade",
    }),
    // Partido al que quedó atado el efecto (ventana "match"), fijado al jugarla.
    effectMatchId: text("effect_match_id"),
    // Día al que quedó atado el efecto (ventana "day"), yyyy-mm-dd huso MX.
    effectDate: text("effect_date"),
    // JSON con datos extra del efecto: { deltas } para snapshots (caparazón/swap),
    // { apodo | mensaje | imagen } para sociales.
    payload: text("payload"),
    // El ataque rebotó en un Espejito: el efecto vuelve al que la jugó.
    reflected: integer("reflected", { mode: "boolean" }).notNull().default(false),
  },
  // Una sola carta por día por participante por prode.
  (table) => [
    uniqueIndex("fun_cards_one_draw_per_day").on(
      table.poolId,
      table.participantId,
      table.drawDate,
    ),
  ],
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
