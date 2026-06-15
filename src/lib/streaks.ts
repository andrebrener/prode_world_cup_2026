// Modo Diversión — rachas.
//
// Racha = partidos seguidos (con resultado, en orden de kickoff) en los que el
// jugador sumó puntos (>0). Un partido en 0 la corta — salvo que ese día esté
// protegido (Fernet de Fernemo, que cubre TODA su jornada vía override
// "protect"; ver applyCardEffects). Cada racha cobra cada hito (3, 5, 8, 12) una
// sola vez; una racha nueva puede volver a cobrarlos.
//
// Se calcula al vuelo desde los resultados (sin estado), igual que el resto de
// los puntos. Los puntos que se usan son los POST-cartas: una Mufa que te deja
// en 1 no te corta la racha; un Doblete sobre 0 sigue siendo 0.

import { STREAK_MILESTONES } from "./cardCatalog";
import type { MatchPointsMap, StreakOverride } from "./cards";

export type StreakResult = {
  /** Racha en curso (al último partido con resultado). */
  current: number;
  /** Mejor racha del torneo. */
  best: number;
  /** Puntos extra acumulados por hitos. */
  bonus: number;
  /** Hitos cobrados, en orden (puede repetir entre rachas). */
  milestones: number[];
  /** Partidos en 0 salvados por una carta de día (Fernet de Fernemo, caído). */
  protectedMatchIds: string[];
};

export function computeStreak(opts: {
  /** Puntos por partido del jugador (post-cartas). Partido sin entrada = 0. */
  points: MatchPointsMap;
  /** Partidos CON resultado, ordenados por kickoff. */
  matchOrder: string[];
  kickoffById: Record<string, string>;
  /**
   * Overrides por partido (de cartas de día):
   * "protect" = un 0 no corta la racha (Fernet de Fernemo / "Le tirás a otro para que no sume") ·
   * "skip" = el partido no cuenta ni a favor ni en contra (Filtro 5mm).
   */
  overrides?: Record<string, StreakOverride>;
}): StreakResult {
  let run = 0;
  let best = 0;
  let bonus = 0;
  const milestones: number[] = [];
  const protectedMatchIds: string[] = [];

  for (const matchId of opts.matchOrder) {
    const ov = opts.overrides?.[matchId];
    if (ov === "skip") continue; // el partido no existe para la racha

    const pts = opts.points[matchId] ?? 0;
    if (pts > 0) {
      run++;
      best = Math.max(best, run);
      const hit = STREAK_MILESTONES.find((m) => m.len === run);
      if (hit) {
        bonus += hit.bonus;
        milestones.push(hit.len);
      }
      continue;
    }

    // Partido en 0 protegido por una carta de día: la racha sobrevive sin sumar.
    if (ov === "protect") {
      protectedMatchIds.push(matchId);
      continue;
    }

    run = 0;
  }

  return {
    current: run,
    best,
    bonus,
    milestones,
    protectedMatchIds,
  };
}
