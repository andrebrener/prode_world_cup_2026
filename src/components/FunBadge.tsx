import type { PoolMode } from "@/lib/cardCatalog";

/**
 * Chip de modo de un prode. El normal es discreto; el Diversión brilla con el
 * gradiente animado para que se note de lejos dónde está la joda.
 */
export default function FunBadge({
  mode,
  size = "sm",
}: {
  mode: PoolMode;
  size?: "sm" | "lg";
}) {
  const base =
    size === "lg"
      ? "px-3 py-1 text-xs rounded-xl"
      : "px-2 py-0.5 text-[10px] rounded-lg";

  if (mode === "fun") {
    return (
      <span
        className={`${base} fun-gradient inline-flex shrink-0 items-center gap-1 font-black uppercase tracking-wider text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.5)]`}
      >
        ✨ Diversión
      </span>
    );
  }
  return (
    <span
      className={`${base} inline-flex shrink-0 items-center border border-border font-bold uppercase tracking-wider text-muted`}
    >
      Normal
    </span>
  );
}
