"use client";

import { useMemo, useState } from "react";
import { MATCHES, teamName, teamFlag } from "@/lib/fixtures";
import { matchPoints, knockoutPoints } from "@/lib/scoring";
import { ROUND_LABEL, type ResolvedKoMatch } from "@/lib/bracket";
import type { MatchPredictionRow, KoPredictionRow } from "@/lib/db/queries";
import GoalInput from "./GoalInput";

type Result = { homeGoals: number; awayGoals: number };
type LbRow = { id: string; name: string; total: number };
type SimScore = { home: string; away: string };

// Fechas de la fase de grupos. Las de llaves se suman en el componente (vienen por props).
const GROUP_DATES = Array.from(new Set(MATCHES.map((m) => m.date))).sort();

function todayISO(): string {
  const d = new Date();
  const off = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - off).toISOString().slice(0, 10);
}

const fmtLong = (iso: string) =>
  new Date(iso + "T12:00:00").toLocaleDateString("es-AR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
  });

// Hora de inicio en la zona horaria del navegador del usuario, con etiqueta de TZ.
// 24h sin am/pm: el "p. m." difiere entre server y browser (U+202F) y rompe la hidratación.
const fmtTime = (iso: string) =>
  new Date(iso).toLocaleTimeString("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZoneName: "short",
  });

// Nombre de la zona horaria en la que está conectado el usuario (ej "America/Argentina/Buenos_Aires").
const userTz = Intl.DateTimeFormat().resolvedOptions().timeZone;

const clamp = (s: string) => {
  const n = parseInt(s.replace(/\D/g, ""), 10);
  if (!Number.isFinite(n)) return "";
  return String(Math.min(n, 99));
};

// Pronóstico efectivo con el que se puntúa: el random del Caldeador (ya con el flip
// de la Piedrambre aplicado), o el del jugador dado vuelta si solo lo flipearon.
const effPred = (p: MatchPredictionRow): Result => {
  if (p.caldeado) return { homeGoals: p.caldeado.homeGoals, awayGoals: p.caldeado.awayGoals };
  if (p.flipped) return { homeGoals: p.awayGoals, awayGoals: p.homeGoals };
  return { homeGoals: p.homeGoals, awayGoals: p.awayGoals };
};

type KoPred = { homeGoals: number; awayGoals: number; advance: string };

// Igual que effPred pero para llaves: arrastra también el "advance" (a quién hace pasar).
const effKoPred = (p: KoPredictionRow): KoPred => {
  if (p.caldeado) return p.caldeado;
  if (p.flipped) return { homeGoals: p.awayGoals, awayGoals: p.homeGoals, advance: p.advance };
  return { homeGoals: p.homeGoals, awayGoals: p.awayGoals, advance: p.advance };
};

