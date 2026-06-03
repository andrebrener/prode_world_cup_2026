"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { joinPoolAction } from "@/lib/actions";

export default function JoinPoolButton({
  codeOrSlug,
  slug,
  label = "Sumarme a este prode",
}: {
  codeOrSlug: string;
  slug: string;
  label?: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  function join() {
    setError(null);
    start(async () => {
      const res = await joinPoolAction(codeOrSlug);
      if (!res.ok) setError(res.error ?? "No se pudo unir.");
      else {
        router.push(`/p/${res.slug ?? slug}`);
        router.refresh();
      }
    });
  }

  return (
    <div className="mt-5">
      <button
        type="button"
        onClick={join}
        disabled={pending}
        className="w-full rounded-xl bg-primary px-5 py-3 font-bold text-primary-ink transition hover:brightness-110 disabled:opacity-60"
      >
        {pending ? "Sumándote…" : label}
      </button>
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
    </div>
  );
}
