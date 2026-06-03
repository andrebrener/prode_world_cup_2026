import { describe, it, expect } from "vitest";
import {
  matchPoints,
  koWinner,
  predictedAdvancer,
  knockoutPoints,
  extraPoints,
  type KoPred,
  type KoReal,
} from "./scoring";
import { SCORING } from "./fixtures";

describe("matchPoints (fase de grupos)", () => {
  it("marcador exacto en victoria local → 5", () => {
    expect(matchPoints({ homeGoals: 2, awayGoals: 1 }, { homeGoals: 2, awayGoals: 1 })).toBe(
      SCORING.exact,
    );
  });

  it("marcador exacto en empate → 5", () => {
    expect(matchPoints({ homeGoals: 0, awayGoals: 0 }, { homeGoals: 0, awayGoals: 0 })).toBe(
      SCORING.exact,
    );
  });

  it("marcador exacto en victoria visitante → 5", () => {
    expect(matchPoints({ homeGoals: 0, awayGoals: 3 }, { homeGoals: 0, awayGoals: 3 })).toBe(
      SCORING.exact,
    );
  });

  it("acierta ganador local pero no el marcador → 3", () => {
    expect(matchPoints({ homeGoals: 2, awayGoals: 1 }, { homeGoals: 3, awayGoals: 0 })).toBe(
      SCORING.outcome,
    );
  });

  it("acierta empate pero no el marcador → 3", () => {
    expect(matchPoints({ homeGoals: 1, awayGoals: 1 }, { homeGoals: 2, awayGoals: 2 })).toBe(
      SCORING.outcome,
    );
  });

  it("acierta ganador visitante pero no el marcador → 3", () => {
    expect(matchPoints({ homeGoals: 0, awayGoals: 1 }, { homeGoals: 1, awayGoals: 2 })).toBe(
      SCORING.outcome,
    );
  });

  it("predice empate y fue victoria → 0", () => {
    expect(matchPoints({ homeGoals: 1, awayGoals: 1 }, { homeGoals: 2, awayGoals: 1 })).toBe(0);
  });

  it("predice ganador equivocado → 0", () => {
    expect(matchPoints({ homeGoals: 2, awayGoals: 0 }, { homeGoals: 0, awayGoals: 2 })).toBe(0);
  });

  it("sin pronóstico → 0", () => {
    expect(matchPoints(undefined, { homeGoals: 1, awayGoals: 0 })).toBe(0);
  });

  it("sin resultado real → 0", () => {
    expect(matchPoints({ homeGoals: 1, awayGoals: 0 }, undefined)).toBe(0);
  });
});

describe("koWinner (quién pasa según el resultado oficial)", () => {
  it("victoria local en los 90' → local", () => {
    const real: KoReal = { homeGoals: 2, awayGoals: 1, penalties: false, penWinner: null };
    expect(koWinner(real, "ARG", "BRA")).toBe("ARG");
  });

  it("victoria visitante en los 90' → visitante", () => {
    const real: KoReal = { homeGoals: 0, awayGoals: 1, penalties: false, penWinner: null };
    expect(koWinner(real, "ARG", "BRA")).toBe("BRA");
  });

  it("penales → gana el penWinner sin importar el marcador", () => {
    const real: KoReal = { homeGoals: 1, awayGoals: 1, penalties: true, penWinner: "BRA" };
    expect(koWinner(real, "ARG", "BRA")).toBe("BRA");
  });

  it("empate sin penales → null (indefinido)", () => {
    const real: KoReal = { homeGoals: 1, awayGoals: 1, penalties: false, penWinner: null };
    expect(koWinner(real, "ARG", "BRA")).toBeNull();
  });

  it("penales sin penWinner → null", () => {
    const real: KoReal = { homeGoals: 1, awayGoals: 1, penalties: true, penWinner: null };
    expect(koWinner(real, "ARG", "BRA")).toBeNull();
  });
});

describe("predictedAdvancer (quién cree el participante que pasa)", () => {
  it("marcador local decisivo → local (ignora advance)", () => {
    const pred: KoPred = { homeGoals: 2, awayGoals: 0, advance: "BRA" };
    expect(predictedAdvancer(pred, "ARG", "BRA")).toBe("ARG");
  });

  it("marcador visitante decisivo → visitante", () => {
    const pred: KoPred = { homeGoals: 0, awayGoals: 2, advance: "ARG" };
    expect(predictedAdvancer(pred, "ARG", "BRA")).toBe("BRA");
  });

  it("empate → usa la elección de penales (advance)", () => {
    const pred: KoPred = { homeGoals: 1, awayGoals: 1, advance: "ARG" };
    expect(predictedAdvancer(pred, "ARG", "BRA")).toBe("ARG");
  });
});

