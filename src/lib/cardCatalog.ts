// Modo Diversión — catálogo de cartas (v2, curado por el grupo).
//
// Fuente de verdad del diseño: la planilla de JVP ("Prode cartas").
// El catálogo es DATA, separado del motor (cards.ts): cambiar nombres, emojis,
// rarezas o sumar/quitar cartas no toca la lógica. Importable desde el cliente
// (sin crypto ni db).
//
// Conceptos:
// - window "match": el efecto se ata al PRÓXIMO partido al jugarla (quirúrgica).
// - window "day":   el efecto cubre TODOS los partidos del día (huso de México).
// - kind "curse":   maldición — se aplica sola al reclamar la carta del día
//                   (la timba del reclamo). Nunca pasa por la mano.
// - blockable:      un Anulo mufa la bloquea / un Espejito rebotín la devuelve.
// - standing:       queda activa hasta consumirse.
// - social:         no toca puntos; toca el ego (apodo, foto, mensaje). Dura
//                   hasta que la víctima juegue Borrón y cuenta nueva.

export type CardRarity = "comun" | "rara" | "legendaria" | "maldicion";

export type CardType =
  // ventana partido (v1)
  | "doblete"
  | "yapa"
  | "mufa"
  | "diego"
  | "var"
  // buffs de día
  | "costillar"
  | "cabala"
  // ataques de día
  | "pelambreada"
  | "caido"
  | "filtro"
  // caos
  | "caldeador"
  | "caparazon"
  | "swap"
  // duelo
  | "duelo"
  // puntos directos / robo
  | "papas"
  | "speed"
  | "pedo"
  // standings
  | "escudo"
  | "aguante"
  | "espejito"
  // maldiciones
  | "nemo"
  | "heladera"
  | "matambrito"
  | "ramirez"
  // sociales
  | "apodo"
  | "foto"
  | "microfono"
  | "borron";

export type CardWindow = "match" | "day" | null;

export type CardDef = {
  type: CardType;
  name: string;
  emoji: string;
  rarity: CardRarity;
  /** buff/instant = te afecta a vos · attack = hostil · shield = defensa · social = ego · curse = te toca */
  kind: "buff" | "attack" | "shield" | "instant" | "social" | "curse";
  /** self · other (elegís víctima) · leader (va solo al puntero del prode) */
  target: "self" | "other" | "leader";
  window: CardWindow;
  /** efecto persistente hasta consumirse */
  standing: boolean;
  /** un escudo la bloquea / un espejito la rebota */
  blockable: boolean;
  /** input extra que pide la UI al jugarla */
  input?: "apodo" | "mensaje" | "imagen";
  /**
   * Peso dentro de su balde de rareza (default 1). La probabilidad efectiva de
   * una carta = peso_rareza × (weight / suma de weights del balde).
   * Para balancear: subí/bajá este número (2 = sale el doble que una de peso 1).
   */
  weight?: number;
  description: string;
};

const c = (def: CardDef): CardDef => def;

