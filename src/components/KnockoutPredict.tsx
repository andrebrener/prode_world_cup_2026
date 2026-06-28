"use client";

import { useMemo, useState, useTransition } from "react";
import { teamName, teamFlag } from "@/lib/fixtures";
import { ROUND_LABEL, type KoRound, type ResolvedKoMatch } from "@/lib/bracket";
import { saveKnockoutPredictionsAction } from "@/lib/actions";
import { fmtKickoffTime, fmtVenueDate } from "@/lib/format";
import GoalInput from "./GoalInput";

const ROUND_ORDER: KoRound[] = ["R32", "R16", "QF", "SF", "3P", "F"];

type PredState = Record<string, { home: string; away: string; advance: string }>;

export default function KnockoutPredict({
  matches,
  initial,
}: {
  matches: ResolvedKoMatch[];
  initial: Record<string, { homeGoals: number; awayGoals: number; advance: string }>;
}) {
  const initialState = useMemo<PredState>(() => {
    const s: PredState = {};
    for (const m of matches) {
      const p = initial[m.id];
      s[m.id] = p
        ? { home: String(p.homeGoals), away: String(p.awayGoals), advance: p.advance }
        : { home: "", away: "", advance: "" };
    }
    return s;
  }, [matches, initial]);

  const [state, setState] = useState<PredState>(initialState);
  const [pending, start] = useTransition();
  const [status, setStatus] = useState<"idle" | "saved" | "error" | "partial">(
    "idle",
  );
  // Cruces empezados pero sin completar (resaltados en rojo tras intentar guardar).
  const [missing, setMissing] = useState<Set<string>>(new Set());

  function setField(id: string, patch: Partial<PredState[string]>) {
    setState((s) => ({ ...s, [id]: { ...s[id], ...patch } }));
    setStatus("idle");
    setMissing((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }

  function save() {
    const open = matches.filter((m) => m.home && m.away && !m.result);
    // Un cruce está "empezado" si tocaste cualquier campo, y "completo" solo si
    // cargaste ambos goles Y elegiste quién gana en penales (los tres obligatorios).
    const started = open.filter((m) => {
      const v = state[m.id];
      return v.home !== "" || v.away !== "" || v.advance !== "";
    });
    const incomplete = started.filter((m) => {
      const v = state[m.id];
      return v.home === "" || v.away === "" || v.advance === "";
    });
    const complete = started.filter((m) => !incomplete.includes(m));

    // Resaltar y, si hay alguno, llevar al primero para que complete o borre.
    setMissing(new Set(incomplete.map((m) => m.id)));
    if (incomplete.length > 0) {
      document
        .getElementById(`ko-${incomplete[0].id}`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    }

    const input = complete.map((m) => {
      const v = state[m.id];
      return { matchId: m.id, home: Number(v.home), away: Number(v.away), advance: v.advance };
    });
    start(async () => {
      const res = await saveKnockoutPredictionsAction(input);
      if (!res.ok) setStatus("error");
      else setStatus(incomplete.length > 0 ? "partial" : "saved");
    });
  }

  const predictableCount = matches.filter((m) => m.home && m.away && !m.result).length;

  return (
    <section className="flex flex-col gap-4">
      <div className="rounded-2xl border border-gold/40 bg-surface p-5">
        <h2 className="mb-1 font-bold text-gold">🗝️ Llaves / eliminatorias</h2>
        <p className="text-sm text-muted">
          En cada cruce tenés que cargar <strong>las 3 cosas, sí o sí</strong>: el
          marcador de los 90&apos;/alargue <strong>y</strong> quién gana en penales
          (siempre, por si termina empatado). Si te falta alguna, ese cruce{" "}
          <strong>no se guarda</strong>. Cada cruce se cierra cuando se carga su
          resultado; las rondas siguientes aparecen a medida que se definen.
        </p>
      </div>

      {ROUND_ORDER.map((round) => {
        const rms = matches.filter((m) => m.round === round);
        if (rms.length === 0) return null;
        return (
          <div
            key={round}
            className="overflow-hidden rounded-2xl border border-border bg-surface"
          >
            <div className="border-b border-border px-5 py-3 font-bold">
              {ROUND_LABEL[round]}
            </div>
            <div className="divide-y divide-border">
              {rms.map((m) => {
                const v = state[m.id];
                const resolved = !!(m.home && m.away);
                const closed = !!m.result;
                if (!resolved) {
                  return (
                    <div key={m.id} className="px-5 py-3 text-sm text-muted">
                      <div className="flex items-center gap-2 text-[11px]">
                        <span className="w-8 shrink-0">#{m.id}</span>
                        <span className="shrink-0 font-medium text-foreground">
                          🕒 {fmtKickoffTime(m.kickoff)} · {fmtVenueDate(m.date)}
                        </span>
                        <span className="truncate">
                          📍 {m.stadium} · {m.city}
                        </span>
                      </div>
                      <div className="mt-1 pl-10">
                        {m.homeLabel} vs {m.awayLabel} — se define con la ronda anterior
                      </div>
                    </div>
                  );
                }
                const needsAdvance = missing.has(m.id);
                return (
                  <div
                    key={m.id}
                    id={`ko-${m.id}`}
                    className={`px-3 py-3 sm:px-5 ${
                      needsAdvance ? "bg-danger/10 ring-1 ring-inset ring-danger/50" : ""
                    }`}
                  >
                    {/* Fecha · hora · sede */}
                    <div className="mb-2 flex items-center justify-between gap-2 pl-10 text-[11px] text-muted">
                      <span className="shrink-0 font-medium text-foreground">
                        🕒 {fmtKickoffTime(m.kickoff)} · {fmtVenueDate(m.date)}
                      </span>
                      <span className="truncate text-right">
                        📍 {m.stadium} · {m.city}
                      </span>
                    </div>
                    {/* Marcador */}
                    <div className="flex items-center gap-2">
                      <span className="w-8 shrink-0 text-xs text-muted">#{m.id}</span>
                      <div className="flex flex-1 items-center justify-end gap-2 text-right text-sm">
                        <span className="truncate">{teamName(m.home!)}</span>
                        <span className="text-base">{teamFlag(m.home!)}</span>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <GoalInput
                          value={v.home}
                          disabled={closed}
                          onChange={(val) => setField(m.id, { home: val })}
                          className="h-9 w-9 rounded-lg border border-border bg-background text-center text-foreground outline-none focus:border-primary disabled:opacity-40"
                        />
                        <span className="text-muted">-</span>
                        <GoalInput
                          value={v.away}
                          disabled={closed}
                          onChange={(val) => setField(m.id, { away: val })}
                          className="h-9 w-9 rounded-lg border border-border bg-background text-center text-foreground outline-none focus:border-primary disabled:opacity-40"
                        />
                      </div>
                      <div className="flex flex-1 items-center gap-2 text-sm">
                        <span className="text-base">{teamFlag(m.away!)}</span>
                        <span className="truncate">{teamName(m.away!)}</span>
                      </div>
                    </div>

                    {/* Selector de quién pasa */}
                    {closed ? (
                      <div className="mt-1 pl-10 text-xs text-muted">
                        🔒 Cerrado · Oficial: {m.result!.homeGoals}-{m.result!.awayGoals}
                        {m.result!.penalties && m.winner
                          ? ` (pen. ${teamName(m.winner)})`
                          : ""}
                      </div>
                    ) : (
                      <div className="mt-3 text-center">
                        <span
                          className={`block text-xs font-semibold ${
                            needsAdvance ? "text-danger" : "text-muted"
                          }`}
                        >
                          🥅 ¿Quién gana si hay penales?{" "}
                          <span className={needsAdvance ? "text-danger" : "text-muted"}>
                            (obligatorio)
                          </span>
                        </span>
                        <div className="mx-auto mt-2 flex w-fit flex-wrap justify-center gap-2">
                          <AdvanceButton
                            code={m.home!}
                            selected={v.advance === m.home}
                            onClick={() => setField(m.id, { advance: m.home! })}
                          />
                          <AdvanceButton
                            code={m.away!}
                            selected={v.advance === m.away}
                            onClick={() => setField(m.id, { advance: m.away! })}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      <div className="sticky bottom-0 z-30 -mx-4 flex items-center justify-between gap-4 border-t border-border bg-background/90 px-4 py-3 backdrop-blur">
        <span className="text-sm text-muted">
          {predictableCount} cruces abiertos
          {status === "saved" && <span className="ml-3 text-primary">✓ Guardado</span>}
          {status === "error" && <span className="ml-3 text-danger">Error</span>}
          {status === "partial" && (
            <span className="ml-3 text-danger">
              ⚠️ {missing.size} cruce{missing.size > 1 ? "s" : ""} sin guardar: falta
              marcador y/o penales (en rojo)
            </span>
          )}
        </span>
        <button
          onClick={save}
          disabled={pending || predictableCount === 0}
          className="rounded-xl bg-gold px-6 py-2.5 font-bold text-primary-ink transition hover:brightness-110 disabled:opacity-50"
        >
          {pending ? "Guardando…" : "Guardar llaves"}
        </button>
      </div>
    </section>
  );
}

function AdvanceButton({
  code,
  selected,
  onClick,
}: {
  code: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition ${
        selected
          ? "border-primary bg-primary text-primary-ink"
          : "border-border bg-background text-foreground hover:border-primary/60"
      }`}
    >
      <span>{teamFlag(code)}</span>
      <span className="max-w-[8rem] truncate">{teamName(code)}</span>
      {selected && <span>✓</span>}
    </button>
  );
}

