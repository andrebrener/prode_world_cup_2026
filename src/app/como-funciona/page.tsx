import Link from "next/link";
import { getTotalParticipantCount } from "@/lib/db/queries";
import { getParticipantId } from "@/lib/session";
import { MATCHES, SCORING } from "@/lib/fixtures";
import { STREAK_MILESTONES } from "@/lib/cardCatalog";
import WorldCupMark from "@/components/WorldCupMark";

export const dynamic = "force-dynamic";

export default async function ComoFunciona() {
  const [count, participantId] = await Promise.all([
    getTotalParticipantCount().catch(() => 0),
    getParticipantId(),
  ]);

  return (
    <div className="flex flex-col gap-8">
      <section className="relative overflow-hidden rounded-3xl border border-border bg-surface p-8 sm:p-10">
        <div className="absolute right-6 top-6 hidden sm:block">
          <WorldCupMark size="md" />
        </div>
        <p className="mb-3 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-bold uppercase tracking-widest text-primary">
          FIFA World Cup 2026 · 🇨🇦 🇲🇽 🇺🇸
        </p>
        <h1 className="wordmark text-5xl sm:text-6xl">
          MUNDIAL <span className="fifa-text">2026</span>
        </h1>
        <p className="mt-2 wordmark text-xl text-muted sm:text-2xl">
          prode entre amigos 🟢
        </p>
        <p className="mt-4 max-w-lg text-muted">
          El prode para el Mundial de Canadá, México y Estados Unidos. Creá tu prode con
          amigos y pronosticá los{" "}
          <strong className="text-foreground">{MATCHES.length} partidos</strong> de la fase de
          grupos, más campeón, subcampeón, goleador y figura. El que más la pega, gana. El
          último… ya sabés.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/"
            className="rounded-xl bg-primary px-5 py-3 font-bold text-primary-ink transition hover:brightness-110"
          >
            {participantId ? "Ir a mis prodes →" : "Empezar →"}
          </Link>
          <Link
            href="/crear"
            className="rounded-xl border border-border px-5 py-3 font-semibold text-foreground transition hover:bg-background"
          >
            Crear un prode
          </Link>
        </div>
        <p className="mt-4 text-sm text-muted">
          {count > 0 ? (
            <>
              Ya hay <span className="text-foreground font-semibold">{count}</span>{" "}
              {count === 1 ? "jugador" : "jugadores"} adentro.
            </>
          ) : (
            <>Sé el primero en entrar 👀</>
          )}
        </p>
      </section>

      <section className="grid gap-3 sm:grid-cols-2">
        <Card title="Cómo funciona" emoji="📋">
          <ul className="space-y-1.5">
            <li>1. Entrás y ponés tu nombre.</li>
            <li>2. Completás el marcador de cada partido de grupos.</li>
            <li>3. Elegís campeón, subcampeón, goleador y figura.</li>
            <li>4. Se cargan los resultados reales y suma la tabla.</li>
            <li>5. Terminada la fase de grupos, se arman las llaves y las pronosticás.</li>
          </ul>
        </Card>
        <Card title="Puntaje" emoji="🎯">
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted/80">
            Fase de grupos
          </p>
          <ul className="space-y-1.5">
            <li>
              <Pts n={SCORING.exact} /> resultado <strong>exacto</strong> del partido
            </li>
            <li>
              <Pts n={SCORING.outcome} /> acertás quién gana o el empate
            </li>
          </ul>
          <p className="mb-1.5 mt-3 text-xs font-semibold uppercase tracking-wider text-muted/80">
            Llaves / eliminatorias
          </p>
          <ul className="space-y-1.5">
            <li>
              <Pts n={SCORING.knockout.exact} /> resultado <strong>exacto</strong>
            </li>
            <li>
              <Pts n={SCORING.knockout.winner} /> acertás quién pasa de ronda
            </li>
            <li>
              <Pts n={SCORING.knockout.penaltyWinner} /> bonus si gana en{" "}
              <strong>penales</strong> y lo cantaste
            </li>
          </ul>
          <p className="mb-1.5 mt-3 text-xs font-semibold uppercase tracking-wider text-muted/80">
            Apuestas grandes
          </p>
          <ul className="space-y-1.5">
            <li>
              <Pts n={SCORING.champion} /> campeón · <Pts n={SCORING.runnerUp} />{" "}
              subcampeón
            </li>
            <li>
              <Pts n={SCORING.topScorer} /> goleador · <Pts n={SCORING.figure} /> figura
            </li>
          </ul>
        </Card>
      </section>

      {/* Modo Diversión */}
      <section className="fun-mode fun-border rounded-3xl p-6">
        <h2 className="wordmark flex items-center gap-3 text-3xl">
          <span className="fun-text">Modo Diversión</span> 🃏✨
        </h2>
        <p className="mt-2 max-w-2xl text-sm text-muted">
          Al crear un prode podés elegirlo en <strong className="text-foreground">modo
          Diversión</strong>: todo lo del prode normal, más cartas y rachas. Solo vale en
          ese prode — tus pronósticos siguen siendo los mismos en todos.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-border bg-surface p-4 text-sm text-muted">
            <h3 className="mb-2 font-bold text-foreground">🎴 Carta del día</h3>
            Cada día tenés una carta sorpresa (común, rara o legendaria)… o una{" "}
            <strong className="text-foreground">maldición ☠️</strong>. La carta se{" "}
            <strong className="text-foreground">juega sola al salir</strong>: los buffs se
            activan, los ataques te piden la víctima en el momento, y no hay vuelta atrás.
            Si no la reclamás antes de medianoche 🇲🇽, se pierde. Y ojo: si sacás un{" "}
            <strong className="text-foreground">ataque y no se lo jugás a nadie</strong>, te
            rebota solo 🎯.
          </div>
          <div className="rounded-2xl border border-border bg-surface p-4 text-sm text-muted">
            <h3 className="mb-2 font-bold text-foreground">😈 Buffs, mufas y traiciones</h3>
            Dobles y triples, días enteros mufados, matambres de cerdo robados, robos de
            puntos y el vidente Sai Bamba. Escudos que bloquean y espejitos que devuelven —
            y son <strong className="text-foreground">secretos</strong>: nadie sabe quién
            está protegido hasta que le tira y la carta rebota. Si nadie ataca, recién al
            otro día aparece en el libro de pases. Los efectos se acumulan en orden de
            jugada. Y las sociales: apodos, fotos truchas y declaraciones fijadas, hasta que
            la víctima juegue Borrón y cuenta nueva 🧽.
          </div>
          <div className="rounded-2xl border border-border bg-surface p-4 text-sm text-muted">
            <h3 className="mb-2 font-bold text-foreground">🔥 Rachas</h3>
            Partidos seguidos sumando puntos encienden tu racha:{" "}
            {STREAK_MILESTONES.map((m, i) => (
              <span key={m.len}>
                {i > 0 && " · "}
                {m.len} seguidos <Pts n={m.bonus} />
              </span>
            ))}
            . Un partido en cero la corta (salvo que tengas un Fernet de Fernemo 🥃 a mano).
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-surface p-5 text-sm text-muted">
        <p className="font-semibold text-foreground">¿Y las llaves?</p>
        <p className="mt-1">
          Cuando estén los 72 resultados de grupos, apretás{" "}
          <em className="text-foreground">“Actualizar llaves”</em> en Resultados oficiales
          y el cuadro se arma solo (1°, 2° de cada grupo + los 8 mejores terceros). Ahí
          pronosticás cada cruce: marcador, quién pasa y el bonus por penales.
        </p>
      </section>
    </div>
  );
}

function Card({
  title,
  emoji,
  children,
}: {
  title: string;
  emoji: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-5">
      <h2 className="mb-3 flex items-center gap-2 font-bold text-foreground">
        <span>{emoji}</span> {title}
      </h2>
      <div className="text-sm text-muted">{children}</div>
    </div>
  );
}

function Pts({ n }: { n: number }) {
  return (
    <span className="mr-1 inline-block min-w-7 rounded-md bg-primary/15 px-1.5 text-center font-bold text-primary">
      +{n}
    </span>
  );
}
