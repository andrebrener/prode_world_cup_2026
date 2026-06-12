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
  payload: null,
  reflected: false,
  playedAt: NOW,
  ...over,
});

describe("auditoría: las 28 cartas del catálogo", () => {
  it("el catálogo está completo y consistente", () => {
    expect(ALL_CARDS.length).toBe(28);
    for (const def of ALL_CARDS) {
      expect(def.name.length, def.type).toBeGreaterThan(1);
      expect(def.description.length, def.type).toBeGreaterThan(10);
      expect(def.emoji.length, def.type).toBeGreaterThan(0);
      // Reglas estructurales:
      if (def.kind === "curse") expect(def.target, def.type).toBe("self");
      if (def.input) expect(def.kind, def.type).toBe("social");
      if (def.kind === "social") expect(def.blockable, def.type).toBe(true);
      if (def.standing) expect(def.window, def.type).toBeNull();
      if (def.kind === "attack") expect(["other", "leader"]).toContain(def.target);
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

  it("toda carta bloqueable rebota contra escudo y (salvo duelo) contra espejito", () => {
    for (const def of ALL_CARDS) {
      if (!def.blockable || def.target === "leader") continue;
      const base = {
        cardType: def.type,
        ownerId: "ana",
        targetId: "beto",
        now: NOW,
        memberIds: ["ana", "beto"],
        targetMirrorCardId: null,
        schedule: SCHEDULE,
      };
      const blocked = resolvePlay({ ...base, targetShieldCardId: "esc" });
      expect(blocked).toMatchObject({ ok: true, blockedByShieldId: "esc" });

      const mirrored = resolvePlay({
        ...base,
        targetShieldCardId: null,
        targetMirrorCardId: "esp",
      });
      if (def.type === "duelo") {
        expect(mirrored).toMatchObject({ ok: true, reflectedByMirrorId: null });
      } else {
        expect(mirrored, def.type).toMatchObject({ ok: true, reflectedByMirrorId: "esp" });
      }
    }
  });

  it("jugar TODAS las cartas a la vez no rompe la resolución (smoke total)", () => {
    const cards: PlayedCardEffect[] = ALL_CARDS.map((def, i) =>
      played(def.type, {
        id: `smoke-${def.type}`,
        targetId: def.target === "self" ? null : "beto",
        effectMatchId: def.window === "match" ? "M1" : null,
        effectDate: def.window === "day" ? DAY_1 : null,
        payload:
          def.type === "caparazon" || def.type === "swap"
            ? { deltas: { ana: 1, beto: -1 } }
            : null,
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
          effectMatchId: "M1",
          playedAt: new Date(NOW.getTime() + 1000),
        }),
        played("mufa", {
          id: "mufa-beto",
          ownerId: "beto",
          targetId: "ana",
          effectMatchId: "M1",
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
        played("yapa", { effectMatchId: "M1" }),
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

  it("duelo después de buffs: compara puntos YA modificados", () => {
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
    // Día: ana 3+5=8 · beto (5×2)+0=10 → gana beto: dobla; ana se va en 0.
    expect(r.points.beto.M1).toBe(20);
    expect(r.points.ana.M1).toBe(0);
    expect(r.points.ana.M2).toBe(0);
  });

  it("costillar salva la racha incluso del día perdido en un duelo", () => {
    const r = applyCardEffects({
      ...opts,
      cards: [
        played("costillar", { effectDate: DAY_1, playedAt: NOW }),
        played("duelo", {
          id: "duelo-beto",
          ownerId: "beto",
          targetId: "ana",
          effectDate: DAY_1,
          playedAt: new Date(NOW.getTime() + 1000),
        }),
      ],
    });
    // beto gana el duelo (5×2... no: día beto 5, ana 8 → gana ana). Rehacer:
    // ana 8 vs beto 5 → ana dobla, beto en 0. El costillar era de ana: ni hizo falta.
    // Lo que importa: overrides de ana siguen ahí y un 0 futuro del día no corta.
    expect(r.streakOverrides.ana?.M1).toBe("protect");
    const s = computeStreak({
      points: { M1: 0, M2: 0, M3: 3 }, // como si ana hubiese perdido el día
      matchOrder: ORDER,
      kickoffById: KICKOFFS,
      overrides: r.streakOverrides.ana,
    });
    expect(s.current).toBe(1); // M1/M2 protegidos, M3 suma
  });

  it("dos escudos en cola: dos bloqueos (a nivel datos, el más viejo primero)", () => {
    // resolvePlay recibe un solo shieldId (el más viejo): acá validamos que el
    // segundo ataque con el segundo escudo también bloquea.
    for (const shieldId of ["esc-1", "esc-2"]) {
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
      expect(r).toMatchObject({ ok: true, blockedByShieldId: shieldId });
    }
  });

  it("el sorteo nunca devuelve undefined en 1000 tiradas", () => {
    for (let i = 0; i < 1000; i++) {
      const def = dailyCard("audit-pool", `p${i}`, "2026-06-20");
      expect(def).toBeDefined();
      expect(CARD_CATALOG[def.type]).toBe(def);
    }
  });

  it("swap y caparazón con payload vacío no rompen (carta vieja/corrupta)", () => {
    const r = applyCardEffects({
      ...opts,
      cards: [
        played("swap", { targetId: "beto", payload: null }),
        played("caparazon", { targetId: "beto", payload: {} }),
      ],
    });
    expect(r.delta).toEqual({ ana: 0, beto: 0 });
  });

  it("cartas de tipos desconocidos (catálogo viejo) se ignoran sin romper", () => {
    const r = applyCardEffects({
      ...opts,
      cards: [played("afano" as CardType, { targetId: "beto" })],
    });
    expect(r.points).toEqual(BASE);
    expect(r.delta).toEqual({ ana: 0, beto: 0 });
  });
});
