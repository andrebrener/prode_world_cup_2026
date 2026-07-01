"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { GROUPS, teamName, teamFlag } from "@/lib/fixtures";
import { ROUND_LABEL, type KoRound } from "@/lib/bracket";
import { fetchParticipantDetailAction } from "@/lib/actions";
import type { LeaderboardRow, ParticipantDetail } from "@/lib/db/queries";
import Avatar, { AvatarFill } from "./Avatar";

const medal = ["🥇", "🥈", "🥉"];
const KO_ROUND_ORDER: KoRound[] = ["R32", "R16", "QF", "SF", "3P", "F"];

const fmtDate = (iso: string) =>
  new Date(iso + "T12:00:00").toLocaleDateString("es-AR", { day: "2-digit", month: "short" });

/** Llama de racha: crece y titila según la racha en curso. */
function StreakFlame({ current }: { current: number }) {
  if (current <= 0) return <span className="text-muted">—</span>;
  const flames = current >= 8 ? "🔥🔥🔥" : current >= 5 ? "🔥🔥" : "🔥";
  return (
    <span title={`Racha de ${current} partido${current === 1 ? "" : "s"} sumando`}>
      <span className={current >= 3 ? "fun-flicker" : ""}>{flames}</span>
      <span className="ml-1 font-bold text-foreground">{current}</span>
    </span>
  );
}

// Descripción del efecto de cada defensa/buff del día (el nombre lo pone el mazo).
const DAY_CARD_DESC: Record<string, string> = {
  escudo: "bloquea todos los ataques de hoy",
  espejito: "todos los ataques de hoy rebotan",
  aguante: "la racha aguanta los ceros de hoy",
  var: "+2 a todos sus partidos de hoy con puntos",
};

/** Badges de efectos activos / pendientes de un jugador (modo Diversión). */
function FunBadges({ row }: { row: LeaderboardRow }) {
  if (!row.fun) return null;
  const pending = row.fun.pendingEffects.map((e, i) => {
    const where = e.matchId ? `para el partido ${e.matchId}` : `para los partidos de hoy`;
    const title = e.fromName ? `${e.name} de ${e.fromName} ${where}` : `${e.name} ${where}`;
    return (
      <span key={`p${i}`} title={title} className="fun-float inline-block cursor-help">
        {e.emoji}
      </span>
    );
  });
  const dayCards = row.fun.activeDayCards.map((s) => (
    <span
      key={s.cardType}
      title={`${s.name} activo: ${DAY_CARD_DESC[s.cardType] ?? ""}`}
      className="cursor-help"
    >
      {s.emoji}
    </span>
  ));
  if (pending.length === 0 && dayCards.length === 0) return null;
  return <span className="ml-1 inline-flex gap-0.5 text-xs">{dayCards}{pending}</span>;
}

const fmtDelta = (n: number) =>
  n > 0 ? `+${n}` : `${n}`;

