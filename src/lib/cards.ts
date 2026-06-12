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
// Regla anti-viveza de las cartas de día: el efecto vale solo para los partidos
// del día que TODAVÍA NO ARRANCARON al jugarla (nada de jugar la Cábala a la
// noche para duplicar retroactivamente lo que ya viste).

import { createHash } from "crypto";
import { MATCHES } from "./fixtures";
import { KO_MATCHES, koKickoff } from "./bracket";
import {
  CARD_CATALOG,
  RARITY_WEIGHTS,
  ALL_CARDS,
  type CardDef,
  type CardRarity,
  type CardType,
} from "./cardCatalog";

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

/** Carta del día para un participante en un prode. Determinística. */
export function dailyCard(poolId: string, participantId: string, date: string): CardDef {
  const rarity = rarityFor(roll([poolId, participantId, date, "rareza"], 100));
  // Dentro del balde, sorteo ponderado por `weight` (default 1).
  const options = ALL_CARDS.filter((c) => c.rarity === rarity);
  const total = options.reduce((acc, c) => acc + (c.weight ?? 1), 0);
  let n = roll([poolId, participantId, date, "carta"], total);
  for (const c of options) {
    n -= c.weight ?? 1;
    if (n < 0) return c;
  }
  return options[options.length - 1];
}

/** Probabilidad efectiva de cada carta en el sorteo diario (sobre 100). */
export function cardOdds(): Record<CardType, number> {
  const odds = {} as Record<CardType, number>;
  for (const rarity of Object.keys(RARITY_WEIGHTS) as CardRarity[]) {
    const options = ALL_CARDS.filter((c) => c.rarity === rarity);
    const total = options.reduce((acc, c) => acc + (c.weight ?? 1), 0);
    for (const c of options) {
      odds[c.type] = (RARITY_WEIGHTS[rarity] * (c.weight ?? 1)) / total;
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
  /** Para target "other"; para "leader" la acción ya lo resolvió al puntero. */
  targetId: string | null;
  now: Date;
  memberIds: string[];
  /** id del Anulo mufa activo de la víctima, si tiene (solo ataques bloqueables). */
  targetShieldCardId: string | null;
  /** id del Espejito rebotín activo de la víctima, si tiene. */
  targetMirrorCardId: string | null;
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
  } else if (def.target === "leader") {
    if (!input.targetId) return { ok: false, error: "No hay líder para apuntarle." };
  } else if (input.targetId && input.targetId !== input.ownerId) {
    return { ok: false, error: "Esta carta no lleva víctima." };
  }

  // Defensas de la víctima: el escudo come el ataque; el espejito lo devuelve.
  if (def.blockable && input.targetId && input.targetId !== input.ownerId) {
    if (input.targetShieldCardId) {
      return {
        ok: true,
        effectMatchId: null,
        effectDate: null,
        blockedByShieldId: input.targetShieldCardId,
        reflectedByMirrorId: null,
      };
    }
    // El duelo no rebota (es simétrico: rebotarlo es el mismo duelo).
    if (input.targetMirrorCardId && def.type !== "duelo") {
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
  /** Snapshot de deltas (caparazón, swap): { deltas: { participantId: ±n } } */
  payload: { deltas?: Record<string, number> } | null;
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
  /** Overrides de racha por miembro (costillar/filtro/caído). */
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

  // Partidos (con resultado) de un día, posteriores a jugar la carta.
  const dayIds = (card: PlayedCardEffect): string[] =>
    opts.matchOrder.filter((id) => {
      const k = opts.kickoffById[id];
      return (
        k &&
        matchDay(k) === card.effectDate &&
        new Date(k).getTime() > card.playedAt.getTime()
      );
    });

  // Orden estable por playedAt para que la resolución sea determinística.
  const cards = [...opts.cards].sort((a, b) => a.playedAt.getTime() - b.playedAt.getTime());

  // ---- Pase 1: modificadores de partido y de día (los ceros pisan al final) ----
  const zeroings: { member: string; matchId: string }[] = [];

  for (const card of cards) {
    const affected = affectedIdOf(card);
    switch (card.cardType) {
      case "doblete":
      case "diego": {
        const mult = card.cardType === "diego" ? 3 : 2;
        const m = map(card.ownerId);
        if (card.effectMatchId && card.effectMatchId in m) {
          m[card.effectMatchId] = m[card.effectMatchId] * mult;
        }
        break;
      }
      case "yapa": {
        const m = map(card.ownerId);
        if (card.effectMatchId && (m[card.effectMatchId] ?? 0) > 0) {
          m[card.effectMatchId] += 1;
        }
        break;
      }
      case "mufa": {
        const m = map(affected);
        if (card.effectMatchId && card.effectMatchId in m) {
          m[card.effectMatchId] = Math.floor(m[card.effectMatchId] / 2);
        }
        break;
      }
      case "cabala": {
        const m = map(card.ownerId);
        for (const id of dayIds(card)) if (id in m) m[id] = m[id] * 2;
        break;
      }
      case "costillar": {
        for (const id of dayIds(card)) override(card.ownerId, id, "protect");
        break;
      }
      case "pelambreada": {
        // 0 en todo el día; los ceros cortan la racha solos.
        for (const id of dayIds(card)) zeroings.push({ member: affected, matchId: id });
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
        // Maldición: 0 en los partidos del día (posteriores al reclamo).
        for (const id of dayIds(card)) zeroings.push({ member: card.ownerId, matchId: id });
        break;
      }
      // ramirez/papas/speed/pedo/caparazon/swap → pase de planos.
      // escudo/espejito → se resuelven al jugarse el ataque.
      // duelo → pase 3. var → pase 2. caldeador → upstream. sociales/borron → no tocan puntos.
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

  // ---- Pase 3: duelos (sobre los puntos del día ya modificados) ----
  for (const card of cards) {
    if (card.cardType !== "duelo" || !card.targetId) continue;
    const ids = dayIds(card);
    if (ids.length === 0) continue;
    const total = (member: string) =>
      ids.reduce((acc, id) => acc + (points[member]?.[id] ?? 0), 0);
    const a = total(card.ownerId);
    const b = total(card.targetId);
    if (a === b) continue; // empate: no pasa nada
    const winner = a > b ? card.ownerId : card.targetId;
    const loser = a > b ? card.targetId : card.ownerId;
    for (const id of ids) {
      const wm = map(winner);
      if (id in wm) wm[id] = wm[id] * 2;
      const lm = map(loser);
      if (id in lm) lm[id] = 0;
    }
  }

  // ---- Pase 4: planos (robos, snapshots, maldición de plata) ----
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
      case "caparazon":
      case "swap": {
        for (const [member, delta] of Object.entries(card.payload?.deltas ?? {})) {
          add(flat, member, delta);
        }
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
