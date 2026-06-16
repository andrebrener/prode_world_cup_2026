// Modo Diversión — motor de cartas v2 (solo server / lógica pura).
//
// No hay cron: el "azar" del sorteo diario es determinístico por
// (prode, participante, fecha) — reclamar solo persiste el resultado, y refrescar
// la página no re-sortea. El día cambia a medianoche de America/Mexico_City
// (misma convención que el deadline de pronósticos).
//
// Las cartas NUNCA tocan pronósticos (son globales entre prodes): todos los
// efectos se resuelven al calcular la tabla del prode (queries.getLeaderboard).
//
// Las cartas de día valen para TODA su jornada (huso de México): cubren todos
// los partidos del día, hayan arrancado o no al jugarla. El día al que se atan
// se fija al jugarlas (bindDay) y queda guardado; el efecto se recalcula siempre
// sobre los resultados actuales (puede aplicar retroactivo dentro del día).

import { createHash } from "crypto";
import { MATCHES, SCORING, teamName, teamFlag } from "./fixtures";
import { KO_MATCHES, KO_MATCHES_BY_ID, ROUND_LABEL, koKickoff } from "./bracket";
import {
  CARD_CATALOG,
  RARITY_WEIGHTS,
  ALL_CARDS,
  DEFAULT_DECK,
  DEFAULT_FUN_CONFIG,
  type CardDef,
  type CardRarity,
  type CardType,
  type FunConfig,
  type FunMatchOption,
} from "./cardCatalog";

/** IDs de partidos de eliminatoria (para distinguir el piso de puntos por fase). */
const KO_IDS = new Set(KO_MATCHES.map((m) => m.id));

/** Piso de puntos de un partido: lo que da acertar el resultado (3 grupos / 4 eliminatoria). */
const matchFloor = (id: string): number =>
  KO_IDS.has(id) ? SCORING.knockout.winner : SCORING.outcome;

export const FUN_TZ = "America/Mexico_City";

/** Fecha (yyyy-mm-dd) del "día de sorteo" actual, en el huso del torneo. */
export function funToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: FUN_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

// ---------- Sorteo diario determinístico ----------

function roll(parts: string[], max: number): number {
  const h = createHash("sha256").update(parts.join("|")).digest();
  // 32 bits alcanzan: el sesgo de módulo es despreciable para max chicos.
  return h.readUInt32BE(0) % max;
}

/** Elige un elemento de un balde de forma uniforme (todas las cartas, misma chance). */
function pickFromBucket<T>(options: T[], parts: string[]): T {
  return options[roll([...parts, "carta"], options.length)];
}

// ---------- Mazo de un prode: carta sorteable ----------

/**
 * Carta resuelta del mazo de un prode: la MECÁNICA (spec/kind/target/window/…)
 * viene del registro en código, lo cosmético (nombre/emoji/descripción/rareza)
 * de la fila del mazo, y `defId` apunta a esa fila (para guardarla en fun_cards).
 */
export type DrawnCard = CardDef & { defId: string };

/** Fila del mazo tal como vive en la DB (lo que necesita resolveDeck). */
export type DeckRow = {
  id: string;
  mechanic: string;
  name: string;
  emoji: string;
  description: string;
  rarity: string;
};

/** Resuelve filas del mazo con su mecánica del registro. Ignora mecánicas desconocidas. */
export function resolveDeck(rows: DeckRow[]): DrawnCard[] {
  const out: DrawnCard[] = [];
  for (const r of rows) {
    const base = CARD_CATALOG[r.mechanic as CardType];
    if (!base) continue;
    out.push({
      ...base,
      name: r.name,
      emoji: r.emoji,
      description: r.description,
      rarity: r.rarity as CardRarity,
      defId: r.id,
    });
  }
  return out;
}

const RARITY_ORDER: CardRarity[] = ["comun", "rara", "legendaria", "maldicion"];

