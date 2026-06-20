// Auditoría del mazo completo: toda carta del catálogo tiene que poder
// jugarse (resolvePlay) y resolverse (applyCardEffects/streaks) sin romper
// nada, más los escenarios cruzados que no cubre la suite principal.

import { describe, it, expect } from "vitest";
import {
  resolvePlay,
  applyCardEffects,
  dailyCard,
  type PlayedCardEffect,
} from "./cards";
import { computeStreak } from "./streaks";
import { ALL_CARDS, CARD_CATALOG, type CardType } from "./cardCatalog";

const SCHEDULE = [
  { id: "M1", kickoff: "2026-06-20T12:00:00-06:00" },
  { id: "M2", kickoff: "2026-06-20T18:00:00-06:00" },
  { id: "M3", kickoff: "2026-06-21T12:00:00-06:00" },
];
const KICKOFFS = Object.fromEntries(SCHEDULE.map((m) => [m.id, m.kickoff]));
const ORDER = ["M1", "M2", "M3"];
const NOW = new Date("2026-06-19T12:00:00-06:00");
const DAY_1 = "2026-06-20";

const BASE = {
  ana: { M1: 3, M2: 5, M3: 0 },
  beto: { M1: 5, M2: 0, M3: 3 },
};

const played = (
  cardType: CardType,
  over: Partial<PlayedCardEffect> = {},
): PlayedCardEffect => ({
  id: `audit-${cardType}`,
  cardType,
  ownerId: "ana",
  targetId: null,
  effectMatchId: null,
  effectDate: null,
  reflected: false,
  playedAt: NOW,
  ...over,
});

