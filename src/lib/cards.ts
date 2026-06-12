// Modo Diversión — motor de cartas (solo server / lógica pura).
//
// No hay cron: el "azar" del sorteo diario es determinístico por
// (prode, participante, fecha) — reclamar solo persiste el resultado, y refrescar
// la página no re-sortea. El día cambia a medianoche de America/Mexico_City
// (misma convención que el deadline de pronósticos).
//
// Las cartas NUNCA tocan pronósticos (son globales entre prodes): todos los
// efectos se resuelven al calcular la tabla del prode (queries.getLeaderboard).

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
  return "legendaria";
}

/** Carta del día para un participante en un prode. Determinística. */
export function dailyCard(poolId: string, participantId: string, date: string): CardDef {
  const rarity = rarityFor(roll([poolId, participantId, date, "rareza"], 100));
  const options = ALL_CARDS.filter((c) => c.rarity === rarity);
  return options[roll([poolId, participantId, date, "carta"], options.length)];
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

/** Próximo partido que todavía no arrancó (las cartas atadas a partido apuntan acá). */
export function nextMatchAfter(now: Date, schedule: ScheduledMatch[] = fullSchedule()): ScheduledMatch | null {
  return schedule.find((m) => new Date(m.kickoff).getTime() > now.getTime()) ?? null;
}

// ---------- Jugar una carta: validación ----------

export type PlayInput = {
  cardType: CardType;
  ownerId: string;
  targetId: string | null;
  now: Date;
  memberIds: string[];
  /** "matchId:participanteAfectado" de efectos ya activos (regla: 1 efecto por partido por persona). */
  occupiedEffects: Set<string>;
  /** Tipos standing (escudo/aguante/var) que el dueño ya tiene activos sin consumir. */
  ownerActiveStandings: Set<CardType>;
  /** id de la carta Escudo activa de la víctima, si tiene (solo para ataques). */
  targetShieldCardId: string | null;
  schedule?: ScheduledMatch[];
};

export type PlayOutcome =
  | { ok: true; effectMatchId: string | null; blockedByShieldId: string | null }
  | { ok: false; error: string };

export function resolvePlay(input: PlayInput): PlayOutcome {
  const def = CARD_CATALOG[input.cardType];
  if (!def) return { ok: false, error: "Carta desconocida." };

  if (def.kind === "attack") {
    if (!input.targetId) return { ok: false, error: "Elegí una víctima." };
    if (input.targetId === input.ownerId)
      return { ok: false, error: "No te podés atacar a vos mismo (para eso está la mufa ajena)." };
    if (!input.memberIds.includes(input.targetId))
      return { ok: false, error: "La víctima no está en este prode." };
  } else if (input.targetId) {
    return { ok: false, error: "Esta carta no lleva víctima." };
  }

  if (def.standing && input.ownerActiveStandings.has(def.type)) {
    return { ok: false, error: `Ya tenés un ${def.name} activo. Esperá a que se consuma.` };
  }

  // Escudo de la víctima: el ataque se juega igual pero queda bloqueado.
  if (def.kind === "attack" && input.targetShieldCardId) {
    return { ok: true, effectMatchId: null, blockedByShieldId: input.targetShieldCardId };
  }

  let effectMatchId: string | null = null;
  if (def.bindsMatch) {
    const next = nextMatchAfter(input.now, input.schedule);
    if (!next) return { ok: false, error: "No quedan partidos por jugarse." };
    effectMatchId = next.id;
    const affectedId = def.kind === "attack" ? input.targetId! : input.ownerId;
    if (input.occupiedEffects.has(`${effectMatchId}:${affectedId}`)) {
      return {
        ok: false,
        error:
          def.kind === "attack"
            ? "La víctima ya tiene un efecto activo para ese partido."
            : "Ya tenés un efecto activo para ese partido.",
      };
    }
  }

  return { ok: true, effectMatchId, blockedByShieldId: null };
}

// ---------- Resolución de efectos sobre los puntos ----------

export type PlayedCardEffect = {
  id: string;
  cardType: CardType;
  ownerId: string;
  targetId: string | null;
  effectMatchId: string | null;
  playedAt: Date;
};

/** matchId → puntos del miembro en ese partido. */
export type MatchPointsMap = Record<string, number>;

export type FunEffects = {
  /** Puntos por partido DESPUÉS de aplicar cartas (por miembro). */
  points: Record<string, MatchPointsMap>;
  /** Ajustes planos (afanos): ±puntos por miembro. */
  flat: Record<string, number>;
  /** Delta total por cartas (modificadores + planos) por miembro, para mostrar. */
  delta: Record<string, number>;
  /** Partido al que el VAR le sumó +2, por miembro (para la UI). */
  varAppliedTo: Record<string, string>;
};

/**
 * Aplica las cartas jugadas sobre los puntos base por partido.
 * Pura: no toca la base; las cartas bloqueadas no deben venir en `cards`.
 */
export function applyCardEffects(opts: {
  cards: PlayedCardEffect[];
  base: Record<string, MatchPointsMap>;
  /** Partidos CON resultado, ordenados por kickoff (para el VAR). */
  matchOrder: string[];
  kickoffById: Record<string, string>;
}): FunEffects {
  const points: Record<string, MatchPointsMap> = {};
  for (const [member, map] of Object.entries(opts.base)) points[member] = { ...map };

  const flat: Record<string, number> = {};
  const varAppliedTo: Record<string, string> = {};
  const add = (m: Record<string, number>, k: string, v: number) => {
    m[k] = (m[k] ?? 0) + v;
  };

  // Orden estable por playedAt para que la resolución sea determinística.
  const cards = [...opts.cards].sort((a, b) => a.playedAt.getTime() - b.playedAt.getTime());

  for (const card of cards) {
    const map = (id: string) => (points[id] ??= {});
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
        if (!card.targetId) break;
        const m = map(card.targetId);
        if (card.effectMatchId && card.effectMatchId in m) {
          m[card.effectMatchId] = Math.floor(m[card.effectMatchId] / 2);
        }
        break;
      }
      case "afano": {
        if (!card.targetId) break;
        add(flat, card.ownerId, 2);
        add(flat, card.targetId, -2);
        break;
      }
      case "var": {
        // Primer partido con puntos posterior a jugarla (una sola vez).
        const m = map(card.ownerId);
        const playedAt = card.playedAt.getTime();
        const hit = opts.matchOrder.find((id) => {
          const k = opts.kickoffById[id];
          return k && new Date(k).getTime() > playedAt && (m[id] ?? 0) > 0;
        });
        if (hit) {
          m[hit] += 2;
          varAppliedTo[card.ownerId] = hit;
        }
        break;
      }
      // escudo: se resuelve al jugarse el ataque · aguante: se resuelve en streaks.ts
      case "escudo":
      case "aguante":
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

  return { points, flat, delta, varAppliedTo };
}
