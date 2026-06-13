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
    // Mail para el resumen diario del modo Diversión (opcional, se pide en el prode).
    email: text("email"),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  },
  // El nombre es la identidad: único sin distinguir mayúsculas/minúsculas.
  (table) => [uniqueIndex("participants_name_lower_unique").on(sql`lower(${table.name})`)],
);

// Suscripciones a notificaciones push (Web Push / PWA). Una fila por
// navegador/dispositivo: un participante puede tener varias (celu, compu…).
export const pushSubscriptions = sqliteTable(
  "push_subscriptions",
  {
    id: text("id").primaryKey(),
    participantId: text("participant_id")
      .notNull()
      .references(() => participants.id, { onDelete: "cascade" }),
    endpoint: text("endpoint").notNull(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  },
  // El endpoint identifica al dispositivo: único para no duplicar.
  (table) => [uniqueIndex("push_subscriptions_endpoint_unique").on(table.endpoint)],
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
// role: owner (creador, único, gestiona todo) | admin (gestiona cartas/resultados/
//       bracket) | player (juega y nada más). Sobre honor-system: la auth es el
//       nombre en una cookie, así que el rol da estructura, no seguridad fuerte.
export const poolMembers = sqliteTable(
  "pool_members",
  {
    poolId: text("pool_id")
      .notNull()
      .references(() => pools.id, { onDelete: "cascade" }),
    participantId: text("participant_id")
      .notNull()
      .references(() => participants.id, { onDelete: "cascade" }),
    role: text("role").notNull().default("player"),
    joinedAt: integer("joined_at", { mode: "timestamp" }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.poolId, table.participantId] })],
);

// ---------- Modo Diversión: mazo de cartas por prode (re-skin) ----------

// El mazo configurable de un prode. Cada fila es una carta del prode: toma su
// MECÁNICA (puntos, ventana, target, etc.) del registro en código (cardCatalog),
// indexada por `mechanic`, y le superpone lo editable por los admins: nombre,
// emoji, descripción, rareza, peso en el sorteo y si está habilitada.
//
// El motor de puntos NUNCA lee esta tabla (la mecánica vive en código): re-skinear
// una carta no puede romper el cálculo. Esta tabla manda solo en el SORTEO (qué
// cartas salen y con qué probabilidad) y en cómo se MUESTRA la carta.
//
// Al crear un prode en modo fun se clona el mazo oficial (las cartas de kbarulo)
// como punto de partida; después cada prode lo edita por su cuenta.
export const cardDefs = sqliteTable("card_defs", {
  id: text("id").primaryKey(),
  poolId: text("pool_id")
    .notNull()
    .references(() => pools.id, { onDelete: "cascade" }),
  // Slug de la mecánica de origen (un CardType del catálogo): de acá salen
  // spec/kind/target/window/blockable/input. Varias cartas del prode
  // pueden compartir mechanic (mismo comportamiento, distinto nombre).
  mechanic: text("mechanic").notNull(),
  // Editables por los admins (re-skin cosmético + sorteo):
  name: text("name").notNull(),
  emoji: text("emoji").notNull(),
  description: text("description").notNull(),
  rarity: text("rarity").notNull(),
  weight: integer("weight").notNull().default(1),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

// Config del SORTEO diario por prode (editable por los admins). El sorteo tiene
// dos niveles:
//   1) noEffectShare% de las tiradas → carta "sin efecto" (puro ego: apodo/foto/…).
//   2) el resto (100 − noEffectShare)% → carta con efecto, repartida por rareza
//      según los pesos (weightComun + weightRara + weightLegendaria + weightMaldicion).
// La UI de admin muestra los dos niveles por separado para que quede claro qué
// porción es "sin efecto" y, dentro del resto, cuánto pesa cada rareza.
// Una fila por prode; si falta, se usan los defaults oficiales (40 / 50·26·9·15).
export const poolFunConfig = sqliteTable("pool_fun_config", {
  poolId: text("pool_id")
    .primaryKey()
    .references(() => pools.id, { onDelete: "cascade" }),
  noEffectShare: integer("no_effect_share").notNull().default(40),
  weightComun: integer("weight_comun").notNull().default(50),
  weightRara: integer("weight_rara").notNull().default(26),
  weightLegendaria: integer("weight_legendaria").notNull().default(9),
  weightMaldicion: integer("weight_maldicion").notNull().default(15),
});

// ---------- Modo Diversión: cartas ----------

// Una fila por carta sorteada. El sorteo diario es determinístico
// (pool, participante, fecha) → carta; reclamar solo persiste la fila.
// status: held (en mano) | played (jugada, efecto vigente/resuelto) |
//         consumed (overlay social borrado por un Borrón) |
//         blocked (ataque anulado por un Anulo mufa del día).
// Las defensas (escudo/espejito) ya NO pasan a consumed: son del día y frenan
// todos los ataques de su jornada sin gastarse.
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
    // cardType = la MECÁNICA jugada (slug del catálogo): manda en el cálculo de
    // puntos (applyCardEffects la usa, intacta). Se conserva siempre.
    cardType: text("card_type").notNull(),
    // Carta del mazo del prode que se sorteó (re-skin: nombre/emoji/rareza). Para
    // mostrarla; null en filas viejas o si se borró la def. La mecánica vive en cardType.
    cardDefId: text("card_def_id").references(() => cardDefs.id, { onDelete: "set null" }),
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
    // JSON con datos extra del efecto: { apodo | mensaje | imagen } para sociales.
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
