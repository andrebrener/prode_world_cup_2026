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
      <header>
        <h1 className="wordmark text-4xl">
          Hola <span className="text-primary">{participant.name}</span> 👋
        </h1>
        <p className="mt-1 text-sm text-muted">
          Tus prodes del Mundial 2026. Tus pronósticos son únicos y cuentan en todos.
        </p>
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
              <Link
                key={p.id}
                href={`/p/${p.slug}`}
                className="group flex items-center justify-between rounded-2xl border border-border bg-surface px-5 py-4 transition hover:border-primary"
              >
                <div>
                  <div className="font-bold text-foreground group-hover:text-primary">
                    {p.name}
                  </div>
                  <div className="text-xs text-muted">
                    {p.memberCount} {p.memberCount === 1 ? "jugador" : "jugadores"}
                    {p.isPublic ? " · público" : " · privado"}
                  </div>
                </div>
                <span className="text-muted group-hover:text-primary">→</span>
              </Link>
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
                className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-surface px-5 py-4"
              >
                <div>
                  <div className="font-bold text-foreground">{p.name}</div>
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
