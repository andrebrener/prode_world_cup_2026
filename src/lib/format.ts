// Helpers de formato de fecha/hora para partidos.
// La hora se muestra en la zona horaria del usuario (el ISO trae el offset de la sede);
// la fecha se muestra como la fecha LOCAL de la sede (yyyy-mm-dd) para evitar saltos de
// día al convertir partidos nocturnos.

/** Hora de inicio en la zona del usuario, con etiqueta de huso. Ej: "23:00 ART". */
export const fmtKickoffTime = (iso: string): string =>
  // 24h sin am/pm: el "p. m." difiere entre server y browser (U+202F) y rompe la hidratación.
  new Date(iso).toLocaleTimeString("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZoneName: "short",
  });

/** Fecha local de la sede a partir de un yyyy-mm-dd. Ej: "11/jun". */
export const fmtVenueDate = (isoDate: string): string =>
  new Date(isoDate + "T12:00:00").toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "short",
  });
