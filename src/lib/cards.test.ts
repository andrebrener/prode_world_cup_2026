import { describe, it, expect } from "vitest";
import {
  dailyCard,
  cardOdds,
  funToday,
  fullSchedule,
  nextMatchAfter,
  matchDay,
  dayMatchesAfter,
  bindDay,
  caldeadorScore,
  caldeadorKoPred,
  resolvePlay,
  applyCardEffects,
  type PlayedCardEffect,
  type PlayInput,
} from "./cards";
import {
  CARD_CATALOG,
  RARITY_WEIGHTS,
  NO_EFFECT_CARDS,
  type CardType,
} from "./cardCatalog";
import { MATCHES } from "./fixtures";

// Calendario sintético: M1 y M2 el 20/jun (huso MX), M3 el 21, M4 el 22.
const SCHEDULE = [
  { id: "M1", kickoff: "2026-06-20T12:00:00-06:00" },
  { id: "M2", kickoff: "2026-06-20T18:00:00-06:00" },
  { id: "M3", kickoff: "2026-06-21T12:00:00-06:00" },
  { id: "M4", kickoff: "2026-06-22T12:00:00-06:00" },
];
const KICKOFFS = Object.fromEntries(SCHEDULE.map((m) => [m.id, m.kickoff]));
const ORDER = ["M1", "M2", "M3", "M4"];
const BEFORE_M1 = new Date("2026-06-19T12:00:00-06:00");
const DAY_1 = "2026-06-20";

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
  effectDate: null,
  reflected: false,
  playedAt: BEFORE_M1,
  ...over,
});

const basePlay: Omit<PlayInput, "cardType"> = {
  ownerId: "ana",
  targetId: null,
  now: BEFORE_M1,
  memberIds: ["ana", "beto", "caro"],
  targetShieldCardId: null,
  targetMirrorCardId: null,
  schedule: SCHEDULE,
};

describe("funToday / matchDay", () => {
  it("usa el huso de México (medianoche MX, no UTC)", () => {
    // 04:00 UTC del 13/jun = 22:00 del 12/jun en CDMX.
    expect(funToday(new Date("2026-06-13T04:00:00Z"))).toBe("2026-06-12");
    expect(funToday(new Date("2026-06-13T12:00:00Z"))).toBe("2026-06-13");
  });

  it("matchDay normaliza el kickoff de la sede al huso MX", () => {
    expect(matchDay("2026-06-20T12:00:00-06:00")).toBe("2026-06-20");
    // 21:00 en Nueva York (-04) = 19:00 MX, mismo día.
    expect(matchDay("2026-06-20T21:00:00-04:00")).toBe("2026-06-20");
  });

  it("dayMatchesAfter solo trae los partidos del día que no arrancaron", () => {
    const mid = new Date("2026-06-20T15:00:00-06:00"); // entre M1 y M2
    expect(dayMatchesAfter(DAY_1, BEFORE_M1, SCHEDULE).map((m) => m.id)).toEqual(["M1", "M2"]);
    expect(dayMatchesAfter(DAY_1, mid, SCHEDULE).map((m) => m.id)).toEqual(["M2"]);
    expect(dayMatchesAfter("2026-06-23", BEFORE_M1, SCHEDULE)).toEqual([]);
  });
});

