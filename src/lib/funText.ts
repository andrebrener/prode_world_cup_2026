// Modo Diversión — textos de las jugadas ("el libro de pases").
// Compartido entre la UI (FunZone) y el mail diario. Client-safe.

import type { CardType } from "./cardCatalog";

type Verb = (o: string, t: string, d: string | null) => string;

export const FEED_VERB: Record<CardType, Verb> = {
  doblete: (o) => `✌️ ${o} jugó un Doblete`,
  yapa: (o) => `🎁 ${o} pidió La Yapa`,
  mufa: (o, t) => `🐈‍⬛ ${o} mufó el próximo partido de ${t}`,
  diego: (o) => `🔟 ${o} sacó El Diego`,
  var: (o) => `📺 ${o} llamó al VAR`,
  costillar: (o) => `🥩 ${o} desayunó costillar a las 7 AM`,
  cabala: (o) => `🍀 ${o} activó la Cábala del Echugo`,
  pelambreada: (o, t) => `🤦 ${o} le clavó una Pelambreada a ${t}`,
  caido: (o, t) => `😭 ${o} le tiró el fernet de ${t} al piso`,
  filtro: (o, t) => `🚬 ${o} le afanó el filtro de 5mm a ${t}`,
  caldeador: (o, t) => `🤮 ${o} caldeó los pronósticos de ${t}`,
  caparazon: (o, t) => `🐢 ${o} soltó el Caparazón azul — directo a ${t}`,
  swap: (o, t) => `🎭 ${o} se robó la identidad de ${t}: puntos intercambiados`,
  duelo: (o, t) => `🥊 ${o} retó a ${t} a un Duelo de matambres`,
  papas: (o) => `🍟 A ${o} le sobran papas: +5`,
  speed: (o) => `🏎️ ${o} está built for speed: +2`,
  pedo: (o, t) => `💨 ${o} se lo soltó en la cara a ${t}`,
  escudo: (o) => `🛡️ ${o} levantó el Anulo mufa`,
  aguante: (o) => `🥃 ${o} se aseguró el Fernet de Fernemo`,
  espejito: (o) => `🪞 ${o} colgó el Espejito rebotín`,
  nemo: (o) => `🛏️ Nemo usó las sábanas de ${o}: hoy no suma`,
  heladera: (o) => `🧊 A ${o} le tocó limpiar la heladera: 0 hoy`,
  matambrito: (o) => `🐄 ${o} quedó como matambrito de vaca: 0 hoy`,
  ramirez: (o) => `💸 ${o} le prestó plata a un Ramirez: -5`,
  apodo: (o, t, d) => `🏷️ ${o} bautizó a ${t}: «${d ?? "…"}»`,
  foto: (o, t) => `📸 ${o} le cambió la foto a ${t}`,
  microfono: (o, t, d) => `🎤 ${o} dejó dicho sobre ${t}: “${d ?? "…"}”`,
  borron: (o) => `🧽 ${o} pasó el borrón: cuenta nueva`,
};

export function playText(opts: {
  cardType: CardType;
  ownerName: string;
  targetName: string | null;
  detail: string | null;
  blocked?: boolean;
  reflected?: boolean;
}): string {
  const base =
    FEED_VERB[opts.cardType]?.(opts.ownerName, opts.targetName ?? "nadie", opts.detail) ??
    `🃏 ${opts.ownerName} jugó una carta`;
  if (opts.blocked) return `${base} — ¡bloqueado por su Anulo mufa! 🛡️`;
  if (opts.reflected) return `${base} — ¡el Espejito se lo devolvió! 🪞`;
  return base;
}
