// Avatar reutilizable: muestra la foto si existe, o las iniciales con un color
// derivado del nombre (estable, sin librerías).

const PALETTE = [
  "#ef4444", "#f97316", "#f59e0b", "#eab308", "#84cc16", "#22c55e",
  "#10b981", "#14b8a6", "#06b6d4", "#3b82f6", "#6366f1", "#8b5cf6",
  "#a855f7", "#d946ef", "#ec4899", "#f43f5e",
];

function colorFor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
  return PALETTE[Math.abs(h) % PALETTE.length];
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * Variante full-bleed: llena el contenedor (absolute inset-0), cuadrada.
 * Para celdas de tabla donde la foto va de borde a borde.
 */
export function AvatarFill({ name, avatar }: { name: string; avatar?: string | null }) {
  if (avatar) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={avatar} alt={name} className="absolute inset-0 h-full w-full object-cover" />
    );
  }
  return (
    <span
      style={{ backgroundColor: colorFor(name) }}
      className="absolute inset-0 grid place-items-center text-lg font-black leading-none text-white"
      aria-hidden
    >
      {initials(name)}
    </span>
  );
}

export default function Avatar({
  name,
  avatar,
  size = 32,
  className = "",
}: {
  name: string;
  avatar?: string | null;
  size?: number;
  className?: string;
}) {
  const dim = { width: size, height: size };
  if (avatar) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={avatar}
        alt={name}
        style={dim}
        className={`shrink-0 rounded-full object-cover ${className}`}
      />
    );
  }
  return (
    <span
      style={{ ...dim, backgroundColor: colorFor(name), fontSize: size * 0.4 }}
      className={`grid shrink-0 place-items-center rounded-full font-bold leading-none text-white ${className}`}
      aria-hidden
    >
      {initials(name)}
    </span>
  );
}
