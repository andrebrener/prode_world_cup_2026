import { SCORING } from "./fixtures";

export type Score = { homeGoals: number; awayGoals: number };

function outcome(s: Score): "H" | "D" | "A" {
  if (s.homeGoals > s.awayGoals) return "H";
  if (s.homeGoals < s.awayGoals) return "A";
  return "D";
}

/** Puntos de un partido: 5 exacto, 3 si acierta el resultado (ganador/empate), 0 si no. */
export function matchPoints(pred: Score | undefined, real: Score | undefined): number {
  if (!pred || !real) return 0;
  if (pred.homeGoals === real.homeGoals && pred.awayGoals === real.awayGoals) {
    return SCORING.exact;
  }
  if (outcome(pred) === outcome(real)) return SCORING.outcome;
  return 0;
}

export type KoPred = { homeGoals: number; awayGoals: number; advance: string };
export type KoReal = {
  homeGoals: number;
  awayGoals: number;
  penalties: boolean;
  penWinner: string | null;
};

/** Equipo que avanza según el resultado oficial (penales si los hubo). */
export function koWinner(real: KoReal, home: string, away: string): string | null {
  if (real.penalties) return real.penWinner || null;
  if (real.homeGoals > real.awayGoals) return home;
  if (real.awayGoals > real.homeGoals) return away;
  return null;
}

/**
 * Equipo que el participante cree que avanza: si su marcador es decisivo, el ganador del
 * marcador; si empató, su elección de penales (`advance`).
 */
export function predictedAdvancer(pred: KoPred, home: string, away: string): string {
  if (pred.homeGoals > pred.awayGoals) return home;
  if (pred.awayGoals > pred.homeGoals) return away;
  return pred.advance;
}

/**
 * Puntos de un cruce de knockout:
 *  +6 marcador exacto (de los 90'/alargue) · +4 acertar quién pasa ·
 *  +2 bonus si fue a penales y tu elección de penales acertó al ganador. (Se acumulan.)
 */
export function knockoutPoints(
  pred: KoPred | undefined,
  real: KoReal | undefined,
  home: string,
  away: string,
): number {
  if (!pred || !real) return 0;
  let pts = 0;
  if (pred.homeGoals === real.homeGoals && pred.awayGoals === real.awayGoals) {
    pts += SCORING.knockout.exact;
  }
  const realAdvancer = koWinner(real, home, away);
  if (realAdvancer && predictedAdvancer(pred, home, away) === realAdvancer) {
    pts += SCORING.knockout.winner;
  }
  // Bonus: el cruce real fue a penales y tu elección de penales coincide con quién pasó.
  if (real.penalties && realAdvancer && pred.advance === realAdvancer) {
    pts += SCORING.knockout.penaltyWinner;
  }
  return pts;
}

/**
 * Bonus de la carta Sai Bamba: garantiza los puntos del campeón. No se duplica
 * si el jugador ya le había pegado al campeón con su pronóstico real (cuando aún
 * no se definió el campeón, `real.champion` es null → cobra igual los 10).
 */
export function saiBambaBonus(pred: ExtraPick, real: ExtraPick): number {
  const earned = real.champion && pred.champion === real.champion ? SCORING.champion : 0;
  return SCORING.champion - earned;
}

export type ExtraPick = {
  champion?: string | null;
  runnerUp?: string | null;
  topScorer?: string | null;
  figure?: string | null;
};

function norm(v?: string | null): string {
  return (v ?? "").trim().toLowerCase();
}

/** Puntos de los extras comparando contra el resultado real del torneo. */
export function extraPoints(pred: ExtraPick, real: ExtraPick): number {
  let pts = 0;
  if (real.champion && pred.champion === real.champion) pts += SCORING.champion;
  if (real.runnerUp && pred.runnerUp === real.runnerUp) pts += SCORING.runnerUp;
  if (real.topScorer && norm(pred.topScorer) && norm(pred.topScorer) === norm(real.topScorer))
    pts += SCORING.topScorer;
  if (real.figure && norm(pred.figure) && norm(pred.figure) === norm(real.figure))
    pts += SCORING.figure;
  return pts;
}
