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
 * Puntos por el RESULTADO de un cruce, sin el bonus de penales:
 *  6 marcador exacto · 4 acertar el resultado (ganador o empate) — excluyentes.
 * Es lo que cuenta para la racha: acertar quién pasa en los penales no es acertar
 * el partido, así que el +2 de penales no mantiene viva la racha.
 */
export function knockoutResultPoints(
  pred: KoPred | undefined,
  real: KoReal | undefined,
): number {
  if (!pred || !real) return 0;
  if (pred.homeGoals === real.homeGoals && pred.awayGoals === real.awayGoals) {
    return SCORING.knockout.exact;
  }
  if (outcome(pred) === outcome(real)) return SCORING.knockout.winner;
  return 0;
}

/**
 * Puntos de un cruce de knockout (mismo criterio que grupos, pero 6/4 y excluyentes):
 *  6 marcador exacto · 4 acertar el resultado (ganador o empate) — nunca los dos juntos ·
 *  +2 bonus aparte si el cruce fue a penales y acertaste quién gana los penales (tu pick
 *  `advance`), sin importar qué hayas puesto en los 90'/alargue.
 */
export function knockoutPoints(
  pred: KoPred | undefined,
  real: KoReal | undefined,
): number {
  if (!pred || !real) return 0;
  let pts = knockoutResultPoints(pred, real);
  // Bonus: el cruce se definió por penales y acertaste al ganador de los penales.
  if (real.penalties && real.penWinner && pred.advance === real.penWinner) {
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
