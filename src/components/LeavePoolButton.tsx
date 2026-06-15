"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { leavePoolAction } from "@/lib/actions";

export default function LeavePoolButton({
  slug,
  poolName,
  variant = "footer",
}: {
  slug: string;
  poolName: string;
  // "footer": link discreto al pie de la tabla del prode (manda al home al salir).
  // "inline": botón compacto para el listado de "Mis prodes" (se queda en el home).
  // "action": botón en la fila de acciones del prode, al lado de "Jugar" (manda al home).
  variant?: "footer" | "inline" | "action";
}) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  function leave() {
    setError(null);
    start(async () => {
      const res = await leavePoolAction(slug);
      if (!res.ok) {
        setError(res.error ?? "No se pudo salir.");
        setConfirming(false);
      } else {
        if (variant === "footer" || variant === "action") router.push("/");
        router.refresh();
      }
    });
  }

  if (variant === "inline") {
    if (!confirming) {
      return (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="shrink-0 rounded-lg px-2 py-1 text-xs text-muted transition hover:bg-danger/10 hover:text-danger"
        >
          Salir
        </button>
      );
    }
    return (
      <div className="flex shrink-0 items-center gap-1.5 text-xs">
        <span className="text-muted">¿Salir?</span>
        <button
          type="button"
          onClick={leave}
          disabled={pending}
          className="rounded-lg bg-danger px-2 py-1 font-bold text-white transition hover:brightness-110 disabled:opacity-60"
        >
          {pending ? "…" : "Sí"}
        </button>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          disabled={pending}
          className="rounded-lg border border-border px-2 py-1 font-bold transition hover:bg-border/30 disabled:opacity-60"
        >
          No
        </button>
      </div>
    );
  }

  if (variant === "action") {
    if (!confirming) {
      return (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="rounded-xl border border-border bg-surface px-4 py-2 text-sm font-bold text-muted transition hover:border-danger/50 hover:bg-danger/10 hover:text-danger"
        >
          Salir
        </button>
      );
    }
    return (
      <div className="flex items-center gap-2 text-sm">
        <span className="text-muted">¿Salir?</span>
        <button
          type="button"
          onClick={leave}
          disabled={pending}
          className="rounded-xl bg-danger px-3 py-2 font-bold text-white transition hover:brightness-110 disabled:opacity-60"
        >
          {pending ? "…" : "Sí, salir"}
        </button>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          disabled={pending}
          className="rounded-xl border border-border px-3 py-2 font-bold transition hover:bg-border/30 disabled:opacity-60"
        >
          No
        </button>
      </div>
    );
  }

  if (!confirming) {
    return (
      <div className="pt-2 text-center">
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="text-xs text-muted underline-offset-2 transition hover:text-danger hover:underline"
        >
          Salir de este prode
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-danger/40 bg-surface p-4 text-center">
      <p className="text-sm text-foreground">
        ¿Seguro que querés salir de <span className="font-bold">{poolName}</span>? Vas a
        dejar de aparecer en su tabla. Tus pronósticos no se borran y podés volver a
        entrar con el código.
      </p>
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
      <div className="mt-3 flex justify-center gap-3">
        <button
          type="button"
          onClick={() => setConfirming(false)}
          disabled={pending}
          className="rounded-xl border border-border px-4 py-2 text-sm font-bold transition hover:bg-border/30 disabled:opacity-60"
        >
          Quedarme
        </button>
        <button
          type="button"
          onClick={leave}
          disabled={pending}
          className="rounded-xl bg-danger px-4 py-2 text-sm font-bold text-white transition hover:brightness-110 disabled:opacity-60"
        >
          {pending ? "Saliendo…" : "Salir"}
        </button>
      </div>
    </div>
  );
}