/**
 * Cuánto encogen las rarezas neutrales (común/rara) hacia los extremos de la tabla,
 * para hacerle lugar al boost de maldición/legendaria. 0 = no se tocan (el sesgo
 * vive solo en leg/mal y casi no se siente porque común domina); 1 = se anulan en
 * el extremo.
 */
const KARMA_NEUTRAL_SHRINK = 0.25;

/**
 * Cuánto se inclina el eje legendaria/maldición por posición. 1 = el viejo
 * comportamiento brutal (líder: maldición ×2 y legendaria ANULADA del todo); 0 =
 * sin sesgo en ese eje. Lo bajamos a 0.5 porque anularle la legendaria al líder
 * hacía que sacar carta fuera -EV puro (todo downside, nada que ganar) y convenía
 * NO jugar para no comerte la maldición. Con 0.5 el líder conserva un tiro a
 * legendaria (~5%) y la maldición sube con tope (~27%, no ~30%+): sacar carta
 * vuelve a ser una apuesta, no un autocastigo. (La otra mitad del arreglo es el
 * auto-maldición de los que no sacan, ver funSweep.ts.)
 */
const KARMA_LEGMAL_STRENGTH = 0.5;

/**
 * Karma de tabla: sesga los pesos de rareza por posición. `rank` es 0-based
 * (0 = 1ro de la tabla) sobre `total` jugadores. Gradiente parejo: hacia el líder
 * sube maldición y baja legendaria; hacia el último sube legendaria y baja
 * maldición; el medio queda igual. Las neutrales (común/rara) se achican hacia los
 * extremos para que el sesgo se sienta (si no, común se come casi toda la
 * probabilidad). El eje leg/mal va atenuado por KARMA_LEGMAL_STRENGTH para que el
 * líder no quede con puro downside. Con 1 jugador no hay sesgo.
 */
export function karmaWeights(
  weights: Record<CardRarity, number>,
  rank: number,
  total: number,
): Record<CardRarity, number> {
  if (total <= 1) return weights;
  const t = Math.max(0, Math.min(1, rank / (total - 1))); // 0 = arriba, 1 = abajo
  const s = 1 - 2 * t; // +1 líder, -1 último, 0 medio
  const shrink = 1 - KARMA_NEUTRAL_SHRINK * Math.abs(s); // neutrales hacia los extremos
  const tilt = s * KARMA_LEGMAL_STRENGTH; // eje leg/mal atenuado
  return {
    comun: Math.max(0, weights.comun * shrink),
    rara: Math.max(0, weights.rara * shrink),
    legendaria: Math.max(0, weights.legendaria * (1 - tilt)),
    maldicion: Math.max(0, weights.maldicion * (1 + tilt)),
  };
}

/**
 * Sorteo diario sobre el mazo de un prode. Determinístico por (pool, jugador, fecha).
 * Un solo nivel: sortea una rareza según los pesos de config y después una carta
 * uniforme dentro de esa rareza. Las sociales (apodo/foto/mensaje/borrón) NO tienen
 * tramo aparte: son cartas comunes más, se sortean por su rareza como cualquier otra.
 * Respeta el enable/disable (el deck ya viene filtrado) y tolera baldes vacíos (un
 * prode puede deshabilitar toda una rareza). Devuelve null si el mazo quedó vacío.
 *
 * Si `config.karmaTabla` está prendido y se pasa `pos` (posición en la tabla), los
 * pesos de rareza se sesgan por posición (ver karmaWeights). Sin `pos`, o con el
 * karma apagado, usa los pesos tal cual.
 */
