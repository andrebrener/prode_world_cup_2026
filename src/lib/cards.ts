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
  NO_EFFECT_CARDS,
  NO_EFFECT_SHARE,
  type CardDef,
  type CardRarity,
  type CardType,
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

function rarityFor(n: number): CardRarity {
  // n ∈ [0, 100)
  if (n < RARITY_WEIGHTS.comun) return "comun";
  if (n < RARITY_WEIGHTS.comun + RARITY_WEIGHTS.rara) return "rara";
  if (n < RARITY_WEIGHTS.comun + RARITY_WEIGHTS.rara + RARITY_WEIGHTS.legendaria)
    return "legendaria";
  return "maldicion";
}

// Partición del mazo: las "sin efecto" (puro ego) salen NO_EFFECT_SHARE% de las
// veces; el resto, con su sorteo por rareza, ocupa el otro tramo.
const NO_EFFECT_SET = new Set(NO_EFFECT_CARDS);
const NO_EFFECT_OPTIONS = ALL_CARDS.filter((c) => NO_EFFECT_SET.has(c.type));
const EFFECT_OPTIONS = ALL_CARDS.filter((c) => !NO_EFFECT_SET.has(c.type));

/** Sorteo ponderado por `weight` (default 1) sobre un balde, con un roll ya hecho. */
function weightedPick(options: CardDef[], n: number): CardDef {
  for (const c of options) {
    n -= c.weight ?? 1;
    if (n < 0) return c;
  }
  return options[options.length - 1];
}

const weightSum = (options: CardDef[]): number =>
  options.reduce((acc, c) => acc + (c.weight ?? 1), 0);

/** Carta del día para un participante en un prode. Determinística. */
export function dailyCard(poolId: string, participantId: string, date: string): CardDef {
  // Primer nivel: el 40% de las veces, una carta sin efecto (puro ego).
  if (roll([poolId, participantId, date, "sinEfecto"], 100) < NO_EFFECT_SHARE) {
    return weightedPick(
      NO_EFFECT_OPTIONS,
      roll([poolId, participantId, date, "carta"], weightSum(NO_EFFECT_OPTIONS)),
    );
  }
  // Segundo nivel: sorteo por rareza sobre las cartas con efecto.
  const rarity = rarityFor(roll([poolId, participantId, date, "rareza"], 100));
  const options = EFFECT_OPTIONS.filter((c) => c.rarity === rarity);
  return weightedPick(options, roll([poolId, participantId, date, "carta"], weightSum(options)));
}

