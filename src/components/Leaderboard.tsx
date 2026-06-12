"use client";

import { useState, useTransition } from "react";
import { GROUPS, teamName, teamFlag } from "@/lib/fixtures";
import { ROUND_LABEL, type KoRound } from "@/lib/bracket";
import { fetchParticipantDetailAction } from "@/lib/actions";
import type { LeaderboardRow, ParticipantDetail } from "@/lib/db/queries";
import Avatar from "./Avatar";

const medal = ["🥇", "🥈", "🥉"];
const KO_ROUND_ORDER: KoRound[] = ["R32", "R16", "QF", "SF", "3P", "F"];

const fmtDate = (iso: string) =>
  new Date(iso + "T12:00:00").toLocaleDateString("es-AR", { day: "2-digit", month: "short" });

export default function Leaderboard({ rows }: { rows: LeaderboardRow[] }) {
  const [openRow, setOpenRow] = useState<LeaderboardRow | null>(null);
  const [detail, setDetail] = useState<ParticipantDetail | null>(null);
  const [pending, start] = useTransition();

  function open(row: LeaderboardRow) {
    setOpenRow(row);
    setDetail(null);
    start(async () => {
      const d = await fetchParticipantDetailAction(row.id);
      setDetail(d);
    });
  }

  if (rows.length === 0) {
    return (
      <div className="overflow-hidden rounded-2xl border border-border bg-surface p-8 text-center text-muted">
        Nadie jugó todavía.{" "}
        <a href="/" className="text-primary underline">
          Sé el primero →
        </a>
      </div>
    );
  }

  return (
    <>
      <div className="overflow-hidden rounded-2xl border border-border bg-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase text-muted">
              <th className="px-4 py-3">#</th>
              <th className="px-2 py-3">Jugador</th>
              <th className="hidden px-2 py-3 text-center sm:table-cell" title="Resultados exactos">🎯</th>
              <th className="hidden px-2 py-3 text-right sm:table-cell">Grupos</th>
              <th className="hidden px-2 py-3 text-right sm:table-cell">Llaves</th>
              <th className="hidden px-2 py-3 text-right sm:table-cell">Extras</th>
              <th className="px-4 py-3 text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr
                key={row.id}
                onClick={() => open(row)}
                className="cursor-pointer border-b border-border/60 transition last:border-0 hover:bg-background"
              >
                <td className="px-4 py-3 font-bold text-muted">{medal[i] ?? i + 1}</td>
                <td className="px-2 py-3 font-semibold text-foreground">
                  <span className="flex items-center gap-2">
                    <Avatar name={row.name} avatar={row.avatar} size={32} />
                    <span>
                      {row.name}
                      <span className="ml-1 text-xs text-muted">›</span>
                      {/* Desglose en móvil (las columnas se ocultan en pantallas chicas) */}
                      <span className="mt-0.5 block text-[11px] font-normal text-muted sm:hidden">
                        🎯 {row.exactCount} · G {row.matchPoints} · Ll {row.koPoints} · Ex{" "}
                        {row.extraPoints}
                      </span>
                    </span>
                  </span>
                </td>
                <td className="hidden px-2 py-3 text-center text-muted sm:table-cell">{row.exactCount}</td>
                <td className="hidden px-2 py-3 text-right text-muted sm:table-cell">{row.matchPoints}</td>
                <td className="hidden px-2 py-3 text-right text-muted sm:table-cell">{row.koPoints}</td>
                <td className="hidden px-2 py-3 text-right text-muted sm:table-cell">{row.extraPoints}</td>
                <td className="px-4 py-3 text-right text-lg font-black text-primary">
                  {row.total}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {openRow && (
        <Drawer
          row={openRow}
          loading={pending || !detail}
          detail={detail}
          onClose={() => setOpenRow(null)}
        />
      )}
    </>
  );
}

