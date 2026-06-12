import { notFound } from "next/navigation";
import JoinForm from "@/components/JoinForm";
import JoinPoolButton from "@/components/JoinPoolButton";
import PredictionForm from "@/components/PredictionForm";
import KnockoutPredict from "@/components/KnockoutPredict";
import { getParticipantId } from "@/lib/session";
import {
  getParticipant,
  getParticipantPredictions,
  getParticipantExtras,
  getBracketState,
  getParticipantKoPredictions,
  getPoolBySlug,
  isPoolMember,
} from "@/lib/db/queries";
import { PREDICTIONS_DEADLINE, predictionsLockedForName } from "@/lib/fixtures";

export const dynamic = "force-dynamic";

export default async function JugarPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const pool = await getPoolBySlug(slug);
  if (!pool) notFound();

  const id = await getParticipantId();
  const participant = id ? await getParticipant(id) : null;

  if (!participant) {
    return (
      <JoinForm
        title={
          <>
            Sumate a <span className="text-primary">{pool.name}</span>
          </>
        }
        subtitle={`Poné tu nombre para jugar en "${pool.name}".`}
      />
    );
  }

  const member = await isPoolMember(pool.id, participant.id);
  if (!member) {
    return (
      <div className="mx-auto max-w-md rounded-3xl border border-border bg-surface p-8 text-center">
        <h1 className="wordmark text-3xl">
          Prode <span className="text-primary">{pool.name}</span>
        </h1>
        <p className="mt-2 text-sm text-muted">
          Sumate al prode para que tus pronósticos aparezcan en su tabla.
        </p>
        <JoinPoolButton codeOrSlug={pool.slug} slug={pool.slug} label={`Sumarme a ${pool.name}`} />
      </div>
    );
  }

  const [predictions, extras, bracket, koPreds] = await Promise.all([
    getParticipantPredictions(participant.id),
    getParticipantExtras(participant.id),
    getBracketState(),
    getParticipantKoPredictions(participant.id),
  ]);

  const hasSaved =
    Object.keys(predictions).length > 0 ||
    !!(extras.champion || extras.runnerUp || extras.topScorer || extras.figure);

  return (
    <div className="flex flex-col gap-8">
      <p className="rounded-xl border border-border bg-surface px-4 py-2 text-xs text-muted">
        Tus pronósticos son únicos y cuentan en <strong className="text-foreground">todos</strong> tus
        prodes. Editás una vez, valen en cada tabla.
      </p>
      <PredictionForm
        name={participant.name}
        initialPredictions={predictions}
        initialExtras={extras}
        hasSaved={hasSaved}
        locked={predictionsLockedForName(participant.name)}
        deadlineISO={PREDICTIONS_DEADLINE}
      />
      {bracket.generated && (
        <KnockoutPredict matches={bracket.matches} initial={koPreds} />
      )}
    </div>
  );
}
