import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getLeaderboard,
  getResultsMap,
  getTournamentResult,
  getPredictionsByMatch,
  getKoPredictionsByMatch,
  getResolvedMatchPoints,
  getBracketState,
  getPoolBySlug,
  isPoolMember,
  getFunState,
  getPoolRole,
} from "@/lib/db/queries";
import FunBadge from "@/components/FunBadge";
import FunZone from "@/components/FunZone";
import EmailCapture from "@/components/EmailCapture";
import { getParticipantId } from "@/lib/session";
import { getParticipant } from "@/lib/db/queries";
import { teamName, teamFlag } from "@/lib/fixtures";
import { pickableMatches } from "@/lib/cards";
import MatchdayPanel from "@/components/MatchdayPanel";
import KnockoutBracket from "@/components/KnockoutBracket";
import Leaderboard from "@/components/Leaderboard";
import PushNudge from "@/components/PushNudge";
import InstallAppBanner from "@/components/InstallAppBanner";
import JoinForm from "@/components/JoinForm";
import JoinPoolButton from "@/components/JoinPoolButton";
import LeavePoolButton from "@/components/LeavePoolButton";
import ShareCode from "@/components/ShareCode";

export const dynamic = "force-dynamic";

export default async function PoolTabla({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const pool = await getPoolBySlug(slug);
  if (!pool) notFound();

  const participantId = await getParticipantId();
  const participant = participantId ? await getParticipant(participantId) : null;
  const member = participant ? await isPoolMember(pool.id, participant.id) : false;

  // No tenés nombre todavía: pedirlo para poder sumarte.
  if (!participant) {
    return (
      <JoinForm
        title={
          <>
            Sumate a <span className="text-primary">{pool.name}</span>
          </>
        }
        subtitle={`Te invitaron al prode "${pool.name}". Poné tu nombre para entrar.`}
      />
    );
  }

  // Tenés nombre pero no sos miembro: ofrecer unirse.
  if (!member) {
    return (
      <div className="mx-auto max-w-md rounded-3xl border border-border bg-surface p-8 text-center">
        <h1 className="wordmark text-3xl">
          Prode <span className="text-primary">{pool.name}</span>
        </h1>
        <p className="mt-2 text-sm text-muted">
          Todavía no estás en este prode. Sumate para aparecer en su tabla con tus
          pronósticos.
        </p>
        <JoinPoolButton codeOrSlug={pool.slug} slug={pool.slug} label={`Sumarme a ${pool.name}`} />
      </div>
    );
  }

  const role = await getPoolRole(pool.id, participant.id);
  const canManage = role === "owner" || role === "admin";

  const isFun = pool.mode === "fun";
  const [
    leaderboard,
    results,
    tourney,
    predictionsByMatch,
    koPredictionsByMatch,
    bracket,
    funState,
    resolvedPts,
  ] =
    await Promise.all([
      getLeaderboard(pool, participant.id),
      getResultsMap(),
      getTournamentResult(),
      getPredictionsByMatch(pool.id, isFun),
      getKoPredictionsByMatch(pool.id, isFun),
      getBracketState(),
      isFun ? getFunState(pool, participant.id) : Promise.resolve(null),
      // Puntos reales post-cartas (con bloqueos/robos/multiplicadores aplicados):
      // el panel de partidos los usa para no mostrar un "+3" que en realidad no se sumó.
      isFun ? getResolvedMatchPoints(pool) : Promise.resolve(null),
    ]);
  const hasResults = Object.keys(results).length > 0;

  return (
    <div
      className={`flex flex-col gap-8 ${isFun ? "fun-mode fun-bg -mx-2 rounded-3xl p-4 sm:-mx-4 sm:p-6" : ""}`}
    >
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="wordmark flex flex-wrap items-center gap-3 text-4xl">
            <span>
              Tabla{" "}
              <span className={isFun ? "fun-text" : "text-primary"}>{pool.name}</span>
            </span>
            <FunBadge mode={pool.mode} size="lg" />
          </h1>
          <p className="mt-1 text-sm text-muted">
            {leaderboard.length === 0
              ? "Todavía no hay jugadores. "
              : `${leaderboard.length} ${leaderboard.length === 1 ? "jugador" : "jugadores"}. `}
            {!hasResults && "Los puntos aparecen cuando se carguen resultados."}
            {isFun &&
              " Acá hay cartas y rachas: el total suma (o resta) lo que pase en la Zona de cartas."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isFun && (
            <Link
              href={`/p/${pool.slug}/informe`}
              className="rounded-xl border border-border bg-surface px-4 py-2 text-sm font-bold text-foreground transition hover:bg-background"
            >
              📊 Informe
            </Link>
          )}
          {canManage && (
            <Link
              href={`/p/${pool.slug}/admin`}
              className="rounded-xl border border-border bg-surface px-4 py-2 text-sm font-bold text-foreground transition hover:bg-background"
            >
              ⚙️ Administrar
            </Link>
          )}
          <Link
            href={`/p/${pool.slug}/jugar`}
            className={`rounded-xl px-4 py-2 text-sm font-bold transition hover:brightness-110 ${
              isFun ? "fun-gradient text-white" : "bg-primary text-primary-ink"
            }`}
          >
            Jugar →
          </Link>
          {/* Salir del prode: una acción más, al lado de "Jugar" */}
          <LeavePoolButton slug={pool.slug} poolName={pool.name} variant="action" />
        </div>
      </header>

      <ShareCode code={pool.code} slug={pool.slug} />

      {/* En el navegador: ofrecer instalar la app. Ya en la PWA: empujar las notis. */}
      <InstallAppBanner />
      <PushNudge />

      {/* Pedir el mail para el resumen diario (solo modo Diversión, una vez) */}
      {isFun && !participant.email && <EmailCapture />}

      {/* Zona de cartas (solo modo Diversión) */}
      {isFun && funState && (
        <FunZone
          slug={pool.slug}
          state={funState}
          members={leaderboard.map((r) => ({ id: r.id, name: r.name, avatar: r.avatar, total: r.total }))}
          meId={participant.id}
          myInfo={leaderboard.find((r) => r.id === participant.id)?.fun ?? null}
          matchOptions={pickableMatches()}
        />
      )}

      {/* Leaderboard (filas clickeables → drawer con todos los pronósticos) */}
      <Leaderboard rows={leaderboard} poolId={isFun ? pool.id : undefined} />
      {leaderboard.length > 0 && (
        <p className="-mt-5 text-xs text-muted">Tocá un jugador para ver todos sus pronósticos.</p>
      )}

      {/* Resultado real del torneo */}
      {(tourney.champion || tourney.topScorer || tourney.figure || tourney.runnerUp) && (
        <section className="rounded-2xl border border-gold/40 bg-surface p-5 text-sm">
          <h2 className="mb-3 font-bold text-gold">⭐ Resultado del torneo</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Fact label="Campeón" value={tourney.champion ? `${teamFlag(tourney.champion)} ${teamName(tourney.champion)}` : "—"} />
            <Fact label="Subcampeón" value={tourney.runnerUp ? `${teamFlag(tourney.runnerUp)} ${teamName(tourney.runnerUp)}` : "—"} />
            <Fact label="Goleador" value={tourney.topScorer || "—"} />
            <Fact label="Figura" value={tourney.figure || "—"} />
          </div>
        </section>
      )}

      {/* Partidos del día con pronósticos de cada uno + simulador */}
      <MatchdayPanel
        predictionsByMatch={predictionsByMatch}
        resultsByMatch={results}
        koMatches={bracket.generated ? bracket.matches : []}
        koPredictionsByMatch={koPredictionsByMatch}
        slug={pool.slug}
        meId={participant.id}
        leaderboard={leaderboard.map((r) => ({ id: r.id, name: r.name, total: r.total }))}
        resolvedPoints={resolvedPts?.resolved}
        annulledMatches={resolvedPts?.annulled}
        stolenMatches={resolvedPts?.stolen}
        streakMatches={resolvedPts?.streak}
      />

      {/* Cuadro de llaves (árbol: se sigue el camino de cada cruce hacia la final) */}
      {bracket.generated && (
        <section>
          <h2 className="mb-3 wordmark text-2xl">Cuadro de llaves</h2>
          <KnockoutBracket matches={bracket.matches} />
        </section>
      )}
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-muted">{label}</div>
      <div className="font-semibold text-foreground">{value}</div>
    </div>
  );
}
