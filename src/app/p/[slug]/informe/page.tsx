// Informe del juego (modo Diversión): muestra el HTML que genera la skill
// `analisis-suerte` (uno por pool fun, en public/informes/<slug>.html). Se
// regenera A MANO una vez por día y se commitea — no hay cron acá.

import fs from "fs";
import path from "path";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getPoolBySlug } from "@/lib/db/queries";

export const dynamic = "force-dynamic";

export default async function InformePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const pool = await getPoolBySlug(slug);
  if (!pool) notFound();
  if (pool.mode !== "fun") notFound();

  const file = path.join(process.cwd(), "public", "informes", `${slug}.html`);
  const exists = fs.existsSync(file);

  return (
    <div className="fun-mode fun-bg -mx-2 flex flex-col gap-5 rounded-3xl p-4 sm:-mx-4 sm:p-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="wordmark text-3xl">
            📊 Informe del juego · <span className="fun-text">{pool.name}</span>
          </h1>
          <p className="mt-1 text-sm text-muted">
            Quién tuvo más suerte con las cartas, las rachas y la guerra de
            cartas. Se actualiza una vez por día.
          </p>
        </div>
        <Link
          href={`/p/${pool.slug}`}
          className="rounded-xl border border-border bg-surface px-4 py-2 text-sm font-bold text-foreground transition hover:bg-background"
        >
          ← Volver a la tabla
        </Link>
      </header>

      {exists ? (
        <iframe
          src={`/informes/${slug}.html`}
          title={`Informe del juego · ${pool.name}`}
          className="h-[80vh] w-full rounded-2xl border border-border bg-[#0d1117]"
        />
      ) : (
        <div className="rounded-2xl border border-border bg-surface p-8 text-center text-sm text-muted">
          Todavía no hay informe generado para este prode. Aparece cuando se
          corre el análisis del día.
        </div>
      )}
    </div>
  );
}
