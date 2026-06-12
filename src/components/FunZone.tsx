"use client";

// Modo Diversión — panel de cartas: sorteo del día, mano y actividad.
// El sorteo es secreto hasta reclamar: el server recién revela la carta en la
// respuesta de claimDailyCardAction, y acá la mostramos con flip + confeti.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import confetti from "canvas-confetti";
import { claimDailyCardAction, playCardAction } from "@/lib/actions";
import {
  CARD_CATALOG,
  RARITY_LABEL,
  MAX_HELD_CARDS,
  type CardDef,
  type CardRarity,
  type CardType,
} from "@/lib/cardCatalog";
import type { FunState } from "@/lib/db/queries";
import Avatar from "./Avatar";
import LottieFX from "./LottieFX";

export type FunMember = { id: string; name: string; avatar: string | null };

const RARITY_STYLE: Record<CardRarity, { ring: string; text: string; glow: string }> = {
  comun: { ring: "border-[#00e5ff66]", text: "text-[#7ee7f4]", glow: "" },
  rara: { ring: "border-[#8b3cff99]", text: "text-[#c9a2ff]", glow: "shadow-[0_0_24px_#8b3cff44]" },
  legendaria: {
    ring: "border-[#ffd24a]",
    text: "text-gold",
    glow: "shadow-[0_0_32px_#ffd24a55]",
  },
};

function burst(rarity: CardRarity) {
  const power = rarity === "legendaria" ? 3 : rarity === "rara" ? 2 : 1;
  confetti({
    particleCount: 60 * power,
    spread: 55 + 25 * power,
    startVelocity: 35 + 10 * power,
    origin: { y: 0.6 },
    colors: ["#ff3d8b", "#8b3cff", "#00e5ff", "#ffd24a", "#ffffff"],
  });
  if (rarity === "legendaria") {
    // Lluvia dorada extra para el 10% más fino.
    setTimeout(() => {
      confetti({
        particleCount: 120,
        spread: 160,
        startVelocity: 25,
        gravity: 0.7,
        origin: { y: 0.4 },
        colors: ["#ffd24a", "#fff3c4"],
      });
    }, 250);
  }
}

const FEED_VERB: Record<CardType, (owner: string, target: string | null) => string> = {
  afano: (o, t) => `🥷 ${o} le afanó 2 puntos a ${t}`,
  mufa: (o, t) => `🐈‍⬛ ${o} mufó el próximo partido de ${t}`,
  doblete: (o) => `✌️ ${o} jugó un Doblete`,
  diego: (o) => `🔟 ${o} sacó El Diego`,
  escudo: (o) => `🛡️ ${o} levantó un Escudo`,
  aguante: (o) => `💪 ${o} se aseguró el Aguante`,
  yapa: (o) => `🎁 ${o} pidió La Yapa`,
  var: (o) => `📺 ${o} llamó al VAR`,
};

function timeAgo(d: Date): string {
  const mins = Math.max(0, Math.floor((Date.now() - d.getTime()) / 60000));
  if (mins < 1) return "recién";
  if (mins < 60) return `hace ${mins} min`;
  const hs = Math.floor(mins / 60);
  if (hs < 24) return `hace ${hs} h`;
  return `hace ${Math.floor(hs / 24)} d`;
}

