"use client";

import { useState } from "react";

export default function ShareCode({ code, slug }: { code: string; slug: string }) {
  const [copied, setCopied] = useState<"link" | "code" | null>(null);

  async function copy(what: "link" | "code") {
    const text =
      what === "link"
        ? `${window.location.origin}/p/${slug}`
        : code;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      // ignorar: algunos navegadores bloquean clipboard sin https
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-surface px-4 py-3 text-sm">
      <span className="text-muted">Invitá amigos:</span>
      <button
        type="button"
        onClick={() => copy("link")}
        className="rounded-lg border border-border px-3 py-1.5 font-semibold text-foreground transition hover:bg-background"
      >
        {copied === "link" ? "¡Link copiado!" : "Copiar link"}
      </button>
      <button
        type="button"
        onClick={() => copy("code")}
        className="rounded-lg border border-border px-3 py-1.5 font-mono font-semibold text-foreground transition hover:bg-background"
      >
        {copied === "code" ? "¡Copiado!" : `Código: ${code}`}
      </button>
    </div>
  );
}
