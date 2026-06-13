import Link from "next/link";
import { notFound } from "next/navigation";
import { getPoolBySlug, getPoolRole, getPoolAdmin } from "@/lib/db/queries";
import { getParticipantId } from "@/lib/session";
import { ensureFunPool } from "@/lib/db/decks";
import { MECHANIC_OPTIONS } from "@/lib/cardCatalog";
import PoolAdmin from "@/components/PoolAdmin";

export const dynamic = "force-dynamic";

export default async function PoolAdminPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const pool = await getPoolBySlug(slug);
  if (!pool) notFound();

  const pid = await getParticipantId();
  const role = pid ? await getPoolRole(pool.id, pid) : null;

  if (role !== "owner" && role !== "admin") {
    return (
      <div className="mx-auto max-w-md rounded-3xl border border-border bg-surface p-8 text-center">
        <h1 className="wordmark text-2xl">Solo para administradores</h1>
        <p className="mt-2 text-sm text-muted">
          No tenés permiso para administrar <span className="font-semibold">{pool.name}</span>.
        </p>
        <Link href={`/p/${pool.slug}`} className="mt-4 inline-block text-primary underline">
          ← Volver a la tabla
        </Link>
      </div>
    );
  }

  // Para los prodes fun, garantizamos mazo + config para tener algo que editar.
  if (pool.mode === "fun") await ensureFunPool(pool.id);
  const data = await getPoolAdmin(pool.id);

  return (
    <PoolAdmin
      slug={pool.slug}
      poolName={pool.name}
      isFun={pool.mode === "fun"}
      myRole={role}
      meId={pid!}
      data={data}
      mechanics={MECHANIC_OPTIONS}
    />
  );
}