export function pickDailyCard(
  seed: { poolId: string; participantId: string; date: string },
  deck: DrawnCard[],
  config: FunConfig,
  pos?: { rank: number; total: number },
): DrawnCard | null {
  if (deck.length === 0) return null;
  const parts = [seed.poolId, seed.participantId, seed.date];
  const pickFrom = (opts: DrawnCard[]) => pickFromBucket(opts, parts);

  // Pesos de rareza: con karma prendido y posición conocida, sesgados por la tabla.
  const weights =
    config.karmaTabla && pos ? karmaWeights(config.weights, pos.rank, pos.total) : config.weights;

  // Sorteo por rareza, solo entre las rarezas presentes y con sus pesos de config.
  const present = RARITY_ORDER.filter((r) => deck.some((c) => c.rarity === r));
  if (present.length === 0) return null;
  const total = present.reduce((a, r) => a + (weights[r] ?? 0), 0);
  let rarity: CardRarity;
  if (total > 0) {
    let acc = roll([...parts, "rareza"], total);
    rarity = present[present.length - 1];
    for (const r of present) {
      acc -= weights[r] ?? 0;
      if (acc < 0) {
        rarity = r;
        break;
      }
    }
  } else {
    // Todos los pesos presentes en 0: repartí parejo entre las rarezas presentes.
    rarity = present[roll([...parts, "rareza"], present.length)];
  }
  return pickFrom(deck.filter((c) => c.rarity === rarity));
}

/** Mazo oficial ya resuelto (para el wrapper de back-compat y los tests). */
const DEFAULT_DECK_RESOLVED: DrawnCard[] = resolveDeck(
  DEFAULT_DECK.map((d) => ({ id: d.mechanic, ...d })),
);

/**
 * Carta del día con el mazo y la config OFICIALES (kbarulo). Determinística.
 * Para el sorteo real por prode, usá pickDailyCard con el mazo y la config del prode.
 */
export function dailyCard(poolId: string, participantId: string, date: string): DrawnCard {
  return pickDailyCard({ poolId, participantId, date }, DEFAULT_DECK_RESOLVED, DEFAULT_FUN_CONFIG)!;
}

/** Probabilidad efectiva de cada carta en el sorteo diario (sobre 100), con el mazo oficial. */
export function cardOdds(): Record<CardType, number> {
  const odds = {} as Record<CardType, number>;

  // Un solo nivel: cada rareza pesa weight/total y se reparte uniforme entre sus cartas.
  const totalWeight = Object.values(RARITY_WEIGHTS).reduce((a, b) => a + b, 0);
  for (const rarity of Object.keys(RARITY_WEIGHTS) as CardRarity[]) {
    const options = ALL_CARDS.filter((c) => c.rarity === rarity);
    for (const c of options) {
      odds[c.type] = (100 * RARITY_WEIGHTS[rarity]) / (totalWeight * options.length);
    }
  }
  return odds;
}

/**
 * Resultado random del Caldeador para un partido. Determinístico por
 * (carta, partido) — no cambia entre refreshes. Goles con distribución
 * futbolera: 0 y 1 frecuentes, 4 es milagro.
 */
export function caldeadorScore(
  cardId: string,
  matchId: string,
): { homeGoals: number; awayGoals: number } {
  const GOAL_WEIGHTS = [28, 34, 22, 11, 5]; // 0..4
  const pick = (salt: string) => {
    const n = roll([cardId, matchId, salt], 100);
    let acc = 0;
    for (let g = 0; g < GOAL_WEIGHTS.length; g++) {
      acc += GOAL_WEIGHTS[g];
      if (n < acc) return g;
    }
    return 0;
  };
  return { homeGoals: pick("local"), awayGoals: pick("visitante") };
}

/** Pronóstico random completo del Caldeador para un cruce de llaves. */
export function caldeadorKoPred(
  cardId: string,
  matchId: string,
  home: string,
  away: string,
): { homeGoals: number; awayGoals: number; advance: string } {
  const s = caldeadorScore(cardId, matchId);
  const advance =
    s.homeGoals > s.awayGoals
      ? home
      : s.awayGoals > s.homeGoals
        ? away
        : roll([cardId, matchId, "penales"], 2) === 0
          ? home
          : away;
  return { ...s, advance };
}

// ---------- Calendario unificado (grupos + llaves) ----------

