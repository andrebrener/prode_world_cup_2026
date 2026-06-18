// Modo Diversión — textos de las jugadas ("el libro de pases").
// Compartido entre la UI (FunZone) y el mail diario. Client-safe.
//
// La narración es GENÉRICA por mecánica: describe el efecto sin el nombre de la
// carta. El nombre y el emoji los pone el mazo del prode (re-skin), así que el
// feed dice el nombre que cada prode le puso a su carta.

import type { CardType } from "./cardCatalog";

// Efecto de cada mecánica, sin el nombre de la carta. t=víctima, d=detalle social.
type Clause = (t: string, d: string | null) => string;

const ACTION: Record<CardType, Clause> = {
  doblete: () => "dobla su primer partido del día",
  honguito: () => "dobla el partido que eligió",
  yapa: () => "+1 en el primer partido del día, solo si ahí suma",
  mufa: (t) => `le parte al medio el primer partido del día a ${t}`,
  diego: () => "triplica su primer partido del día",
  var: () => "+2 en cada partido de hoy donde sume",
  costillar: () => "piso de puntos en cada partido de hoy",
  cabala: () => "dobla todos sus partidos de hoy",
  piedrambre: () => "se le dan vuelta los pronósticos del día (cuentan al revés)",
  caido: (t) => `${t} no suma hoy (pero le banca la racha)`,
  filtro: (t) => `${t} no suma hoy y el día no le cuenta`,
  caldeador: (t) => `le reemplaza los pronósticos de hoy a ${t} por uno al azar`,
  duelo: (t) => `le afana a ${t} todos sus puntos del día`,
  papas: () => "+5 al toque",
  speed: () => "+2 al toque",
  pedo: (t) => `le roba 5 puntos a ${t}`,
  saibamba: () => "cobra los puntos del campeón",
  escudo: () => "bloquea todos los ataques que le tiren hoy",
  aguante: () => "su racha aguanta los ceros de hoy",
  espejito: () => "todos los ataques que le tiren hoy rebotan",
  nemo: () => "hoy no suma",
  heladera: () => "hoy no suma",
  matambrito: () => "hoy no suma",
  ramirez: () => "pierde 5 puntos",
  apodo: (t, d) => `bautiza a ${t}: «${d ?? "…"}»`,
  foto: (t) => `le cambia la foto a ${t}`,
  microfono: (t, d) => `deja dicho sobre ${t}: “${d ?? "…"}”`,
  borron: () => "se limpia los apodos y fotos que le colgaron",
};

export function playText(opts: {
  cardType: CardType;
  /** Nombre y emoji del mazo del prode (re-skin). */
  name: string;
  emoji: string;
  ownerName: string;
  targetName: string | null;
  detail: string | null;
  blocked?: boolean;
  reflected?: boolean;
  /** Autotiro: sacó el ataque y no se lo jugó a nadie, le rebotó solo. */
  backfire?: boolean;
}): string {
  // Autotiro: el ataque le pega al propio dueño (la "víctima" es él mismo).
  if (opts.backfire) {
    const action = ACTION[opts.cardType]?.("sí mismo", opts.detail) ?? "le rebotó";
    return `${opts.emoji} ${opts.ownerName} no le jugó ${opts.name} a nadie y le rebotó solo 🎯: ${action}`;
  }
  const action = ACTION[opts.cardType]?.(opts.targetName ?? "nadie", opts.detail) ?? "jugó una carta";
  const base = `${opts.emoji} ${opts.ownerName} jugó ${opts.name}: ${action}`;
  if (opts.blocked) return `${base} — ¡bloqueado por su escudo! 🛡️`;
  if (opts.reflected) return `${base} — ¡rebotó con el espejito! 🪞`;
  return base;
}