describe("knockoutPoints (cruces de eliminatoria)", () => {
  const home = "ARG";
  const away = "BRA";

  it("marcador exacto + acierta quién pasa (sin penales) → 6 + 4 = 10", () => {
    const pred: KoPred = { homeGoals: 2, awayGoals: 1, advance: "ARG" };
    const real: KoReal = { homeGoals: 2, awayGoals: 1, penalties: false, penWinner: null };
    expect(knockoutPoints(pred, real, home, away)).toBe(
      SCORING.knockout.exact + SCORING.knockout.winner,
    );
  });

  it("acierta quién pasa pero no el marcador → 4", () => {
    const pred: KoPred = { homeGoals: 3, awayGoals: 0, advance: "ARG" };
    const real: KoReal = { homeGoals: 2, awayGoals: 1, penalties: false, penWinner: null };
    expect(knockoutPoints(pred, real, home, away)).toBe(SCORING.knockout.winner);
  });

  it("marcador exacto pero el cruce lo definían penales y erró el avance → solo 6", () => {
    // Predijo 1-1 con ARG en penales; fue 1-1 pero pasó BRA en penales.
    const pred: KoPred = { homeGoals: 1, awayGoals: 1, advance: "ARG" };
    const real: KoReal = { homeGoals: 1, awayGoals: 1, penalties: true, penWinner: "BRA" };
    expect(knockoutPoints(pred, real, home, away)).toBe(SCORING.knockout.exact);
  });

  it("penales: exacto + avance + bonus de penales → 6 + 4 + 2 = 12", () => {
    const pred: KoPred = { homeGoals: 1, awayGoals: 1, advance: "BRA" };
    const real: KoReal = { homeGoals: 1, awayGoals: 1, penalties: true, penWinner: "BRA" };
    expect(knockoutPoints(pred, real, home, away)).toBe(
      SCORING.knockout.exact + SCORING.knockout.winner + SCORING.knockout.penaltyWinner,
    );
  });

  it("penales: acierta avance por penales pero no el marcador → 4 + 2 = 6", () => {
    const pred: KoPred = { homeGoals: 0, awayGoals: 0, advance: "BRA" };
    const real: KoReal = { homeGoals: 1, awayGoals: 1, penalties: true, penWinner: "BRA" };
    expect(knockoutPoints(pred, real, home, away)).toBe(
      SCORING.knockout.winner + SCORING.knockout.penaltyWinner,
    );
  });

  it("yerra todo → 0", () => {
    const pred: KoPred = { homeGoals: 0, awayGoals: 2, advance: "BRA" };
    const real: KoReal = { homeGoals: 3, awayGoals: 0, penalties: false, penWinner: null };
    expect(knockoutPoints(pred, real, home, away)).toBe(0);
  });

  it("sin pronóstico o sin resultado → 0", () => {
    const pred: KoPred = { homeGoals: 1, awayGoals: 0, advance: "ARG" };
    const real: KoReal = { homeGoals: 1, awayGoals: 0, penalties: false, penWinner: null };
    expect(knockoutPoints(undefined, real, home, away)).toBe(0);
    expect(knockoutPoints(pred, undefined, home, away)).toBe(0);
  });
});

describe("extraPoints (extras del torneo)", () => {
  const real = { champion: "ARG", runnerUp: "FRA", topScorer: "Messi", figure: "Mbappé" };

  it("acierta campeón → 10", () => {
    expect(extraPoints({ champion: "ARG" }, real)).toBe(SCORING.champion);
  });

  it("acierta subcampeón → 7", () => {
    expect(extraPoints({ runnerUp: "FRA" }, real)).toBe(SCORING.runnerUp);
  });

  it("acierta goleador (case/espacios insensible) → 8", () => {
    expect(extraPoints({ topScorer: "  mEsSi " }, real)).toBe(SCORING.topScorer);
  });

  it("acierta figura (case/espacios insensible) → 8", () => {
    expect(extraPoints({ figure: "mbappé" }, real)).toBe(SCORING.figure);
  });

  it("acierta todo → 10 + 7 + 8 + 8 = 33", () => {
    expect(extraPoints(real, real)).toBe(
      SCORING.champion + SCORING.runnerUp + SCORING.topScorer + SCORING.figure,
    );
  });

  it("campeón y subcampeón cruzados → 0", () => {
    expect(extraPoints({ champion: "FRA", runnerUp: "ARG" }, real)).toBe(0);
  });

  it("goleador vacío no puntúa aunque el real esté vacío", () => {
    expect(extraPoints({ topScorer: "" }, { topScorer: "" })).toBe(0);
  });

  it("sin resultado real definido → 0 aunque haya pronóstico", () => {
    expect(
      extraPoints(
        { champion: "ARG", runnerUp: "FRA", topScorer: "Messi", figure: "Mbappé" },
        { champion: null, runnerUp: null, topScorer: null, figure: null },
      ),
    ).toBe(0);
  });
});