export type ScheduledMatch = { id: string; kickoff: string };

/** Todos los partidos del torneo (72 de grupos + 32 de llaves) ordenados por kickoff. */
export function fullSchedule(): ScheduledMatch[] {
  const group: ScheduledMatch[] = MATCHES.map((m) => ({ id: m.id, kickoff: m.kickoff }));
  const ko: ScheduledMatch[] = KO_MATCHES.flatMap((m) => {
    const k = koKickoff(m.id);
    return k ? [{ id: m.id, kickoff: k }] : [];
  });
  return [...group, ...ko].sort(
    (a, b) => new Date(a.kickoff).getTime() - new Date(b.kickoff).getTime(),
  );
}

/**
 * Partidos elegibles para el Honguito: los del DÍA al que se ata la carta (hoy
 * si quedan partidos, si no el próximo día con partidos) que todavía no
 * arrancaron, con etiqueta legible (equipos en grupos, ronda en eliminatoria).
 */
export function pickableMatches(now: Date = new Date()): FunMatchOption[] {
  const matchById = new Map(MATCHES.map((m) => [m.id, m]));
  const schedule = fullSchedule();
  const day = bindDay(now, schedule);
  if (!day) return [];
  return schedule
    .filter((m) => new Date(m.kickoff).getTime() > now.getTime() && matchDay(m.kickoff) === day)
    .map((m) => {
      const g = matchById.get(m.id);
      if (g) {
        return {
          id: m.id,
          label: `${teamFlag(g.homeCode)} ${teamName(g.homeCode)} vs ${teamName(g.awayCode)} ${teamFlag(g.awayCode)}`,
          sub: `Grupo ${g.group}`,
          kickoff: m.kickoff,
        };
      }
      const ko = KO_MATCHES_BY_ID[m.id];
      return {
        id: m.id,
        label: ko ? ROUND_LABEL[ko.round] : `Partido ${m.id}`,
        sub: "Eliminatoria",
        kickoff: m.kickoff,
      };
    });
}

/** Próximo partido que todavía no arrancó (las cartas de partido apuntan acá). */
export function nextMatchAfter(
  now: Date,
  schedule: ScheduledMatch[] = fullSchedule(),
): ScheduledMatch | null {
  return schedule.find((m) => new Date(m.kickoff).getTime() > now.getTime()) ?? null;
}

/**
 * Día (yyyy-mm-dd, huso MX) de un partido del calendario. Los kickoffs vienen
 * con offset de la sede; acá los normalizamos al huso del torneo.
 */
export function matchDay(kickoffIso: string): string {
  return funToday(new Date(kickoffIso));
}

/** Partidos de un día que todavía no arrancaron a la hora dada. */
export function dayMatchesAfter(
  date: string,
  now: Date,
  schedule: ScheduledMatch[] = fullSchedule(),
): ScheduledMatch[] {
  return schedule.filter(
    (m) => matchDay(m.kickoff) === date && new Date(m.kickoff).getTime() > now.getTime(),
  );
}

/**
 * Día al que se ata una carta de día: hoy si todavía quedan partidos por
 * arrancar; si no, el próximo día con partidos. (Con jugada obligada no puede
 * haber cartas muertas por reclamar de noche.)
 */
export function bindDay(now: Date, schedule: ScheduledMatch[] = fullSchedule()): string | null {
  const today = funToday(now);
  if (dayMatchesAfter(today, now, schedule).length > 0) return today;
  const next = nextMatchAfter(now, schedule);
  return next ? matchDay(next.kickoff) : null;
}

// ---------- Jugar una carta: validación ----------

export type PlayInput = {
  cardType: CardType;
  ownerId: string;
  /** Víctima, para target "other". */
  targetId: string | null;
  now: Date;
  memberIds: string[];
  /** id del Anulo mufa activo de la víctima, si tiene (solo ataques bloqueables). */
  targetShieldCardId: string | null;
  /** id del Espejito rebotín activo de la víctima, si tiene. */
  targetMirrorCardId: string | null;
  /** Partido elegido por el dueño (solo cartas con input "partido", ej. Honguito). */
  chosenMatchId?: string | null;
  schedule?: ScheduledMatch[];
};

