import type { ReactNode } from "react";
import { teamName, teamFlag } from "@/lib/fixtures";
import {
  KO_MATCHES_BY_ID,
  ROUND_SHORT,
  type ResolvedKoMatch,
  type KoRound,
} from "@/lib/bracket";

// Cuadro de llaves en árbol: R32 a la izquierda, la Final a la derecha. Cada cruce
// se conecta con los dos de la ronda anterior que lo alimentan, así se siguen los
// caminos de un vistazo (W73 → W90 → W97 → …).

/** Los dos cruces que alimentan a `id` (o null si es de R32, que no depende de nadie). */
function childrenOf(id: string): [string, string] | null {
  const def = KO_MATCHES_BY_ID[id];
  if (!def) return null;
  if (def.home.kind === "matchWinner" && def.away.kind === "matchWinner") {
    return [def.home.match, def.away.match];
  }
  return null;
}

function Side({
  code,
  label,
  score,
  isWinner,
}: {
  code: string | null;
  label: string;
  score: number | null;
  isWinner: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-1.5 px-2 py-1 ${
        isWinner ? "font-bold text-primary" : "text-foreground"
      }`}
    >
      <span className="w-4 shrink-0 text-center text-xs">{code ? teamFlag(code) : "·"}</span>
      <span className="min-w-0 flex-1 truncate text-[11px]">
        {code ? teamName(code) : label}
      </span>
      {score != null && <span className="shrink-0 font-mono text-[11px]">{score}</span>}
    </div>
  );
}

function MatchCard({ m }: { m: ResolvedKoMatch }) {
  const r = m.result;
  return (
    <div className="w-32 shrink-0 overflow-hidden rounded-lg border border-border bg-surface sm:w-36">
      <div className="flex items-center justify-between border-b border-border/50 bg-background/40 px-2 py-0.5 text-[9px] uppercase tracking-wide text-muted">
        <span className="font-mono">#{m.id}</span>
        <span>{ROUND_SHORT[m.round]}</span>
      </div>
      <Side
        code={m.home}
        label={m.homeLabel}
        score={r ? r.homeGoals : null}
        isWinner={!!m.winner && m.winner === m.home}
      />
      <div className="border-t border-border/40" />
      <Side
        code={m.away}
        label={m.awayLabel}
        score={r ? r.awayGoals : null}
        isWinner={!!m.winner && m.winner === m.away}
      />
      {r?.penalties && m.winner && (
        <div className="border-t border-border/40 bg-background/40 px-2 py-0.5 text-[9px] text-muted">
          🥅 pen. {teamName(m.winner)}
        </div>
      )}
    </div>
  );
}

/** Nodo del árbol: dibuja sus dos hijos a la izquierda + conector + el cruce. */
function Node({
  id,
  byId,
  below,
}: {
  id: string;
  byId: Record<string, ResolvedKoMatch>;
  // Contenido anclado debajo del cruce (lo usa la raíz para colgar el 3er puesto
  // bajo la final sin descentrar el conector).
  below?: ReactNode;
}) {
  const m = byId[id];
  if (!m) return null;
  const kids = childrenOf(id);

  if (!kids) {
    return (
      <div className="flex items-center">
        <MatchCard m={m} />
      </div>
    );
  }

  return (
    <div className="flex items-stretch">
      {/* Los dos cruces que alimentan a este */}
      <div className="flex flex-col">
        <div className="flex flex-1 items-center">
          <Node id={kids[0]} byId={byId} />
        </div>
        <div className="flex flex-1 items-center">
          <Node id={kids[1]} byId={byId} />
        </div>
      </div>
      {/* Conector en ┤: verticales que unen ambos hijos con la altura del padre */}
      <div className="flex w-4 flex-col sm:w-6">
        <div className="flex-1" />
        <div className="flex-1 border-r-2 border-t-2 border-border" />
        <div className="flex-1 border-r-2 border-b-2 border-border" />
        <div className="flex-1" />
      </div>
      {/* Línea corta hacia el cruce, centrada verticalmente */}
      <div className="flex items-center">
        <div className="h-0.5 w-2 bg-border sm:w-3" />
        <div className="relative">
          <MatchCard m={m} />
          {below}
        </div>
      </div>
    </div>
  );
}

export default function KnockoutBracket({ matches }: { matches: ResolvedKoMatch[] }) {
  const byId: Record<string, ResolvedKoMatch> = Object.fromEntries(
    matches.map((m) => [m.id, m]),
  );
  // Raíz = Final (104). El 3er puesto (103) no está en el árbol: va aparte.
  if (!byId["104"]) return null;
  const third = byId["103"];

  // Etiquetas de ronda como encabezado (de R32 a Final, izquierda → derecha).
  const HEADERS: KoRound[] = ["R32", "R16", "QF", "SF", "F"];

  return (
    <div className="overflow-x-auto pb-2">
      <div className="min-w-max">
        {/* El gap iguala (conector + línea corta) para alinear con las columnas del árbol. */}
        <div className="mb-2 flex gap-6 text-xs font-bold text-gold sm:gap-9">
          {HEADERS.map((round) => (
            <div key={round} className="w-32 text-center sm:w-36">
              {ROUND_SHORT[round]}
            </div>
          ))}
        </div>
        <Node
          id="104"
          byId={byId}
          below={
            third ? (
              <div className="absolute left-0 top-full w-full pt-3">
                <div className="mb-1 text-center text-[10px] font-bold uppercase tracking-wide text-muted">
                  3.er puesto
                </div>
                <MatchCard m={third} />
              </div>
            ) : undefined
          }
        />
      </div>
    </div>
  );
}