describe("auditoría: las 29 cartas del catálogo", () => {
  it("el catálogo está completo y consistente", () => {
    expect(ALL_CARDS.length).toBe(29);
    for (const def of ALL_CARDS) {
      expect(def.name.length, def.type).toBeGreaterThan(1);
      expect(def.description.length, def.type).toBeGreaterThan(10);
      expect(def.emoji.length, def.type).toBeGreaterThan(0);
      // Reglas estructurales:
      if (def.kind === "curse") expect(def.target, def.type).toBe("self");
      // Los inputs sociales (apodo/foto/micrófono) son de cartas sociales; el
      // input "partido" (Honguito) es un buff que elige a qué partido se ata.
      if (def.input && def.input !== "partido") expect(def.kind, def.type).toBe("social");
      if (def.kind === "social") expect(def.blockable, def.type).toBe(true);
      // Las defensas (escudo/espejito) y la racha/VAR son del día: nada se "guarda".
      if (def.type === "escudo" || def.type === "espejito" || def.type === "aguante")
        expect(def.window, def.type).toBe("day");
      if (def.kind === "attack") expect(def.target, def.type).toBe("other");
    }
  });

  it("toda carta NO-maldición pasa resolvePlay con su binding esperado", () => {
    for (const def of ALL_CARDS) {
      if (def.kind === "curse") continue;
      const r = resolvePlay({
        cardType: def.type,
        ownerId: "ana",
        targetId: def.target === "self" ? null : "beto",
        now: NOW,
        memberIds: ["ana", "beto"],
        targetShieldCardId: null,
        targetMirrorCardId: null,
        schedule: SCHEDULE,
      });
      expect(r.ok, `${def.type} debería poder jugarse`).toBe(true);
      if (r.ok) {
        if (def.window === "match") expect(r.effectMatchId, def.type).toBe("M1");
        if (def.window === "day") expect(r.effectDate, def.type).toBe(DAY_1);
        if (!def.window) {
          expect(r.effectMatchId, def.type).toBeNull();
          expect(r.effectDate, def.type).toBeNull();
        }
      }
    }
  });

  it("a un defendido (escudo o espejito) el ataque bloqueable IGUAL le sale, pero se anula/rebota", () => {
    for (const def of ALL_CARDS) {
      if (!def.blockable || def.kind !== "attack") continue;
      const base = {
        cardType: def.type,
        ownerId: "ana",
        targetId: "beto",
        now: NOW,
        memberIds: ["ana", "beto"],
        targetMirrorCardId: null,
        schedule: SCHEDULE,
      };
      // Escudo secreto: el ataque sale (ok) pero queda anulado.
      const conEscudo = resolvePlay({ ...base, targetShieldCardId: "esc" });
      expect(conEscudo, def.type).toMatchObject({ ok: true, blocked: true, reflected: false });

      // Espejito secreto: el ataque sale (ok) pero rebota al que lo tiró.
      const conEspejito = resolvePlay({
        ...base,
        targetShieldCardId: null,
        targetMirrorCardId: "esp",
      });
      expect(conEspejito, def.type).toMatchObject({ ok: true, blocked: false, reflected: true });
    }
  });

  it("las cartas sociales SÍ se le pueden jugar a un defendido (no son ataques)", () => {
    for (const def of ALL_CARDS) {
      if (def.kind !== "social") continue;
      const base = {
        cardType: def.type,
        ownerId: "ana",
        targetId: "beto",
        now: NOW,
        memberIds: ["ana", "beto"],
        schedule: SCHEDULE,
      };
      const withShield = resolvePlay({
        ...base,
        targetShieldCardId: "esc",
        targetMirrorCardId: null,
      });
      expect(withShield, def.type).toMatchObject({ ok: true });

      const withMirror = resolvePlay({
        ...base,
        targetShieldCardId: null,
        targetMirrorCardId: "esp",
      });
      expect(withMirror, def.type).toMatchObject({ ok: true });
    }
  });

  it("jugar TODAS las cartas a la vez no rompe la resolución (smoke total)", () => {
    const cards: PlayedCardEffect[] = ALL_CARDS.map((def, i) =>
      played(def.type, {
        id: `smoke-${def.type}`,
        targetId: def.target === "self" ? null : "beto",
        effectMatchId: def.window === "match" ? "M1" : null,
        effectDate: def.window === "day" ? DAY_1 : null,
        playedAt: new Date(NOW.getTime() + i * 1000),
      }),
    );
    const r = applyCardEffects({
      cards,
      base: BASE,
      matchOrder: ORDER,
      kickoffById: KICKOFFS,
    });
    for (const member of ["ana", "beto"]) {
      expect(Number.isFinite(r.delta[member])).toBe(true);
      for (const pts of Object.values(r.points[member])) {
        expect(Number.isFinite(pts)).toBe(true);
        expect(pts).toBeGreaterThanOrEqual(0);
      }
      // La racha también tiene que bancarse el caos completo.
      const s = computeStreak({
        points: r.points[member],
        matchOrder: ORDER,
        kickoffById: KICKOFFS,
        overrides: r.streakOverrides[member],
      });
      expect(Number.isFinite(s.bonus)).toBe(true);
    }
  });
});