export default function FunZone({
  slug,
  state,
  members,
  meId,
}: {
  slug: string;
  state: FunState;
  members: FunMember[];
  meId: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Reveal de la carta del día
  const [revealed, setRevealed] = useState<CardDef | null>(null);
  const [flipped, setFlipped] = useState(false);

  // Jugar carta
  const [playing, setPlaying] = useState<{ id: string; def: CardDef } | null>(null);
  const [lastPlay, setLastPlay] = useState<{ text: string; blocked: boolean } | null>(null);

  const rivals = members.filter((m) => m.id !== meId);

  function claim() {
    setError(null);
    start(async () => {
      const res = await claimDailyCardAction(slug);
      if (!res.ok || !res.card) {
        setError(res.error ?? "No se pudo reclamar.");
        return;
      }
      setRevealed(res.card);
      requestAnimationFrame(() => {
        setFlipped(true);
        setTimeout(() => burst(res.card!.rarity), 500);
      });
      setTimeout(() => router.refresh(), 1600);
    });
  }

  function play(cardId: string, def: CardDef, targetId: string | null) {
    setError(null);
    setPlaying(null);
    start(async () => {
      const res = await playCardAction(slug, cardId, targetId);
      if (!res.ok) {
        setError(res.error ?? "No se pudo jugar.");
        return;
      }
      const targetName = targetId
        ? (members.find((m) => m.id === targetId)?.name ?? "—")
        : null;
      if (res.blocked) {
        setLastPlay({
          text: `🛡️ ¡${targetName} tenía un Escudo! Tu ${def.name} rebotó.`,
          blocked: true,
        });
      } else {
        setLastPlay({ text: `${def.emoji} ¡${def.name} jugada!`, blocked: false });
        burst(def.rarity);
      }
      router.refresh();
    });
  }

  return (
    <section className="fun-border relative rounded-3xl bg-surface p-5">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="wordmark relative text-2xl">
          <span className="fun-text">Zona de cartas</span> 🃏
          <LottieFX
            src="/lottie/sparkles.json"
            className="pointer-events-none absolute -top-4 left-0 h-12 w-40"
          />
        </h2>
        <span className="text-xs text-muted">
          Mano: {state.held.length}/{MAX_HELD_CARDS}
        </span>
      </header>

      {/* Carta del día */}
      <div className="mt-4 flex flex-col items-center gap-3 sm:flex-row sm:items-stretch">
        <div className="fun-card-3d relative h-44 w-32 shrink-0">
          {/* Estallido detrás de la carta al revelarla */}
          {revealed && (
            <LottieFX
              src="/lottie/card-burst.json"
              className="pointer-events-none absolute -inset-16"
            />
          )}
          <div className={`fun-card-inner h-full w-full ${flipped ? "flipped" : ""}`}>
            {/* Dorso */}
            <div className="fun-card-face relative flex h-full w-full flex-col items-center justify-center overflow-hidden rounded-2xl border border-border bg-background">
              <div className="fun-gradient absolute inset-0 opacity-20" />
              <span className={`text-4xl ${state.canClaim ? "fun-float" : "opacity-40"}`}>🃏</span>
              <span className="mt-2 text-[10px] font-bold uppercase tracking-widest text-muted">
                Carta del día
              </span>
              {state.canClaim && <div className="fun-shine" />}
            </div>
            {/* Frente (revelada) */}
            {revealed && (
              <div
                className={`fun-card-face fun-card-front flex h-full w-full flex-col items-center justify-center rounded-2xl border-2 bg-background p-3 text-center ${RARITY_STYLE[revealed.rarity].ring} ${RARITY_STYLE[revealed.rarity].glow}`}
              >
                <span className="fun-pop text-4xl">{revealed.emoji}</span>
                <span className="mt-1 font-black text-foreground">{revealed.name}</span>
                <span
                  className={`mt-0.5 text-[10px] font-bold uppercase tracking-widest ${RARITY_STYLE[revealed.rarity].text}`}
                >
                  {RARITY_LABEL[revealed.rarity]}
                </span>
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-1 flex-col justify-center gap-2 text-center sm:text-left">
          {revealed ? (
            <p className="fun-pop text-sm text-foreground">{revealed.description}</p>
          ) : state.canClaim ? (
            <>
              <p className="text-sm text-muted">
                Hay una carta esperándote. Si no la reclamás hoy, a medianoche se pierde.
              </p>
              <button
                onClick={claim}
                disabled={pending}
                className="fun-gradient fun-wiggle mx-auto rounded-xl px-5 py-2.5 text-sm font-black text-white transition hover:brightness-110 disabled:opacity-60 sm:mx-0"
              >
                {pending ? "Abriendo…" : "✨ Reclamar carta"}
              </button>
            </>
          ) : state.claimedToday ? (
            <p className="text-sm text-muted">
              Ya reclamaste la de hoy. Mañana hay otra (cambia a la medianoche de México 🇲🇽).
            </p>
          ) : (
            <p className="text-sm text-muted">
              Tenés la mano llena ({MAX_HELD_CARDS}). Jugá una carta para poder reclamar la de
              hoy antes de medianoche.
            </p>
          )}
          {error && <p className="text-sm text-danger">{error}</p>}
          {lastPlay && (
            <p
              className={`fun-pop text-sm font-bold ${lastPlay.blocked ? "fun-shake text-danger" : "text-foreground"}`}
            >
              {lastPlay.text}
            </p>
          )}
        </div>
      </div>

      {/* Mano */}
      {state.held.length > 0 && (
        <div className="mt-5">
          <h3 className="mb-2 text-xs font-bold uppercase tracking-widest text-muted">
            Tu mano
          </h3>
          <div className="grid gap-3 sm:grid-cols-3">
            {state.held.map((c) => {
              const st = RARITY_STYLE[c.def.rarity];
              return (
                <div
                  key={c.id}
                  className={`flex flex-col rounded-2xl border bg-background p-3 ${st.ring} ${st.glow}`}
                >
                  <div className="flex items-center gap-2">
                    <span className="fun-float text-2xl">{c.def.emoji}</span>
                    <div>
                      <div className="text-sm font-black text-foreground">{c.def.name}</div>
                      <div className={`text-[10px] font-bold uppercase tracking-widest ${st.text}`}>
                        {RARITY_LABEL[c.def.rarity]}
                      </div>
                    </div>
                  </div>
                  <p className="mt-2 flex-1 text-xs text-muted">{c.def.description}</p>
                  <button
                    onClick={() =>
                      c.def.kind === "attack"
                        ? setPlaying({ id: c.id, def: c.def })
                        : play(c.id, c.def, null)
                    }
                    disabled={pending}
                    className="mt-3 rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-primary-ink transition hover:brightness-110 disabled:opacity-60"
                  >
                    {c.def.kind === "attack" ? "Elegir víctima →" : "Jugar"}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Selector de víctima */}
      {playing && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => setPlaying(null)}
        >
          <div
            className="fun-mode fun-pop w-full max-w-sm rounded-3xl border border-border bg-surface p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="wordmark text-xl text-foreground">
              {playing.def.emoji} {playing.def.name}: ¿a quién?
            </h3>
            <p className="mt-1 text-xs text-muted">{playing.def.description}</p>
            <div className="mt-4 flex max-h-72 flex-col gap-2 overflow-y-auto">
              {rivals.length === 0 && (
                <p className="text-sm text-muted">No hay rivales todavía. Invitá gente 😈</p>
              )}
              {rivals.map((m) => (
                <button
                  key={m.id}
                  onClick={() => play(playing.id, playing.def, m.id)}
                  disabled={pending}
                  className="flex items-center gap-3 rounded-xl border border-border bg-background px-3 py-2 text-left transition hover:border-primary disabled:opacity-60"
                >
                  <Avatar name={m.name} avatar={m.avatar} size={32} />
                  <span className="font-bold text-foreground">{m.name}</span>
                  <span className="ml-auto text-muted">🎯</span>
                </button>
              ))}
            </div>
            <button
              onClick={() => setPlaying(null)}
              className="mt-4 w-full rounded-xl border border-border px-4 py-2 text-sm text-muted transition hover:text-foreground"
            >
              Mejor no…
            </button>
          </div>
        </div>
      )}

      {/* Actividad */}
      {state.feed.length > 0 && (
        <div className="mt-5">
          <h3 className="mb-2 text-xs font-bold uppercase tracking-widest text-muted">
            Últimas jugadas
          </h3>
          <ul className="flex flex-col gap-1.5">
            {state.feed.map((f) => (
              <li key={f.id} className="flex items-baseline gap-2 text-sm">
                <span className="text-foreground">
                  {FEED_VERB[f.cardType]?.(f.ownerName, f.targetName) ??
                    `${CARD_CATALOG[f.cardType]?.emoji ?? "🃏"} ${f.ownerName} jugó una carta`}
                  {f.blocked && (
                    <span className="font-bold text-gold"> — ¡bloqueado por su Escudo! 🛡️</span>
                  )}
                </span>
                <span className="ml-auto shrink-0 text-[10px] text-muted">{timeAgo(f.at)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
