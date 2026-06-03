import { describe, it, expect } from "vitest";
import {
  bestThirds,
  assignThirds,
  computeR32,
  resolveBracket,
  KO_MATCHES,
  type KoResult,
} from "./bracket";
import type { TeamStanding } from "./standings";

// ---- helpers ----

function ts(code: string, points = 0, goalDiff = 0, goalsFor = 0): TeamStanding {
  return {
    code,
    played: 0,
    won: 0,
    drawn: 0,
    lost: 0,
    goalsFor,
    goalsAgainst: 0,
    goalDiff,
    points,
  };
}

// Standings sintéticos: posiciones con códigos "{grupo}1".."{grupo}4".
function fullStandings(): Record<string, TeamStanding[]> {
  const letters = "ABCDEFGHIJKL".split("");
  return Object.fromEntries(
    letters.map((g) => [g, [1, 2, 3, 4].map((p) => ts(`${g}${p}`))]),
  );
}

// allowed por id de slot de tercero, leído del cuadro oficial.
const THIRD_SLOT_ALLOWED: Record<string, string[]> = Object.fromEntries(
  KO_MATCHES.filter((m) => m.away.kind === "third").map((m) => [
    m.id,
    (m.away as { kind: "third"; allowed: string[] }).allowed,
  ]),
);
const THIRD_SLOT_IDS = Object.keys(THIRD_SLOT_ALLOWED);

function combinations<T>(arr: T[], k: number): T[][] {
  if (k === 0) return [[]];
  if (k > arr.length) return [];
  const [head, ...rest] = arr;
  return [
    ...combinations(rest, k - 1).map((c) => [head, ...c]),
    ...combinations(rest, k),
  ];
}

describe("bestThirds", () => {
  it("elige los 8 mejores terceros por puntos, en orden de ranking", () => {
    // puntos del 3° de cada grupo: A=9 ... decrecientes; I..L con menos
    const pts: Record<string, number> = {
      A: 9, B: 8, C: 7, D: 6, E: 5, F: 4, G: 3, H: 2, I: 1, J: 0, K: 0, L: 0,
    };
    const standings = Object.fromEntries(
      Object.entries(pts).map(([g, p]) => [g, [ts(`${g}1`), ts(`${g}2`), ts(`${g}3`, p), ts(`${g}4`)]]),
    );
    expect(bestThirds(standings)).toEqual(["A", "B", "C", "D", "E", "F", "G", "H"]);
  });

  it("desempata por diferencia de gol en el borde de clasificación", () => {
    const standings = Object.fromEntries(
      "ABCDEFGHIJKL".split("").map((g) => [g, [ts(`${g}1`), ts(`${g}2`), ts(`${g}3`), ts(`${g}4`)]]),
    );
    // A..G con puntos altos distintos; H e I empatan en puntos pero H mejor dif de gol.
    const set = (g: string, p: number, gd: number) => {
      standings[g][2] = ts(`${g}3`, p, gd);
    };
    set("A", 9, 0); set("B", 8, 0); set("C", 7, 0); set("D", 6, 0);
    set("E", 5, 0); set("F", 4, 0); set("G", 3, 0);
    set("H", 2, 5); set("I", 2, 1); // empate en 2 pts, H mejor dif
    set("J", 0, 0); set("K", 0, 0); set("L", 0, 0);
    const res = bestThirds(standings);
    expect(res).toContain("H");
    expect(res).not.toContain("I");
  });
});

describe("assignThirds (matching bipartito de terceros)", () => {
  // Valida que el resultado sea un matching perfecto y legal.
  function validate(input: string[]) {
    const result = assignThirds(input);
    const slots = Object.keys(result);
    // 8 slots asignados, todos slots válidos de tercero
    expect(slots).toHaveLength(8);
    for (const s of slots) {
      expect(THIRD_SLOT_IDS).toContain(s);
      // el grupo asignado debe estar permitido en ese slot
      expect(THIRD_SLOT_ALLOWED[s]).toContain(result[s]);
    }
    // biyección: los 8 grupos de entrada usados exactamente una vez
    const assigned = Object.values(result);
    expect(new Set(assigned).size).toBe(8);
    expect([...assigned].sort()).toEqual([...input].sort());
  }

  it("asigna correctamente un set de ejemplo", () => {
    validate(["A", "B", "C", "D", "E", "F", "G", "H"]);
  });

  it("es determinista (misma entrada → misma salida)", () => {
    const a = assignThirds(["A", "B", "C", "D", "I", "J", "K", "L"]);
    const b = assignThirds(["L", "K", "J", "I", "D", "C", "B", "A"]);
    expect(a).toEqual(b);
  });

  it("produce un matching perfecto para LAS 495 combinaciones posibles de 8 grupos", () => {
    const groups = "ABCDEFGHIJKL".split("");
    const combos = combinations(groups, 8);
    expect(combos).toHaveLength(495);
    const failures: string[] = [];
    for (const combo of combos) {
      const result = assignThirds(combo);
      const assigned = Object.values(result);
      const ok =
        Object.keys(result).length === 8 &&
        new Set(assigned).size === 8 &&
        Object.entries(result).every(([slot, g]) => THIRD_SLOT_ALLOWED[slot].includes(g)) &&
        [...assigned].sort().join("") === [...combo].sort().join("");
      if (!ok) failures.push(combo.join(""));
    }
    expect(failures).toEqual([]);
  });
});

