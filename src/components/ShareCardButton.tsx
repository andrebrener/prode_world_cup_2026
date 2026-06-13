"use client";

// Botón "Compartir al grupo" para una carta del Modo Diversión.
// En mobile baja el PNG branded (/api/fun-card) y lo manda por la Web Share API
// como archivo: el menú nativo abre WhatsApp con la FOTO ya adjunta (reemplaza
// el screenshot manual). Si no hay file-share (desktop o navegador viejo), cae
// a un link wa.me con texto + link al prode.

import { useState } from "react";
import { RARITY_LABEL, type CardRarity } from "@/lib/cardCatalog";

type Props = {
  slug: string;
  name: string;
  emoji: string;
  rarity: CardRarity;
  curse?: boolean;
  description?: string;
  /** Nombre del que sacó la carta (se imprime en la imagen). */
  by?: string;
  variant?: "primary" | "icon";
};

async function fetchCardFile(url: string): Promise<File | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    return new File([blob], "carta.png", { type: "image/png" });
  } catch {
    return null;
  }
}

export default function ShareCardButton({
  slug,
  name,
  emoji,
  rarity,
  curse = false,
  description = "",
  by = "",
  variant = "primary",
}: Props) {
  const [busy, setBusy] = useState(false);

  function imageUrl(origin: string) {
    const p = new URLSearchParams({ name, emoji, rarity });
    if (description) p.set("desc", description);
    if (curse) p.set("curse", "1");
    if (by) p.set("by", by);
    return `${origin}/api/fun-card?${p.toString()}`;
  }

  function shareText(origin: string) {
    const what = curse ? "una maldición ☠️" : `una carta ${RARITY_LABEL[rarity].toLowerCase()}`;
    return `${emoji} Me salió *${name}* (${what}) en el Prode Mundial 2026 🏆\nJugá vos 👉 ${origin}/p/${slug}`;
  }

  async function share() {
    if (busy) return;
    setBusy(true);
    try {
      const origin = window.location.origin;
      const text = shareText(origin);

      const file = await fetchCardFile(imageUrl(origin));
      if (file && navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({ files: [file], text });
          return;
        } catch (e) {
          // El usuario canceló el menú nativo: no hacemos fallback.
          if ((e as Error)?.name === "AbortError") return;
          // Cualquier otro error: caemos al link de WhatsApp.
        }
      }

      // Fallback desktop / sin file-share: WhatsApp con texto + link.
      window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener");
    } finally {
      setBusy(false);
    }
  }

  if (variant === "icon") {
    return (
      <button
        type="button"
        onClick={share}
        disabled={busy}
        title="Compartir a WhatsApp"
        className="mt-1 rounded-lg border border-[#25D366]/60 px-2 py-1 text-[11px] font-bold text-[#7dffa0] transition hover:bg-[#25D366]/10 disabled:opacity-60"
      >
        {busy ? "…" : "📲 Compartir"}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={share}
      disabled={busy}
      className="mx-auto inline-flex items-center gap-2 rounded-xl bg-[#25D366] px-5 py-2.5 text-sm font-black text-[#062b13] transition hover:brightness-110 disabled:opacity-60 sm:mx-0"
    >
      {busy ? "Armando imagen…" : "📲 Compartir al grupo"}
    </button>
  );
}
