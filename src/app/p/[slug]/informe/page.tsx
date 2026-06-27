// Informe del juego (modo Diversión): muestra el HTML que genera la skill
// `analisis-suerte` (uno por pool fun, en public/informes/<slug>.html). Se
// regenera A MANO una vez por día y se commitea — no hay cron acá.
//
// La página rompe el ancho del layout (max-w-3xl) para que el informe respire a
// pantalla completa, y el iframe se auto-ajusta de alto (ReportFrame) para que no
// haya scroll interno.

import fs from "fs";
import path from "path";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getPoolBySlug } from "@/lib/db/queries";
import ReportFrame from "@/components/ReportFrame";

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
    // Full-bleed: salir del max-w-3xl del layout para usar todo el ancho.
    <div className="relative left-1/2 right-1/2 -mx-[50vw] w-screen px-3 sm:px-6">
      <div className="mx-auto flex max-w-[1240px] flex-col gap-4">
        <header className="flex flex-wrap items-end justify-between gap-3 pt-1">
          <div>
            <h1 className="wordmark text-2xl sm:text-3xl">
              📊 Informe del juego · <span className="text-primary">{pool.name}</span>
            </h1>
            <p className="mt-1 text-sm text-muted">
              Quién tuvo más suerte con las cartas, las rachas y la guerra de
              cartas. Se actualiza una vez por día.
            </p>
          </div>
          <Link
            href={`/p/${pool.slug}`}
            className="shrink-0 rounded-xl border border-border bg-surface px-4 py-2 text-sm font-bold text-foreground transition hover:bg-background"
          >
            ← Volver
          </Link>
        </header>

        {exists ? (
          <div className="overflow-hidden rounded-2xl border border-border">
            <ReportFrame
              src={`/informes/${slug}.html`}
              title={`Informe del juego · ${pool.name}`}
            />
          </div>
        ) : (
          <div className="rounded-2xl border border-border bg-surface p-8 text-center text-sm text-muted">
            Todavía no hay informe generado para este prode. Aparece cuando se
            corre el análisis del día.
          </div>
        )}
      </div>
    </div>
  );
}
