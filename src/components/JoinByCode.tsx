"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { joinPoolAction } from "@/lib/actions";

export default function JoinByCode() {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    start(async () => {
      const res = await joinPoolAction(code);
      if (!res.ok) setError(res.error ?? "No se pudo unir.");
      else {
        router.push(`/p/${res.slug}`);
        router.refresh();
      }
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-2">
      <div className="flex gap-2">
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="Código del prode…"
          className="min-w-0 flex-1 rounded-xl border border-border bg-background px-4 py-2.5 text-foreground outline-none focus:border-primary"
        />
        <button
          type="submit"
          disabled={pending}
          className="shrink-0 rounded-xl border border-border px-4 py-2.5 font-semibold text-foreground transition hover:bg-surface disabled:opacity-60"
        >
          {pending ? "…" : "Unirme"}
        </button>
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
    </form>
  );
}
