"use client";

// Modo Diversión — pedirle el mail al que todavía no lo dejó, para el resumen
// diario (carta + tabla + libro de pases). "Después" lo esconde por la sesión.

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveEmailAction } from "@/lib/actions";

export default function EmailCapture() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  // sessionStorage solo existe en el cliente: leerlo en el render inicial
  // rompe la hidratación. Server y primer render coinciden (visible) y el
  // efecto lo esconde recién después si corresponde.
  const [dismissed, setDismissed] = useState(false);
  const [pending, start] = useTransition();

  useEffect(() => {
    if (sessionStorage.getItem("fun-email-later") === "1") setDismissed(true);
  }, []);

  if (dismissed) return null;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    start(async () => {
      const res = await saveEmailAction(email);
      if (!res.ok) setError(res.error ?? "No se pudo guardar.");
      else router.refresh();
    });
  }

  return (
    <form
      onSubmit={submit}
      className="fun-border flex flex-wrap items-center gap-3 rounded-2xl bg-surface px-4 py-3"
    >
      <span className="text-xl" aria-hidden>
        📬
      </span>
      <div className="min-w-48 flex-1 text-sm">
        <span className="font-bold text-foreground">¿Te mandamos el resumen diario?</span>{" "}
        <span className="text-muted">
          Cada mañana: cómo viene la tabla, qué se tiraron ayer y el recordatorio de tu carta.
        </span>
      </div>
      <div className="flex items-center gap-2">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="tu@mail.com"
          className="w-44 rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
        />
        <button
          type="submit"
          disabled={pending}
          className="fun-gradient rounded-xl px-4 py-2 text-sm font-black text-white transition hover:brightness-110 disabled:opacity-60"
        >
          {pending ? "…" : "Dale"}
        </button>
        <button
          type="button"
          onClick={() => {
            sessionStorage.setItem("fun-email-later", "1");
            setDismissed(true);
          }}
          className="text-xs text-muted transition hover:text-foreground"
        >
          Después
        </button>
      </div>
      {error && <p className="w-full text-sm text-danger">{error}</p>}
    </form>
  );
}
