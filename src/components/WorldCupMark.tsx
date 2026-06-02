// Emblema estilo Mundial 2026 (diseño propio, homenaje — no es el logo oficial de FIFA).

export default function WorldCupMark({
  size = "md",
  className = "",
}: {
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const num =
    size === "lg" ? "text-6xl" : size === "md" ? "text-4xl" : "text-2xl";
  const pad = size === "lg" ? "p-5" : size === "md" ? "p-4" : "p-2.5";
  return (
    <div
      className={`inline-flex flex-col items-center rounded-2xl border border-border bg-background/40 ${pad} ${className}`}
    >
      <span className="text-[0.6rem] font-bold uppercase tracking-[0.2em] text-muted">
        World Cup
      </span>
      <span className={`wordmark fifa-text ${num}`}>26</span>
      <span className="text-[0.55rem] font-semibold uppercase tracking-[0.15em] text-muted">
        🇨🇦 🇲🇽 🇺🇸
      </span>
    </div>
  );
}
