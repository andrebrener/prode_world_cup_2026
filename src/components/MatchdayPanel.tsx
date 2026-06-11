"use client";

import { useMemo, useState } from "react";
import { MATCHES, teamName, teamFlag } from "@/lib/fixtures";
import { matchPoints } from "@/lib/scoring";
import type { MatchPredictionRow } from "@/lib/db/queries";
import GoalInput from "./GoalInput";

type Result = { homeGoals: number; awayGoals: number };
type LbRow = { id: string; name: string; total: number };
type SimScore = { home: string; away: string };

// Fechas con partidos, ordenadas.
const MATCH_DATES = Array.from(new Set(MATCHES.map((m) => m.date))).sort();
const FIRST_DATE = MATCH_DATES[0];
const LAST_DATE = MATCH_DATES[MATCH_DATES.length - 1];

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
const fmtTime = (iso: string) =>
  new Date(iso).toLocaleTimeString("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  });

// Nombre de la zona horaria en la que está conectado el usuario (ej "America/Argentina/Buenos_Aires").
const userTz = Intl.DateTimeFormat().resolvedOptions().timeZone;

const clamp = (s: string) => {
  const n = parseInt(s.replace(/\D/g, ""), 10);
  if (!Number.isFinite(n)) return "";
  return String(Math.min(n, 99));
};

export default function MatchdayPanel({
  predictionsByMatch,
  resultsByMatch,
  leaderboard = [],
}: {
  predictionsByMatch: Record<string, MatchPredictionRow[]>;
  resultsByMatch: Record<string, Result>;
  leaderboard?: LbRow[];
}) {
  const today = todayISO();
  // Si hoy no hay partidos, arranca en el día más cercano dentro del torneo.
  const initial = useMemo(() => {
    if (MATCH_DATES.includes(today)) return today;
    if (today < FIRST_DATE) return FIRST_DATE;
    if (today > LAST_DATE) return LAST_DATE;
    return MATCH_DATES.find((d) => d >= today) ?? FIRST_DATE;
  }, [today]);

  const [date, setDate] = useState(initial);
  const [simMode, setSimMode] = useState(false);
  // Resultados simulados por matchId (solo los que el usuario tocó).
  const [sim, setSim] = useState<Record<string, SimScore>>({});

  const dayMatches = useMemo(
    () => MATCHES.filter((m) => m.date === date).sort((a, b) => a.id.localeCompare(b.id)),
    [date],
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
        const pred = { homeGoals: mine.homeGoals, awayGoals: mine.awayGoals };
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

      {dayMatches.length === 0 ? (
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
                    <span className="shrink-0 rounded-md bg-background px-2 py-0.5 font-semibold">
                      Grupo {m.group}
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
                      const pts = result
                        ? matchPoints(
                            { homeGoals: p.homeGoals, awayGoals: p.awayGoals },
                            result,
                          )
                        : null;
                      return (
                        <li
                          key={p.id}
                          className="flex items-center justify-between px-4 py-2 text-sm"
                        >
                          <span className="text-foreground">{p.name}</span>
                          <div className="flex items-center gap-3">
                            <span className="font-mono text-muted">
                              {p.homeGoals} - {p.awayGoals}
                            </span>
                            {pts !== null && (
                              <span
                                className={`min-w-9 rounded-md px-2 py-0.5 text-center text-xs font-bold ${
                                  pts === 5
                                    ? "bg-primary/20 text-primary"
                                    : pts === 3
                                      ? "bg-gold/20 text-gold"
                                      : "bg-background text-muted"
                                }`}
                              >
                                +{pts}
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