export const CARD_CATALOG: Record<CardType, CardDef> = {
  // ---------- Ventana partido (quirúrgicas, v1) ----------
  doblete: c({
    type: "doblete",
    name: "Doblete",
    emoji: "✌️",
    rarity: "comun",
    kind: "buff",
    target: "self",
    window: "match",
    standing: false,
    blockable: false,
    description: "Tu próximo partido suma puntos dobles. Quirúrgica: jugala justo antes del partido que tenés clavado.",
  }),
  yapa: c({
    type: "yapa",
    name: "La Yapa",
    emoji: "🎁",
    rarity: "comun",
    kind: "buff",
    target: "self",
    window: "match",
    standing: false,
    blockable: false,
    description: "Si sumás en tu próximo partido, te llevás +1 de yapa. Si no sumás, no hay yapa.",
  }),
  mufa: c({
    type: "mufa",
    name: "Mufa",
    emoji: "🐈‍⬛",
    rarity: "rara",
    kind: "attack",
    target: "other",
    window: "match",
    standing: false,
    blockable: true,
    description: "El próximo partido de tu víctima suma la mitad, redondeado para abajo (3 → 1).",
  }),
  diego: c({
    type: "diego",
    name: "El Diego",
    emoji: "🔟",
    rarity: "legendaria",
    kind: "buff",
    target: "self",
    window: "match",
    standing: false,
    blockable: false,
    description: "Tu próximo partido suma triple. Barrilete cósmico, ¿de qué planeta viniste?",
  }),
  var: c({
    type: "var",
    name: "VAR a favor",
    emoji: "📺",
    rarity: "legendaria",
    kind: "buff",
    target: "self",
    window: null,
    standing: true,
    blockable: false,
    description: "Queda activo: tu próximo partido donde sumes puntos recibe +2 del VAR. Revisalo, che.",
  }),

  // ---------- Buffs de día ----------
  costillar: c({
    type: "costillar",
    name: "Costillar 7 AM",
    emoji: "🥩",
    rarity: "rara",
    kind: "buff",
    target: "self",
    window: "day",
    standing: false,
    blockable: false,
    description: "Desayunaste costillar a las 7 AM y estás imparable: hoy tu racha no se puede cortar, pinches lo que pinches.",
  }),
  cabala: c({
    type: "cabala",
    name: "Cábala del Echugo",
    emoji: "🍀",
    rarity: "rara",
    kind: "buff",
    target: "self",
    window: "day",
    standing: false,
    blockable: false,
    description: "El Echugo hizo la cábala y funcionó: hoy todos tus partidos suman puntos dobles.",
  }),

  // ---------- Ataques de día ----------
  pelambreada: c({
    type: "pelambreada",
    name: "Pelambreada",
    emoji: "🤦",
    rarity: "legendaria",
    kind: "attack",
    target: "other",
    window: "day",
    standing: false,
    blockable: true,
    description: "Tu víctima se mandó una pelambreada épica: hoy no suma ni un punto y se le corta la racha.",
  }),
  caido: c({
    type: "caido",
    name: "Se me cayó el Fernet",
    emoji: "😭",
    rarity: "rara",
    kind: "attack",
    target: "other",
    window: "day",
    standing: false,
    blockable: true,
    description: "Se le cayó el fernet y está de luto: hoy no suma puntos, pero los partidos que igual acierte le mantienen la racha viva.",
  }),
  filtro: c({
    type: "filtro",
    name: "Filtro 5mm",
    emoji: "🚬",
    rarity: "rara",
    kind: "attack",
    target: "other",
    window: "day",
    standing: false,
    blockable: true,
    description: "Le afanás el filtro de 5mm: sin eso no arma nada y hoy no suma puntos. Su racha queda congelada (hoy no cuenta ni a favor ni en contra).",
  }),

  // ---------- Caos ----------
  caldeador: c({
    type: "caldeador",
    name: "Caldeador de las tinieblas",
    emoji: "🤮",
    rarity: "legendaria",
    kind: "attack",
    target: "other",
    window: "day",
    standing: false,
    blockable: true,
    description: "Le vomitás los resultados encima: hoy sus pronósticos no valen — cada partido del día se le reemplaza por un resultado al azar, y con eso se le calculan los puntos. Puede pegarla de casualidad.",
  }),
  caparazon: c({
    type: "caparazon",
    name: "Caparazón azul",
    emoji: "🐢",
    rarity: "legendaria",
    kind: "attack",
    target: "leader",
    window: null,
    standing: false,
    blockable: true,
    description: "Directo a la cabeza, como en el Mario Kart: el líder del prode pierde puntos hasta quedar último, 1 punto abajo del que venía último. Si el líder sos vos… problema tuyo.",
  }),
  swap: c({
    type: "swap",
    name: "Robo de identidad",
    emoji: "🎭",
    rarity: "legendaria",
    kind: "attack",
    target: "other",
    window: null,
    standing: false,
    blockable: true,
    description: "Te hacés pasar por tu víctima ante el banco: intercambian los puntos totales en el acto. Elegí bien — si va último, el negocio es pésimo.",
  }),

  // ---------- Duelo ----------
  duelo: c({
    type: "duelo",
    name: "Duelo de matambres",
    emoji: "🥊",
    rarity: "legendaria",
    kind: "attack",
    target: "other",
    window: "day",
    standing: false,
    blockable: true,
    description: "Mano a mano de parrilla: el que sume más puntos hoy cobra doble, el que pierde se va con 0. Empate: no pasa nada.",
  }),

  // ---------- Puntos directos / robo ----------
  papas: c({
    type: "papas",
    name: "Nico compró papas",
    emoji: "🍟",
    rarity: "rara",
    kind: "instant",
    target: "self",
    window: null,
    standing: false,
    blockable: false,
    description: "Nico apareció con 18 papas y sobra felicidad: +5 puntos al contado.",
  }),
  speed: c({
    type: "speed",
    name: "Built for speed",
    emoji: "🏎️",
    rarity: "comun",
    kind: "instant",
    target: "self",
    window: null,
    standing: false,
    blockable: false,
    description: "Built for speed, nene: +2 puntos al toque.",
  }),
  pedo: c({
    type: "pedo",
    name: "Pedo en la cara",
    emoji: "💨",
    rarity: "rara",
    kind: "attack",
    target: "other",
    window: null,
    standing: false,
    blockable: true,
    description: "Te le sentás en la cara y soltás: le robás 5 puntos y te los llevás puestos (vos +5, él -5).",
  }),

  // ---------- Standings ----------
  escudo: c({
    type: "escudo",
    name: "Anulo mufa",
    emoji: "🛡️",
    rarity: "comun",
    kind: "shield",
    target: "self",
    window: null,
    standing: true,
    blockable: false,
    description: "Anulo mufa, beso: escudo activo que bloquea el próximo ataque que te tiren. Se consume solo.",
  }),
  aguante: c({
    type: "aguante",
    name: "Fernet de Fernemo",
    emoji: "🥃",
    rarity: "rara",
    kind: "buff",
    target: "self",
    window: null,
    standing: true,
    blockable: false,
    description: "El Fernemo te sirvió uno de los buenos: tu racha aguanta el próximo partido en cero. Se consume solo.",
  }),
  espejito: c({
    type: "espejito",
    name: "Espejito rebotín",
    emoji: "🪞",
    rarity: "legendaria",
    kind: "shield",
    target: "self",
    window: null,
    standing: true,
    blockable: false,
    description: "Escudo con maldad: el próximo ataque que te tiren rebota y le pega al que lo mandó. Se consume solo.",
  }),

  // ---------- Maldiciones (se aplican solas al reclamar) ----------
  nemo: c({
    type: "nemo",
    name: "Nemo usó tus sábanas",
    emoji: "🛏️",
    rarity: "maldicion",
    kind: "curse",
    target: "self",
    window: "day",
    standing: false,
    blockable: false,
    description: "Nemo durmió en tu cama y las sábanas quedaron pegajosas: hoy no sumás puntos.",
  }),
  heladera: c({
    type: "heladera",
    name: "Te toca limpiar la heladera",
    emoji: "🧊",
    rarity: "maldicion",
    kind: "curse",
    target: "self",
    window: "day",
    standing: false,
    blockable: false,
    description: "Había algo vivo al fondo de la heladera y te tocó a vos: perdés el día entero, 0 puntos.",
  }),
  matambrito: c({
    type: "matambrito",
    name: "Matambrito de vaca",
    emoji: "🐄",
    rarity: "maldicion",
    kind: "curse",
    target: "self",
    window: "day",
    standing: false,
    blockable: false,
    description: "Te dijeron matambrito de vaca delante de todos: te vas humillado y hoy no sumás.",
  }),
  ramirez: c({
    type: "ramirez",
    name: "Le prestaste plata a un Ramirez",
    emoji: "💸",
    rarity: "maldicion",
    kind: "curse",
    target: "self",
    window: null,
    standing: false,
    blockable: false,
    description: "Le prestaste plata a un Ramirez. Despedite: -5 puntos que no vuelven más.",
  }),

  // ---------- Sociales (no tocan puntos: tocan el ego) ----------
  apodo: c({
    type: "apodo",
    name: "Los apodos del Droco",
    emoji: "🏷️",
    rarity: "comun",
    kind: "social",
    target: "other",
    window: null,
    standing: false,
    blockable: true,
    input: "apodo",
    description: "El Droco bautiza de nuevo: tu víctima pasa a llamarse Nombre «Apodo» en este prode, hasta que se lo saque con Borrón y cuenta nueva.",
  }),
  foto: c({
    type: "foto",
    name: "Foto trucha",
    emoji: "📸",
    rarity: "rara",
    kind: "social",
    target: "other",
    window: null,
    standing: false,
    blockable: true,
    input: "imagen",
    description: "Le cambiás la foto de perfil de este prode por una que elijas vos, hasta que se la saque con Borrón y cuenta nueva. Puntos intactos, dignidad no.",
  }),
  microfono: c({
    type: "microfono",
    name: "Micrófono abierto",
    emoji: "🎤",
    rarity: "comun",
    kind: "social",
    target: "other",
    window: null,
    standing: false,
    blockable: true,
    input: "mensaje",
    description: "Fijás una declaración tuya (máx. 60 caracteres) al lado de su nombre en la tabla, hasta que se la saque con Borrón y cuenta nueva.",
  }),
  borron: c({
    type: "borron",
    name: "Borrón y cuenta nueva",
    emoji: "🧽",
    rarity: "comun",
    kind: "buff",
    target: "self",
    window: null,
    standing: false,
    blockable: false,
    description: "Te sacás de encima todos los apodos, fotos truchas y declaraciones que te colgaron. Volvés a ser vos.",
  }),
};

