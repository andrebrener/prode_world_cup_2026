"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createPoolAction } from "@/lib/actions";
import type { PoolMode } from "@/lib/cardCatalog";

export default function CreatePoolForm() {
  const [name, setName] = useState("");
  const [isPublic, setIsPublic] = useState(false);
  const [mode, setMode] = useState<PoolMode>("normal");
  const [startDate, setStartDate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    start(async () => {
      const res = await createPoolAction(name, isPublic, mode, startDate || null);
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
      className={`mx-auto max-w-md rounded-3xl border border-border bg-surface p-8 ${mode === "fun" ? "fun-mode fun-bg" : ""}`}
    >
      <h1 className="wordmark text-3xl">
        Crear un <span className={mode === "fun" ? "fun-text" : "text-primary"}>prode</span>
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

      {/* Modo: se elige al crear y no cambia */}
      <div className="mt-5 grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => setMode("normal")}
          aria-pressed={mode === "normal"}
          className={`rounded-2xl border p-4 text-left transition ${
            mode === "normal"
              ? "border-primary bg-background"
              : "border-border bg-background/40 opacity-70 hover:opacity-100"
          }`}
        >
          <div className="text-2xl">⚽</div>
          <div className="mt-1 font-bold text-foreground">Normal</div>
          <div className="mt-1 text-xs text-muted">
            El prode de siempre: pronósticos, puntos y tabla.
          </div>
        </button>
        <button
          type="button"
          onClick={() => setMode("fun")}
          aria-pressed={mode === "fun"}
          className={`relative rounded-2xl p-4 text-left transition ${
            mode === "fun"
              ? "fun-border [--fun-border-fill:var(--background)]"
              : "border border-border bg-background/40 opacity-70 hover:opacity-100"
          }`}
        >
          <div className={`text-2xl ${mode === "fun" ? "fun-float" : ""}`}>🃏</div>
          <div className="mt-1 font-bold text-foreground">
            Diversión <span aria-hidden>✨</span>
          </div>
          <div className="mt-1 text-xs text-muted">
            Todo lo del normal + carta sorpresa diaria, mufas y robos entre amigos, y
            rachas con puntos extra.
          </div>
        </button>
      </div>

      {/* Desde qué día suman los puntos. Vacío = desde el principio del torneo.
          Útil si armás el prode a mitad de camino: así los que entran no arrastran
          resultados de antes y todos compiten parejos desde esa fecha. */}
      <label className="mt-5 block text-sm font-semibold text-foreground">
        Suma puntos desde
        <input
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          className="mt-1 w-full rounded-xl border border-border bg-background px-4 py-3 text-foreground outline-none focus:border-primary"
        />
        <span className="mt-1 block text-xs font-normal text-muted">
          Opcional. Dejalo vacío para contar desde el principio del Mundial. Si lo
          armás a mitad de camino, poné una fecha y los partidos de antes no suman.
        </span>
      </label>

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
        className={`mt-5 w-full rounded-xl px-5 py-3 font-bold transition hover:brightness-110 disabled:opacity-60 ${
          mode === "fun" ? "fun-gradient text-white" : "bg-primary text-primary-ink"
        }`}
      >
        {pending ? "Creando…" : mode === "fun" ? "Crear prode Diversión ✨ →" : "Crear prode →"}
      </button>
    </form>
  );
}
