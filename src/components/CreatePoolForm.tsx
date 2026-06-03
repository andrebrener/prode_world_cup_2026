"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createPoolAction } from "@/lib/actions";

export default function CreatePoolForm() {
  const [name, setName] = useState("");
  const [isPublic, setIsPublic] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    start(async () => {
      const res = await createPoolAction(name, isPublic);
      if (!res.ok) setError(res.error ?? "No se pudo crear.");
      else {
        router.push(`/p/${res.slug}`);
        router.refresh();
      }
    });
  }

  return (
    <form
      onSubmit={submit}
      className="mx-auto max-w-md rounded-3xl border border-border bg-surface p-8"
    >
      <h1 className="wordmark text-3xl">
        Crear un <span className="text-primary">prode</span>
      </h1>
      <p className="mt-2 text-sm text-muted">
        Ponele un nombre. Vas a poder invitar amigos con un link o código.
      </p>
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Nombre del prode…"
        maxLength={40}
        className="mt-5 w-full rounded-xl border border-border bg-background px-4 py-3 text-foreground outline-none focus:border-primary"
      />
      <label className="mt-4 flex items-center gap-2 text-sm text-foreground">
        <input
          type="checkbox"
          checked={isPublic}
          onChange={(e) => setIsPublic(e.target.checked)}
          className="h-4 w-4 accent-primary"
        />
        Público (aparece en el listado para que cualquiera se sume)
      </label>
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="mt-5 w-full rounded-xl bg-primary px-5 py-3 font-bold text-primary-ink transition hover:brightness-110 disabled:opacity-60"
      >
        {pending ? "Creando…" : "Crear prode →"}
      </button>
    </form>
  );
}
