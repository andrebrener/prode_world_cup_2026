"use client";

// Modo Diversión — panel de cartas: sorteo del día (jugada OBLIGADA) e historial.
// No hay mano: la carta se juega al salir. Si pide víctima/apodo/foto, el modal
// se abre al toque y no se puede esquivar — hasta no resolverla no hay otro sorteo.

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import confetti from "canvas-confetti";
import { claimDailyCardAction, devDrawCardAction, playCardAction } from "@/lib/actions";
import {
  CARD_CATALOG,
  RARITY_LABEL,
  MAX_APODO_CHARS,
  MAX_MENSAJE_CHARS,
  type CardDef,
  type CardRarity,
  type CardType,
} from "@/lib/cardCatalog";
import { fileToSquareDataUrl } from "@/lib/imageFile";
import type { FunState, FunFeedItem, FunLeaderboardInfo } from "@/lib/db/queries";
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
  maldicion: {
    ring: "border-[#39ff5a99]",
    text: "text-[#7dff96]",
    glow: "shadow-[0_0_32px_#39ff5a44]",
  },
};

function burst(rarity: CardRarity) {
  if (rarity === "maldicion") {
    // Nube verde de mufa: cae, no festeja.
    confetti({
      particleCount: 90,
      spread: 100,
      startVelocity: 16,
      gravity: 1.4,
      origin: { y: 0.4 },
      colors: ["#39ff5a", "#1d7a2f", "#0a3d14"],
    });
    return;
  }
  const power = rarity === "legendaria" ? 3 : rarity === "rara" ? 2 : 1;
  confetti({
    particleCount: 60 * power,
    spread: 55 + 25 * power,
    startVelocity: 35 + 10 * power,
    origin: { y: 0.6 },
    colors: ["#ff3d8b", "#8b3cff", "#00e5ff", "#ffd24a", "#ffffff"],
  });
  if (rarity === "legendaria") {
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

type Verb = (o: string, t: string, d: string | null) => string;
const FEED_VERB: Record<CardType, Verb> = {
  doblete: (o) => `✌️ ${o} jugó un Doblete`,
  yapa: (o) => `🎁 ${o} pidió La Yapa`,
  mufa: (o, t) => `🐈‍⬛ ${o} mufó el próximo partido de ${t}`,
  diego: (o) => `🔟 ${o} sacó El Diego`,
  var: (o) => `📺 ${o} llamó al VAR`,
  costillar: (o) => `🥩 ${o} desayunó costillar a las 7 AM`,
  cabala: (o) => `🍀 ${o} activó la Cábala del Echugo`,
  pelambreada: (o, t) => `🤦 ${o} le clavó una Pelambreada a ${t}`,
  caido: (o, t) => `😭 ${o} le tiró el fernet de ${t} al piso`,
  filtro: (o, t) => `🚬 ${o} le afanó el filtro de 5mm a ${t}`,
  caldeador: (o, t) => `🤮 ${o} caldeó los pronósticos de ${t}`,
  caparazon: (o, t) => `🐢 ${o} soltó el Caparazón azul — directo a ${t}`,
  swap: (o, t) => `🎭 ${o} se robó la identidad de ${t}: puntos intercambiados`,
  duelo: (o, t) => `🥊 ${o} retó a ${t} a un Duelo de matambres`,
  papas: (o) => `🍟 A ${o} le sobran papas: +5`,
  speed: (o) => `🏎️ ${o} está built for speed: +2`,
  pedo: (o, t) => `💨 ${o} se lo soltó en la cara a ${t}`,
  escudo: (o) => `🛡️ ${o} levantó el Anulo mufa`,
  aguante: (o) => `🥃 ${o} se aseguró el Fernet de Fernemo`,
  espejito: (o) => `🪞 ${o} colgó el Espejito rebotín`,
  nemo: (o) => `🛏️ Nemo usó las sábanas de ${o}: hoy no suma`,
  heladera: (o) => `🧊 A ${o} le tocó limpiar la heladera: 0 hoy`,
  matambrito: (o) => `🐄 ${o} quedó como matambrito de vaca: 0 hoy`,
  ramirez: (o) => `💸 ${o} le prestó plata a un Ramirez: -5`,
  apodo: (o, t, d) => `🏷️ ${o} bautizó a ${t}: «${d ?? "…"}»`,
  foto: (o, t) => `📸 ${o} le cambió la foto a ${t}`,
  microfono: (o, t, d) => `🎤 ${o} dejó dicho sobre ${t}: “${d ?? "…"}”`,
  borron: (o) => `🧽 ${o} pasó el borrón: cuenta nueva`,
};

function feedText(f: FunFeedItem): string {
  return (
    FEED_VERB[f.cardType]?.(f.ownerName, f.targetName ?? "nadie", f.detail) ??
    `🃏 ${f.ownerName} jugó una carta`
  );
}

const fmtDay = (iso: string, today: string): string => {
  if (iso === today) return "Hoy";
  return new Date(iso + "T12:00:00").toLocaleDateString("es-AR", {
    weekday: "long",
    day: "2-digit",
    month: "short",
  });
};

// 24h sin am/pm: el formato "p. m." difiere entre server y browser por un
// espacio invisible (U+202F) y rompe la hidratación.
const fmtTime = (d: Date): string =>
  d.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", hour12: false });

const STANDING_LABEL: Record<string, string> = {
  escudo: "🛡️ Anulo mufa listo",
  espejito: "🪞 Espejito colgado",
  aguante: "🥃 Fernet de Fernemo a mano",
  var: "📺 VAR al acecho",
};

export default function FunZone({
  slug,
  state,
  members,
  meId,
  myInfo = null,
  devTools = false,
}: {
  slug: string;
  state: FunState;
  members: FunMember[];
  meId: string;
  /** Info fun del visitante (efectos activos / pendientes sobre él). */
  myInfo?: FunLeaderboardInfo | null;
  /** SOLO DEV: botón para sacar cartas extra y probar el mazo. */
  devTools?: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Reveal de la carta del día
  const [revealed, setRevealed] = useState<{ def: CardDef; curse: boolean } | null>(null);
  const [flipped, setFlipped] = useState(false);

  // Resolución obligada (víctima / apodo / foto)
  const [localPlaying, setLocalPlaying] = useState<{ id: string; def: CardDef } | null>(null);
  // Carta ya resuelta en esta sesión (evita reabrir el modal hasta que llegue el refresh).
  const [resolvedId, setResolvedId] = useState<string | null>(null);
  const [targetId, setTargetId] = useState<string | null>(null);
  const [apodo, setApodo] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [imagen, setImagen] = useState<string | null>(null);
  const [lastPlay, setLastPlay] = useState<{ text: string; bad: boolean } | null>(null);

  const rivals = members.filter((m) => m.id !== meId);

  // Una carta pendiente (de un refresh / sesión anterior) reabre el modal sola:
  // derivado del estado del server, sin efectos.
  const playing =
    localPlaying ??
    (state.pending && state.pending.id !== resolvedId && !revealed
      ? { id: state.pending.id, def: state.pending.def }
      : null);

  // Historial agrupado por día (hoy expandido, el resto colapsado).
  const feedByDay = useMemo(() => {
    const groups: { day: string; items: FunFeedItem[] }[] = [];
    for (const f of state.feed) {
      const last = groups[groups.length - 1];
      if (last && last.day === f.day) last.items.push(f);
      else groups.push({ day: f.day, items: [f] });
    }
    return groups;
  }, [state.feed]);

  function showReveal(card: CardDef, curse: boolean, then?: () => void) {
    setFlipped(false);
    setRevealed(null);
    requestAnimationFrame(() => {
      setRevealed({ def: card, curse });
      requestAnimationFrame(() => {
        setFlipped(true);
        setTimeout(() => burst(card.rarity), 500);
      });
    });
    setTimeout(() => {
      router.refresh();
      then?.();
    }, 1600);
  }

  function draw(action: typeof claimDailyCardAction) {
    setError(null);
    start(async () => {
      const res = await action(slug);
      if (!res.ok || !res.card) {
        setError(res.error ?? "No se pudo reclamar.");
        return;
      }
      const def = res.card;
      showReveal(def, !!res.curse, () => {
        // Jugada obligada: si pide elección, el modal se abre solo tras el reveal.
        if (res.needsTarget && res.cardId) {
          setTargetId(null);
          setApodo("");
          setMensaje("");
          setImagen(null);
          setLocalPlaying({ id: res.cardId, def });
        }
      });
    });
  }

  function resolve() {
    if (!playing) return;
    const { id, def } = playing;
    setError(null);
    start(async () => {
      const res = await playCardAction(slug, id, def.target === "other" ? targetId : null, {
        apodo: apodo || undefined,
        mensaje: mensaje || undefined,
        imagen: imagen || undefined,
      });
      if (!res.ok) {
        setError(res.error ?? "No se pudo jugar.");
        return;
      }
      setResolvedId(id);
      setLocalPlaying(null);
      if (res.blocked) {
        setLastPlay({
          text: `🛡️ ¡${res.targetName} tenía un Anulo mufa! Tu ${def.name} quedó en la nada.`,
          bad: true,
        });
      } else if (res.reflected) {
        setLastPlay({
          text: `🪞 ¡${res.targetName} tenía el Espejito rebotín! Tu ${def.name} te volvió en la cara.`,
          bad: true,
        });
      } else {
        setLastPlay({ text: `${def.emoji} ¡${def.name} jugada!`, bad: false });
        burst(def.rarity === "maldicion" ? "comun" : def.rarity);
      }
      router.refresh();
    });
  }

  const modalReady =
    (!playing?.def.input ||
      (playing.def.input === "apodo" && apodo.trim().length >= 2) ||
      (playing.def.input === "mensaje" && mensaje.trim().length >= 2) ||
      (playing.def.input === "imagen" && !!imagen)) &&
    (playing?.def.target !== "other" || !!targetId || rivals.length === 0);

  // Efectos activos del visitante (standings + lo que tiene encima/en juego).
  const activeChips: { key: string; text: string; hostile: boolean }[] = [];
  if (myInfo) {
    for (const s of myInfo.activeStandings) {
      activeChips.push({ key: `s-${s}`, text: STANDING_LABEL[s] ?? s, hostile: false });
    }
    myInfo.pendingEffects.forEach((e, i) => {
      const def = CARD_CATALOG[e.cardType];
      const where = e.matchId
        ? `partido ${e.matchId}`
        : e.day === state.today
          ? "hoy"
          : e.day;
      activeChips.push({
        key: `p-${i}`,
        text: `${def?.emoji ?? "🃏"} ${def?.name ?? e.cardType}${e.fromName ? ` de ${e.fromName}` : ""} — ${where}`,
        hostile: !!e.fromName,
      });
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
        {devTools && (
          <span className="flex items-center gap-2 text-xs">
            <button
              onClick={() => draw(devDrawCardAction)}
              disabled={pending || !!state.pending}
              title="SOLO PRUEBAS: saca una carta extra al azar (después lo sacamos)"
              className="rounded-lg border border-dashed border-gold/60 px-2 py-1 font-bold text-gold transition hover:bg-gold/10 disabled:opacity-50"
            >
              🧪 +carta
            </button>
            <button
              onClick={() => router.refresh()}
              disabled={pending}
              title="SOLO PRUEBAS: refrescar el estado"
              className="rounded-lg border border-dashed border-gold/60 px-2 py-1 font-bold text-gold transition hover:bg-gold/10 disabled:opacity-50"
            >
              🔄
            </button>
          </span>
        )}
      </header>

      {/* Carta del día */}
      <div className="mt-4 flex flex-col items-center gap-3 sm:flex-row sm:items-stretch">
        <div className="fun-card-3d relative h-44 w-32 shrink-0">
          {revealed && !revealed.curse && (
            <LottieFX
              src="/lottie/card-burst.json"
              className="pointer-events-none absolute -inset-16"
            />
          )}
          <div
            className={`fun-card-inner h-full w-full ${flipped ? "flipped" : ""} ${
              revealed?.curse && flipped ? "fun-shake" : ""
            }`}
          >
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
                className={`fun-card-face fun-card-front flex h-full w-full flex-col items-center justify-center rounded-2xl border-2 bg-background p-3 text-center ${RARITY_STYLE[revealed.def.rarity].ring} ${RARITY_STYLE[revealed.def.rarity].glow}`}
              >
                <span className="fun-pop text-4xl">{revealed.def.emoji}</span>
                <span className="mt-1 text-sm font-black leading-tight text-foreground">
                  {revealed.def.name}
                </span>
                <span
                  className={`mt-0.5 text-[10px] font-bold uppercase tracking-widest ${RARITY_STYLE[revealed.def.rarity].text}`}
                >
                  {revealed.curse ? "☠️ Maldición" : RARITY_LABEL[revealed.def.rarity]}
                </span>
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-1 flex-col justify-center gap-2 text-center sm:text-left">
          {revealed ? (
            <>
              {revealed.curse && (
                <p className="fun-pop text-sm font-black text-[#7dff96]">
                  ☠️ Te tocó una maldición. Se aplica sola, no hay nada que puedas hacer.
                </p>
              )}
              <p className="fun-pop text-sm text-foreground">{revealed.def.description}</p>
            </>
          ) : state.pending ? (
            <>
              <p className="text-sm text-foreground">
                {state.pending.def.emoji} Tenés un{" "}
                <strong>{state.pending.def.name}</strong> sin resolver. La carta se juega sí
                o sí: elegí.
              </p>
              <button
                onClick={() => setLocalPlaying({ id: state.pending!.id, def: state.pending!.def })}
                className="fun-gradient fun-wiggle mx-auto rounded-xl px-5 py-2.5 text-sm font-black text-white transition hover:brightness-110 sm:mx-0"
              >
                ⚡ Resolver ahora
              </button>
            </>
          ) : state.canClaim ? (
            <>
              <p className="text-sm text-muted">
                Hay una carta esperándote y se juega al salir: puede ser gloria o
                maldición ☠️. Si no la reclamás hoy, a medianoche se pierde. ¿Te la jugás?
              </p>
              <button
                onClick={() => draw(claimDailyCardAction)}
                disabled={pending}
                className="fun-gradient fun-wiggle mx-auto rounded-xl px-5 py-2.5 text-sm font-black text-white transition hover:brightness-110 disabled:opacity-60 sm:mx-0"
              >
                {pending ? "Abriendo…" : "✨ Reclamar carta"}
              </button>
            </>
          ) : (
            <p className="text-sm text-muted">
              Ya reclamaste la de hoy. Mañana hay otra (cambia a la medianoche de México 🇲🇽).
            </p>
          )}
          {error && !playing && <p className="text-sm text-danger">{error}</p>}
          {lastPlay && (
            <p
              className={`fun-pop text-sm font-bold ${lastPlay.bad ? "fun-shake text-danger" : "text-foreground"}`}
            >
              {lastPlay.text}
            </p>
          )}
        </div>
      </div>

      {/* Tus efectos en juego */}
      {activeChips.length > 0 && (
        <div className="mt-4">
          <h3 className="mb-2 text-xs font-bold uppercase tracking-widest text-muted">
            En juego sobre vos
          </h3>
          <div className="flex flex-wrap gap-1.5">
            {activeChips.map((c) => (
              <span
                key={c.key}
                className={`rounded-lg border px-2 py-1 text-xs font-semibold ${
                  c.hostile
                    ? "border-danger/50 bg-danger/10 text-danger"
                    : "border-border bg-background text-foreground"
                }`}
              >
                {c.text}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Modal de resolución obligada (víctima / inputs) */}
      {playing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="fun-mode fun-pop w-full max-w-sm rounded-3xl border border-border bg-surface p-6">
            <h3 className="wordmark text-xl text-foreground">
              {playing.def.emoji} {playing.def.name}
            </h3>
            <p className="mt-1 text-xs text-muted">{playing.def.description}</p>
            <p className="mt-2 text-xs font-bold uppercase tracking-wider text-gold">
              ⚡ Jugada obligada: no hay vuelta atrás
            </p>

            {/* Selector de víctima */}
            {playing.def.target === "other" && (
              <div className="mt-4 flex max-h-56 flex-col gap-2 overflow-y-auto">
                {rivals.length === 0 && (
                  <p className="text-sm text-muted">
                    No hay rivales todavía: la carta se va a jugar al vacío 🫥
                  </p>
                )}
                {rivals.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => setTargetId(m.id)}
                    className={`flex items-center gap-3 rounded-xl border px-3 py-2 text-left transition ${
                      targetId === m.id
                        ? "border-primary bg-background"
                        : "border-border bg-background/50 hover:border-primary/50"
                    }`}
                  >
                    <Avatar name={m.name} avatar={m.avatar} size={32} />
                    <span className="font-bold text-foreground">{m.name}</span>
                    {targetId === m.id && <span className="ml-auto">🎯</span>}
                  </button>
                ))}
              </div>
            )}

            {/* Inputs sociales */}
            {playing.def.input === "apodo" && (
              <input
                value={apodo}
                onChange={(e) => setApodo(e.target.value)}
                placeholder="El apodo…"
                maxLength={MAX_APODO_CHARS}
                className="mt-3 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
              />
            )}
            {playing.def.input === "mensaje" && (
              <input
                value={mensaje}
                onChange={(e) => setMensaje(e.target.value)}
                placeholder="La declaración…"
                maxLength={MAX_MENSAJE_CHARS}
                className="mt-3 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
              />
            )}
            {playing.def.input === "imagen" && (
              <label className="mt-3 flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-border bg-background px-3 py-2 text-sm text-muted hover:border-primary">
                {imagen ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={imagen} alt="" className="h-10 w-10 rounded-lg object-cover" />
                ) : (
                  <span className="text-2xl">🖼️</span>
                )}
                {imagen ? "Cambiar foto…" : "Elegir la foto trucha…"}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    try {
                      setImagen(await fileToSquareDataUrl(f));
                    } catch {
                      setError("No se pudo procesar la imagen.");
                    }
                  }}
                />
              </label>
            )}

            {error && <p className="mt-2 text-sm text-danger">{error}</p>}
            <button
              disabled={pending || !modalReady}
              onClick={resolve}
              className="fun-gradient mt-4 w-full rounded-xl px-4 py-2 text-sm font-black text-white transition hover:brightness-110 disabled:opacity-50"
            >
              {pending ? "Jugando…" : `${playing.def.emoji} Jugarla`}
            </button>
          </div>
        </div>
      )}

      {/* Historial de jugadas, agrupado por día */}
      {feedByDay.length > 0 && (
        <div className="mt-5">
          <h3 className="mb-2 text-xs font-bold uppercase tracking-widest text-muted">
            El libro de pases
          </h3>
          <div className="flex flex-col gap-2">
            {feedByDay.map((g, gi) => (
              <details
                key={g.day}
                open={gi === 0}
                className="group rounded-xl border border-border/60 bg-background/40"
              >
                <summary className="flex cursor-pointer items-center gap-2 px-3 py-2 text-xs font-bold uppercase tracking-wider text-muted [&::-webkit-details-marker]:hidden">
                  <span className="transition group-open:rotate-90">▸</span>
                  {fmtDay(g.day, state.today)}
                  <span className="ml-auto font-normal normal-case tracking-normal">
                    {g.items.length} {g.items.length === 1 ? "jugada" : "jugadas"}
                  </span>
                </summary>
                <ul className="flex flex-col gap-1.5 px-3 pb-3">
                  {g.items.map((f) => (
                    <li key={f.id} className="flex items-baseline gap-2 text-sm">
                      <span className={f.curse ? "text-[#7dff96]" : "text-foreground"}>
                        {feedText(f)}
                        {f.blocked && (
                          <span className="font-bold text-gold">
                            {" "}
                            — ¡bloqueado por su Anulo mufa! 🛡️
                          </span>
                        )}
                        {f.reflected && (
                          <span className="font-bold text-gold">
                            {" "}
                            — ¡el Espejito se lo devolvió! 🪞
                          </span>
                        )}
                      </span>
                      <span className="ml-auto shrink-0 text-[10px] text-muted">
                        {fmtTime(f.at)}
                      </span>
                    </li>
                  ))}
                </ul>
              </details>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