/** Probabilidad efectiva de cada carta en el sorteo diario (sobre 100). */
export function cardOdds(): Record<CardType, number> {
  const odds = {} as Record<CardType, number>;

  // Tramo sin efecto: NO_EFFECT_SHARE repartido por weight entre las sociales.
  const noEffectTotal = weightSum(NO_EFFECT_OPTIONS);
  for (const c of NO_EFFECT_OPTIONS) {
    odds[c.type] = (NO_EFFECT_SHARE * (c.weight ?? 1)) / noEffectTotal;
  }

  // Tramo con efecto: el resto (100 - NO_EFFECT_SHARE) por rareza y luego weight.
  const effectShare = 100 - NO_EFFECT_SHARE;
  for (const rarity of Object.keys(RARITY_WEIGHTS) as CardRarity[]) {
    const options = EFFECT_OPTIONS.filter((c) => c.rarity === rarity);
    const total = weightSum(options);
    for (const c of options) {
      odds[c.type] = (effectShare * RARITY_WEIGHTS[rarity] * (c.weight ?? 1)) / (100 * total);
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
      blockedByShieldId: string | null;
      reflectedByMirrorId: string | null;
    }
  | { ok: false; error: string };

// Sin regla de 1 efecto: los efectos STACKEAN en orden de jugada (los ceros
// ganan siempre). Con jugada obligada y mazo random nadie arma pile-ons a
// propósito. Los standings también se acumulan (dos escudos = dos bloqueos).
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

  // Defensas de la víctima: el escudo come el ataque; el espejito lo devuelve.
  // Solo saltan contra ataques que te tocan puntos (kind "attack"). Las cartas
  // sociales (apodo/foto/micrófono) cambian tu ego, no tu puntaje: el escudo no
  // se gasta defendiéndote de que te cambien el nombre. Para sacarte esos
  // overlays está el borrón.
  if (def.kind === "attack" && def.blockable && input.targetId && input.targetId !== input.ownerId) {
    if (input.targetShieldCardId) {
      return {
        ok: true,
        effectMatchId: null,
        effectDate: null,
        blockedByShieldId: input.targetShieldCardId,
        reflectedByMirrorId: null,
      };
    }
    if (input.targetMirrorCardId) {
      const r = bindWindow(def, input);
      if (!r.ok) return r;
      return { ...r, blockedByShieldId: null, reflectedByMirrorId: input.targetMirrorCardId };
    }
  }

  const r = bindWindow(def, input);
  if (!r.ok) return r;
  return { ...r, blockedByShieldId: null, reflectedByMirrorId: null };
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
    const affected = affectedIdOf(card);
    switch (card.cardType) {
      case "honguito": {
        // Quirúrgica: doblás el partido que elegiste (effectMatchId), el que sea.
        const m = map(card.ownerId);
        if (card.effectMatchId && card.effectMatchId in m) {
          m[card.effectMatchId] = m[card.effectMatchId] * 2;
        }
        break;
      }
      case "doblete":
      case "diego": {
        // Primer partido del día: ×2 (doblete) / ×3 (El Diego).
        const mult = card.cardType === "diego" ? 3 : 2;
        const m = map(card.ownerId);
        const id = firstOfDay(card);
        if (id && id in m) m[id] = m[id] * mult;
        break;
      }
      case "yapa": {
        const m = map(card.ownerId);
        const id = firstOfDay(card);
        if (id && (m[id] ?? 0) > 0) m[id] += 1;
        break;
      }
      case "mufa": {
        const m = map(affected);
        const id = firstOfDay(card);
        if (id && id in m) m[id] = Math.floor(m[id] / 2);
        break;
      }
      case "cabala": {
        const m = map(card.ownerId);
        for (const id of dayIds(card)) if (id in m) m[id] = m[id] * 2;
        break;
      }
      case "costillar": {
        // Piso de puntos: en cada partido del día sumás al menos lo de acertar
        // el resultado (3 grupos / 4 eliminatoria), pegues o falles. Si ya tenías
        // más, te lo quedás. Como todos quedan ≥ piso (> 0), la racha del día
        // queda protegida sola (sin override).
        const m = map(card.ownerId);
        for (const id of dayIds(card)) m[id] = Math.max(m[id] ?? 0, matchFloor(id));
        break;
      }
      case "caido": {
        // 0 puntos, pero los partidos que IGUAL hubiese acertado mantienen la racha.
        const m = map(affected);
        for (const id of dayIds(card)) {
          if ((m[id] ?? 0) > 0) override(affected, id, "protect");
          zeroings.push({ member: affected, matchId: id });
        }
        break;
      }
      case "filtro": {
        // 0 puntos y el día no cuenta para la racha (ni a favor ni en contra).
        for (const id of dayIds(card)) {
          override(affected, id, "skip");
          zeroings.push({ member: affected, matchId: id });
        }
        break;
      }
      case "nemo":
      case "heladera":
      case "matambrito": {
        // Maldición: 0 en todos los partidos del día.
        for (const id of dayIds(card)) zeroings.push({ member: card.ownerId, matchId: id });
        break;
      }
      // ramirez/papas/speed/pedo → pase de planos.
      // escudo/espejito → se resuelven al jugarse el ataque.
      // duelo → pase 3. var → pase 2. caldeador/piedrambre → upstream (dan vuelta el
      // pronóstico al armar la base). sociales/borron → no tocan puntos.
      // saibamba → en queries (bonus del campeón, vive en los extras).
      default:
        break;
    }
  }

  // Los ceros ganan siempre (una maldición pisa una cábala).
  for (const z of zeroings) {
    const m = map(z.member);
    if (z.matchId in m) m[z.matchId] = 0;
  }

  // ---- Pase 2: VAR (primer partido con puntos posterior a jugarlo; cada VAR
  //      agarra un partido distinto si hay varios) ----
  for (const card of cards) {
    if (card.cardType !== "var") continue;
    const m = map(card.ownerId);
    const used = (varAppliedTo[card.ownerId] ??= []);
    const playedAt = card.playedAt.getTime();
    const hit = opts.matchOrder.find((id) => {
      const k = opts.kickoffById[id];
      return (
        k && new Date(k).getTime() > playedAt && (m[id] ?? 0) > 0 && !used.includes(id)
      );
    });
    if (hit) {
      m[hit] += 2;
      used.push(hit);
    }
  }

  // ---- Pase 3: Matambre de cerdo — robo de los puntos del día (ya modificados) ----
  for (const card of cards) {
    if (card.cardType !== "duelo" || !card.targetId) continue;
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

  // ---- Pase 4: planos (robos directos, maldición de plata) ----
  for (const card of cards) {
    switch (card.cardType) {
      case "papas":
        add(flat, card.ownerId, 5);
        break;
      case "speed":
        add(flat, card.ownerId, 2);
        break;
      case "ramirez":
        add(flat, card.ownerId, -5);
        break;
      case "pedo": {
        if (!card.targetId) break;
        const to = card.reflected ? card.targetId : card.ownerId;
        const from = card.reflected ? card.ownerId : card.targetId;
        add(flat, to, 5);
        add(flat, from, -5);
        break;
      }
      default:
        break;
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