describe("dailyCard (sorteo diario, 4 baldes)", () => {
  it("es determinística: misma (pool, jugador, fecha) → misma carta", () => {
    expect(dailyCard("pool1", "ana", "2026-06-15").type).toBe(
      dailyCard("pool1", "ana", "2026-06-15").type,
    );
  });

  it("el 40% de las tiradas son cartas sin efecto (puro ego)", () => {
    const noEffect = new Set<CardType>(NO_EFFECT_CARDS);
    let sinEfecto = 0;
    const N = 4000;
    for (let i = 0; i < N; i++) {
      if (noEffect.has(dailyCard("pool1", `jugador-${i}`, "2026-06-15").type)) sinEfecto++;
    }
    expect(sinEfecto / N).toBeGreaterThan(0.35);
    expect(sinEfecto / N).toBeLessThan(0.45);
  });

  it("dentro del tramo con efecto respeta los baldes (50/26/9/15)", () => {
    const noEffect = new Set<CardType>(NO_EFFECT_CARDS);
    const counts = { comun: 0, rara: 0, legendaria: 0, maldicion: 0 };
    let conEfecto = 0;
    for (let i = 0; i < 4000; i++) {
      const card = dailyCard("pool1", `jugador-${i}`, "2026-06-15");
      if (noEffect.has(card.type)) continue;
      counts[card.rarity]++;
      conEfecto++;
    }
    expect(counts.comun / conEfecto).toBeGreaterThan(0.42);
    expect(counts.comun / conEfecto).toBeLessThan(0.58);
    expect(counts.maldicion / conEfecto).toBeGreaterThan(0.1);
    expect(counts.maldicion / conEfecto).toBeLessThan(0.2);
    expect(counts.legendaria / conEfecto).toBeGreaterThan(0.05);
  });

  it("los pesos de rareza suman 100 y toda rareza tiene cartas", () => {
    const total = Object.values(RARITY_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(total).toBe(100);
    for (const rarity of Object.keys(RARITY_WEIGHTS)) {
      expect(
        Object.values(CARD_CATALOG).some((c) => c.rarity === rarity),
      ).toBe(true);
    }
  });

  it("cardOdds: las probabilidades efectivas suman 100", () => {
    const odds = cardOdds();
    const total = Object.values(odds).reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(100, 6);
    for (const v of Object.values(odds)) expect(v).toBeGreaterThan(0);
  });
});

describe("caldeadorScore / caldeadorKoPred", () => {
  it("es determinístico por (carta, partido)", () => {
    expect(caldeadorScore("c1", "A1")).toEqual(caldeadorScore("c1", "A1"));
    expect(caldeadorKoPred("c1", "73", "ARG", "BRA")).toEqual(
      caldeadorKoPred("c1", "73", "ARG", "BRA"),
    );
  });

  it("genera goles futboleros (0-4) y un avance coherente", () => {
    for (let i = 0; i < 50; i++) {
      const s = caldeadorScore("carta", `M${i}`);
      expect(s.homeGoals).toBeGreaterThanOrEqual(0);
      expect(s.homeGoals).toBeLessThanOrEqual(4);
      const ko = caldeadorKoPred("carta", `M${i}`, "AAA", "BBB");
      if (ko.homeGoals > ko.awayGoals) expect(ko.advance).toBe("AAA");
      if (ko.awayGoals > ko.homeGoals) expect(ko.advance).toBe("BBB");
    }
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
    expect(nextMatchAfter(new Date("2026-07-30T00:00:00Z"), SCHEDULE)).toBeNull();
  });
});

describe("resolvePlay (validación)", () => {
  it("el doblete (primer partido del día) queda atado al día", () => {
    const r = resolvePlay({ ...basePlay, cardType: "doblete" });
    expect(r).toMatchObject({ ok: true, effectMatchId: null, effectDate: DAY_1 });
  });

  it("el honguito se ata al partido del día que elijas", () => {
    const r = resolvePlay({ ...basePlay, cardType: "honguito", chosenMatchId: "M2" });
    expect(r).toMatchObject({ ok: true, effectMatchId: "M2", effectDate: null });
  });

  it("el honguito sin elección cae al próximo partido", () => {
    const r = resolvePlay({ ...basePlay, cardType: "honguito" });
    expect(r).toMatchObject({ ok: true, effectMatchId: "M1", effectDate: null });
  });

  it("el honguito no puede ir a un partido de otro día ni a uno ya arrancado", () => {
    // M3 es del 21/jun; la carta se ata al día de M1/M2 (20/jun).
    expect(
      resolvePlay({ ...basePlay, cardType: "honguito", chosenMatchId: "M3" }),
    ).toMatchObject({ ok: false });
    // A las 14:00 del 20/jun, M1 ya arrancó: no es elegible.
    expect(
      resolvePlay({
        ...basePlay,
        cardType: "honguito",
        chosenMatchId: "M1",
        now: new Date("2026-06-20T14:00:00-06:00"),
      }),
    ).toMatchObject({ ok: false });
  });

  it("un buff de día queda atado a hoy", () => {
    const r = resolvePlay({
      ...basePlay,
      cardType: "cabala",
      now: new Date("2026-06-20T08:00:00-06:00"),
    });
    expect(r).toMatchObject({ ok: true, effectMatchId: null, effectDate: DAY_1 });
  });

  it("una carta de día sin partidos restantes hoy se ata al próximo día con partidos", () => {
    const r = resolvePlay({
      ...basePlay,
      cardType: "cabala",
      now: new Date("2026-06-20T22:00:00-06:00"), // ya arrancaron M1 y M2
    });
    expect(r).toMatchObject({ ok: true, effectDate: "2026-06-21" });
  });

  it("bindDay: hoy si quedan partidos, si no el próximo día", () => {
    expect(bindDay(new Date("2026-06-20T08:00:00-06:00"), SCHEDULE)).toBe(DAY_1);
    expect(bindDay(new Date("2026-06-20T22:00:00-06:00"), SCHEDULE)).toBe("2026-06-21");
    expect(bindDay(new Date("2026-07-30T00:00:00Z"), SCHEDULE)).toBeNull();
  });

  it("un ataque requiere víctima válida y distinta", () => {
    expect(resolvePlay({ ...basePlay, cardType: "mufa" })).toMatchObject({ ok: false });
    expect(resolvePlay({ ...basePlay, cardType: "mufa", targetId: "ana" })).toMatchObject({
      ok: false,
    });
    expect(resolvePlay({ ...basePlay, cardType: "mufa", targetId: "zoe" })).toMatchObject({
      ok: false,
    });
    expect(resolvePlay({ ...basePlay, cardType: "mufa", targetId: "beto" })).toMatchObject({
      ok: true,
      effectMatchId: null,
      effectDate: DAY_1,
    });
  });

  it("el Anulo mufa de la víctima bloquea el ataque", () => {
    const r = resolvePlay({
      ...basePlay,
      cardType: "pedo",
      targetId: "beto",
      targetShieldCardId: "escudo-de-beto",
    });
    expect(r).toMatchObject({ ok: true, blockedByShieldId: "escudo-de-beto" });
  });

  it("el Espejito rebota el ataque y lo ata al que lo tiró", () => {
    const r = resolvePlay({
      ...basePlay,
      cardType: "mufa",
      targetId: "beto",
      targetMirrorCardId: "espejito-de-beto",
    });
    // La mufa rebotada queda atada al día de ANA (la atacante).
    expect(r).toMatchObject({
      ok: true,
      effectMatchId: null,
      effectDate: DAY_1,
      reflectedByMirrorId: "espejito-de-beto",
    });
  });

  it("el escudo tiene prioridad sobre el espejito, y el matambre sí rebota", () => {
    expect(
      resolvePlay({
        ...basePlay,
        cardType: "mufa",
        targetId: "beto",
        targetShieldCardId: "escudo",
        targetMirrorCardId: "espejito",
      }),
    ).toMatchObject({ ok: true, blockedByShieldId: "escudo" });
    expect(
      resolvePlay({
        ...basePlay,
        cardType: "duelo",
        targetId: "beto",
        targetMirrorCardId: "espejito",
        now: new Date("2026-06-20T08:00:00-06:00"),
      }),
    ).toMatchObject({ ok: true, reflectedByMirrorId: "espejito", effectDate: DAY_1 });
  });

  it("las maldiciones no se pueden jugar a mano", () => {
    expect(resolvePlay({ ...basePlay, cardType: "nemo" })).toMatchObject({ ok: false });
  });
});

describe("applyCardEffects", () => {
  // base: M1/M2 el 20, M3 el 21, M4 el 22 — todos con resultado.
  const base = {
    ana: { M1: 3, M2: 5, M3: 0, M4: 3 },
    beto: { M1: 5, M2: 0, M3: 3, M4: 5 },
  };
  const opts = { base, matchOrder: ORDER, kickoffById: KICKOFFS };

  it("sin cartas no cambia nada", () => {
    const r = applyCardEffects({ ...opts, cards: [] });
    expect(r.points).toEqual(base);
    expect(r.delta).toEqual({ ana: 0, beto: 0 });
  });

  it("doblete y diego doblan/triplican el primer partido del día", () => {
    const r = applyCardEffects({
      ...opts,
      cards: [
        played("doblete", "ana", { effectDate: DAY_1 }), // primer partido del 20 = M1
        played("diego", "beto", { effectDate: "2026-06-22" }), // único del 22 = M4
      ],
    });
    expect(r.points.ana.M1).toBe(6); // 3 → ×2
    expect(r.points.ana.M2).toBe(5); // segundo del día: intacto
    expect(r.points.beto.M4).toBe(15); // 5 → ×3
  });

  it("honguito duplica solo el partido elegido", () => {
    const r = applyCardEffects({
      ...opts,
      cards: [played("honguito", "ana", { effectMatchId: "M2" })],
    });
    expect(r.points.ana.M1).toBe(3); // intacto
    expect(r.points.ana.M2).toBe(10); // 5 → ×2
    expect(r.delta.ana).toBe(5);
  });

  it("cábala duplica todos los partidos del día (toda la jornada)", () => {
    const r = applyCardEffects({
      ...opts,
      cards: [played("cabala", "ana", { effectDate: DAY_1 })],
    });
    expect(r.points.ana.M1).toBe(6);
    expect(r.points.ana.M2).toBe(10);
    expect(r.points.ana.M3).toBe(0); // otro día
    expect(r.delta.ana).toBe(8);
  });

  it("la cábala cubre todo el día, incluso partidos ya arrancados al jugarla", () => {
    const r = applyCardEffects({
      ...opts,
      cards: [
        played("cabala", "ana", {
          effectDate: DAY_1,
          playedAt: new Date("2026-06-20T15:00:00-06:00"), // entre M1 y M2
        }),
      ],
    });
    expect(r.points.ana.M1).toBe(6); // retroactivo dentro del día: M1 también dobla
    expect(r.points.ana.M2).toBe(10);
  });

  // La Piedrambre da vuelta el marcador del pronóstico (no pone 0), así que se
  // resuelve al armar la base en getLeaderboard —como el Caldeador—, no acá.

  it("caído del fernet: 0 puntos pero protege la racha donde hubiese sumado", () => {
    const r = applyCardEffects({
      ...opts,
      cards: [played("caido", "ana", { targetId: "beto", effectDate: DAY_1 })],
    });
    expect(r.points.beto.M1).toBe(0);
    expect(r.streakOverrides.beto?.M1).toBe("protect"); // base 5 > 0
    expect(r.streakOverrides.beto?.M2).toBeUndefined(); // base 0: se corta igual
  });

  it("filtro: 0 puntos y el día no cuenta para la racha", () => {
    const r = applyCardEffects({
      ...opts,
      cards: [played("filtro", "ana", { targetId: "beto", effectDate: DAY_1 })],
    });
    expect(r.points.beto.M1).toBe(0);
    expect(r.streakOverrides.beto?.M1).toBe("skip");
    expect(r.streakOverrides.beto?.M2).toBe("skip");
  });

  it("costillar pone piso de puntos en cada partido del día (3 en grupos)", () => {
    const r = applyCardEffects({
      ...opts,
      cards: [played("costillar", "beto", { effectDate: DAY_1 })],
    });
    expect(r.points.beto.M1).toBe(5); // ya tenía más que el piso: intacto
    expect(r.points.beto.M2).toBe(3); // tenía 0 → sube al piso
    expect(r.streakOverrides.beto?.M2).toBeUndefined(); // sin override: el piso protege solo
  });

  it("una maldición pisa a la cábala (los ceros ganan)", () => {
    const r = applyCardEffects({
      ...opts,
      cards: [
        played("cabala", "ana", { effectDate: DAY_1 }),
        played("nemo", "ana", { effectDate: DAY_1 }),
      ],
    });
    expect(r.points.ana.M1).toBe(0);
    expect(r.points.ana.M2).toBe(0);
  });

  it("matambre: el dueño se lleva los puntos del día de la víctima", () => {
    const r = applyCardEffects({
      ...opts,
      cards: [played("duelo", "ana", { targetId: "beto", effectDate: DAY_1 })],
    });
    // Día 1 = M1, M2. beto sumó 5+0=5 → ana se lo afana.
    expect(r.points.beto.M1).toBe(0); // robado
    expect(r.points.beto.M2).toBe(0);
    expect(r.points.beto.M3).toBe(3); // otro día, intacto
    expect(r.points.ana.M1).toBe(3); // los del dueño no cambian
    expect(r.points.ana.M2).toBe(5);
    expect(r.flat.ana).toBe(5); // el botín entra plano
    expect(r.delta.beto).toBe(-5);
    expect(r.delta.ana).toBe(5);
  });

  it("matambre rebotado: la víctima le afana al dueño", () => {
    const r = applyCardEffects({
      ...opts,
      cards: [played("duelo", "ana", { targetId: "beto", effectDate: DAY_1, reflected: true })],
    });
    // Rebota: beto le roba a ana sus M1+M2 = 3+5 = 8.
    expect(r.points.ana.M1).toBe(0);
    expect(r.points.ana.M2).toBe(0);
    expect(r.flat.beto).toBe(8);
    expect(r.points.beto.M1).toBe(5); // beto conserva los suyos
  });

  it("planos: papas +5, speed +2, ramirez -5", () => {
    const r = applyCardEffects({
      ...opts,
      cards: [played("papas", "ana"), played("speed", "ana"), played("ramirez", "beto")],
    });
    expect(r.flat).toEqual({ ana: 7, beto: -5 });
  });

  it("pedo transfiere 5; rebotado va al revés", () => {
    const directo = applyCardEffects({
      ...opts,
      cards: [played("pedo", "ana", { targetId: "beto" })],
    });
    expect(directo.flat).toEqual({ ana: 5, beto: -5 });

    const rebotado = applyCardEffects({
      ...opts,
      cards: [played("pedo", "ana", { targetId: "beto", reflected: true })],
    });
    expect(rebotado.flat).toEqual({ ana: -5, beto: 5 });
  });

  it("var suma +2 al primer partido con puntos posterior a jugarla", () => {
    const r = applyCardEffects({
      ...opts,
      cards: [played("var", "ana", { playedAt: new Date("2026-06-20T14:00:00-06:00") })],
    });
    expect(r.points.ana.M1).toBe(3); // ya se jugó
    expect(r.points.ana.M2).toBe(7); // 5 + 2
    expect(r.varAppliedTo.ana).toEqual(["M2"]);
  });

  it("dos VAR agarran partidos distintos", () => {
    const r = applyCardEffects({
      ...opts,
      cards: [
        played("var", "ana", { id: "v1", playedAt: BEFORE_M1 }),
        played("var", "ana", { id: "v2", playedAt: BEFORE_M1 }),
      ],
    });
    expect(r.points.ana.M1).toBe(5); // 3 + 2
    expect(r.points.ana.M2).toBe(7); // 5 + 2
    expect(r.varAppliedTo.ana).toEqual(["M1", "M2"]);
  });

  it("los efectos stackean en orden de jugada (cábala + mufa componen)", () => {
    const r = applyCardEffects({
      ...opts,
      cards: [
        played("cabala", "ana", { effectDate: DAY_1, playedAt: BEFORE_M1 }),
        played("mufa", "beto", {
          targetId: "ana",
          effectDate: DAY_1,
          playedAt: new Date("2026-06-19T13:00:00-06:00"),
        }),
      ],
    });
    // M1: 3 → cábala ×2 = 6 → mufa ÷2 = 3 · M2: 5 → cábala ×2 = 10.
    expect(r.points.ana.M1).toBe(3);
    expect(r.points.ana.M2).toBe(10);
  });

  it("las sociales no tocan puntos", () => {
    const r = applyCardEffects({
      ...opts,
      cards: [
        played("apodo", "ana", { targetId: "beto" }),
        played("microfono", "ana", { targetId: "beto" }),
        played("borron", "beto"),
      ],
    });
    expect(r.points).toEqual(base);
    expect(r.delta).toEqual({ ana: 0, beto: 0 });
  });
});