export default function MatchdayPanel({
  predictionsByMatch,
  resultsByMatch,
  koMatches = [],
  koPredictionsByMatch = {},
  leaderboard = [],
  resolvedPoints,
  annulledMatches,
  stolenMatches,
  streakMatches,
}: {
  predictionsByMatch: Record<string, MatchPredictionRow[]>;
  resultsByMatch: Record<string, Result>;
  // Llaves resueltas (R32→Final) con fecha/sede. La navegación por día las incluye.
  koMatches?: ResolvedKoMatch[];
  // Pronósticos de llaves de los miembros, por cruce (`${matchId}` → filas).
  koPredictionsByMatch?: Record<string, KoPredictionRow[]>;
  leaderboard?: LbRow[];
  // Modo Diversión: puntos reales por (jugador → partido) DESPUÉS de las cartas
  // (bloqueos, robos, multiplicadores). El badge los usa fuera del simulador para
  // no mostrar puntos que en realidad una carta anuló. Ausente en modo clásico.
  resolvedPoints?: Record<string, Record<string, number>>;
  // `${jugadorId}:${matchId}` de los partidos con puntos anulados por un bloqueo/robo
  // de día. Incluye los partidos del día SIN resultado, para avisar "no suma" antes.
  annulledMatches?: Record<string, true>;
  // `${ladrónId}:${matchId}` → robos de ese partido (víctima + monto). El ladrón ve
  // un chip "🥩 +X (a Fulano)" al lado de sus puntos en cada partido del que sacó tajada.
  stolenMatches?: Record<string, { victimId: string; amount: number }[]>;
  // jugadorId → matchId → bonus de racha cobrado en ese partido (chip "🔥 +N").
  streakMatches?: Record<string, Record<string, number>>;
}) {
  const today = todayISO();
  // Nombres por id (para mostrar a quién le robó el ladrón en cada partido).
  const nameById = useMemo(
    () => Object.fromEntries(leaderboard.map((r) => [r.id, r.name])),
    [leaderboard],
  );
  // Todas las fechas del torneo: grupos + llaves. Define la navegación día a día.
  const MATCH_DATES = useMemo(() => {
    const s = new Set(GROUP_DATES);
    for (const k of koMatches) s.add(k.date);
    return Array.from(s).sort();
  }, [koMatches]);
  const FIRST_DATE = MATCH_DATES[0];
  const LAST_DATE = MATCH_DATES[MATCH_DATES.length - 1];
  // Si hoy no hay partidos, arranca en el día más cercano dentro del torneo.
  const initial = useMemo(() => {
    if (MATCH_DATES.includes(today)) return today;
    if (today < FIRST_DATE) return FIRST_DATE;
    if (today > LAST_DATE) return LAST_DATE;
    return MATCH_DATES.find((d) => d >= today) ?? FIRST_DATE;
  }, [today, MATCH_DATES, FIRST_DATE, LAST_DATE]);

  const [date, setDate] = useState(initial);
  const [simMode, setSimMode] = useState(false);
  // Resultados simulados por matchId (solo los que el usuario tocó).
  const [sim, setSim] = useState<Record<string, SimScore>>({});

  const dayMatches = useMemo(
    () =>
      MATCHES.filter((m) => m.date === date).sort(
        (a, b) =>
          new Date(a.kickoff).getTime() - new Date(b.kickoff).getTime() ||
          a.id.localeCompare(b.id),
      ),
    [date],
  );

  // Cruces de llaves de la fecha elegida (grupos y llaves no comparten día: los grupos
  // terminan el 27/6 y las llaves arrancan el 28/6).
  const koDayMatches = useMemo(
    () =>
      koMatches
        .filter((m) => m.date === date)
        .sort(
          (a, b) =>
            new Date(a.kickoff).getTime() - new Date(b.kickoff).getTime() ||
            a.id.localeCompare(b.id, undefined, { numeric: true }),
        ),
    [koMatches, date],
  );

  const idx = MATCH_DATES.indexOf(date);
  const prev = idx > 0 ? MATCH_DATES[idx - 1] : null;
  const next = idx >= 0 && idx < MATCH_DATES.length - 1 ? MATCH_DATES[idx + 1] : null;
  const isToday = date === today;

  // Valor que se muestra en el input de un partido: lo simulado, o el oficial, o vacío.
  const fieldValue = (matchId: string, side: "home" | "away"): string => {
    const s = sim[matchId];
    if (s && s[side] !== undefined) return s[side];
    const official = resultsByMatch[matchId];
    if (official) return String(side === "home" ? official.homeGoals : official.awayGoals);
    return "";
  };

  // Resultado efectivo para la simulación de un partido (lo que se usa para puntuar).
  const effResult = (matchId: string): Result | undefined => {
    const h = fieldValue(matchId, "home");
    const a = fieldValue(matchId, "away");
    if (h === "" || a === "") return resultsByMatch[matchId];
    return { homeGoals: Number(h), awayGoals: Number(a) };
  };

  function setScore(matchId: string, side: "home" | "away", raw: string) {
    const v = clamp(raw);
    setSim((prevSim) => {
      const cur = prevSim[matchId] ?? {
        home:
          resultsByMatch[matchId] !== undefined
            ? String(resultsByMatch[matchId].homeGoals)
            : "",
        away:
          resultsByMatch[matchId] !== undefined
            ? String(resultsByMatch[matchId].awayGoals)
            : "",
      };
      return { ...prevSim, [matchId]: { ...cur, [side]: v } };
    });
  }

  // Tabla proyectada: total actual + delta de los partidos del día simulados.
  const projected = useMemo(() => {
    if (leaderboard.length === 0) return [];
    const currentRank = new Map(leaderboard.map((r, i) => [r.id, i]));
    const rows = leaderboard.map((c) => {
      let delta = 0;
      for (const m of dayMatches) {
        const preds = predictionsByMatch[m.id] ?? [];
        const mine = preds.find((p) => p.id === c.id);
        if (!mine) continue;
        const pred = effPred(mine);
        const official = resultsByMatch[m.id];
        const simRes = effResult(m.id);
        delta += matchPoints(pred, simRes) - matchPoints(pred, official);
      }
      return { ...c, delta, projected: c.total + delta };
    });
    rows.sort((a, b) => b.projected - a.projected || a.name.localeCompare(b.name, "es"));
    return rows.map((r, i) => ({
      ...r,
      move: (currentRank.get(r.id) ?? i) - i, // >0 subió, <0 bajó
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leaderboard, dayMatches, predictionsByMatch, resultsByMatch, sim]);

  const anyEdit = dayMatches.some((m) => {
    const official = resultsByMatch[m.id];
    const eff = effResult(m.id);
    if (!eff) return false;
    if (!official) return true;
    return eff.homeGoals !== official.homeGoals || eff.awayGoals !== official.awayGoals;
  });

  return (
    <section>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="wordmark text-2xl">
          Partidos {isToday ? "de hoy" : "del día"}
        </h2>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => prev && setDate(prev)}
            disabled={!prev}
            className="grid h-9 w-9 place-items-center rounded-lg border border-border text-foreground transition hover:bg-surface disabled:opacity-30"
            aria-label="Día anterior"
          >
            ‹
          </button>
          <input
            type="date"
            value={date}
            min={FIRST_DATE}
            max={LAST_DATE}
            onChange={(e) => e.target.value && setDate(e.target.value)}
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
          />
          <button
            onClick={() => next && setDate(next)}
            disabled={!next}
            className="grid h-9 w-9 place-items-center rounded-lg border border-border text-foreground transition hover:bg-surface disabled:opacity-30"
            aria-label="Día siguiente"
          >
            ›
          </button>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm capitalize text-muted">
          {fmtLong(date)}
          <span className="ml-2 normal-case text-xs text-muted/70">
            · horarios en tu zona ({userTz})
          </span>
        </p>
        {leaderboard.length > 0 && dayMatches.length > 0 && (
          <button
            onClick={() => setSimMode((s) => !s)}
            className={`rounded-lg border px-3 py-1.5 text-sm font-semibold transition ${
              simMode
                ? "border-primary bg-primary/15 text-primary"
                : "border-border text-foreground hover:bg-surface"
            }`}
          >
            {simMode ? "✕ Salir del simulador" : "🔮 Simular resultados"}
          </button>
        )}
      </div>

      {/* Tabla proyectada (modo simulación) */}
      {simMode && (
        <div className="mb-4 overflow-hidden rounded-2xl border border-primary/40 bg-surface">
          <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
            <h3 className="text-sm font-bold text-primary">
              Tabla proyectada {anyEdit ? "(con tu simulación)" : ""}
            </h3>
            {anyEdit && (
              <button
                onClick={() => setSim({})}
                className="text-xs text-muted underline hover:text-foreground"
              >
                Reiniciar
              </button>
            )}
          </div>
          <ul className="divide-y divide-border/60">
            {projected.map((r, i) => (
              <li key={r.id} className="flex items-center gap-3 px-4 py-2 text-sm">
                <span className="w-5 text-right font-bold text-muted">{i + 1}</span>
                <span className="w-5 text-center text-xs">
                  {r.move > 0 ? (
                    <span className="text-primary">▲</span>
                  ) : r.move < 0 ? (
                    <span className="text-danger">▼</span>
                  ) : (
                    <span className="text-muted/40">·</span>
                  )}
                </span>
                <span className="flex-1 truncate text-foreground">{r.name}</span>
                {r.delta !== 0 && (
                  <span
                    className={`rounded px-1.5 py-0.5 text-xs font-bold ${
                      r.delta > 0 ? "bg-primary/20 text-primary" : "bg-danger/20 text-danger"
                    }`}
                  >
                    {r.delta > 0 ? `+${r.delta}` : r.delta}
                  </span>
                )}
                <span className="w-10 text-right text-lg font-black text-foreground">
                  {r.projected}
                </span>
              </li>
            ))}
          </ul>
          <p className="border-t border-border px-4 py-2 text-[11px] text-muted">
            Editá los marcadores abajo. La simulación es tuya, no cambia los resultados
            oficiales.
          </p>
        </div>
      )}

      {dayMatches.length === 0 && koDayMatches.length === 0 ? (
        <div className="rounded-2xl border border-border bg-surface p-6 text-center text-sm text-muted">
          No hay partidos esta fecha. Elegí otro día 📅
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {dayMatches.map((m) => {
            const official = resultsByMatch[m.id];
            const result = simMode ? effResult(m.id) : official;
            const preds = predictionsByMatch[m.id] ?? [];
            return (
              <div
                key={m.id}
                className="overflow-hidden rounded-2xl border border-border bg-surface"
              >
                {/* Cabecera del partido */}
                <div className="border-b border-border px-4 py-3">
                  <div className="mb-2 flex items-start justify-between gap-3 text-xs text-muted">
                    <span className="flex shrink-0 items-center gap-1.5">
                      <span className="rounded-md bg-background px-2 py-0.5 font-semibold">
                        Grupo {m.group}
                      </span>
                      <span className="rounded-md bg-background px-2 py-0.5 font-mono font-semibold text-muted/70">
                        {m.id}
                      </span>
                    </span>
                    <div className="flex min-w-0 flex-col items-end gap-0.5 text-right">
                      <span className="font-medium text-foreground">
                        🕒 {fmtTime(m.kickoff)}
                      </span>
                      <span className="truncate">
                        {simMode
                          ? "Simulación"
                          : official
                            ? "Final"
                            : `${m.stadium} · ${m.city}`}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center justify-center gap-2 text-sm font-semibold sm:gap-3">
                    <span className="flex flex-1 items-center justify-end gap-1.5 text-right">
                      {teamFlag(m.homeCode)}{" "}
                      <span className="truncate">{teamName(m.homeCode)}</span>
                    </span>
                    {simMode ? (
                      <span className="flex shrink-0 items-center gap-1">
                        <GoalInput
                          value={fieldValue(m.id, "home")}
                          onChange={(v) => setScore(m.id, "home", v)}
                          className="h-8 w-9 rounded-md border border-border bg-background text-center font-mono text-foreground outline-none focus:border-primary"
                        />
                        <span className="text-muted">-</span>
                        <GoalInput
                          value={fieldValue(m.id, "away")}
                          onChange={(v) => setScore(m.id, "away", v)}
                          className="h-8 w-9 rounded-md border border-border bg-background text-center font-mono text-foreground outline-none focus:border-primary"
                        />
                      </span>
                    ) : official ? (
                      <span className="shrink-0 rounded-md bg-primary/15 px-2 py-0.5 font-black text-primary">
                        {official.homeGoals} - {official.awayGoals}
                      </span>
                    ) : (
                      <span className="shrink-0 text-muted">vs</span>
                    )}
                    <span className="flex flex-1 items-center gap-1.5">
                      <span className="truncate">{teamName(m.awayCode)}</span>{" "}
                      {teamFlag(m.awayCode)}
                    </span>
                  </div>
                </div>

                {/* Pronósticos de los participantes */}
                {preds.length === 0 ? (
                  <p className="px-4 py-3 text-sm text-muted">Nadie pronosticó este partido.</p>
                ) : (
                  <ul className="divide-y divide-border/60">
                    {preds.map((p) => {
                      const eff = effPred(p);
                      // Puntos NORMALES del partido: lo que vale el pronóstico contra el
                      // resultado, sin cartas. Es el badge principal.
                      const base = result ? matchPoints(eff, result) : null;
                      // Puntos REALES post-cartas (VAR, doblete, mufa…) si los tenemos.
                      const real =
                        !simMode && result ? resolvedPoints?.[p.id]?.[m.id] : undefined;
                      // Lo que aportó la carta EN este partido (VAR +2, doblete ×2, mufa…).
                      const cardDelta =
                        real !== undefined && base !== null ? real - base : 0;
                      // Bonus de racha cobrado en este partido (hito 3/5/8/12).
                      const streakBonus = !simMode
                        ? (streakMatches?.[p.id]?.[m.id] ?? 0)
                        : 0;
                      // Una carta le anula los puntos de la fecha (bloqueo/robo): aplica a todo
                      // el día, incluso a los partidos que todavía no se jugaron.
                      const annulled = !simMode && !!annulledMatches?.[`${p.id}:${m.id}`];
                      // Robo: lo que ESTE jugador le sacó a otros en este partido.
                      const loot = !simMode ? stolenMatches?.[`${p.id}:${m.id}`] : undefined;
                      return (
                        <li
                          key={p.id}
                          className="flex items-center justify-between px-4 py-2 text-sm"
                        >
                          <span className="text-foreground">{p.name}</span>
                          <div className="flex items-center gap-3">
                            {p.caldeado || p.flipped ? (
                              <span
                                className="flex items-center gap-1.5 font-mono"
                                title={
                                  p.caldeado
                                    ? `Caldeador de las tinieblas: puso ${p.homeGoals}-${p.awayGoals}, pero se le cuenta un resultado al azar`
                                    : `Piedrambre: puso ${p.homeGoals}-${p.awayGoals}, se le cuenta dado vuelta`
                                }
                              >
                                <span className="text-muted/50 line-through">
                                  {p.homeGoals}-{p.awayGoals}
                                </span>
                                <span className="text-muted/50">→</span>
                                <span className={p.caldeado ? "text-danger" : "text-muted"}>
                                  {p.caldeado ? "🤮 " : "🪨 "}
                                  {eff.homeGoals}-{eff.awayGoals}
                                </span>
                              </span>
                            ) : (
                              <span className="font-mono text-muted">
                                {eff.homeGoals} - {eff.awayGoals}
                              </span>
                            )}
                            {annulled ? (
                              <span
                                className="flex items-center gap-1 text-xs font-bold"
                                title="Una carta le anuló los puntos de esta fecha (bloqueo o robo)"
                              >
                                {base !== null && base > 0 && (
                                  <span className="font-mono text-muted/50 line-through">
                                    +{base}
                                  </span>
                                )}
                                <span className="min-w-9 rounded-md bg-background px-2 py-0.5 text-center text-muted">
                                  🚫 0
                                </span>
                              </span>
                            ) : (
                              base !== null && (
                                <span
                                  className={`min-w-9 rounded-md px-2 py-0.5 text-center text-xs font-bold ${
                                    base === 5
                                      ? "bg-primary/20 text-primary"
                                      : base === 3 || base === 4
                                        ? "bg-gold/20 text-gold"
                                        : "bg-background text-muted"
                                  }`}
                                  title="Puntos del partido (sin cartas)"
                                >
                                  +{base}
                                </span>
                              )
                            )}
                            {/* Aporte de la carta en este partido (VAR +2, doblete, mufa…). */}
                            {!annulled && cardDelta !== 0 && (
                              <span
                                className={`min-w-9 rounded-md px-2 py-0.5 text-center text-xs font-bold ${
                                  cardDelta > 0
                                    ? "bg-primary/15 text-primary"
                                    : "bg-danger/15 text-danger"
                                }`}
                                title="Lo que sumó (o restó) una carta en este partido"
                              >
                                🃏 {cardDelta > 0 ? "+" : ""}
                                {cardDelta}
                              </span>
                            )}
                            {/* Bonus de racha cobrado en este partido. */}
                            {streakBonus > 0 && (
                              <span
                                className="min-w-9 rounded-md bg-gold/15 px-2 py-0.5 text-center text-xs font-bold text-gold"
                                title="Bonus por hito de racha cobrado en este partido"
                              >
                                🔥 +{streakBonus}
                              </span>
                            )}
                            {loot && loot.length > 0 && (
                              <span
                                className="flex items-center gap-1 rounded-md bg-primary/15 px-2 py-0.5 text-xs font-bold text-primary"
                                title={loot
                                  .map((l) => `Le robó +${l.amount} a ${nameById[l.victimId] ?? "alguien"}`)
                                  .join(" · ")}
                              >
                                🥩 +{loot.reduce((a, l) => a + l.amount, 0)}
                                <span className="font-normal text-primary/80">
                                  {loot.length === 1
                                    ? `a ${nameById[loot[0].victimId] ?? "alguien"}`
                                    : `a ${loot.length} jugadores`}
                                </span>
                              </span>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            );
          })}

          {/* Cruces de llaves del día (16avos → Final), con los pronósticos de cada uno. */}
          {koDayMatches.map((m) => {
            const result = m.result;
            const preds = koPredictionsByMatch[m.id] ?? [];
            const homeName = m.home ? teamName(m.home) : m.homeLabel;
            const awayName = m.away ? teamName(m.away) : m.awayLabel;
            return (
              <div
                key={`ko-${m.id}`}
                className="overflow-hidden rounded-2xl border border-gold/40 bg-surface"
              >
                {/* Cabecera del cruce */}
                <div className="border-b border-border px-4 py-3">
                  <div className="mb-2 flex items-start justify-between gap-3 text-xs text-muted">
                    <span className="flex shrink-0 items-center gap-1.5">
                      <span className="rounded-md bg-gold/15 px-2 py-0.5 font-semibold text-gold">
                        {ROUND_LABEL[m.round]}
                      </span>
                      <span className="rounded-md bg-background px-2 py-0.5 font-mono font-semibold text-muted/70">
                        #{m.id}
                      </span>
                    </span>
                    <div className="flex min-w-0 flex-col items-end gap-0.5 text-right">
                      <span className="font-medium text-foreground">
                        🕒 {fmtTime(m.kickoff)}
                      </span>
                      <span className="truncate">
                        {result
                          ? result.penalties
                            ? "Final (pen.)"
                            : "Final"
                          : `${m.stadium} · ${m.city}`}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center justify-center gap-2 text-sm font-semibold sm:gap-3">
                    <span
                      className={`flex flex-1 items-center justify-end gap-1.5 text-right ${
                        m.winner && m.winner === m.home ? "text-primary" : ""
                      }`}
                    >
                      {m.home ? (
                        <>
                          {teamFlag(m.home)} <span className="truncate">{homeName}</span>
                        </>
                      ) : (
                        <span className="truncate text-muted">{homeName}</span>
                      )}
                    </span>
                    {result ? (
                      <span className="shrink-0 rounded-md bg-primary/15 px-2 py-0.5 font-black text-primary">
                        {result.homeGoals} - {result.awayGoals}
                      </span>
                    ) : (
                      <span className="shrink-0 text-muted">vs</span>
                    )}
                    <span
                      className={`flex flex-1 items-center gap-1.5 ${
                        m.winner && m.winner === m.away ? "text-primary" : ""
                      }`}
                    >
                      {m.away ? (
                        <>
                          <span className="truncate">{awayName}</span> {teamFlag(m.away)}
                        </>
                      ) : (
                        <span className="truncate text-muted">{awayName}</span>
                      )}
                    </span>
                  </div>
                </div>

                {/* Pronósticos de los participantes */}
                {preds.length === 0 ? (
                  <p className="px-4 py-3 text-sm text-muted">
                    {m.home && m.away
                      ? "Nadie pronosticó este cruce."
                      : "Se define con la ronda anterior."}
                  </p>
                ) : (
                  <ul className="divide-y divide-border/60">
                    {preds.map((p) => {
                      const eff = effKoPred(p);
                      const base =
                        result && m.home && m.away
                          ? knockoutPoints(eff, result, m.home, m.away)
                          : null;
                      const real = result ? resolvedPoints?.[p.id]?.[m.id] : undefined;
                      const cardDelta =
                        real !== undefined && base !== null ? real - base : 0;
                      const streakBonus = streakMatches?.[p.id]?.[m.id] ?? 0;
                      const annulled = !!annulledMatches?.[`${p.id}:${m.id}`];
                      const loot = stolenMatches?.[`${p.id}:${m.id}`];
                      return (
                        <li
                          key={p.id}
                          className="flex items-center justify-between gap-2 px-4 py-2 text-sm"
                        >
                          <span className="min-w-0 flex-1 truncate text-foreground">
                            {p.name}
                          </span>
                          <div className="flex shrink-0 items-center gap-2">
                            {p.caldeado || p.flipped ? (
                              <span
                                className="flex items-center gap-1.5 font-mono"
                                title={
                                  p.caldeado
                                    ? `Caldeador de las tinieblas: puso ${p.homeGoals}-${p.awayGoals}, pero se le cuenta un resultado al azar`
                                    : `Piedrambre: puso ${p.homeGoals}-${p.awayGoals}, se le cuenta dado vuelta`
                                }
                              >
                                <span className="text-muted/50 line-through">
                                  {p.homeGoals}-{p.awayGoals}
                                </span>
                                <span className="text-muted/50">→</span>
                                <span className={p.caldeado ? "text-danger" : "text-muted"}>
                                  {p.caldeado ? "🤮 " : "🪨 "}
                                  {eff.homeGoals}-{eff.awayGoals}
                                </span>
                              </span>
                            ) : (
                              <span className="font-mono text-muted">
                                {eff.homeGoals} - {eff.awayGoals}
                              </span>
                            )}
                            {/* A quién hace pasar (decisivo si empató en los 90'). */}
                            {eff.advance && (
                              <span
                                className="flex items-center gap-1 rounded-md bg-background px-1.5 py-0.5 text-xs text-muted"
                                title={`Hace pasar a ${teamName(eff.advance)}`}
                              >
                                🥅 {teamFlag(eff.advance)}
                              </span>
                            )}
                            {annulled ? (
                              <span
                                className="flex items-center gap-1 text-xs font-bold"
                                title="Una carta le anuló los puntos de esta fecha (bloqueo o robo)"
                              >
                                {base !== null && base > 0 && (
                                  <span className="font-mono text-muted/50 line-through">
                                    +{base}
                                  </span>
                                )}
                                <span className="min-w-9 rounded-md bg-background px-2 py-0.5 text-center text-muted">
                                  🚫 0
                                </span>
                              </span>
                            ) : (
                              base !== null && (
                                <span
                                  className={`min-w-9 rounded-md px-2 py-0.5 text-center text-xs font-bold ${
                                    base >= 6
                                      ? "bg-primary/20 text-primary"
                                      : base > 0
                                        ? "bg-gold/20 text-gold"
                                        : "bg-background text-muted"
                                  }`}
                                  title="Puntos del cruce (sin cartas)"
                                >
                                  +{base}
                                </span>
                              )
                            )}
                            {!annulled && cardDelta !== 0 && (
                              <span
                                className={`min-w-9 rounded-md px-2 py-0.5 text-center text-xs font-bold ${
                                  cardDelta > 0
                                    ? "bg-primary/15 text-primary"
                                    : "bg-danger/15 text-danger"
                                }`}
                                title="Lo que sumó (o restó) una carta en este cruce"
                              >
                                🃏 {cardDelta > 0 ? "+" : ""}
                                {cardDelta}
                              </span>
                            )}
                            {streakBonus > 0 && (
                              <span
                                className="min-w-9 rounded-md bg-gold/15 px-2 py-0.5 text-center text-xs font-bold text-gold"
                                title="Bonus por hito de racha cobrado en este cruce"
                              >
                                🔥 +{streakBonus}
                              </span>
                            )}
                            {loot && loot.length > 0 && (
                              <span
                                className="flex items-center gap-1 rounded-md bg-primary/15 px-2 py-0.5 text-xs font-bold text-primary"
                                title={loot
                                  .map(
                                    (l) =>
                                      `Le robó +${l.amount} a ${nameById[l.victimId] ?? "alguien"}`,
                                  )
                                  .join(" · ")}
                              >
                                🥩 +{loot.reduce((a, l) => a + l.amount, 0)}
                                <span className="font-normal text-primary/80">
                                  {loot.length === 1
                                    ? `a ${nameById[loot[0].victimId] ?? "alguien"}`
                                    : `a ${loot.length} jugadores`}
                                </span>
                              </span>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
