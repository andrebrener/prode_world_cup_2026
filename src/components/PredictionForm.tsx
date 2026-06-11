"use client";

import { useMemo, useState, useTransition } from "react";
import { GROUPS, MATCHES, ALL_TEAMS, teamName, teamFlag } from "@/lib/fixtures";
import { savePredictionsAction, type PredictionInput } from "@/lib/actions";
import GoalInput from "./GoalInput";

type GoalState = Record<string, { home: string; away: string }>;
type Extras = {
  champion: string;
  runnerUp: string;
  topScorer: string;
  figure: string;
};

const fmtDate = (iso: string) =>
  new Date(iso + "T12:00:00").toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "short",
  });

const fmtDeadline = (iso: string) =>
  new Date(iso).toLocaleString("es-AR", {
    day: "2-digit",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });

export default function PredictionForm({
  name,
  initialPredictions,
  initialExtras,
  hasSaved,
  locked,
  deadlineISO,
}: {
  name: string;
  initialPredictions: Record<string, { homeGoals: number; awayGoals: number }>;
  initialExtras: {
    champion?: string | null;
    runnerUp?: string | null;
    topScorer?: string | null;
    figure?: string | null;
  };
  hasSaved: boolean;
  locked: boolean;
  deadlineISO: string;
}) {
  const initialGoals = useMemo<GoalState>(() => {
    const s: GoalState = {};
    for (const m of MATCHES) {
      const p = initialPredictions[m.id];
      s[m.id] = p
        ? { home: String(p.homeGoals), away: String(p.awayGoals) }
        : { home: "", away: "" };
    }
    return s;
  }, [initialPredictions]);

  const initialExtrasState = useMemo<Extras>(
    () => ({
      champion: initialExtras.champion ?? "",
      runnerUp: initialExtras.runnerUp ?? "",
      topScorer: initialExtras.topScorer ?? "",
      figure: initialExtras.figure ?? "",
    }),
    [initialExtras],
  );

  const [goals, setGoals] = useState<GoalState>(initialGoals);
  const [extras, setExtras] = useState<Extras>(initialExtrasState);
  // Editable solo si no está cerrado. Arranca abierto solo si todavía no guardó nada.
  const [editing, setEditing] = useState(!locked && !hasSaved);
  const [pending, start] = useTransition();
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");

  const completed = useMemo(
    () => MATCHES.filter((m) => goals[m.id]?.home !== "" && goals[m.id]?.away !== "").length,
    [goals],
  );

  function setGoal(matchId: string, side: "home" | "away", value: string) {
    const clean = value.replace(/[^0-9]/g, "").slice(0, 2);
    setGoals((g) => ({ ...g, [matchId]: { ...g[matchId], [side]: clean } }));
    setStatus("idle");
  }

  function cancel() {
    setGoals(initialGoals);
    setExtras(initialExtrasState);
    setStatus("idle");
    setEditing(false);
  }

  function save() {
    const matches: PredictionInput["matches"] = [];
    for (const m of MATCHES) {
      const g = goals[m.id];
      if (g.home !== "" && g.away !== "") {
        matches.push({ matchId: m.id, home: Number(g.home), away: Number(g.away) });
      }
    }
    start(async () => {
      const res = await savePredictionsAction({
        matches,
        extras: {
          champion: extras.champion || null,
          runnerUp: extras.runnerUp || null,
          topScorer: extras.topScorer || null,
          figure: extras.figure || null,
        },
      });
      if (res.ok) {
        setStatus("saved");
        setEditing(false);
      } else {
        setStatus("error");
      }
    });
  }

  const readOnly = !editing;

  return (
    <div className="flex flex-col gap-6 pb-28">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="wordmark text-3xl">Tus pronósticos</h1>
          <p className="text-sm text-muted">
            Jugando como <span className="font-semibold text-primary">{name}</span>
          </p>
        </div>
        {/* Chip de estado */}
        {locked ? (
          <span className="rounded-full border border-danger/40 bg-danger/10 px-3 py-1 text-xs font-semibold text-danger">
            🔒 Cerrado — empezó el Mundial
          </span>
        ) : readOnly ? (
          <span className="rounded-full border border-primary/40 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
            ✓ Guardado
          </span>
        ) : (
          <span className="rounded-full border border-gold/40 bg-gold/10 px-3 py-1 text-xs font-semibold text-gold">
            ✏️ Editando
          </span>
        )}
      </header>

      {/* Aviso de deadline / cerrado */}
      {locked ? (
        <div className="rounded-2xl border border-danger/40 bg-surface p-4 text-sm text-muted">
          El Mundial ya arrancó, así que los pronósticos quedaron cerrados. Esto es lo que
          dejaste cargado.
        </div>
      ) : readOnly ? (
        <div className="rounded-2xl border border-border bg-surface p-4 text-sm text-muted">
          Tus pronósticos están guardados y cerrados. Podés editarlos hasta el{" "}
          <strong className="text-foreground">{fmtDeadline(deadlineISO)}</strong> (cuando
          arranca el Mundial). Tocá <em className="text-foreground">Editar</em> para
          cambiarlos.
        </div>
      ) : (
        <div className="rounded-2xl border border-border bg-surface p-4 text-sm text-muted">
          Completá lo que quieras y guardá. Podés volver a editar hasta el{" "}
          <strong className="text-foreground">{fmtDeadline(deadlineISO)}</strong>.
        </div>
      )}

      <fieldset disabled={readOnly} className="contents">
        {/* Extras */}
        <section className="rounded-2xl border border-gold/40 bg-surface p-5">
          <h2 className="mb-1 flex items-center gap-2 font-bold text-gold">
            ⭐ Apuestas grandes
          </h2>
          <p className="mb-4 text-xs text-muted">
            Las que más puntos dan. Goleador y figura: escribí el nombre del jugador.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <TeamSelect
              label="🏆 Campeón"
              value={extras.champion}
              onChange={(v) => {
                setExtras((e) => ({ ...e, champion: v }));
                setStatus("idle");
              }}
            />
            <TeamSelect
              label="🥈 Subcampeón"
              value={extras.runnerUp}
              onChange={(v) => {
                setExtras((e) => ({ ...e, runnerUp: v }));
                setStatus("idle");
              }}
            />
            <TextField
              label="👟 Goleador"
              placeholder="Ej: Lautaro Martínez"
              value={extras.topScorer}
              onChange={(v) => {
                setExtras((e) => ({ ...e, topScorer: v }));
                setStatus("idle");
              }}
            />
            <TextField
              label="✨ Figura del torneo"
              placeholder="Ej: Lamine Yamal"
              value={extras.figure}
              onChange={(v) => {
                setExtras((e) => ({ ...e, figure: v }));
                setStatus("idle");
              }}
            />
          </div>
        </section>

        {/* Grupos */}
        {GROUPS.map((group) => {
          const matches = MATCHES.filter((m) => m.group === group.letter);
          const done = matches.filter(
            (m) => goals[m.id]?.home !== "" && goals[m.id]?.away !== "",
          ).length;
          return (
            <section
              key={group.letter}
              className="overflow-hidden rounded-2xl border border-border bg-surface"
            >
              <div className="flex items-center justify-between border-b border-border px-5 py-3">
                <h2 className="font-bold">
                  <span className="mr-2 inline-block rounded-md bg-primary px-2 py-0.5 text-sm font-black text-primary-ink">
                    {group.letter}
                  </span>
                  Grupo {group.letter}
                </h2>
                <span className="text-xs text-muted">
                  {done}/{matches.length}
                </span>
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

      {/* Barra de acciones (inline sticky) */}
      <div className="sticky bottom-0 z-30 -mx-4 border-t border-border bg-background/90 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-3">
          <div className="text-sm">
            <span className="font-semibold text-foreground">{completed}</span>
            <span className="text-muted">/{MATCHES.length} partidos</span>
            {status === "saved" && <span className="ml-3 text-primary">✓ Guardado</span>}
            {status === "error" && (
              <span className="ml-3 text-danger">Error al guardar</span>
            )}
          </div>

          {locked ? (
            <span className="text-sm text-muted">🔒 Edición cerrada</span>
          ) : editing ? (
            <div className="flex items-center gap-2">
              {hasSaved && (
                <button
                  onClick={cancel}
                  disabled={pending}
                  className="rounded-xl border border-border px-4 py-2.5 font-semibold text-foreground transition hover:bg-surface disabled:opacity-60"
                >
                  Cancelar
                </button>
              )}
              <button
                onClick={save}
                disabled={pending}
                className="rounded-xl bg-primary px-6 py-2.5 font-bold text-primary-ink transition hover:brightness-110 disabled:opacity-60"
              >
                {pending ? "Guardando…" : "Guardar"}
              </button>
            </div>
          ) : (
            <button
              onClick={() => setEditing(true)}
              className="rounded-xl bg-primary px-6 py-2.5 font-bold text-primary-ink transition hover:brightness-110"
            >
              ✏️ Editar
            </button>
          )}
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
        className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-foreground outline-none focus:border-primary disabled:opacity-60"
      >
        <option value="">— elegir —</option>
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
  placeholder,
  value,
  onChange,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-foreground">{label}</span>
      <input
        value={value}
        placeholder={placeholder}
        maxLength={60}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-foreground outline-none focus:border-primary disabled:opacity-60"
      />
    </label>
  );
}
