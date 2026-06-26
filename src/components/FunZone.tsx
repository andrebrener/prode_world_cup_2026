"use client";

// Modo Diversión — panel de cartas: sorteo del día (jugada OBLIGADA) e historial.
// No hay mano: la carta se juega al salir. Si pide víctima/apodo/foto, el modal
// se abre al toque y no se puede esquivar — hasta no resolverla no hay otro sorteo.

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import confetti from "canvas-confetti";
import { claimDailyCardAction, playCardAction } from "@/lib/actions";
import {
  RARITY_LABEL,
  MAX_APODO_CHARS,
  MAX_MENSAJE_CHARS,
  type CardDef,
  type CardRarity,
  type FunMatchOption,
} from "@/lib/cardCatalog";
import { playText } from "@/lib/funText";
import { fileToSquareDataUrl } from "@/lib/imageFile";
import type { FunState, FunFeedItem, FunLeaderboardInfo } from "@/lib/db/queries";
import Avatar from "./Avatar";
import LottieFX from "./LottieFX";
import ShareCardButton from "./ShareCardButton";

export type FunMember = { id: string; name: string; avatar: string | null; total: number };

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
  // Extra (posicionales): azul caparazón.
  extra: {
    ring: "border-[#4d7cffaa]",
    text: "text-[#9db4ff]",
    glow: "shadow-[0_0_32px_#4d7cff55]",
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
  if (rarity === "extra") {
    // Caparazón azul cayendo del cielo: nube azul, no festeja.
    confetti({
      particleCount: 110,
      spread: 110,
      startVelocity: 18,
      gravity: 1.5,
      origin: { y: 0.3 },
      colors: ["#4d7cff", "#1e40af", "#9db4ff"],
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

function feedText(f: FunFeedItem): string {
  return playText({
    cardType: f.cardType,
    name: f.name,
    emoji: f.emoji,
    ownerName: f.ownerName,
    targetName: f.targetName,
    detail: f.detail,
    backfire: f.backfire,
    auto: f.auto,
  });
}

// Misma frase, pero con el nombre del que jugó la carta en negrita.
function feedNodes(f: FunFeedItem) {
  const text = feedText(f);
  const name = f.ownerName;
  const i = name ? text.indexOf(name) : -1;
  if (i === -1) return text;
  return (
    <>
      {text.slice(0, i)}
      <strong className="font-bold">{name}</strong>
      {text.slice(i + name.length)}
    </>
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

// Qué hace cada defensa/buff del día mientras está activa (para la colección).
const DAY_CARD_NOTE: Record<string, string> = {
  escudo: "Bloquea todos los ataques que te tiren hoy.",
  espejito: "Rebota todos los ataques de hoy a quien los mandó.",
  aguante: "Tu racha aguanta los ceros de hoy.",
  var: "+2 a todos tus partidos de hoy donde sumes.",
};

export default function FunZone({
  slug,
  state,
  members,
  meId,
  myInfo = null,
  matchOptions = [],
}: {
  slug: string;
  state: FunState;
  members: FunMember[];
  meId: string;
  /** Info fun del visitante (efectos activos / pendientes sobre él). */
  myInfo?: FunLeaderboardInfo | null;
  /** Partidos del día elegibles para el Honguito (input "partido"). */
  matchOptions?: FunMatchOption[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Reveal de la carta del día
  const [revealed, setRevealed] = useState<{ def: CardDef; curse: boolean } | null>(null);
  const [flipped, setFlipped] = useState(false);

  // Resolución obligada (víctima / apodo / foto)
  const [localPlaying, setLocalPlaying] = useState<{
    id: string;
    def: CardDef;
    restrictedTargetId: string | null;
  } | null>(null);
  // Carta ya resuelta en esta sesión (evita reabrir el modal hasta que llegue el refresh).
  const [resolvedId, setResolvedId] = useState<string | null>(null);
  const [targetId, setTargetId] = useState<string | null>(null);
  const [apodo, setApodo] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [imagen, setImagen] = useState<string | null>(null);
  const [matchId, setMatchId] = useState<string | null>(null);
  const [lastPlay, setLastPlay] = useState<{ text: string; bad: boolean } | null>(null);

  // `members` ya viene ordenado por ranking (de mayor a menor total). La posición
  // de cada uno es su índice en la tabla completa (incluyéndome a mí).
  const rankById = new Map(members.map((m, i) => [m.id, i + 1]));
  const rivals = members.filter((m) => m.id !== meId);
  const myName = members.find((m) => m.id === meId)?.name ?? "";

  // Una carta pendiente (de un refresh / sesión anterior) reabre el modal sola:
  // derivado del estado del server, sin efectos.
  const playing =
    localPlaying ??
    (state.pending && state.pending.id !== resolvedId && !revealed
      ? {
          id: state.pending.id,
          def: state.pending.def,
          restrictedTargetId: state.pending.restrictedTargetId,
        }
      : null);

  // Blanco fijo (config del admin): la carta solo se le puede tirar a esta persona.
  // `lockedValid` = el blanco está entre tus rivales (no sos vos ni se fue del prode).
  const lockedTarget = playing?.restrictedTargetId ?? null;
  const lockedValid = !!lockedTarget && rivals.some((m) => m.id === lockedTarget);
  const lockedName = lockedTarget ? (members.find((m) => m.id === lockedTarget)?.name ?? null) : null;

  // Con blanco fijo válido, el blanco es esa persona y no se puede elegir otra
  // (derivado: no hace falta sincronizar estado). Si no, vale lo que elegiste.
  const effectiveTarget = lockedValid && lockedTarget ? lockedTarget : targetId;

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

  function claim() {
    setError(null);
    start(async () => {
      const res = await claimDailyCardAction(slug);
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
          setMatchId(null);
          setLocalPlaying({
            id: res.cardId,
            def,
            restrictedTargetId: res.restrictedTargetId ?? null,
          });
        }
      });
    });
  }

  function resolve() {
    if (!playing) return;
    const { id, def } = playing;
    setError(null);
    start(async () => {
      const res = await playCardAction(slug, id, def.target === "other" ? effectiveTarget : null, {
        apodo: apodo || undefined,
        mensaje: mensaje || undefined,
        imagen: imagen || undefined,
        matchId: matchId || undefined,
      });
      if (!res.ok) {
        setError(res.error ?? "No se pudo jugar.");
        return;
      }
      setResolvedId(id);
      setLocalPlaying(null);
      if (res.reflected) {
        const quien = res.targetName ?? "Ese";
        setLastPlay({
          text: `🪞 Aaaah… ¡te agarré! ${quien} tenía un espejito escondido y tu ${def.name} te volvió de lleno a la cara. 😈`,
          bad: true,
        });
      } else if (res.blocked) {
        const quien = res.targetName ?? "Ese";
        setLastPlay({
          text: `🛡️ Aaaah… ¡te agarré! ${quien} tenía un escudo escondido y tu ${def.name} no le hizo ni cosquillas. 😏`,
          bad: true,
        });
      } else if (def.kind === "shield" && res.retro && res.retro > 0) {
        const n = res.retro;
        const verbo = def.type === "espejito" ? "Rebotaste" : "Anulaste";
        setLastPlay({
          text: `${def.emoji} ¡${def.name}! ${verbo} ${n} ataque${n === 1 ? "" : "s"} que te tiraron hoy.`,
          bad: false,
        });
        burst(def.rarity === "maldicion" ? "comun" : def.rarity);
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
      (playing.def.input === "imagen" && !!imagen) ||
      (playing.def.input === "partido" && (!!matchId || matchOptions.length === 0))) &&
    (playing?.def.target !== "other" ||
      !!effectiveTarget ||
      rivals.length === 0 ||
      (!!lockedTarget && !lockedValid));

  // Tus defensas/buffs del día activos — escudo, espejito, Fernet de Fernemo, VAR
  // — que valen para la jornada de hoy (o la próxima si los jugaste de noche).
  const collection = myInfo?.activeDayCards ?? [];

  // Efectos pendientes en juego: buffs/ataques atados a un partido o al día.
  const activeChips: { key: string; text: string; hostile: boolean }[] = [];
  if (myInfo) {
    myInfo.pendingEffects.forEach((e, i) => {
      const where = e.matchId
        ? `partido ${e.matchId}`
        : e.day === state.today
          ? "hoy"
          : e.day;
      activeChips.push({
        key: `p-${i}`,
        text: `${e.emoji} ${e.name}${e.fromName ? ` de ${e.fromName}` : ""} — ${where}`,
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
                  {revealed.curse
                    ? revealed.def.rarity === "extra"
                      ? "💥 Extra"
                      : "☠️ Maldición"
                    : RARITY_LABEL[revealed.def.rarity]}
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
              <div className="fun-pop">
                <ShareCardButton
                  slug={slug}
                  name={revealed.def.name}
                  emoji={revealed.def.emoji}
                  rarity={revealed.def.rarity}
                  curse={revealed.curse}
                  description={revealed.def.description}
                  by={myName}
                />
              </div>
            </>
          ) : state.pending ? (
            <>
              <p className="text-sm text-foreground">
                {state.pending.def.emoji} Te salió{" "}
                <strong>{state.pending.def.name}</strong> y falta elegir a quién.
              </p>
              <button
                onClick={() =>
                  setLocalPlaying({
                    id: state.pending!.id,
                    def: state.pending!.def,
                    restrictedTargetId: state.pending!.restrictedTargetId,
                  })
                }
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
                onClick={claim}
                disabled={pending}
                className="fun-gradient fun-wiggle mx-auto rounded-xl px-5 py-2.5 text-sm font-black text-white transition hover:brightness-110 disabled:opacity-60 sm:mx-0"
              >
                {pending ? "Abriendo…" : "✨ Reclamar carta"}
              </button>
            </>
          ) : (
            <>
              <p className="text-sm text-muted">
                Ya reclamaste la de hoy. Mañana hay otra (cambia a la medianoche de México 🇲🇽).
              </p>
              {state.myCardToday && (
                <>
                  <p className="text-sm text-foreground">
                    Hoy te {state.myCardToday.curse ? "tocó" : "salió"}{" "}
                    {state.myCardToday.emoji} <strong>{state.myCardToday.name}</strong>.
                  </p>
                  <ShareCardButton
                    slug={slug}
                    name={state.myCardToday.name}
                    emoji={state.myCardToday.emoji}
                    rarity={state.myCardToday.rarity}
                    curse={state.myCardToday.curse}
                    description={state.myCardToday.description}
                    by={myName}
                  />
                </>
              )}
            </>
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

      {/* Tus defensas/buffs del día activos */}
      {collection.length > 0 && (
        <div className="mt-5">
          <h3 className="mb-2 text-xs font-bold uppercase tracking-widest text-muted">
            Activas hoy 🎴{" "}
            <span className="font-medium normal-case tracking-normal text-muted/70">
              — defensas y buffs que valen esta jornada
            </span>
          </h3>
          <div className="flex flex-wrap gap-2">
            {collection.map((t) => {
              const st = RARITY_STYLE[t.rarity];
              return (
                <div
                  key={`col-${t.cardType}`}
                  className={`flex w-28 flex-col items-center rounded-2xl border-2 bg-background p-2 text-center ${st.ring} ${st.glow}`}
                >
                  <span className="text-3xl">{t.emoji}</span>
                  <span className="mt-1 text-xs font-black leading-tight text-foreground">
                    {t.name}
                  </span>
                  <span
                    className={`mt-0.5 text-[9px] font-bold uppercase tracking-wider ${st.text}`}
                  >
                    {RARITY_LABEL[t.rarity]}
                  </span>
                  <span className="mt-1 text-[10px] leading-snug text-muted">
                    {DAY_CARD_NOTE[t.cardType] ?? ""}
                  </span>
                  <ShareCardButton
                    slug={slug}
                    name={t.name}
                    emoji={t.emoji}
                    rarity={t.rarity}
                    description={DAY_CARD_NOTE[t.cardType] ?? ""}
                    by={myName}
                    variant="icon"
                  />
                </div>
              );
            })}
          </div>
        </div>
      )}

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

      {/* Modal de resolución obligada (víctima / inputs). Overlay scrolleable y
          anclado arriba en mobile: si el modal es más alto que la pantalla, el
          botón "Jugarla" sigue siendo alcanzable. */}
      {playing && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4 sm:items-center">
          <div className="fun-mode fun-pop my-auto w-full max-w-sm rounded-3xl border border-border bg-surface p-6">
            <h3 className="wordmark text-xl text-foreground">
              {playing.def.emoji} {playing.def.name}
            </h3>
            <p className="mt-1 text-xs text-muted">{playing.def.description}</p>

            {/* Selector de víctima */}
            {playing.def.target === "other" && (
              <div className="mt-4 flex max-h-56 flex-col gap-2 overflow-y-auto">
                {rivals.length === 0 && (
                  <p className="text-sm text-muted">
                    No hay rivales todavía: la carta se va a jugar al vacío 🫥
                  </p>
                )}
                {/* Blanco fijo: esta carta solo se le puede tirar a una persona. */}
                {lockedTarget && lockedValid && (
                  <p className="rounded-lg border border-primary/40 bg-primary/10 px-3 py-2 text-xs font-semibold text-primary">
                    🎯 Esta carta tiene nombre y apellido: solo se le puede tirar a{" "}
                    <strong>{lockedName}</strong>.
                  </p>
                )}
                {lockedTarget && !lockedValid && (
                  <p className="rounded-lg border border-border bg-background/60 px-3 py-2 text-xs text-muted">
                    🎯 Esta carta apunta a {lockedName ?? "alguien"}, que no está disponible: se va a
                    jugar al vacío 🫥
                  </p>
                )}
                {rivals.map((m) => {
                  // Las defensas son secretas: a cualquiera le podés tirar. Si tenía
                  // escudo/espejito puesto, te enterás recién al tirarla.
                  // Con blanco fijo válido, solo esa persona queda habilitada.
                  const disabled = lockedValid && m.id !== lockedTarget;
                  return (
                    <button
                      key={m.id}
                      disabled={disabled}
                      onClick={() => !disabled && setTargetId(m.id)}
                      className={`flex items-center gap-3 rounded-xl border px-3 py-2 text-left transition ${
                        disabled
                          ? "cursor-not-allowed border-border/40 bg-background/30 opacity-40"
                          : effectiveTarget === m.id
                            ? "border-primary bg-background"
                            : "border-border bg-background/50 hover:border-primary/50"
                      }`}
                    >
                      <span className="w-5 shrink-0 text-center text-xs font-bold tabular-nums text-muted">
                        {rankById.get(m.id)}
                      </span>
                      <Avatar name={m.name} avatar={m.avatar} size={32} />
                      <span className="font-bold text-foreground">{m.name}</span>
                      <span className="ml-auto shrink-0 text-xs font-semibold tabular-nums text-muted">
                        {m.total} pts
                      </span>
                      {effectiveTarget === m.id && <span className="shrink-0">🎯</span>}
                    </button>
                  );
                })}
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

            {/* Selector de partido (Honguito): partidos del día sin arrancar */}
            {playing.def.input === "partido" && (
              <div className="mt-4 flex max-h-56 flex-col gap-2 overflow-y-auto">
                {matchOptions.length === 0 && (
                  <p className="text-sm text-muted">
                    No quedan partidos por jugarse hoy: la carta se va a jugar al vacío 🫥
                  </p>
                )}
                {matchOptions.map((o) => (
                  <button
                    key={o.id}
                    onClick={() => setMatchId(o.id)}
                    className={`flex items-center gap-3 rounded-xl border px-3 py-2 text-left transition ${
                      matchId === o.id
                        ? "border-primary bg-background"
                        : "border-border bg-background/50 hover:border-primary/50"
                    }`}
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-foreground">{o.label}</p>
                      <p className="text-[11px] text-muted">
                        {o.sub} · {fmtTime(new Date(o.kickoff))}
                      </p>
                    </div>
                    {matchId === o.id && <span className="ml-auto">🍄</span>}
                  </button>
                ))}
              </div>
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
                        {feedNodes(f)}
                        {f.blocked && (
                          <span className="font-bold text-gold">
                            {" "}
                            — ¡bloqueado por su Anulo mufa! 🛡️
                          </span>
                        )}
                        {f.reflected && !f.backfire && (
                          <span className="font-bold text-gold">
                            {" "}
                            — ¡el Espejito se lo devolvió! 🪞
                          </span>
                        )}
                        {f.secretReal && (
                          <span className="ml-1 rounded bg-primary/15 px-1.5 py-0.5 text-[10px] font-bold text-primary">
                            🤫 solo vos: en realidad es tu {f.secretReal.emoji} {f.secretReal.name}
                          </span>
                        )}
                      </span>
                      <span className="ml-auto flex shrink-0 items-baseline gap-1.5">
                        <span className="rounded-full bg-foreground/5 px-1.5 py-0.5 text-[10px] font-medium text-muted">
                          {f.ownerName}
                        </span>
                        <span className="text-[10px] text-muted">{fmtTime(f.at)}</span>
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
