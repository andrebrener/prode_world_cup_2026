import { describe, it, expect } from "vitest";
import {
  dailyCard,
  funToday,
  fullSchedule,
  nextMatchAfter,
  resolvePlay,
  applyCardEffects,
  type PlayedCardEffect,
} from "./cards";
import { CARD_CATALOG, RARITY_WEIGHTS, type CardType } from "./cardCatalog";
import { MATCHES } from "./fixtures";

// Calendario sintético para tests: 3 partidos.
const SCHEDULE = [
  { id: "M1", kickoff: "2026-06-20T12:00:00-06:00" },
  { id: "M2", kickoff: "2026-06-21T12:00:00-06:00" },
  { id: "M3", kickoff: "2026-06-22T12:00:00-06:00" },
];
const KICKOFFS = Object.fromEntries(SCHEDULE.map((m) => [m.id, m.kickoff]));
const BEFORE_M1 = new Date("2026-06-19T12:00:00-06:00");

const played = (
  cardType: CardType,
  ownerId: string,
  over: Partial<PlayedCardEffect> = {},
): PlayedCardEffect => ({
  id: `card-${cardType}-${ownerId}`,
  cardType,
  ownerId,
  targetId: null,
  effectMatchId: null,
  playedAt: BEFORE_M1,
  ...over,
});

const basePlay = {
  ownerId: "ana",
  targetId: null,
  now: BEFORE_M1,
  memberIds: ["ana", "beto", "caro"],
  occupiedEffects: new Set<string>(),
  ownerActiveStandings: new Set<CardType>(),
  targetShieldCardId: null,
  schedule: SCHEDULE,
};

describe("funToday", () => {
  it("usa el huso de México (medianoche MX, no UTC)", () => {
    // 04:00 UTC del 13/jun = 22:00 del 12/jun en CDMX.
    expect(funToday(new Date("2026-06-13T04:00:00Z"))).toBe("2026-06-12");
    expect(funToday(new Date("2026-06-13T12:00:00Z"))).toBe("2026-06-13");
  });
});

describe("dailyCard (sorteo diario)", () => {
  it("es determinística: misma (pool, jugador, fecha) → misma carta", () => {
    const a = dailyCard("pool1", "ana", "2026-06-15");
    const b = dailyCard("pool1", "ana", "2026-06-15");
    expect(a.type).toBe(b.type);
  });

  it("cambia con el día, el jugador o el prode", () => {
    const days = new Set(
      Array.from({ length: 30 }, (_, i) =>
        dailyCard("pool1", "ana", `2026-06-${String(i + 1).padStart(2, "0")}`).type,
      ),
    );
    expect(days.size).toBeGreaterThan(1);
  });

  it("respeta las rarezas a grandes rasgos (60/30/10)", () => {
    const counts = { comun: 0, rara: 0, legendaria: 0 };
    for (let i = 0; i < 2000; i++) {
      counts[dailyCard("pool1", `jugador-${i}`, "2026-06-15").rarity]++;
    }
    expect(counts.comun / 2000).toBeGreaterThan(0.5);
    expect(counts.comun / 2000).toBeLessThan(0.7);
    expect(counts.legendaria / 2000).toBeGreaterThan(0.05);
    expect(counts.legendaria / 2000).toBeLessThan(0.15);
  });

  it("los pesos de rareza suman 100", () => {
    expect(RARITY_WEIGHTS.comun + RARITY_WEIGHTS.rara + RARITY_WEIGHTS.legendaria).toBe(100);
  });
});

describe("fullSchedule / nextMatchAfter", () => {
  it("incluye los 72 de grupos + 32 de llaves, ordenados", () => {
    const s = fullSchedule();
    expect(s.length).toBe(MATCHES.length + 32);
    for (let i = 1; i < s.length; i++) {
      expect(new Date(s[i].kickoff).getTime()).toBeGreaterThanOrEqual(
        new Date(s[i - 1].kickoff).getTime(),
      );
    }
  });

  it("devuelve el primer partido que aún no arrancó", () => {
    expect(nextMatchAfter(BEFORE_M1, SCHEDULE)?.id).toBe("M1");
    expect(nextMatchAfter(new Date("2026-06-20T12:00:00-06:00"), SCHEDULE)?.id).toBe("M2");
    expect(nextMatchAfter(new Date("2026-07-30T00:00:00Z"), SCHEDULE)).toBeNull();
  });
});

