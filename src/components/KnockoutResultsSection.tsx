"use client";

import { useMemo, useState, useTransition } from "react";
import { teamName, teamFlag } from "@/lib/fixtures";
import { ROUND_LABEL, type KoRound, type ResolvedKoMatch } from "@/lib/bracket";
import { updateBracketAction, saveKnockoutResultsAction } from "@/lib/actions";

const ROUND_ORDER: KoRound[] = ["R32", "R16", "QF", "SF", "3P", "F"];

type KoState = Record<
  string,
  { home: string; away: string; penalties: boolean; penWinner: string }
>;

export default function KnockoutResultsSection({
  canEdit,
  groupResultsCount,
  groupTotal,
  generated,
  matches,
}: {
  canEdit: boolean;
  groupResultsCount: number;
  groupTotal: number;
  generated: boolean;
  matches: ResolvedKoMatch[];
}) {
  const groupComplete = groupResultsCount >= groupTotal;
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  const initial = useMemo<KoState>(() => {
    const s: KoState = {};
    for (const m of matches) {
      s[m.id] = m.result
        ? {
            home: String(m.result.homeGoals),
            away: String(m.result.awayGoals),
            penalties: m.result.penalties,
            penWinner: m.result.penWinner ?? "",
          }
        : { home: "", away: "", penalties: false, penWinner: "" };
    }
    return s;
  }, [matches]);

  const [state, setState] = useState<KoState>(initial);
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");

  function updateBracket() {
    setMsg(null);
    start(async () => {
      const res = await updateBracketAction();
      if (!res.ok) setMsg(res.error ?? "No se pudo.");
      else window.location.reload();
    });
  }

  function setField(id: string, patch: Partial<KoState[string]>) {
    setState((s) => ({ ...s, [id]: { ...s[id], ...patch } }));
    setStatus("idle");
  }

  function save() {
    const results: {
      matchId: string;
      home: number;
      away: number;
      penalties: boolean;
      penWinner: string | null;
    }[] = [];
    const cleared: string[] = [];
    for (const m of matches) {
      if (!m.home || !m.away) continue;
      const v = state[m.id];
      if (v.home !== "" && v.away !== "") {
        results.push({
          matchId: m.id,
          home: Number(v.home),
          away: Number(v.away),
          penalties: v.penalties,
          penWinner: v.penalties ? v.penWinner || null : null,
        });
      } else if (m.result) {
        cleared.push(m.id);
      }
    }
    start(async () => {
      const res = await saveKnockoutResultsAction({ results, cleared });
      setStatus(res.ok ? "saved" : "error");
      if (res.ok) setTimeout(() => window.location.reload(), 500);
    });
  }

  // ----- Estado: llaves todavía no generadas -----
  if (!generated) {
    return (
      <section className="rounded-2xl border border-gold/40 bg-surface p-5">
        <h2 className="mb-1 font-bold text-gold">🗝️ Llaves / eliminatorias</h2>
        <p className="mb-4 text-sm text-muted">
          Cuando estén cargados los {groupTotal} resultados de la fase de grupos, generás
          el cuadro con un botón: los cruces se calculan solos (1°, 2° de cada grupo + los
          8 mejores terceros).
        </p>
        <button
          onClick={updateBracket}
          disabled={!canEdit || !groupComplete || pending}
          className="rounded-xl bg-gold px-5 py-2.5 font-bold text-primary-ink transition hover:brightness-110 disabled:opacity-50"
        >
          {pending ? "Calculando…" : "🗝️ Actualizar llaves"}
        </button>
        <p className="mt-2 text-xs text-muted">
          {groupComplete
            ? "Listo para generar."
            : `Faltan resultados: ${groupResultsCount}/${groupTotal} de grupos.`}
        </p>
        {msg && <p className="mt-2 text-sm text-danger">{msg}</p>}
      </section>
    );
  }

  // ----- Estado: llaves generadas, cargar resultados -----
  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-gold/40 bg-surface p-4">
        <div>
          <h2 className="font-bold text-gold">🗝️ Resultados de las llaves</h2>
          <p className="text-xs text-muted">
            Cargá el marcador (90&apos;/alargue) y, si fue a penales, quién ganó. Las rondas
            siguientes se completan solas.
          </p>
        </div>
        <button
          onClick={updateBracket}
          disabled={!canEdit || pending}
          className="rounded-xl border border-gold/50 px-4 py-2 text-sm font-semibold text-gold transition hover:bg-gold/10 disabled:opacity-50"
        >
          ↻ Re-sincronizar
        </button>
      </div>
      {msg && <p className="text-sm text-danger">{msg}</p>}

      <fieldset disabled={!canEdit || pending} className="contents">
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
                  const resolved = m.home && m.away;
                  return (
                    <div key={m.id} className="px-3 py-3 sm:px-5">
                      <div className="flex items-center gap-2">
                        <span className="w-8 shrink-0 text-xs text-muted">#{m.id}</span>
                        <div className="flex flex-1 items-center justify-end gap-2 text-right text-sm">
                          <span className="truncate">
                            {m.home ? `${teamFlag(m.home)} ${teamName(m.home)}` : m.homeLabel}
                          </span>
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          <input
                            inputMode="numeric"
                            disabled={!resolved}
                            value={v.home}
                            onChange={(e) =>
                              setField(m.id, {
                                home: e.target.value.replace(/[^0-9]/g, "").slice(0, 2),
                              })
                            }
                            placeholder="–"
                            className="h-9 w-9 rounded-lg border border-border bg-background text-center text-foreground outline-none focus:border-primary disabled:opacity-40"
                          />
                          <span className="text-muted">-</span>
                          <input
                            inputMode="numeric"
                            disabled={!resolved}
                            value={v.away}
                            onChange={(e) =>
                              setField(m.id, {
                                away: e.target.value.replace(/[^0-9]/g, "").slice(0, 2),
                              })
                            }
                            placeholder="–"
                            className="h-9 w-9 rounded-lg border border-border bg-background text-center text-foreground outline-none focus:border-primary disabled:opacity-40"
                          />
                        </div>
                        <div className="flex flex-1 items-center gap-2 text-sm">
                          <span className="truncate">
                            {m.away ? `${teamFlag(m.away)} ${teamName(m.away)}` : m.awayLabel}
                          </span>
                        </div>
                      </div>

                      {/* Penales */}
                      {resolved && (
                        <div className="mt-2 flex flex-wrap items-center gap-3 pl-10 text-xs">
                          <label className="flex items-center gap-1.5 text-muted">
                            <input
                              type="checkbox"
                              checked={v.penalties}
                              onChange={(e) =>
                                setField(m.id, { penalties: e.target.checked })
                              }
                              className="accent-gold"
                            />
                            Fue a penales
                          </label>
                          {v.penalties && (
                            <select
                              value={v.penWinner}
                              onChange={(e) => setField(m.id, { penWinner: e.target.value })}
                              className="rounded-lg border border-border bg-background px-2 py-1 text-foreground outline-none focus:border-gold"
                            >
                              <option value="">¿quién ganó?</option>
                              <option value={m.home!}>{teamName(m.home!)}</option>
                              <option value={m.away!}>{teamName(m.away!)}</option>
                            </select>
                          )}
                          {m.winner && (
                            <span className="text-primary">
                              ✓ Pasa {teamName(m.winner)}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </fieldset>

      <div className="sticky bottom-0 -mx-4 flex items-center justify-between gap-4 border-t border-border bg-background/90 px-4 py-3 backdrop-blur">
        <span className="text-sm text-muted">
          {status === "saved" && <span className="text-primary">✓ Guardado</span>}
          {status === "error" && <span className="text-danger">Error al guardar</span>}
        </span>
        <button
          onClick={save}
          disabled={!canEdit || pending}
          className="rounded-xl bg-gold px-6 py-2.5 font-bold text-primary-ink transition hover:brightness-110 disabled:opacity-50"
        >
          {pending ? "Guardando…" : "Guardar llaves"}
        </button>
      </div>
    </section>
  );
}
