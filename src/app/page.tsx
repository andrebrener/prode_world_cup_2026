import Link from "next/link";
import { getParticipantId } from "@/lib/session";
import {
  getParticipant,
  getUserPools,
  getPublicPools,
} from "@/lib/db/queries";
import JoinForm from "@/components/JoinForm";
import JoinByCode from "@/components/JoinByCode";
import JoinPoolButton from "@/components/JoinPoolButton";
import LeavePoolButton from "@/components/LeavePoolButton";
import Avatar from "@/components/Avatar";
import FunBadge from "@/components/FunBadge";

export const dynamic = "force-dynamic";

export default async function Home() {
  const id = await getParticipantId();
  const participant = id ? await getParticipant(id) : null;

  if (!participant) {
    return (
      <JoinForm
        title={
          <>
            Bienvenido al <span className="text-primary">prode</span> ⚽
          </>
        }
        subtitle="Poné tu nombre para empezar. Después creás tu prode o te sumás a uno con un código."
      />
    );
  }

  const [myPools, publicPools] = await Promise.all([
    getUserPools(participant.id),
    getPublicPools(),
  ]);
  const myIds = new Set(myPools.map((p) => p.id));
  const otherPublic = publicPools.filter((p) => !myIds.has(p.id));

  return (
    <div className="flex flex-col gap-8">
      <header className="flex items-center gap-4">
        <Link href="/perfil" className="transition hover:opacity-80" aria-label="Mi perfil">
          <Avatar name={participant.name} avatar={participant.avatar ?? null} size={56} />
        </Link>
        <div>
          <h1 className="wordmark text-4xl">
            Hola <span className="text-primary">{participant.name}</span> 👋
          </h1>
          <p className="mt-1 text-sm text-muted">
            Tus prodes del Mundial 2026. Tus pronósticos son únicos y cuentan en todos.
          </p>
        </div>
      </header>

      {/* Mis prodes */}
      <section>
        <h2 className="mb-3 wordmark text-2xl">Mis prodes</h2>
        {myPools.length === 0 ? (
          <p className="rounded-2xl border border-border bg-surface p-6 text-sm text-muted">
            Todavía no estás en ningún prode. Creá uno o sumate con un código abajo.
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {myPools.map((p) => (
              <div
                key={p.id}
                className={`group flex items-center justify-between gap-3 rounded-2xl bg-surface px-5 py-4 transition ${
                  p.mode === "fun"
                    ? "fun-mode fun-border"
                    : "border border-border hover:border-primary"
                }`}
              >
                <Link href={`/p/${p.slug}`} className="flex min-w-0 flex-1 items-center justify-between">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 font-bold text-foreground group-hover:text-primary">
                      {p.name}
                      {p.mode === "fun" && <FunBadge mode="fun" />}
                    </div>
                    <div className="text-xs text-muted">
                      {p.memberCount} {p.memberCount === 1 ? "jugador" : "jugadores"}
                      {p.isPublic ? " · público" : " · privado"}
                    </div>
                  </div>
                  <span className="ml-3 text-muted group-hover:text-primary">→</span>
                </Link>
                <LeavePoolButton slug={p.slug} poolName={p.name} variant="inline" />
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Crear / unirme */}
      <section className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-border bg-surface p-5">
          <h3 className="font-bold text-foreground">Crear un prode</h3>
          <p className="mt-1 text-sm text-muted">
            Armá tu grupo y compartí el link con tus amigos.
          </p>
          <Link
            href="/crear"
            className="mt-4 inline-block rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-ink transition hover:brightness-110"
          >
            + Nuevo prode
          </Link>
        </div>
        <div className="rounded-2xl border border-border bg-surface p-5">
          <h3 className="font-bold text-foreground">Unirme con código</h3>
          <p className="mt-1 mb-3 text-sm text-muted">
            ¿Te pasaron un código? Pegalo acá.
          </p>
          <JoinByCode />
        </div>
      </section>

      {/* Prodes públicos */}
      {otherPublic.length > 0 && (
        <section>
          <h2 className="mb-3 wordmark text-2xl">Prodes públicos</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {otherPublic.map((p) => (
              <div
                key={p.id}
                className={`flex items-center justify-between gap-3 rounded-2xl bg-surface px-5 py-4 ${
                  p.mode === "fun" ? "fun-mode fun-border" : "border border-border"
                }`}
              >
                <div>
                  <div className="flex items-center gap-2 font-bold text-foreground">
                    {p.name}
                    {p.mode === "fun" && <FunBadge mode="fun" />}
                  </div>
                  <div className="text-xs text-muted">
                    {p.memberCount} {p.memberCount === 1 ? "jugador" : "jugadores"}
                  </div>
                </div>
                <JoinPoolButtonInline slug={p.slug} />
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

// Botón compacto para el listado público (reusa JoinPoolButton con estilo chico).
function JoinPoolButtonInline({ slug }: { slug: string }) {
  return (
    <div className="shrink-0">
      <JoinPoolButton codeOrSlug={slug} slug={slug} label="Unirme" />
    </div>
  );
}
