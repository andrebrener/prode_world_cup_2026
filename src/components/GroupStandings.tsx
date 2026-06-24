import { GROUPS, teamName, teamFlag } from "@/lib/fixtures";
import type { TeamStanding } from "@/lib/standings";

export default function GroupStandings({
  standings,
}: {
  standings: Record<string, TeamStanding[]>;
}) {
  return (
    <section>
      <h2 className="mb-3 wordmark text-2xl">Posiciones por grupo</h2>
      <p className="mb-4 text-sm text-muted">
        Según los resultados cargados. Es la base de las llaves.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        {GROUPS.map((g) => {
          const rows = standings[g.letter];
          const closed = rows.length > 0 && rows.every((r) => r.played === 3);
          return (
            <div
              key={g.letter}
              className="overflow-hidden rounded-2xl border border-border bg-surface"
            >
              <div className="flex items-center justify-between border-b border-border px-4 py-2 font-bold">
                <span>Grupo {g.letter}</span>
                {closed && (
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
                    Cerrado
                  </span>
                )}
              </div>
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-muted">
                    <th className="px-3 py-1.5 font-medium">Equipo</th>
                    <th className="px-1 py-1.5 text-center font-medium">PJ</th>
                    <th className="px-1 py-1.5 text-center font-medium">DG</th>
                    <th className="px-3 py-1.5 text-center font-medium">Pts</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr
                      key={r.code}
                      className={`border-t border-border/60 ${i < 2 ? "bg-primary/5" : ""}`}
                    >
                      <td className="px-3 py-1.5">
                        <span className="mr-1">{teamFlag(r.code)}</span>
                        {teamName(r.code)}
                      </td>
                      <td className="px-1 py-1.5 text-center text-muted">{r.played}</td>
                      <td className="px-1 py-1.5 text-center text-muted">
                        {r.goalDiff > 0 ? `+${r.goalDiff}` : r.goalDiff}
                      </td>
                      <td className="px-3 py-1.5 text-center font-bold text-foreground">
                        {r.points}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        })}
      </div>
    </section>
  );
}