export type PlayOutcome =
  | {
      ok: true;
      effectMatchId: string | null;
      effectDate: string | null;
    }
  | { ok: false; error: string };

// Sin regla de 1 efecto: los efectos STACKEAN en orden de jugada (los ceros
// ganan siempre). Con jugada obligada y mazo random nadie arma pile-ons a
// propósito. Las defensas son del día: un Anulo mufa cubre TODOS los ataques de
// su jornada sin gastarse (no hace falta apilar escudos).
export function resolvePlay(input: PlayInput): PlayOutcome {
  const def = CARD_CATALOG[input.cardType];
  if (!def) return { ok: false, error: "Carta desconocida." };
  if (def.kind === "curse") return { ok: false, error: "Las maldiciones se aplican solas." };

  if (def.target === "other") {
    if (!input.targetId) return { ok: false, error: "Elegí una víctima." };
    if (input.targetId === input.ownerId)
      return { ok: false, error: "No te podés atacar a vos mismo." };
    if (!input.memberIds.includes(input.targetId))
      return { ok: false, error: "La víctima no está en este prode." };
  } else if (input.targetId && input.targetId !== input.ownerId) {
    return { ok: false, error: "Esta carta no lleva víctima." };
  }

  // No le podés tirar nada a alguien que ya tiene la defensa puesta hoy: si tiene
  // un escudo/espejito activo de esta jornada, queda intocable y el ataque ni
  // sale. (Las sociales —apodo/foto/micrófono— no son ataques: la defensa no las
  // frena, así que igual se pueden jugar contra un defendido.) La defensa que te
  // salva de un ataque YA recibido es retroactiva y se resuelve al jugar la
  // defensa (executePlay), no acá.
  if (
    def.kind === "attack" &&
    def.blockable &&
    input.targetId &&
    input.targetId !== input.ownerId &&
    (input.targetShieldCardId || input.targetMirrorCardId)
  ) {
    return { ok: false, error: "Está defendido hoy: no le podés tirar nada." };
  }

  return bindWindow(def, input);
}

/** Tipos de ataque bloqueables: contra estos saltan escudo y espejito. */
export const BLOCKABLE_ATTACKS: CardType[] = ALL_CARDS.filter(
  (d) => d.kind === "attack" && d.blockable,
).map((d) => d.type);

/** Fila mínima de un ataque recibido, para el matching de la defensa retroactiva. */
export type RetroAttackRow = {
  id: string;
  cardType: CardType;
  status: string;
  reflected: boolean;
  effectDate: string | null;
  playedAt: Date | null;
  targetParticipantId: string | null;
};

/**
 * Ataques que una defensa (escudo/espejito) de `jornada` jugada por `defenderId`
 * anula/rebota retroactivamente: bloqueables, dirigidos a él, en estado "played",
 * todavía no rebotados, de esa misma jornada. La jornada de un ataque es su
 * effectDate; los instantáneos sin día (pedo) se atan por la jornada en que se
 * jugaron (bindDay del playedAt). Pura y determinística (sin tocar DB).
 */
export function retroDefenseTargets(
  rows: RetroAttackRow[],
  defenderId: string,
  jornada: string,
  schedule: ScheduledMatch[] = fullSchedule(),
): string[] {
  const blockable = new Set<CardType>(BLOCKABLE_ATTACKS);
  return rows
    .filter((c) => {
      if (c.targetParticipantId !== defenderId) return false;
      if (c.status !== "played") return false;
      if (c.reflected) return false; // ya rebotado: no se toca de nuevo
      if (!blockable.has(c.cardType)) return false;
      const aj = c.effectDate ?? (c.playedAt ? bindDay(c.playedAt, schedule) : null);
      return aj === jornada;
    })
    .map((c) => c.id);
}

