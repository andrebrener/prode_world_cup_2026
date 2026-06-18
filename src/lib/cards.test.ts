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
  retroDefenseTargets,
  applyCardEffects,
  resolveDeck,
  pickDailyCard,
  karmaWeights,
  type PlayedCardEffect,
  type PlayInput,
  type RetroAttackRow,
} from "./cards";
import {
  CARD_CATALOG,
  RARITY_WEIGHTS,
  NO_EFFECT_CARDS,
  DEFAULT_DECK,
  DEFAULT_FUN_CONFIG,
  isNoEffect,
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

  it("la distribución por rareza respeta los pesos (50/26/9/15)", () => {
    const counts = { comun: 0, rara: 0, legendaria: 0, maldicion: 0 };
    const N = 4000;
    for (let i = 0; i < N; i++) {
      counts[dailyCard("pool1", `jugador-${i}`, "2026-06-15").rarity]++;
    }
    expect(counts.comun / N).toBeGreaterThan(0.42);
    expect(counts.comun / N).toBeLessThan(0.58);
    expect(counts.maldicion / N).toBeGreaterThan(0.1);
    expect(counts.maldicion / N).toBeLessThan(0.2);
    expect(counts.legendaria / N).toBeGreaterThan(0.05);
  });

  it("las sociales se sortean como comunes (sin tramo aparte)", () => {
    const social = new Set<CardType>(NO_EFFECT_CARDS);
    let count = 0;
    const N = 4000;
    for (let i = 0; i < N; i++) {
      if (social.has(dailyCard("pool1", `jugador-${i}`, "2026-06-15").type)) count++;
    }
    // Son 4 cartas dentro del balde común: salen, pero mucho menos que el viejo 40%.
    expect(count).toBeGreaterThan(0);
    expect(count / N).toBeLessThan(0.35);
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

  it("el ataque SALE contra un escudo secreto, pero se anula (blocked) en el acto", () => {
    // La defensa es secreta: el ataque no se rechaza, sale y choca contra el escudo.
    const r = resolvePlay({
      ...basePlay,
      cardType: "pedo",
      targetId: "beto",
      targetShieldCardId: "escudo-de-beto",
    });
    expect(r).toMatchObject({ ok: true, blocked: true, reflected: false });
  });

  it("el ataque SALE contra un espejito secreto, pero rebota (reflected) al que lo tiró", () => {
    const r = resolvePlay({
      ...basePlay,
      cardType: "mufa",
      targetId: "beto",
      targetMirrorCardId: "espejito-de-beto",
    });
    expect(r).toMatchObject({ ok: true, blocked: false, reflected: true, effectDate: DAY_1 });
  });

  it("el espejito tiene prioridad sobre el escudo: rebota antes que anular", () => {
    const r = resolvePlay({
      ...basePlay,
      cardType: "mufa",
      targetId: "beto",
      targetShieldCardId: "escudo-de-beto",
      targetMirrorCardId: "espejito-de-beto",
    });
    expect(r).toMatchObject({ ok: true, blocked: false, reflected: true });
  });

  it("una carta social no es ataque: la defensa no la toca (ni bloquea ni rebota)", () => {
    const r = resolvePlay({
      ...basePlay,
      cardType: "apodo",
      targetId: "beto",
      targetShieldCardId: "escudo-de-beto",
      targetMirrorCardId: "espejito-de-beto",
    });
    expect(r).toMatchObject({ ok: true, blocked: false, reflected: false });
  });

  it("las maldiciones no se pueden jugar a mano", () => {
    expect(resolvePlay({ ...basePlay, cardType: "nemo" })).toMatchObject({ ok: false });
  });
});

describe("retroDefenseTargets (defensa retroactiva)", () => {
  const row = (over: Partial<RetroAttackRow> & { id: string }): RetroAttackRow => ({
    cardType: "mufa",
    status: "played",
    reflected: false,
    effectDate: DAY_1,
    playedAt: BEFORE_M1,
    targetParticipantId: "beto",
    ...over,
  });

  it("agarra los ataques del día dirigidos al defensor y nada más", () => {
    const rows: RetroAttackRow[] = [
      row({ id: "hit-mufa" }), // ataque de día, a beto, played → cae
      row({ id: "otra-jornada", effectDate: "2026-06-21" }), // otro día → no
      row({ id: "ya-rebotado", reflected: true }), // ya rebotado → no
      row({ id: "bloqueado", status: "blocked" }), // no está "played" → no
      row({ id: "a-otro", targetParticipantId: "caro" }), // a otra persona → no
      row({ id: "no-ataque", cardType: "escudo" }), // no es ataque bloqueable → no
    ];
    expect(retroDefenseTargets(rows, "beto", DAY_1, SCHEDULE)).toEqual(["hit-mufa"]);
  });

  it("un instantáneo sin día (pedo) cae por la jornada en que se jugó", () => {
    const rows: RetroAttackRow[] = [
      // pedo no tiene effectDate: se ata por bindDay(playedAt). 13:00 del 20 → DAY_1.
      row({
        id: "pedo-hoy",
        cardType: "pedo",
        effectDate: null,
        playedAt: new Date("2026-06-20T13:00:00-06:00"),
      }),
      // pedo jugado el 22 → otra jornada, no lo toca una defensa de DAY_1.
      row({
        id: "pedo-otro-dia",
        cardType: "pedo",
        effectDate: null,
        playedAt: new Date("2026-06-22T13:00:00-06:00"),
      }),
    ];
    expect(retroDefenseTargets(rows, "beto", DAY_1, SCHEDULE)).toEqual(["pedo-hoy"]);
  });

  it("el escudo anula y el espejito rebota: marcar blocked excluye, reflected rebota", () => {
    // Verifica el efecto AGUAS ABAJO de la defensa retroactiva sobre los puntos.
    const base = {
      ana: { M1: 4, M2: 0 }, // ana (atacante) base
      beto: { M1: 6, M2: 0 }, // beto (víctima) tiene una mufa de ana en M1
    };
    const opts = { base, matchOrder: ORDER, kickoffById: KICKOFFS };

    // Mufa de ana sobre el primer partido del día de beto (M1: 6 → 3).
    const mufa = played("mufa", "ana", { targetId: "beto", effectDate: DAY_1 });
    const sinDefensa = applyCardEffects({ ...opts, cards: [mufa] });
    expect(sinDefensa.points.beto.M1).toBe(3); // pegó

    // Escudo retroactivo → la mufa queda "blocked" → no entra a applyCardEffects.
    const conEscudo = applyCardEffects({ ...opts, cards: [] });
    expect(conEscudo.points.beto.M1).toBe(6); // como si nunca hubiera pasado

    // Espejito retroactivo → la mufa pasa a reflected → le pega a ana (M1: 4 → 2).
    const conEspejito = applyCardEffects({
      ...opts,
      cards: [{ ...mufa, reflected: true }],
    });
    expect(conEspejito.points.beto.M1).toBe(6); // beto se salva
    expect(conEspejito.points.ana.M1).toBe(2); // el rebote le pega al atacante
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

  it("fernet (aguante): protege la racha en todos los ceros de su día, sin tocar puntos", () => {
    const r = applyCardEffects({
      ...opts,
      cards: [played("aguante", "beto", { effectDate: DAY_1 })],
    });
    expect(r.points.beto.M1).toBe(5); // no toca puntos
    expect(r.points.beto.M2).toBe(0);
    expect(r.streakOverrides.beto?.M1).toBe("protect");
    expect(r.streakOverrides.beto?.M2).toBe("protect"); // el 0 del día no corta la racha
    expect(r.streakOverrides.beto?.M3).toBeUndefined(); // otro día: sin protección
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

  // Autotiro: ataque sacado y no jugado a nadie → reflejado contra sí mismo
  // (targetId = dueño, reflected). El motor lo resuelve como daño puro al dueño.
  describe("autotiro (ataque reflejado contra sí mismo)", () => {
    const self = (cardType: CardType, over: Partial<PlayedCardEffect> = {}) =>
      played(cardType, "ana", { targetId: "ana", reflected: true, ...over });

    it("mufa: te parte al medio TU primer partido del día", () => {
      const r = applyCardEffects({ ...opts, cards: [self("mufa", { effectDate: DAY_1 })] });
      expect(r.points.ana.M1).toBe(1); // 3 → floor(×0.5)
      expect(r.points.ana.M2).toBe(5); // segundo del día: intacto
      expect(r.delta.ana).toBe(-2);
    });

    it("caído/filtro: te dejan TU día en cero", () => {
      const r = applyCardEffects({ ...opts, cards: [self("filtro", { effectDate: DAY_1 })] });
      expect(r.points.ana.M1).toBe(0);
      expect(r.points.ana.M2).toBe(0);
      expect(r.streakOverrides.ana?.M1).toBe("skip");
    });

    it("duelo: perdés TUS puntos del día y no van a ningún lado (daño puro)", () => {
      const r = applyCardEffects({ ...opts, cards: [self("duelo", { effectDate: DAY_1 })] });
      expect(r.points.ana.M1).toBe(0);
      expect(r.points.ana.M2).toBe(0);
      expect(r.flat.ana ?? 0).toBe(0); // no se devuelve el botín
      expect(r.delta.ana).toBe(-8); // perdió M1+M2 = 3+5
    });

    it("pedo: te comés el -5, sin la parte buena", () => {
      const r = applyCardEffects({ ...opts, cards: [self("pedo")] });
      expect(r.flat.ana).toBe(-5);
      expect(r.delta.ana).toBe(-5);
    });
  });

  it("var suma +2 a todos los partidos del día donde sumaste", () => {
    const r = applyCardEffects({
      ...opts,
      cards: [played("var", "ana", { effectDate: DAY_1 })],
    });
    expect(r.points.ana.M1).toBe(5); // 3 + 2
    expect(r.points.ana.M2).toBe(7); // 5 + 2
    expect(r.points.ana.M3).toBe(0); // otro día: sin tocar
    expect(r.varAppliedTo.ana).toEqual(["M1", "M2"]);
  });

  it("dos VAR el mismo día no apilan sobre el mismo partido", () => {
    const r = applyCardEffects({
      ...opts,
      cards: [
        played("var", "ana", { id: "v1", effectDate: DAY_1 }),
        played("var", "ana", { id: "v2", effectDate: DAY_1 }),
      ],
    });
    expect(r.points.ana.M1).toBe(5); // 3 + 2 (una sola vez)
    expect(r.points.ana.M2).toBe(7); // 5 + 2 (una sola vez)
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

describe("resolveDeck / pickDailyCard (sorteo por prode)", () => {
  // Mazo oficial como filas de DB (id = mechanic para los tests).
  const allRows = DEFAULT_DECK.map((d) => ({
    id: d.mechanic,
    mechanic: d.mechanic,
    name: d.name,
    emoji: d.emoji,
    description: d.description,
    rarity: d.rarity,
  }));

  it("resolveDeck superpone lo cosmético del mazo sobre la mecánica del registro", () => {
    const deck = resolveDeck([{ ...allRows.find((r) => r.mechanic === "doblete")!, name: "La Tractora", emoji: "🚜" }]);
    expect(deck).toHaveLength(1);
    expect(deck[0].name).toBe("La Tractora"); // del mazo
    expect(deck[0].emoji).toBe("🚜"); // del mazo
    expect(deck[0].spec).toEqual(CARD_CATALOG.doblete.spec); // del registro
    expect(deck[0].defId).toBe("doblete");
  });

  it("resolveDeck ignora mecánicas desconocidas", () => {
    const deck = resolveDeck([
      { ...allRows[0] },
      { id: "x", mechanic: "no-existe", name: "?", emoji: "?", description: "?", rarity: "comun" },
    ]);
    expect(deck).toHaveLength(1);
  });

  it("paridad: con el mazo y la config default coincide con dailyCard", () => {
    const deck = resolveDeck(allRows);
    for (let i = 0; i < 200; i++) {
      const a = dailyCard("pool", `p${i}`, "2026-06-20");
      const b = pickDailyCard(
        { poolId: "pool", participantId: `p${i}`, date: "2026-06-20" },
        deck,
        DEFAULT_FUN_CONFIG,
      );
      expect(b?.type).toBe(a.type);
    }
  });

  it("si el prode deshabilita las sin-efecto, el sorteo nunca devuelve una", () => {
    const deck = resolveDeck(allRows.filter((r) => !isNoEffect(CARD_CATALOG[r.mechanic as CardType])));
    for (let i = 0; i < 500; i++) {
      const d = pickDailyCard({ poolId: "pool", participantId: `p${i}`, date: "d" }, deck, DEFAULT_FUN_CONFIG);
      expect(d && isNoEffect(d)).toBe(false);
    }
  });

  it("si el prode deshabilita una rareza, esa rareza no sale", () => {
    const deck = resolveDeck(allRows.filter((r) => r.rarity !== "legendaria"));
    for (let i = 0; i < 500; i++) {
      const d = pickDailyCard({ poolId: "pool", participantId: `p${i}`, date: "d" }, deck, DEFAULT_FUN_CONFIG);
      expect(d?.rarity).not.toBe("legendaria");
    }
  });

  it("re-skin: la carta sorteada lleva el nombre del mazo, no el del catálogo", () => {
    const deck = resolveDeck(
      allRows.filter((r) => r.mechanic === "doblete").map((r) => ({ ...r, name: "La Tractora" })),
    );
    const d = pickDailyCard({ poolId: "p", participantId: "x", date: "d" }, deck, {
      weights: DEFAULT_FUN_CONFIG.weights,
      karmaTabla: false,
    });
    expect(d?.type).toBe("doblete");
    expect(d?.name).toBe("La Tractora");
    expect(d?.defId).toBe("doblete");
  });

  it("mazo vacío → null (todo deshabilitado)", () => {
    expect(pickDailyCard({ poolId: "p", participantId: "x", date: "d" }, [], DEFAULT_FUN_CONFIG)).toBeNull();
  });
});

describe("karmaWeights (sesgo por posición)", () => {
  const base = { comun: 50, rara: 26, legendaria: 10, maldicion: 10 };

  it("1 jugador → sin sesgo", () => {
    expect(karmaWeights(base, 0, 1)).toEqual(base);
  });

  it("líder (rank 0) → sube maldición y baja legendaria (atenuado), achica neutrales", () => {
    const w = karmaWeights(base, 0, 5);
    expect(w.maldicion).toBe(15); // ×(1 + 0.5) — sube pero con tope
    expect(w.legendaria).toBe(5); // ×(1 - 0.5) — baja pero NO se anula (sigue habiendo upside)
    expect(w.comun).toBe(37.5); // ×(1 - 0.25)
    expect(w.rara).toBe(19.5); // ×(1 - 0.25)
  });

  it("último (rank N-1) → sube legendaria y baja maldición (atenuado), achica neutrales", () => {
    const w = karmaWeights(base, 4, 5);
    expect(w.legendaria).toBe(15);
    expect(w.maldicion).toBe(5);
    expect(w.comun).toBe(37.5);
    expect(w.rara).toBe(19.5);
  });

  it("medio → sin cambios", () => {
    const w = karmaWeights(base, 2, 5);
    expect(w.maldicion).toBe(10);
    expect(w.legendaria).toBe(10);
    expect(w.comun).toBe(50);
    expect(w.rara).toBe(26);
  });

  it("el karma sesga el sorteo según posición", () => {
    const deck = resolveDeck([
      { id: "leg", mechanic: "saibamba", name: "Leg", emoji: "🔮", description: "", rarity: "legendaria" },
      { id: "mal", mechanic: "nemo", name: "Mal", emoji: "🛏️", description: "", rarity: "maldicion" },
    ]);
    const cfg = { weights: base, karmaTabla: true };
    // Ya ninguna rareza pesa 0 (el líder conserva su tiro a legendaria), así que el
    // sesgo se ve en frecuencia: muestreamos muchos seeds y comparamos.
    const N = 400;
    let liderMal = 0;
    let ultimoMal = 0;
    for (let i = 0; i < N; i++) {
      const seed = { poolId: "p", participantId: `x${i}`, date: "d" };
      if (pickDailyCard(seed, deck, cfg, { rank: 0, total: 5 })?.rarity === "maldicion") liderMal++;
      if (pickDailyCard(seed, deck, cfg, { rank: 4, total: 5 })?.rarity === "maldicion") ultimoMal++;
    }
    // El líder cae en maldición bastante más seguido que el último.
    expect(liderMal).toBeGreaterThan(ultimoMal);
  });
});
