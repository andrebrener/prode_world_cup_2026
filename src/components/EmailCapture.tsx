"use client";

// Modo Diversión — pedirle el mail al que todavía no lo dejó, para el resumen
// diario (carta + tabla + libro de pases). "Después" lo esconde por la sesión.

import { useState, useSyncExternalStore, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveEmailAction } from "@/lib/actions";

// "Después" se recuerda por la sesión en sessionStorage. Lo leemos con
// useSyncExternalStore: en el server (y primer render) devuelve "visible", y
// recién en el cliente refleja el valor real — sin romper la hidratación.
const DISMISS_KEY = "fun-email-later";
const listeners = new Set<() => void>();

// Respaldo en memoria: si el storage está bloqueado (Safari modo privado,
// bloqueadores, "bloquear todas las cookies"), sessionStorage TIRA al leer. Como
// esto corre en el getSnapshot (durante el render), una excepción acá rompe la
// hidratación de TODA la página y deja todo sin responder. Por eso va con try/catch
// y un flag en memoria que mantiene el "Después" andando aunque no se pueda persistir.
let dismissedMem = false;

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
function isDismissed() {
  if (dismissedMem) return true;
  try {
    return sessionStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}
function dismissForSession() {
  dismissedMem = true;
  try {
    sessionStorage.setItem(DISMISS_KEY, "1");
  } catch {
    /* sin persistencia: igual lo escondemos por la sesión vía dismissedMem */
  }
  listeners.forEach((l) => l());
}

export default function EmailCapture() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const dismissed = useSyncExternalStore(subscribe, isDismissed, () => false);

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
          onClick={dismissForSession}
          className="text-xs text-muted transition hover:text-foreground"
        >
          Después
        </button>
      </div>
      {error && <p className="w-full text-sm text-danger">{error}</p>}
    </form>
  );
}
