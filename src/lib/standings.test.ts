import { describe, it, expect } from "vitest";
import { groupStandings, allGroupStandings, type Score } from "./standings";
import { GROUPS, MATCHES } from "./fixtures";

// Partidos del grupo A (orden de cabezas de serie: MEX, RSA, KOR, CZE)
//   A1: MEX vs RSA   A2: KOR vs CZE
//   A3: MEX vs KOR   A4: CZE vs RSA
//   A5: CZE vs MEX   A6: RSA vs KOR
// Verificamos contra los ids reales que genera fixtures para no asumir el armado.
const A = Object.fromEntries(
  MATCHES.filter((m) => m.group === "A").map((m) => [m.id, `${m.homeCode}-${m.awayCode}`]),
);

describe("groupStandings", () => {
  it("el armado de partidos del grupo A es el esperado (FIFA pairing)", () => {
    expect(A.A1).toBe("MEX-RSA");
    expect(A.A2).toBe("KOR-CZE");
    expect(A.A3).toBe("MEX-KOR");
    expect(A.A4).toBe("CZE-RSA");
    expect(A.A5).toBe("CZE-MEX");
    expect(A.A6).toBe("RSA-KOR");
  });

  it("grupo completo: puntos, V/E/D, GF/GC/dif y orden", () => {
    const results: Record<string, Score> = {
      A1: { homeGoals: 2, awayGoals: 0 }, // MEX 2-0 RSA
      A2: { homeGoals: 0, awayGoals: 0 }, // KOR 0-0 CZE
      A3: { homeGoals: 0, awayGoals: 0 }, // MEX 0-0 KOR
      A4: { homeGoals: 1, awayGoals: 2 }, // CZE 1-2 RSA
      A5: { homeGoals: 0, awayGoals: 1 }, // CZE 0-1 MEX
      A6: { homeGoals: 1, awayGoals: 1 }, // RSA 1-1 KOR
    };
    const table = groupStandings("A", results);
    const byCode = Object.fromEntries(table.map((t) => [t.code, t]));

    // MEX: A1 W2-0, A3 D0-0, A5 (visitante) W1-0  → 2V 1E 0D, GF3 GC0, 7pts
    expect(byCode.MEX).toMatchObject({
      played: 3,
      won: 2,
      drawn: 1,
      lost: 0,
      goalsFor: 3,
      goalsAgainst: 0,
      goalDiff: 3,
      points: 7,
    });
    // RSA: A1 L0-2, A4 (visitante) W2-1, A6 D1-1 → 1V 1E 1D, GF3 GC4, 4pts
    expect(byCode.RSA).toMatchObject({
      played: 3,
      won: 1,
      drawn: 1,
      lost: 1,
      goalsFor: 3,
      goalsAgainst: 4,
      goalDiff: -1,
      points: 4,
    });
    // KOR: A2 D0-0, A3 D0-0, A6 (visitante) D1-1 → 3E, GF1 GC1, 3pts
    expect(byCode.KOR).toMatchObject({
      played: 3,
      won: 0,
      drawn: 3,
      lost: 0,
      goalsFor: 1,
      goalsAgainst: 1,
      goalDiff: 0,
      points: 3,
    });
    // CZE: A2 D0-0, A4 L1-2, A5 L0-1 → 1E 2D, GF1 GC3, 1pt
    expect(byCode.CZE).toMatchObject({
      played: 3,
      won: 0,
      drawn: 1,
      lost: 2,
      goalsFor: 1,
      goalsAgainst: 3,
      goalDiff: -2,
      points: 1,
    });

    expect(table.map((t) => t.code)).toEqual(["MEX", "RSA", "KOR", "CZE"]);
  });

  it("desempate por diferencia de gol", () => {
    const results: Record<string, Score> = {
      A1: { homeGoals: 3, awayGoals: 0 }, // MEX +3
      A2: { homeGoals: 1, awayGoals: 0 }, // KOR +1
    };
    const table = groupStandings("A", results);
    // MEX y KOR con 3pts; MEX mejor dif de gol → primero
    expect(table.map((t) => t.code)).toEqual(["MEX", "KOR", "CZE", "RSA"]);
  });

  it("desempate por goles a favor (misma dif de gol)", () => {
    const results: Record<string, Score> = {
      A1: { homeGoals: 2, awayGoals: 0 }, // MEX 3pts, dif +2, GF2
      A2: { homeGoals: 3, awayGoals: 1 }, // KOR 3pts, dif +2, GF3
    };
    const table = groupStandings("A", results);
    expect(table.slice(0, 2).map((t) => t.code)).toEqual(["KOR", "MEX"]);
  });

  it("desempate final alfabético por código", () => {
    const results: Record<string, Score> = {
      A1: { homeGoals: 1, awayGoals: 0 }, // MEX 3pts, +1, GF1
      A2: { homeGoals: 1, awayGoals: 0 }, // KOR 3pts, +1, GF1
    };
    const table = groupStandings("A", results);
    // MEX y KOR idénticos → KOR antes que MEX; RSA y CZE en 0 → CZE antes que RSA
    expect(table.map((t) => t.code)).toEqual(["KOR", "MEX", "CZE", "RSA"]);
  });

  it("sin resultados: todos en 0, orden alfabético por código", () => {
    const table = groupStandings("A", {});
    expect(table.every((t) => t.played === 0 && t.points === 0)).toBe(true);
    expect(table.map((t) => t.code)).toEqual(["CZE", "KOR", "MEX", "RSA"]);
  });

  it("grupo inexistente → []", () => {
    expect(groupStandings("Z", {})).toEqual([]);
  });
});

