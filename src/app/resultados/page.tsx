import ResultsEditor from "@/components/ResultsEditor";
import KnockoutResultsSection from "@/components/KnockoutResultsSection";
import ResultadosTabs from "@/components/ResultadosTabs";
import GroupStandings from "@/components/GroupStandings";
import { getParticipantId } from "@/lib/session";
import {
  getParticipant,
  getResultsMap,
  getTournamentResult,
  getBracketState,
} from "@/lib/db/queries";
import { allGroupStandings } from "@/lib/standings";
import { MATCHES } from "@/lib/fixtures";

export const dynamic = "force-dynamic";

export default async function ResultadosPage() {
  const id = await getParticipantId();
  const [participant, results, tournament, bracket] = await Promise.all([
    id ? getParticipant(id) : null,
    getResultsMap(),
    getTournamentResult(),
    getBracketState(),
  ]);
  const standings = allGroupStandings(results);

  return (
    <ResultadosTabs
      resultados={
        <>
          <ResultsEditor
            canEdit={!!participant}
            initialResults={results}
            initialTournament={tournament}
          />
          <KnockoutResultsSection
            canEdit={!!participant}
            groupResultsCount={Object.keys(results).length}
            groupTotal={MATCHES.length}
            generated={bracket.generated}
            matches={bracket.matches}
          />
        </>
      }
      posiciones={<GroupStandings standings={standings} />}
    />
  );
}
