import { describe, it, expect } from "vitest";
import { computeStreak } from "./streaks";

// 6 partidos, un día de diferencia entre cada uno.
const ORDER = ["M1", "M2", "M3", "M4", "M5", "M6"];
const KICKOFFS = Object.fromEntries(
  ORDER.map((id, i) => [id, `2026-06-${String(15 + i).padStart(2, "0")}T12:00:00-06:00`]),
);

const streak = (points: Record<string, number>) =>
  computeStreak({ points, matchOrder: ORDER, kickoffById: KICKOFFS });

describe("computeStreak", () => {
  it("sin partidos → todo en cero", () => {
    const r = computeStreak({ points: {}, matchOrder: [], kickoffById: {} });
    expect(r).toMatchObject({ current: 0, best: 0, bonus: 0 });
  });

  it("racha en curso y mejor racha", () => {
    const r = streak({ M1: 3, M2: 5, M3: 0, M4: 3, M5: 3, M6: 5 });
    expect(r.current).toBe(3); // M4-M6
    expect(r.best).toBe(3);
  });

  it("un 0 corta la racha", () => {
    const r = streak({ M1: 3, M2: 3, M3: 0, M4: 3, M5: 0, M6: 0 });
    expect(r.current).toBe(0);
    expect(r.best).toBe(2);
    expect(r.milestones).toEqual([]);
  });

  it("partido con resultado pero sin entrada en points cuenta como 0", () => {
    const r = streak({ M1: 3, M2: 3 }); // M3..M6 = 0
    expect(r.current).toBe(0);
    expect(r.best).toBe(2);
  });

  it("hito de 3 paga +3; el de 5 paga +6 acumulando", () => {
    const r = streak({ M1: 3, M2: 3, M3: 5, M4: 3, M5: 3, M6: 0 });
    expect(r.milestones).toEqual([3, 5]);
    expect(r.bonus).toBe(3 + 6);
  });

  it("una racha nueva puede volver a cobrar el mismo hito", () => {
    const points = { M1: 3, M2: 3, M3: 3, M4: 0, M5: 3, M6: 3 };
    const r = streak(points);
    expect(r.milestones).toEqual([3]);
    // con un partido más la segunda racha también llega a 3
    const r2 = computeStreak({
      points: { ...points, M7: 5 },
      matchOrder: [...ORDER, "M7"],
      kickoffById: { ...KICKOFFS, M7: "2026-06-21T12:00:00-06:00" },
    });
    expect(r2.milestones).toEqual([3, 3]);
    expect(r2.bonus).toBe(6);
  });

  it("override 'protect' (caído): un 0 no corta", () => {
    const r = computeStreak({
      points: { M1: 3, M2: 3, M3: 0, M4: 3, M5: 3, M6: 0 },
      matchOrder: ORDER,
      kickoffById: KICKOFFS,
      overrides: { M3: "protect" },
    });
    // M3 protegido → la racha llega a 4 en M5; M6 en 0 sin protección corta.
    expect(r.protectedMatchIds).toEqual(["M3"]);
    expect(r.best).toBe(4);
    expect(r.current).toBe(0);
    expect(r.milestones).toEqual([3]);
  });

  it("override 'skip' (filtro): el partido no cuenta ni a favor ni en contra", () => {
    const r = computeStreak({
      points: { M1: 3, M2: 3, M3: 0, M4: 5, M5: 3, M6: 3 },
      matchOrder: ORDER,
      kickoffById: KICKOFFS,
      overrides: { M3: "skip", M4: "skip" },
    });
    // M3 y M4 no existen para la racha: M1,M2,M5,M6 = 4 seguidos.
    expect(r.current).toBe(4);
    expect(r.milestones).toEqual([3]);
    expect(r.protectedMatchIds).toEqual([]);
  });

  it("la racha no suma en el partido protegido (protege, no regala)", () => {
    const r = computeStreak({
      points: { M1: 3, M2: 3, M3: 0, M4: 3, M5: 5, M6: 5 },
      matchOrder: ORDER,
      kickoffById: KICKOFFS,
      overrides: { M3: "protect" },
    });
    // M1,M2 = 2 · M3 protegido (no suma) · M4 → 3 (hito) · M6 → 5 (hito)
    expect(r.protectedMatchIds).toEqual(["M3"]);
    expect(r.current).toBe(5);
    expect(r.milestones).toEqual([3, 5]);
    expect(r.bonus).toBe(3 + 6);
  });

  it("override 'break' (piso del costillar sobre fallado): corta aunque haya puntos", () => {
    const r = computeStreak({
      points: { M1: 3, M2: 3, M3: 3, M4: 3, M5: 3, M6: 3 },
      matchOrder: ORDER,
      kickoffById: KICKOFFS,
      overrides: { M3: "break" },
    });
    // M3 tiene puntos (piso) pero está fallado: corta. La racha arranca en M4.
    expect(r.current).toBe(3); // M4, M5, M6
    expect(r.best).toBe(3); // máximo entre M1,M2 (2) y M4..M6 (3)
    expect(r.protectedMatchIds).toEqual([]);
  });
});