export default function Leaderboard({
  rows,
  meId,
  poolId,
}: {
  rows: LeaderboardRow[];
  meId?: string;
  poolId?: string;
}) {
  const fun = rows.some((r) => r.fun);
  const [openRow, setOpenRow] = useState<LeaderboardRow | null>(null);
  // Lightbox: click en una foto la abre a tamaño real (sin abrir el drawer).
  const [photo, setPhoto] = useState<{ src: string; name: string } | null>(null);
  const [detail, setDetail] = useState<ParticipantDetail | null>(null);
  const [pending, start] = useTransition();

  function open(row: LeaderboardRow) {
    setOpenRow(row);
    setDetail(null);
    start(async () => {
      const d = await fetchParticipantDetailAction(row.id, poolId);
      setDetail(d);
    });
  }

  if (rows.length === 0) {
    return (
      <div className="overflow-hidden rounded-2xl border border-border bg-surface p-8 text-center text-muted">
        Nadie jugó todavía.{" "}
        <Link href="/" className="text-primary underline">
          Sé el primero →
        </Link>
      </div>
    );
  }

  return (
    <>
      <div className="overflow-hidden rounded-2xl border border-border bg-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase text-muted">
              <th className="w-12 px-0 py-3 sm:w-14" aria-label="Foto y posición"></th>
              <th className="px-2 py-3">Jugador</th>
              <th className="hidden px-2 py-3 text-right sm:table-cell">Grupos</th>
              <th className="hidden px-2 py-3 text-right sm:table-cell">Llaves</th>
              <th className="hidden px-2 py-3 text-right sm:table-cell">Extras</th>
              {fun && (
                <>
                  <th className="px-2 py-3 text-center" title="Racha de partidos sumando">
                    🔥
                  </th>
                  <th
                    className="hidden px-2 py-3 text-right sm:table-cell"
                    title="Puntos que movieron TUS cartas"
                  >
                    🃏
                  </th>
                  <th
                    className="hidden px-2 py-3 text-right sm:table-cell"
                    title="Puntos que te movieron los ataques de otros"
                  >
                    💥
                  </th>
                  <th
                    className="hidden px-2 py-3 text-right sm:table-cell"
                    title="Puntos por hitos de racha"
                  >
                    ⚡
                  </th>
                  <th
                    className="hidden px-2 py-3 text-right sm:table-cell"
                    title="Total solo con resultados reales: sin cartas, sin rachas"
                  >
                    Puro
                  </th>
                </>
              )}
              <th className="px-2 py-3 text-right sm:px-4">Total</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => {
              const me = !!meId && row.id === meId;
              return (
              <tr
                key={row.id}
                onClick={() => open(row)}
                className={`cursor-pointer border-b border-border/60 transition last:border-0 hover:bg-background ${
                  me ? "bg-primary/[0.07]" : ""
                }`}
              >
                {/* Foto full-bleed con la posición superpuesta (sin columna #).
                    El alto fijo del bloque dicta la altura de la fila: absolute
                    inset-0 directo en el td no funciona en tablas. */}
                <td className={`w-14 p-0 align-middle sm:w-16 ${me ? "border-l-[3px] border-primary" : ""}`}>
                  <div
                    className="relative h-14 w-14 sm:h-16 sm:w-16"
                    onClick={(e) => {
                      const src = row.fun?.overlay?.avatar?.dataUrl ?? row.avatar;
                      if (src) {
                        e.stopPropagation();
                        setPhoto({ src, name: row.name });
                      }
                    }}
                  >
                  <div className="absolute inset-0 overflow-hidden">
                    <AvatarFill
                      name={row.name}
                      avatar={row.fun?.overlay?.avatar?.dataUrl ?? row.avatar}
                    />
                  </div>
                  {/* Medalla/posición fuera del clip para que no se recorte */}
                  <span className="absolute bottom-0 left-0">
                    <span className="grid place-items-center rounded-md bg-black/75 px-1 py-px text-[10px] font-black leading-tight text-white">
                      {medal[i] ?? i + 1}
                    </span>
                  </span>
                  </div>
                </td>
                <td className="min-w-0 px-3 py-3 font-semibold text-foreground">
                  <span className="block min-w-0">
                    <span className="block" style={{ overflowWrap: "anywhere", wordBreak: "break-word" }}>
                      {row.name}
                      {me && (
                        <span className="ml-1.5 hidden rounded-md bg-primary px-1.5 py-px align-middle text-[10px] font-black uppercase tracking-wide text-primary-ink sm:inline-block">
                          Vos
                        </span>
                      )}
                      {row.fun?.overlay?.nickname && (
                        <span
                          className="fun-text ml-1 font-black"
                          title={`Bautizado por ${row.fun.overlay.nickname.byName}`}
                        >
                          «{row.fun.overlay.nickname.text}»
                        </span>
                      )}
                      <FunBadges row={row} />
                      <span className="ml-1 text-xs text-muted">›</span>
                      {row.fun?.overlay?.message && (
                        <span
                          className="mt-0.5 block text-[11px] font-normal italic text-gold"
                          title={`Fijado por ${row.fun.overlay.message.byName}`}
                        >
                          🎤 “{row.fun.overlay.message.text}” — {row.fun.overlay.message.byName}
                        </span>
                      )}
                      {/* Desglose en móvil (las columnas se ocultan en pantallas chicas) */}
                      <span className="mt-0.5 block text-[11px] font-normal text-muted sm:hidden">
                        G {row.matchPoints} · Ll {row.koPoints} · Ex{" "}
                        {row.extraPoints}
                        {row.fun && (
                          <>
                            {row.fun.cardSelfDelta ? ` · 🃏 ${fmtDelta(row.fun.cardSelfDelta)}` : ""}
                            {row.fun.attackDelta ? ` · 💥 ${fmtDelta(row.fun.attackDelta)}` : ""}
                            {row.fun.streakBonus ? ` · ⚡ +${row.fun.streakBonus}` : ""} · Puro{" "}
                            {row.fun.pureTotal}
                          </>
                        )}
                      </span>
                    </span>
                  </span>
                </td>
                <td className="hidden px-2 py-3 text-right text-muted sm:table-cell">{row.matchPoints}</td>
                <td className="hidden px-2 py-3 text-right text-muted sm:table-cell">{row.koPoints}</td>
                <td className="hidden px-2 py-3 text-right text-muted sm:table-cell">{row.extraPoints}</td>
                {fun && (
                  <>
                    <td className="px-2 py-3 text-center text-sm">
                      <StreakFlame current={row.fun?.streakCurrent ?? 0} />
                    </td>
                    <td
                      className={`hidden px-2 py-3 text-right font-bold sm:table-cell ${
                        (row.fun?.cardSelfDelta ?? 0) < 0 ? "text-danger" : "text-muted"
                      }`}
                      title="Puntos que movieron TUS cartas"
                    >
                      {row.fun?.cardSelfDelta ? fmtDelta(row.fun.cardSelfDelta) : "—"}
                    </td>
                    <td
                      className={`hidden px-2 py-3 text-right font-bold sm:table-cell ${
                        (row.fun?.attackDelta ?? 0) < 0 ? "text-danger" : "text-muted"
                      }`}
                      title="Puntos que te movieron los ataques de otros"
                    >
                      {row.fun?.attackDelta ? fmtDelta(row.fun.attackDelta) : "—"}
                    </td>
                    <td
                      className="hidden px-2 py-3 text-right font-bold text-gold sm:table-cell"
                      title="Puntos por hitos de racha"
                    >
                      {row.fun?.streakBonus ? `+${row.fun.streakBonus}` : "—"}
                    </td>
                    <td
                      className="hidden px-2 py-3 text-right text-muted sm:table-cell"
                      title="Total solo con resultados reales: sin cartas, sin rachas"
                    >
                      {row.fun?.pureTotal ?? 0}
                    </td>
                  </>
                )}
                <td className="whitespace-nowrap px-2 py-3 text-right text-lg font-black text-primary sm:px-4">
                  {row.total}
                </td>
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Leyenda de columnas (los headers son emojis: en touch no hay tooltip). */}
      {fun && (
        <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 px-1 text-[11px] text-muted">
          <li>🔥 racha de partidos sumando</li>
          <li>🃏 lo que movieron tus cartas</li>
          <li>💥 lo que te mandaron los ataques de otros</li>
          <li>⚡ puntos por hitos de racha</li>
          <li>Puro: total sin cartas ni rachas</li>
        </ul>
      )}

      {/* Lightbox de foto a tamaño real */}
      {photo && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm"
          onClick={() => setPhoto(null)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={photo.src}
            alt={photo.name}
            className="max-h-[85vh] max-w-[92vw] rounded-2xl object-contain shadow-2xl"
          />
        </div>
      )}

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
          <div className="flex items-center gap-4">
            <span className="fun-gradient shrink-0 rounded-full p-[3px]">
              <Avatar
                name={row.name}
                avatar={row.fun?.overlay?.avatar?.dataUrl ?? row.avatar}
                size={96}
                className="border-2 border-background"
              />
            </span>
            <div>
              <h3 className="wordmark text-2xl">
                {row.name}
                {row.fun?.overlay?.nickname && (
                  <span className="fun-text ml-1 font-black">
                    «{row.fun.overlay.nickname.text}»
                  </span>
                )}
              </h3>
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
          <PredScore
            pred={m.pred}
            caldeado={m.caldeado}
            flipped={m.flipped}
          />
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
                    <PredScore
                      pred={m.pred}
                      caldeado={m.caldeado}
                      flipped={m.flipped}
                    />
                    <span className="flex-1 truncate">
                      {m.away ? `${teamFlag(m.away)} ${teamName(m.away)}` : m.awayLabel}
                    </span>
                    <ResultBadge
                      real={m.real ? `${m.real.home}-${m.real.away}${m.real.penalties ? "p" : ""}` : null}
                      points={m.points}
                      hasPred={!!m.pred}
                    />
                  </div>
                  {(m.caldeado ?? m.pred) && (
                    <p className="mt-0.5 pr-1 text-right text-[11px] text-muted">
                      pasa: {teamName((m.caldeado ?? m.pred)!.advance)}
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

/**
 * Marcador pronosticado en el drawer. Si el Caldeador lo pisó, muestra el
 * resultado al azar (🤮) en vez del pronóstico real; la Piedrambre lo da vuelta (🪨).
 */
function PredScore({
  pred,
  caldeado,
  flipped,
}: {
  pred: { home: number; away: number } | null;
  caldeado?: { home: number; away: number };
  flipped?: boolean;
}) {
  // Caldeador (o Piedrambre): mostramos lo que PUSO tachado y, al lado, el que CUENTA.
  if (caldeado || (flipped && pred)) {
    const shown = caldeado
      ? { home: caldeado.home, away: caldeado.away }
      : { home: pred!.away, away: pred!.home }; // flip
    return (
      <span
        className="flex shrink-0 items-center gap-1 font-mono"
        title={
          caldeado
            ? `Caldeador de las tinieblas: puso ${
                pred ? `${pred.home}-${pred.away}` : "—"
              }, se le cuenta un resultado al azar`
            : `Piedrambre: puso ${pred!.home}-${pred!.away}, se le cuenta dado vuelta`
        }
      >
        {pred && (
          <span className="text-[11px] text-muted/50 line-through">
            {pred.home}-{pred.away}
          </span>
        )}
        <span className="text-muted/50">→</span>
        <span
          className={`rounded-md px-2 py-0.5 font-bold ${
            caldeado ? "bg-danger/15 text-danger" : "bg-surface"
          }`}
        >
          {caldeado ? "🤮 " : "🪨 "}
          {shown.home}-{shown.away}
        </span>
      </span>
    );
  }
  return (
    <span className="shrink-0 rounded-md bg-surface px-2 py-0.5 font-mono font-bold">
      {pred ? `${pred.home}-${pred.away}` : "—"}
    </span>
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
