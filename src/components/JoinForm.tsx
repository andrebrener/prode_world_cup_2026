"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { joinAction } from "@/lib/actions";

export default function JoinForm({
  currentName,
  title,
  subtitle,
}: {
  currentName?: string;
  title?: React.ReactNode;
  subtitle?: string;
}) {
  const [name, setName] = useState(currentName ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    start(async () => {
      const res = await joinAction(name);
      if (!res.ok) setError(res.error ?? "Algo salió mal.");
      else router.refresh();
    });
  }

  return (
    <form
      onSubmit={submit}
      className="mx-auto max-w-md rounded-3xl border border-border bg-surface p-8"
    >
      <h1 className="wordmark text-3xl">
        {title ?? (
          <>
            Entrá al <span className="text-primary">prode</span>
          </>
        )}
      </h1>
      <p className="mt-2 text-sm text-muted">
        {subtitle ?? "Poné tu nombre o apodo. Con eso aparecés en las tablas."}
      </p>
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Tu nombre…"
        maxLength={40}
        className="mt-5 w-full rounded-xl border border-border bg-background px-4 py-3 text-foreground outline-none focus:border-primary"
      />
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="mt-4 w-full rounded-xl bg-primary px-5 py-3 font-bold text-primary-ink transition hover:brightness-110 disabled:opacity-60"
      >
        {pending ? "Entrando…" : currentName ? "Guardar nombre" : "Entrar →"}
      </button>
    </form>
  );
}
