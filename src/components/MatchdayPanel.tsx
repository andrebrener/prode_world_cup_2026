"use client";

import { useMemo, useState } from "react";
import { MATCHES, teamName, teamFlag } from "@/lib/fixtures";
import { matchPoints } from "@/lib/scoring";
import type { MatchPredictionRow } from "@/lib/db/queries";

type Result = { homeGoals: number; awayGoals: number };

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

export default function MatchdayPanel({
  predictionsByMatch,
  resultsByMatch,
}: {
  predictionsByMatch: Record<string, MatchPredictionRow[]>;
  resultsByMatch: Record<string, Result>;
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

  const dayMatches = useMemo(
    () => MATCHES.filter((m) => m.date === date).sort((a, b) => a.id.localeCompare(b.id)),
    [date],
  );

  const idx = MATCH_DATES.indexOf(date);
  const prev = idx > 0 ? MATCH_DATES[idx - 1] : null;
  const next = idx >= 0 && idx < MATCH_DATES.length - 1 ? MATCH_DATES[idx + 1] : null;
  const isToday = date === today;

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
      <p className="mb-4 text-sm capitalize text-muted">{fmtLong(date)}</p>

      {dayMatches.length === 0 ? (
        <div className="rounded-2xl border border-border bg-surface p-6 text-center text-sm text-muted">
          No hay partidos esta fecha. Elegí otro día 📅
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {dayMatches.map((m) => {
            const result = resultsByMatch[m.id];
            const preds = predictionsByMatch[m.id] ?? [];
            return (
              <div
                key={m.id}
                className="overflow-hidden rounded-2xl border border-border bg-surface"
              >
                {/* Cabecera del partido */}
                <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
                  <span className="rounded-md bg-background px-2 py-0.5 text-xs font-semibold text-muted">
                    Grupo {m.group}
                  </span>
                  <div className="flex flex-1 items-center justify-center gap-3 text-sm font-semibold">
                    <span className="flex items-center gap-1.5">
                      {teamFlag(m.homeCode)} {teamName(m.homeCode)}
                    </span>
                    {result ? (
                      <span className="rounded-md bg-primary/15 px-2 py-0.5 font-black text-primary">
                        {result.homeGoals} - {result.awayGoals}
                      </span>
                    ) : (
                      <span className="text-muted">vs</span>
                    )}
                    <span className="flex items-center gap-1.5">
                      {teamName(m.awayCode)} {teamFlag(m.awayCode)}
                    </span>
                  </div>
                  <span className="text-xs text-muted">
                    {result ? "Final" : m.city}
                  </span>
                </div>

                {/* Pronósticos de los participantes */}
                {preds.length === 0 ? (
                  <p className="px-4 py-3 text-sm text-muted">Nadie pronosticó este partido.</p>
                ) : (
                  <ul className="divide-y divide-border/60">
                    {preds.map((p, i) => {
                      const pts = result
                        ? matchPoints(
                            { homeGoals: p.homeGoals, awayGoals: p.awayGoals },
                            result,
                          )
                        : null;
                      return (
                        <li
                          key={i}
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