function Drawer({
  row,
  loading,
  detail,
  onClose,
}: {
  row: LeaderboardRow;
  loading: boolean;
  detail: ParticipantDetail | null;
  onClose: () => void;
}) {
  const pages: { key: string; label: string }[] = [
    ...GROUPS.map((g) => ({ key: g.letter, label: `Grupo ${g.letter}` })),
    ...(detail?.bracketGenerated ? [{ key: "KO", label: "Llaves" }] : []),
  ];
  const [page, setPage] = useState(0);
  const current = pages[Math.min(page, pages.length - 1)];

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <aside className="relative flex h-full w-full max-w-md flex-col border-l border-border bg-background shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div className="flex items-center gap-3">
            <Avatar name={row.name} avatar={row.avatar} size={44} />
            <div>
              <h3 className="wordmark text-2xl">{row.name}</h3>
              <p className="text-xs text-muted">
                Grupos {row.matchPoints} · Llaves {row.koPoints} · Extras {row.extraPoints} ·{" "}
                <span className="font-bold text-primary">Total {row.total}</span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="grid h-9 w-9 place-items-center rounded-lg border border-border text-foreground hover:bg-surface"
            aria-label="Cerrar"
          >
            ✕
          </button>
        </div>

        {loading || !detail ? (
          <div className="flex flex-1 items-center justify-center text-muted">Cargando…</div>
        ) : (
          <div className="flex flex-1 flex-col overflow-hidden">
            {/* Generales */}
            <div className="border-b border-border px-5 py-4">
              <h4 className="mb-2 text-xs font-bold uppercase tracking-wider text-gold">
                ⭐ Generales
              </h4>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <Extra label="Campeón" pick={teamLabel(detail.extras.champion)} real={teamLabel(detail.realExtras.champion)} />
                <Extra label="Subcampeón" pick={teamLabel(detail.extras.runnerUp)} real={teamLabel(detail.realExtras.runnerUp)} />
                <Extra label="Goleador" pick={detail.extras.topScorer || "—"} real={detail.realExtras.topScorer || ""} />
                <Extra label="Figura" pick={detail.extras.figure || "—"} real={detail.realExtras.figure || ""} />
              </div>
            </div>

            {/* Paginador grupo por grupo */}
            <div className="flex items-center justify-between gap-2 border-b border-border px-5 py-2.5">
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                className="grid h-8 w-8 place-items-center rounded-lg border border-border text-foreground hover:bg-surface disabled:opacity-30"
              >
                ‹
              </button>
              <span className="text-sm font-bold">{current.label}</span>
              <button
                onClick={() => setPage((p) => Math.min(pages.length - 1, p + 1))}
                disabled={page >= pages.length - 1}
                className="grid h-8 w-8 place-items-center rounded-lg border border-border text-foreground hover:bg-surface disabled:opacity-30"
              >
                ›
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-3 py-2">
              {current.key === "KO" ? (
                <KoList detail={detail} />
              ) : (
                <GroupList detail={detail} group={current.key} />
              )}
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}

function GroupList({ detail, group }: { detail: ParticipantDetail; group: string }) {
  const matches = detail.matches.filter((m) => m.group === group);
  return (
    <ul className="divide-y divide-border/60">
      {matches.map((m) => (
        <li key={m.id} className="flex items-center gap-2 px-2 py-2.5 text-sm">
          <span className="w-11 shrink-0 text-[11px] text-muted">{fmtDate(m.date)}</span>
          <span className="flex-1 truncate text-right">
            {teamName(m.homeCode)} {teamFlag(m.homeCode)}
          </span>
          <span className="shrink-0 rounded-md bg-surface px-2 py-0.5 font-mono font-bold">
            {m.pred ? `${m.pred.home}-${m.pred.away}` : "—"}
          </span>
          <span className="flex-1 truncate">
            {teamFlag(m.awayCode)} {teamName(m.awayCode)}
          </span>
          <ResultBadge real={m.real ? `${m.real.home}-${m.real.away}` : null} points={m.points} hasPred={!!m.pred} />
        </li>
      ))}
    </ul>
  );
}

function KoList({ detail }: { detail: ParticipantDetail }) {
  return (
    <div className="flex flex-col gap-3">
      {KO_ROUND_ORDER.map((round) => {
        const ms = detail.ko.filter((m) => m.round === round);
        if (ms.length === 0) return null;
        return (
          <div key={round}>
            <h5 className="mb-1 px-2 text-xs font-bold text-gold">{ROUND_LABEL[round]}</h5>
            <ul className="divide-y divide-border/60">
              {ms.map((m) => (
                <li key={m.id} className="px-2 py-2 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="flex-1 truncate text-right">
                      {m.home ? `${teamName(m.home)} ${teamFlag(m.home)}` : m.homeLabel}
                    </span>
                    <span className="shrink-0 rounded-md bg-surface px-2 py-0.5 font-mono font-bold">
                      {m.pred ? `${m.pred.home}-${m.pred.away}` : "—"}
                    </span>
                    <span className="flex-1 truncate">
                      {m.away ? `${teamFlag(m.away)} ${teamName(m.away)}` : m.awayLabel}
                    </span>
                    <ResultBadge
                      real={m.real ? `${m.real.home}-${m.real.away}${m.real.penalties ? "p" : ""}` : null}
                      points={m.points}
                      hasPred={!!m.pred}
                    />
                  </div>
                  {m.pred && (
                    <p className="mt-0.5 pr-1 text-right text-[11px] text-muted">
                      pasa: {teamName(m.pred.advance)}
                      {m.winner ? ` · real: ${teamName(m.winner)}` : ""}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

function ResultBadge({
  real,
  points,
  hasPred,
}: {
  real: string | null;
  points: number;
  hasPred: boolean;
}) {
  if (!real) return <span className="w-12 shrink-0" />;
  return (
    <span className="flex w-12 shrink-0 flex-col items-end">
      <span className="text-[10px] text-muted">{real}</span>
      {hasPred && (
        <span
          className={`rounded px-1 text-[10px] font-bold ${
            points >= 5
              ? "bg-primary/20 text-primary"
              : points > 0
                ? "bg-gold/20 text-gold"
                : "bg-surface text-muted"
          }`}
        >
          +{points}
        </span>
      )}
    </span>
  );
}

function Extra({ label, pick, real }: { label: string; pick: string; real: string }) {
  const hit = real && pick && pick === real && real !== "—";
  return (
    <div className="rounded-lg border border-border bg-surface px-2.5 py-1.5">
      <div className="text-[10px] uppercase tracking-wider text-muted">{label}</div>
      <div className={`truncate font-semibold ${hit ? "text-primary" : "text-foreground"}`}>
        {pick} {real && real !== "—" ? (hit ? "✓" : "✗") : ""}
      </div>
    </div>
  );
}

function teamLabel(code?: string | null): string {
  if (!code) return "—";
  return `${teamFlag(code)} ${teamName(code)}`;
}