describe("computeR32", () => {
  const standings = fullStandings();
  const r32 = computeR32(standings);

  it("genera los 16 cruces de R32 (partidos 73-88)", () => {
    const ids = Object.keys(r32).sort((a, b) => Number(a) - Number(b));
    expect(ids).toEqual(
      Array.from({ length: 16 }, (_, i) => String(73 + i)),
    );
  });

  it("resuelve slots de 1°/2° de grupo a los códigos correctos", () => {
    // 73: 2°A vs 2°B
    expect(r32["73"]).toEqual({ home: "A2", away: "B2" });
    // 75: 1°F vs 2°C
    expect(r32["75"]).toEqual({ home: "F1", away: "C2" });
    // 88: 2°D vs 2°G
    expect(r32["88"]).toEqual({ home: "D2", away: "G2" });
  });

  it("los slots de tercero se llenan con un 3° de un grupo permitido", () => {
    const thirdSlots = KO_MATCHES.filter((m) => m.round === "R32" && m.away.kind === "third");
    for (const m of thirdSlots) {
      const away = r32[m.id].away; // ej "C3"
      expect(away).toMatch(/^[A-L]3$/);
      const group = away[0];
      expect((m.away as { allowed: string[] }).allowed).toContain(group);
    }
  });

  it("cada tercero clasificado aparece exactamente una vez entre los slots de tercero", () => {
    const thirdAways = KO_MATCHES.filter((m) => m.round === "R32" && m.away.kind === "third").map(
      (m) => r32[m.id].away,
    );
    expect(new Set(thirdAways).size).toBe(8);
  });
});

describe("resolveBracket", () => {
  const home = (id: string) => `${id}H`;
  const away = (id: string) => `${id}A`;

  // snapshot R32 con códigos sintéticos por cruce
  const r32: Record<string, { home: string; away: string }> = Object.fromEntries(
    KO_MATCHES.filter((m) => m.round === "R32").map((m) => [
      m.id,
      { home: home(m.id), away: away(m.id) },
    ]),
  );

  it("propaga ganadores de R32 a R16", () => {
    const results: Record<string, KoResult> = {
      // 89 = W74 vs W77 ; gana local en ambos previos
      "74": { homeGoals: 1, awayGoals: 0, penalties: false, penWinner: null },
      "77": { homeGoals: 2, awayGoals: 1, penalties: false, penWinner: null },
    };
    const resolved = resolveBracket(r32, results);
    const m89 = resolved.find((m) => m.id === "89")!;
    expect(m89.home).toBe(home("74")); // ganador de 74
    expect(m89.away).toBe(home("77")); // ganador de 77
  });

  it("respeta al ganador por penales al propagar", () => {
    const results: Record<string, KoResult> = {
      // 73 lo define penales, gana el visitante
      "73": { homeGoals: 1, awayGoals: 1, penalties: true, penWinner: away("73") },
      "75": { homeGoals: 0, awayGoals: 0, penalties: true, penWinner: home("75") },
    };
    const resolved = resolveBracket(r32, results);
    // 90 = W73 vs W75
    const m90 = resolved.find((m) => m.id === "90")!;
    expect(m90.home).toBe(away("73"));
    expect(m90.away).toBe(home("75"));
  });

  it("etiquetas de slot legibles para R32", () => {
    const resolved = resolveBracket(r32, {});
    const m73 = resolved.find((m) => m.id === "73")!;
    expect(m73.homeLabel).toBe("2° A");
    expect(m73.awayLabel).toBe("2° B");
  });

  it("torneo completo (gana siempre el local): todo resuelto y consistente", () => {
    // Resultado 1-0 para todos los cruces de knockout.
    const results: Record<string, KoResult> = Object.fromEntries(
      KO_MATCHES.map((m) => [
        m.id,
        { homeGoals: 1, awayGoals: 0, penalties: false, penWinner: null } as KoResult,
      ]),
    );
    const resolved = resolveBracket(r32, results);
    const byId = Object.fromEntries(resolved.map((m) => [m.id, m]));

    // Todo cruce queda con ambos equipos definidos y el ganador es el local.
    for (const m of resolved) {
      expect(m.home).not.toBeNull();
      expect(m.away).not.toBeNull();
      expect(m.winner).toBe(m.home);
    }

    // El 3er puesto (103) enfrenta a los perdedores de las semis (101, 102).
    // Como siempre gana el local, el perdedor es el visitante de cada semi.
    expect(byId["103"].home).toBe(byId["101"].away);
    expect(byId["103"].away).toBe(byId["102"].away);

    // La final (104) la juegan los ganadores de las semis (los locales).
    expect(byId["104"].home).toBe(byId["101"].home);
    expect(byId["104"].away).toBe(byId["102"].home);
  });
});