/** Ata la carta a su ventana: próximo partido, o próximo día con partidos. */
function bindWindow(
  def: CardDef,
  input: PlayInput,
):
  | { ok: true; effectMatchId: string | null; effectDate: string | null }
  | { ok: false; error: string } {
  const schedule = input.schedule ?? fullSchedule();

  if (def.window === "match") {
    // El Honguito (input "partido") se ata al partido que el dueño eligió, siempre
    // que sea del DÍA de la carta y no haya arrancado. Sin elección, cae al
    // próximo partido como las demás.
    if (def.input === "partido" && input.chosenMatchId) {
      const chosen = schedule.find((m) => m.id === input.chosenMatchId);
      if (!chosen) return { ok: false, error: "Ese partido no existe." };
      if (new Date(chosen.kickoff).getTime() <= input.now.getTime())
        return { ok: false, error: "Ese partido ya arrancó. Elegí uno que no haya empezado." };
      const day = bindDay(input.now, schedule);
      if (day && matchDay(chosen.kickoff) !== day)
        return { ok: false, error: "El honguito va a un partido del día de la carta." };
      return { ok: true, effectMatchId: chosen.id, effectDate: null };
    }
    const next = nextMatchAfter(input.now, schedule);
    if (!next) return { ok: false, error: "No quedan partidos por jugarse." };
    return { ok: true, effectMatchId: next.id, effectDate: null };
  }

  if (def.window === "day") {
    const date = bindDay(input.now, schedule);
    if (!date) return { ok: false, error: "No quedan partidos por jugarse." };
    return { ok: true, effectMatchId: null, effectDate: date };
  }

  return { ok: true, effectMatchId: null, effectDate: null };
}

// ---------- Resolución de efectos sobre los puntos ----------

export type PlayedCardEffect = {
  id: string;
  cardType: CardType;
  ownerId: string;
  targetId: string | null;
  effectMatchId: string | null;
  effectDate: string | null;
  reflected: boolean;
  playedAt: Date;
};

/** matchId → puntos del miembro en ese partido. */
export type MatchPointsMap = Record<string, number>;

export type StreakOverride = "protect" | "skip";

export type FunEffects = {
  /** Puntos por partido DESPUÉS de aplicar cartas (por miembro). */
  points: Record<string, MatchPointsMap>;
  /** Ajustes planos (robos, snapshots, maldiciones de puntos): ±puntos por miembro. */
  flat: Record<string, number>;
  /** Delta total por cartas (modificadores + planos) por miembro, para mostrar. */
  delta: Record<string, number>;
  /** Partidos a los que el VAR sumó +2, por miembro (puede haber varios VAR). */
  varAppliedTo: Record<string, string[]>;
  /** Overrides de racha por miembro (filtro/caído). */
  streakOverrides: Record<string, Record<string, StreakOverride>>;
};

/** A quién le pega el efecto de una carta (los rebotes vuelven al que la tiró). */
export function affectedIdOf(card: PlayedCardEffect): string {
  const def = CARD_CATALOG[card.cardType];
  if (def?.kind === "attack" && card.targetId) {
    return card.reflected ? card.ownerId : card.targetId;
  }
  return card.ownerId;
}

/**
 * Aplica las cartas jugadas sobre los puntos base por partido.
 * Pura: no toca la base; las cartas bloqueadas no deben venir en `cards`.
 * El Caldeador NO pasa por acá: se aplica antes, al construir la base
 * (reemplaza pronósticos, no puntos).
 */