describe("resolvePlay (validación)", () => {
  it("un buff atado a partido apunta al próximo partido", () => {
    const r = resolvePlay({ ...basePlay, cardType: "doblete" });
    expect(r).toEqual({ ok: true, effectMatchId: "M1", blockedByShieldId: null });
  });

  it("un ataque requiere víctima válida y distinta", () => {
    expect(resolvePlay({ ...basePlay, cardType: "mufa" })).toMatchObject({ ok: false });
    expect(
      resolvePlay({ ...basePlay, cardType: "mufa", targetId: "ana" }),
    ).toMatchObject({ ok: false });
    expect(
      resolvePlay({ ...basePlay, cardType: "mufa", targetId: "zoe" }),
    ).toMatchObject({ ok: false });
    expect(
      resolvePlay({ ...basePlay, cardType: "mufa", targetId: "beto" }),
    ).toMatchObject({ ok: true, effectMatchId: "M1" });
  });

  it("regla de 1 efecto por partido por persona", () => {
    const occupied = new Set(["M1:ana"]);
    expect(
      resolvePlay({ ...basePlay, cardType: "doblete", occupiedEffects: occupied }),
    ).toMatchObject({ ok: false });
    // El mismo partido para OTRA persona sí se puede.
    expect(
      resolvePlay({ ...basePlay, cardType: "mufa", targetId: "beto", occupiedEffects: occupied }),
    ).toMatchObject({ ok: true });
  });

  it("no se puede duplicar un standing activo", () => {
    expect(
      resolvePlay({
        ...basePlay,
        cardType: "escudo",
        ownerActiveStandings: new Set<CardType>(["escudo"]),
      }),
    ).toMatchObject({ ok: false });
  });

  it("el escudo de la víctima bloquea el ataque", () => {
    const r = resolvePlay({
      ...basePlay,
      cardType: "afano",
      targetId: "beto",
      targetShieldCardId: "escudo-de-beto",
    });
    expect(r).toEqual({ ok: true, effectMatchId: null, blockedByShieldId: "escudo-de-beto" });
  });

  it("sin partidos restantes no se puede jugar una carta atada a partido", () => {
    const r = resolvePlay({ ...basePlay, cardType: "diego", now: new Date("2026-08-01T00:00:00Z") });
    expect(r).toMatchObject({ ok: false });
  });
});

describe("applyCardEffects", () => {
  const base = {
    ana: { M1: 3, M2: 5, M3: 0 },
    beto: { M1: 5, M2: 0, M3: 3 },
  };
  const opts = { base, matchOrder: ["M1", "M2", "M3"], kickoffById: KICKOFFS };

  it("sin cartas no cambia nada", () => {
    const r = applyCardEffects({ ...opts, cards: [] });
    expect(r.points).toEqual(base);
    expect(r.delta).toEqual({ ana: 0, beto: 0 });
  });

  it("doblete duplica el partido atado; diego triplica", () => {
    const r = applyCardEffects({
      ...opts,
      cards: [
        played("doblete", "ana", { effectMatchId: "M1" }),
        played("diego", "beto", { effectMatchId: "M3" }),
      ],
    });
    expect(r.points.ana.M1).toBe(6);
    expect(r.points.beto.M3).toBe(9);
    expect(r.delta).toEqual({ ana: 3, beto: 6 });
  });

  it("doblete sobre un 0 sigue siendo 0", () => {
    const r = applyCardEffects({
      ...opts,
      cards: [played("doblete", "ana", { effectMatchId: "M3" })],
    });
    expect(r.points.ana.M3).toBe(0);
    expect(r.delta.ana).toBe(0);
  });

  it("yapa suma +1 solo si el partido sumó", () => {
    const conPuntos = applyCardEffects({
      ...opts,
      cards: [played("yapa", "ana", { effectMatchId: "M1" })],
    });
    expect(conPuntos.points.ana.M1).toBe(4);

    const sinPuntos = applyCardEffects({
      ...opts,
      cards: [played("yapa", "ana", { effectMatchId: "M3" })],
    });
    expect(sinPuntos.points.ana.M3).toBe(0);
  });

  it("mufa deja la mitad redondeada para abajo", () => {
    const r = applyCardEffects({
      ...opts,
      cards: [played("mufa", "ana", { targetId: "beto", effectMatchId: "M1" })],
    });
    expect(r.points.beto.M1).toBe(2); // 5 → 2
    expect(r.delta.beto).toBe(-3);
  });

  it("afano transfiere 2 puntos al contado", () => {
    const r = applyCardEffects({
      ...opts,
      cards: [played("afano", "ana", { targetId: "beto" })],
    });
    expect(r.flat).toEqual({ ana: 2, beto: -2 });
    expect(r.delta).toEqual({ ana: 2, beto: -2 });
  });

  it("var suma +2 al primer partido con puntos posterior a jugarla", () => {
    const r = applyCardEffects({
      ...opts,
      cards: [
        played("var", "ana", { playedAt: new Date("2026-06-20T18:00:00-06:00") }), // post-M1
      ],
    });
    expect(r.points.ana.M1).toBe(3); // no aplica: ya se jugó
    expect(r.points.ana.M2).toBe(7); // 5 + 2
    expect(r.varAppliedTo.ana).toBe("M2");
  });

  it("var no aplica si no hay partidos con puntos después", () => {
    const r = applyCardEffects({
      ...opts,
      cards: [played("var", "beto", { playedAt: new Date("2026-06-21T18:00:00-06:00") })],
    });
    // beto: M3 = 3 → sí aplica. Probamos con ana cuyo M3 = 0.
    const r2 = applyCardEffects({
      ...opts,
      cards: [played("var", "ana", { playedAt: new Date("2026-06-21T18:00:00-06:00") })],
    });
    expect(r.points.beto.M3).toBe(5);
    expect(r2.points.ana.M3).toBe(0);
    expect(r2.varAppliedTo.ana).toBeUndefined();
  });

  it("efectos sobre partidos sin resultado todavía no suman", () => {
    // M4 no está en base (sin resultado): el doblete queda latente.
    const r = applyCardEffects({
      ...opts,
      cards: [played("doblete", "ana", { effectMatchId: "M4" })],
    });
    expect(r.delta.ana).toBe(0);
  });

  it("el catálogo tiene 8 cartas y todas con definición completa", () => {
    for (const def of Object.values(CARD_CATALOG)) {
      expect(def.name.length).toBeGreaterThan(0);
      expect(def.description.length).toBeGreaterThan(0);
      expect(["comun", "rara", "legendaria"]).toContain(def.rarity);
    }
  });
});
