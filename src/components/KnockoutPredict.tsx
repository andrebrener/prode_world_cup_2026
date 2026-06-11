"use client";

import { useMemo, useState, useTransition } from "react";
import { teamName, teamFlag } from "@/lib/fixtures";
import { ROUND_LABEL, type KoRound, type ResolvedKoMatch } from "@/lib/bracket";
import { saveKnockoutPredictionsAction } from "@/lib/actions";
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
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");

  function setField(id: string, patch: Partial<PredState[string]>) {
    setState((s) => ({ ...s, [id]: { ...s[id], ...patch } }));
    setStatus("idle");
  }

  function save() {
    const input = matches
      .filter((m) => m.home && m.away && !m.result)
      .map((m) => ({ m, v: state[m.id] }))
      .filter(({ v }) => v.home !== "" && v.away !== "" && v.advance !== "")
      .map(({ m, v }) => ({
        matchId: m.id,
        home: Number(v.home),
        away: Number(v.away),
        advance: v.advance,
      }));
    start(async () => {
      const res = await saveKnockoutPredictionsAction(input);
      setStatus(res.ok ? "saved" : "error");
    });
  }

  const predictableCount = matches.filter((m) => m.home && m.away && !m.result).length;

  return (
    <section className="flex flex-col gap-4">
      <div className="rounded-2xl border border-gold/40 bg-surface p-5">
        <h2 className="mb-1 font-bold text-gold">🗝️ Llaves / eliminatorias</h2>
        <p className="text-sm text-muted">
          Pon&eacute; el marcador de los 90&apos;/alargue y, además, elegí{" "}
          <strong>quién gana si hay penales</strong> (siempre, por si ese cruce termina
          empatado). Cada cruce se cierra cuando se carga su resultado. Las rondas
          siguientes aparecen a medida que se definen.
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
                    <div
                      key={m.id}
                      className="flex items-center gap-2 px-5 py-3 text-sm text-muted"
                    >
                      <span className="w-8 shrink-0 text-xs">#{m.id}</span>
                      <span>
                        {m.homeLabel} vs {m.awayLabel} — se define con la ronda anterior
                      </span>
                    </div>
                  );
                }
                return (
                  <div key={m.id} className="px-3 py-3 sm:px-5">
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
                        <span className="block text-xs font-semibold text-muted">
                          🥅 ¿Quién gana si hay penales?
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