export function applyCardEffects(opts: {
  cards: PlayedCardEffect[];
  base: Record<string, MatchPointsMap>;
  /** Partidos CON resultado, ordenados por kickoff. */
  matchOrder: string[];
  kickoffById: Record<string, string>;
}): FunEffects {
  const points: Record<string, MatchPointsMap> = {};
  for (const [member, map] of Object.entries(opts.base)) points[member] = { ...map };

  const flat: Record<string, number> = {};
  const varAppliedTo: Record<string, string[]> = {};
  const streakOverrides: Record<string, Record<string, StreakOverride>> = {};
  const add = (m: Record<string, number>, k: string, v: number) => {
    m[k] = (m[k] ?? 0) + v;
  };
  const override = (member: string, matchId: string, kind: StreakOverride) => {
    (streakOverrides[member] ??= {})[matchId] = kind;
  };
  const map = (id: string) => (points[id] ??= {});

  // Partidos (con resultado) del día de la carta. Cubre TODA la jornada, hayan
  // arrancado o no al jugarla: una carta de día vale para todos sus partidos.
  const dayIds = (card: PlayedCardEffect): string[] =>
    opts.matchOrder.filter((id) => {
      const k = opts.kickoffById[id];
      return k != null && matchDay(k) === card.effectDate;
    });

  // Primer partido (con resultado) del día de la carta, en orden de kickoff.
  // Es a donde apuntan doblete/diego/mufa/yapa: el primero de la jornada, sin
  // importar el momento en que se jugó la carta.
  const firstOfDay = (card: PlayedCardEffect): string | null => dayIds(card)[0] ?? null;

  // Orden estable por playedAt para que la resolución sea determinística.
  const cards = [...opts.cards].sort((a, b) => a.playedAt.getTime() - b.playedAt.getTime());

  // ---- Pase 1: modificadores de partido y de día (los ceros pisan al final) ----
  const zeroings: { member: string; matchId: string }[] = [];

  for (const card of cards) {
    const def = CARD_CATALOG[card.cardType];
    if (!def) continue; // tipo desconocido (catálogo viejo): se ignora.
    const affected = affectedIdOf(card);
    const spec = def.spec;
    switch (spec.outcome) {
      case "multiply_match": {
        // Multiplica los puntos (floor) del/los partido(s) del scope. Cubre
        // honguito (chosen ×2), doblete (first ×2), diego (first ×3),
        // cábala (all ×2) y mufa (first ×0.5 → la mitad para abajo).
        // affected ya resuelve self vs víctima (y los rebotes).
        const m = map(affected);
        const ids =
          spec.scope === "all_of_day"
            ? dayIds(card)
            : spec.scope === "chosen"
              ? card.effectMatchId
                ? [card.effectMatchId]
                : []
              : (() => {
                  const id = firstOfDay(card);
                  return id ? [id] : [];
                })();
        for (const id of ids) if (id in m) m[id] = Math.floor(m[id] * spec.factor);
        break;
      }
      case "bonus_if_scored": {
        // +amount al primer partido del día solo si ahí sumaste (>0). La Yapa.
        const m = map(affected);
        const id = firstOfDay(card);
        if (id && (m[id] ?? 0) > 0) m[id] += spec.amount;
        break;
      }
      case "floor_match_points": {
        // Piso de puntos: en cada partido del día sumás al menos lo de acertar
        // el resultado (3 grupos / 4 eliminatoria), pegues o falles. Si ya tenías
        // más, te lo quedás. Como todos quedan ≥ piso (> 0), la racha del día
        // queda protegida sola (sin override). Costillar.
        const m = map(affected);
        for (const id of dayIds(card)) m[id] = Math.max(m[id] ?? 0, matchFloor(id));
        break;
      }
      case "zero_day": {
        // 0 puntos en el día. `streak` decide el destino de la racha:
        //  - protect_on_hit: los partidos que IGUAL hubiese acertado la mantienen (caído).
        //  - skip: el día no cuenta ni a favor ni en contra (filtro).
        //  - none: solo el cero, la racha se corta sola (maldiciones nemo/heladera/matambrito).
        const m = map(affected);
        for (const id of dayIds(card)) {
          if (spec.streak === "protect_on_hit") {
            if ((m[id] ?? 0) > 0) override(affected, id, "protect");
          } else if (spec.streak === "skip") {
            override(affected, id, "skip");
          }
          zeroings.push({ member: affected, matchId: id });
        }
        break;
      }
      case "streak_shield": {
        // Fernet de Fernemo: tu racha aguanta los ceros de ese día entero. Marca
        // cada partido del día como "protect"; computeStreak solo lo usa cuando
        // el partido quedó en 0 (si sumaste, la racha corre normal). No se gasta.
        for (const id of dayIds(card)) override(affected, id, "protect");
        break;
      }
      // var_bonus → pase 2. steal_day_points → pase 3. flat_points → pase 4.
      // shield (escudo/espejito) → se resuelve al jugarse el ataque (bloquea/rebota
      // todos los del día, sin consumirse). upstream_forecast (caldeador/piedrambre)
      // → dan vuelta el pronóstico al armar la base (getLeaderboard).
      // champion_points (saibamba) → en queries, vive en los extras.
      // social_overlay/clear_social → no tocan puntos.
      default:
        break;
    }
  }

  // Los ceros ganan siempre (una maldición pisa una cábala).
  for (const z of zeroings) {
    const m = map(z.member);
    if (z.matchId in m) m[z.matchId] = 0;
  }

  // ---- Pase 2: VAR (+amount a TODOS los partidos del día donde sumaste; varios
  //      VAR el mismo día no apilan sobre el mismo partido) ----
  for (const card of cards) {
    const spec = CARD_CATALOG[card.cardType]?.spec;
    if (spec?.outcome !== "var_bonus") continue;
    const m = map(card.ownerId);
    const used = (varAppliedTo[card.ownerId] ??= []);
    for (const id of dayIds(card)) {
      if ((m[id] ?? 0) > 0 && !used.includes(id)) {
        m[id] += spec.amount;
        used.push(id);
      }
    }
  }

  // ---- Pase 3: Matambre de cerdo — robo de los puntos del día (ya modificados) ----
  for (const card of cards) {
    const spec = CARD_CATALOG[card.cardType]?.spec;
    if (spec?.outcome !== "steal_day_points" || !card.targetId) continue;
    const ids = dayIds(card);
    if (ids.length === 0) continue;
    // Si rebotó en un espejito, el robo se invierte: la víctima le afana al dueño.
    const stealer = card.reflected ? card.targetId : card.ownerId;
    const victim = card.reflected ? card.ownerId : card.targetId;
    const vm = map(victim);
    let loot = 0;
    for (const id of ids) {
      loot += vm[id] ?? 0;
      if (id in vm) vm[id] = 0;
    }
    add(flat, stealer, loot);
  }

  // ---- Pase 4: planos (puntos directos, robo plano, maldición de plata) ----
  // flat_points: selfAmount al dueño; si hay victimAmount + víctima, también a
  // ella (con rebote invertido). Cubre papas (+5), speed (+2), ramirez (−5) y
  // pedo (+5 dueño / −5 víctima).
  for (const card of cards) {
    const spec = CARD_CATALOG[card.cardType]?.spec;
    if (spec?.outcome !== "flat_points") continue;
    if (spec.victimAmount != null && card.targetId) {
      const to = card.reflected ? card.targetId : card.ownerId;
      const from = card.reflected ? card.ownerId : card.targetId;
      add(flat, to, spec.selfAmount);
      add(flat, from, spec.victimAmount);
    } else {
      add(flat, card.ownerId, spec.selfAmount);
    }
  }

  const delta: Record<string, number> = {};
  const members = new Set([...Object.keys(opts.base), ...Object.keys(flat)]);
  for (const id of members) {
    const after = Object.values(points[id] ?? {}).reduce((a, b) => a + b, 0);
    const before = Object.values(opts.base[id] ?? {}).reduce((a, b) => a + b, 0);
    delta[id] = after - before + (flat[id] ?? 0);
  }

  return { points, flat, delta, varAppliedTo, streakOverrides };
}
