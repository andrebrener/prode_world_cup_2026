"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import {
  GROUPS,
  MATCHES,
  ALL_TEAMS,
  teamName,
  teamFlag,
} from "@/lib/fixtures";
import { saveResultsBatchAction } from "@/lib/actions";
import GoalInput from "./GoalInput";

type GoalState = Record<string, { home: string; away: string }>;

const fmtDate = (iso: string) =>
  new Date(iso + "T12:00:00").toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "short",
  });

export default function ResultsEditor({
  canEdit,
  initialResults,
  initialTournament,
}: {
  canEdit: boolean;
  initialResults: Record<string, { homeGoals: number; awayGoals: number }>;
  initialTournament: {
    champion?: string | null;
    runnerUp?: string | null;
    topScorer?: string | null;
    figure?: string | null;
  };
}) {
  const initialGoals = useMemo<GoalState>(() => {
    const s: GoalState = {};
    for (const m of MATCHES) {
      const r = initialResults[m.id];
      s[m.id] = r
        ? { home: String(r.homeGoals), away: String(r.awayGoals) }
        : { home: "", away: "" };
    }
    return s;
  }, [initialResults]);

  const [goals, setGoals] = useState<GoalState>(initialGoals);
  const [tournament, setTournament] = useState({
    champion: initialTournament.champion ?? "",
    runnerUp: initialTournament.runnerUp ?? "",
    topScorer: initialTournament.topScorer ?? "",
    figure: initialTournament.figure ?? "",
  });
  const [pending, start] = useTransition();
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");

  const loaded = useMemo(
    () => MATCHES.filter((m) => goals[m.id]?.home !== "" && goals[m.id]?.away !== "").length,
    [goals],
  );

  function setGoal(matchId: string, side: "home" | "away", value: string) {
    const clean = value.replace(/[^0-9]/g, "").slice(0, 2);
    setGoals((g) => ({ ...g, [matchId]: { ...g[matchId], [side]: clean } }));
    setStatus("idle");
  }

  function save() {
    const results: { matchId: string; home: number; away: number }[] = [];
    const cleared: string[] = [];
    for (const m of MATCHES) {
      const g = goals[m.id];
      const had = initialResults[m.id];
      if (g.home !== "" && g.away !== "") {
        results.push({ matchId: m.id, home: Number(g.home), away: Number(g.away) });
      } else if (had) {
        cleared.push(m.id);
      }
    }
    start(async () => {
      const res = await saveResultsBatchAction({
        results,
        cleared,
        tournament: {
          champion: tournament.champion || null,
          runnerUp: tournament.runnerUp || null,
          topScorer: tournament.topScorer || null,
          figure: tournament.figure || null,
        },
      });
      setStatus(res.ok ? "saved" : "error");
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <header>
        <p className="mb-1 text-sm font-semibold uppercase tracking-widest text-primary">
          Lo que pasó de verdad
        </p>
        <h1 className="wordmark text-4xl">
          Resultados <span className="text-primary">oficiales</span>
        </h1>
        <p className="mt-2 text-sm text-muted">
          Acá van los marcadores <strong className="text-foreground">reales</strong> de
          cada partido, no los pronósticos. Se completan a medida que se van jugando.
          Cualquiera del grupo puede cargarlos y, al guardar, la tabla se recalcula sola.
        </p>
      </header>

      {!canEdit && (
        <div className="rounded-2xl border border-gold/40 bg-surface p-4 text-sm text-gold">
          Para cargar resultados primero{" "}
          <Link href="/" className="underline">
            ingresá tu nombre
          </Link>
          .
        </div>
      )}

      <fieldset disabled={!canEdit || pending} className="contents">
        {/* Resultado del torneo */}
        <section className="rounded-2xl border border-gold/40 bg-surface p-5">
          <h2 className="mb-3 font-bold text-gold">⭐ Resultado del torneo</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <TeamSelect
              label="🏆 Campeón"
              value={tournament.champion}
              onChange={(v) => {
                setTournament((t) => ({ ...t, champion: v }));
                setStatus("idle");
              }}
            />
            <TeamSelect
              label="🥈 Subcampeón"
              value={tournament.runnerUp}
              onChange={(v) => {
                setTournament((t) => ({ ...t, runnerUp: v }));
                setStatus("idle");
              }}
            />
            <TextField
              label="👟 Goleador"
              value={tournament.topScorer}
              onChange={(v) => {
                setTournament((t) => ({ ...t, topScorer: v }));
                setStatus("idle");
              }}
            />
            <TextField
              label="✨ Figura"
              value={tournament.figure}
              onChange={(v) => {
                setTournament((t) => ({ ...t, figure: v }));
                setStatus("idle");
              }}
            />
          </div>
        </section>

        {/* Partidos por grupo */}
        {GROUPS.map((group) => {
          const matches = MATCHES.filter((m) => m.group === group.letter);
          return (
            <section
              key={group.letter}
              className="overflow-hidden rounded-2xl border border-border bg-surface"
            >
              <div className="border-b border-border px-5 py-3 font-bold">
                <span className="mr-2 inline-block rounded-md bg-primary px-2 py-0.5 text-sm font-black text-primary-ink">
                  {group.letter}
                </span>
                Grupo {group.letter}
              </div>
              <div className="divide-y divide-border">
                {matches.map((m) => (
                  <div key={m.id} className="flex items-center gap-2 px-3 py-2.5 sm:px-5">
                    <div className="w-16 shrink-0 text-[11px] leading-tight text-muted">
                      {fmtDate(m.date)}
                    </div>
                    <div className="flex flex-1 items-center justify-end gap-2 text-right text-sm">
                      <span className="truncate">{teamName(m.homeCode)}</span>
                      <span className="text-base">{teamFlag(m.homeCode)}</span>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <GoalInput
                        value={goals[m.id]?.home ?? ""}
                        onChange={(v) => setGoal(m.id, "home", v)}
                      />
                      <span className="text-muted">-</span>
                      <GoalInput
                        value={goals[m.id]?.away ?? ""}
                        onChange={(v) => setGoal(m.id, "away", v)}
                      />
                    </div>
                    <div className="flex flex-1 items-center gap-2 text-sm">
                      <span className="text-base">{teamFlag(m.awayCode)}</span>
                      <span className="truncate">{teamName(m.awayCode)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          );
        })}
      </fieldset>

      {/* Barra de guardado (inline) */}
      <div className="sticky bottom-0 -mx-4 border-t border-border bg-background/90 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-3">
          <div className="text-sm">
            <span className="font-semibold text-foreground">{loaded}</span>
            <span className="text-muted">/{MATCHES.length} cargados</span>
            {status === "saved" && <span className="ml-3 text-primary">✓ Guardado</span>}
            {status === "error" && (
              <span className="ml-3 text-danger">Error al guardar</span>
            )}
          </div>
          <button
            onClick={save}
            disabled={!canEdit || pending}
            className="rounded-xl bg-primary px-6 py-2.5 font-bold text-primary-ink transition hover:brightness-110 disabled:opacity-60"
          >
            {pending ? "Guardando…" : "Guardar resultados"}
          </button>
        </div>
      </div>
    </div>
  );
}

function TeamSelect({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-foreground">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-foreground outline-none focus:border-primary"
      >
        <option value="">— sin definir —</option>
        {ALL_TEAMS.map((t) => (
          <option key={t.code} value={t.code}>
            {t.flag} {t.name}
          </option>
        ))}
      </select>
    </label>
  );
}

function TextField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-foreground">{label}</span>
      <input
        value={value}
        maxLength={60}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-foreground outline-none focus:border-primary"
      />
    </label>
  );
}