describe("desempate mano a mano (criterios FIFA 4-6)", () => {
  it("empate total en pts/dif/goles → decide el partido directo (no alfabético)", () => {
    // MEX y KOR terminan idénticos (4 pts, dif 0, GF 2). El alfabético pondría KOR antes,
    // pero MEX le ganó 1-0 en el cruce directo (A3) → MEX debe ir por encima de KOR.
    const results: Record<string, Score> = {
      A1: { homeGoals: 1, awayGoals: 1 }, // MEX 1-1 RSA
      A2: { homeGoals: 2, awayGoals: 1 }, // KOR 2-1 CZE
      A3: { homeGoals: 1, awayGoals: 0 }, // MEX 1-0 KOR  (mano a mano)
      A4: { homeGoals: 0, awayGoals: 2 }, // CZE 0-2 RSA
      A5: { homeGoals: 1, awayGoals: 0 }, // CZE 1-0 MEX
      A6: { homeGoals: 0, awayGoals: 0 }, // RSA 0-0 KOR
    };
    const table = groupStandings("A", results);
    const mex = table.find((t) => t.code === "MEX")!;
    const kor = table.find((t) => t.code === "KOR")!;
    // Confirmamos que de verdad están empatados en los 3 criterios globales.
    expect([mex.points, mex.goalDiff, mex.goalsFor]).toEqual([4, 0, 2]);
    expect([kor.points, kor.goalDiff, kor.goalsFor]).toEqual([4, 0, 2]);
    expect(table.map((t) => t.code)).toEqual(["RSA", "MEX", "KOR", "CZE"]);
  });

  it("FIFA 2026: el mano a mano manda sobre la diferencia de gol general", () => {
    // MEX y KOR empatan en puntos (6). KOR tiene MUCHO mejor dif de gol general (+7 vs +1)
    // por golear a los débiles, pero MEX le ganó 1-0 el cruce directo (A3).
    // Reglamento viejo: primero KOR (mejor dif). Reglamento 2026: primero MEX (mano a mano).
    const results: Record<string, Score> = {
      A1: { homeGoals: 1, awayGoals: 0 }, // MEX 1-0 RSA
      A2: { homeGoals: 5, awayGoals: 0 }, // KOR 5-0 CZE
      A3: { homeGoals: 1, awayGoals: 0 }, // MEX 1-0 KOR  (mano a mano)
      A4: { homeGoals: 0, awayGoals: 0 }, // CZE 0-0 RSA
      A5: { homeGoals: 1, awayGoals: 0 }, // CZE 1-0 MEX
      A6: { homeGoals: 0, awayGoals: 3 }, // RSA 0-3 KOR
    };
    const table = groupStandings("A", results);
    const mex = table.find((t) => t.code === "MEX")!;
    const kor = table.find((t) => t.code === "KOR")!;
    expect([mex.points, mex.goalDiff]).toEqual([6, 1]);
    expect([kor.points, kor.goalDiff]).toEqual([6, 7]);
    // Pese a la peor dif de gol, MEX va primero por haber ganado el cruce directo.
    expect(table.slice(0, 2).map((t) => t.code)).toEqual(["MEX", "KOR"]);
  });

  it("empate total con cruce directo empatado → cae a alfabético", () => {
    // Dos empates separados: MEX=KOR (dif +1) y CZE=RSA (dif -1), los cuatro con 4 pts.
    // Ambos cruces directos (A3 y A4) fueron empate → desempate alfabético en cada par.
    const results: Record<string, Score> = {
      A1: { homeGoals: 2, awayGoals: 0 }, // MEX 2-0 RSA
      A2: { homeGoals: 2, awayGoals: 0 }, // KOR 2-0 CZE
      A3: { homeGoals: 1, awayGoals: 1 }, // MEX 1-1 KOR  (mano a mano empatado)
      A4: { homeGoals: 0, awayGoals: 0 }, // CZE 0-0 RSA  (mano a mano empatado)
      A5: { homeGoals: 1, awayGoals: 0 }, // CZE 1-0 MEX
      A6: { homeGoals: 1, awayGoals: 0 }, // RSA 1-0 KOR
    };
    const table = groupStandings("A", results);
    expect(table.every((t) => t.points === 4)).toBe(true);
    expect(table.map((t) => t.code)).toEqual(["KOR", "MEX", "CZE", "RSA"]);
  });

  it("triple empate circular (cada uno le gana a uno) → mano a mano no separa → alfabético", () => {
    // MEX, KOR y CZE quedan 4 pts, dif 0, GF 1, en ciclo: MEX>KOR>CZE>MEX (todos 1-0).
    // El mano a mano los deja iguales (3 pts cada uno en el mini-grupo) → alfabético.
    const results: Record<string, Score> = {
      A1: { homeGoals: 0, awayGoals: 0 }, // MEX 0-0 RSA
      A2: { homeGoals: 1, awayGoals: 0 }, // KOR 1-0 CZE
      A3: { homeGoals: 1, awayGoals: 0 }, // MEX 1-0 KOR
      A4: { homeGoals: 0, awayGoals: 0 }, // CZE 0-0 RSA
      A5: { homeGoals: 1, awayGoals: 0 }, // CZE 1-0 MEX
      A6: { homeGoals: 0, awayGoals: 0 }, // RSA 0-0 KOR
    };
    const table = groupStandings("A", results);
    const trio = table.filter((t) => t.code !== "RSA");
    expect(trio.every((t) => t.points === 4 && t.goalDiff === 0 && t.goalsFor === 1)).toBe(true);
    expect(table.map((t) => t.code)).toEqual(["CZE", "KOR", "MEX", "RSA"]);
  });
});

describe("allGroupStandings", () => {
  it("devuelve los 12 grupos, cada uno con sus 4 equipos", () => {
    const all = allGroupStandings({});
    expect(Object.keys(all).sort()).toEqual(GROUPS.map((g) => g.letter).sort());
    for (const g of GROUPS) {
      expect(all[g.letter]).toHaveLength(4);
    }
  });
});