describe("auditoría: escenarios cruzados", () => {
  const opts = { base: BASE, matchOrder: ORDER, kickoffById: KICKOFFS };

  it("las tres maldiciones de día dejan el día en 0 por igual", () => {
    for (const curse of ["nemo", "heladera", "matambrito"] as const) {
      const r = applyCardEffects({
        ...opts,
        cards: [played(curse, { effectDate: DAY_1 })],
      });
      expect(r.points.ana.M1, curse).toBe(0);
      expect(r.points.ana.M2, curse).toBe(0);
      expect(r.points.ana.M3, curse).toBe(0); // otro día: intacto... M3 es del 21
    }
  });

  it("doblete + cábala stackean (×4) y una mufa posterior los divide", () => {
    const r = applyCardEffects({
      ...opts,
      cards: [
        played("cabala", { effectDate: DAY_1, playedAt: NOW }),
        played("doblete", {
          effectDate: DAY_1, // primer partido del día = M1
          playedAt: new Date(NOW.getTime() + 1000),
        }),
        played("mufa", {
          id: "mufa-beto",
          ownerId: "beto",
          targetId: "ana",
          effectDate: DAY_1,
          playedAt: new Date(NOW.getTime() + 2000),
        }),
      ],
    });
    // M1: 3 → ×2 (cábala) → ×2 (doblete) = 12 → ÷2 (mufa) = 6
    expect(r.points.ana.M1).toBe(6);
  });

  it("la yapa de un partido luego maldecido se va a 0 (los ceros ganan)", () => {
    const r = applyCardEffects({
      ...opts,
      cards: [
        played("yapa", { effectDate: DAY_1 }),
        played("nemo", { effectDate: DAY_1, playedAt: new Date(NOW.getTime() + 1000) }),
      ],
    });
    expect(r.points.ana.M1).toBe(0);
  });

  it("el VAR no rescata un día borrado por filtro/maldición", () => {
    const r = applyCardEffects({
      ...opts,
      cards: [
        played("filtro", { ownerId: "beto", targetId: "ana", effectDate: DAY_1 }),
        played("var", { playedAt: NOW }),
      ],
    });
    // M1/M2 quedaron en 0 → el VAR cae en M3… que ana tiene en 0 también → nada.
    expect(r.points.ana.M1).toBe(0);
    expect(r.varAppliedTo.ana ?? []).toEqual([]);
  });

  it("matambre después de buffs: roba los puntos del día YA modificados", () => {
    const r = applyCardEffects({
      ...opts,
      cards: [
        played("cabala", { ownerId: "beto", effectDate: DAY_1, playedAt: NOW }),
        played("duelo", {
          targetId: "beto",
          effectDate: DAY_1,
          playedAt: new Date(NOW.getTime() + 1000),
        }),
      ],
    });
    // beto duplicó con la cábala: M1 5×2=10, M2 0 → ana le afana 10.
    expect(r.points.beto.M1).toBe(0);
    expect(r.points.beto.M2).toBe(0);
    expect(r.flat.ana).toBe(10);
  });

  it("costillar pone piso de puntos y con eso la racha sobrevive el día", () => {
    // ana falló M1 y M2 (0 y 0). El costillar le pone piso 3 en ambos.
    const r = applyCardEffects({
      base: { ana: { M1: 0, M2: 0, M3: 3 } },
      matchOrder: ORDER,
      kickoffById: KICKOFFS,
      cards: [played("costillar", { effectDate: DAY_1, playedAt: NOW })],
    });
    expect(r.points.ana.M1).toBe(3); // 0 → piso
    expect(r.points.ana.M2).toBe(3); // 0 → piso
    expect(r.streakOverrides.ana).toBeUndefined(); // ya no usa override
    const s = computeStreak({
      points: r.points.ana,
      matchOrder: ORDER,
      kickoffById: KICKOFFS,
    });
    expect(s.current).toBe(3); // M1, M2 (pisados) + M3 → racha de 3, sin protecciones
  });

  it("un escudo del día (secreto, no se consume) anula cada ataque que reciba", () => {
    // El escudo es del día y no se consume (getPlayContext devuelve el mismo
    // shieldId mientras siga activo): cada ataque sale pero queda anulado.
    for (const shieldId of ["esc-1", "esc-1"]) {
      const r = resolvePlay({
        cardType: "pedo",
        ownerId: "ana",
        targetId: "beto",
        now: NOW,
        memberIds: ["ana", "beto"],
        targetShieldCardId: shieldId,
        targetMirrorCardId: null,
        schedule: SCHEDULE,
      });
      expect(r).toMatchObject({ ok: true, blocked: true });
    }
  });

  it("el sorteo nunca devuelve undefined en 1000 tiradas", () => {
    for (let i = 0; i < 1000; i++) {
      const def = dailyCard("audit-pool", `p${i}`, "2026-06-20");
      expect(def).toBeDefined();
      // Devuelve una DrawnCard con mecánica válida del catálogo (ya no es el
      // mismo objeto: lleva defId y lo cosmético del mazo).
      expect(CARD_CATALOG[def.type]).toBeDefined();
      expect(def.spec).toEqual(CARD_CATALOG[def.type].spec);
    }
  });

  it("cartas de tipos desconocidos (catálogo viejo: swap/caparazón) se ignoran sin romper", () => {
    const r = applyCardEffects({
      ...opts,
      cards: [played("afano" as CardType, { targetId: "beto" })],
    });
    expect(r.points).toEqual(BASE);
    expect(r.delta).toEqual({ ana: 0, beto: 0 });
  });
});