export const ALL_CARDS: CardDef[] = Object.values(CARD_CATALOG);

/** Probabilidad de cada rareza en el sorteo diario (sobre 100). */
export const RARITY_WEIGHTS: Record<CardRarity, number> = {
  comun: 50,
  rara: 26,
  legendaria: 9,
  maldicion: 15,
};

export const RARITY_LABEL: Record<CardRarity, string> = {
  comun: "Común",
  rara: "Rara",
  legendaria: "Legendaria",
  maldicion: "Maldición",
};

/** Máximo de cartas en mano por prode: con la mano llena no se puede reclamar la del día. */
export const MAX_HELD_CARDS = 3;

/** Largo máximo de los inputs sociales. */
export const MAX_APODO_CHARS = 24;
export const MAX_MENSAJE_CHARS = 60;
export const MAX_FOTO_CHARS = 280_000; // data URL ya comprimida en el cliente

// ---------- Rachas ----------

/**
 * Hitos de racha: partidos seguidos sumando puntos (>0). Un partido en 0 corta la
 * racha (salvo protección). Cada racha puede cobrar cada hito una vez.
 */
export const STREAK_MILESTONES: { len: number; bonus: number }[] = [
  { len: 3, bonus: 3 },
  { len: 5, bonus: 6 },
  { len: 8, bonus: 12 },
  { len: 12, bonus: 20 },
];

export type PoolMode = "normal" | "fun";
