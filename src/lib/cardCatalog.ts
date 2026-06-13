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
  | "honguito"
  | "yapa"
  | "mufa"
  | "diego"
  | "var"
  // buffs de día
  | "costillar"
  | "cabala"
  // ataques de día
  | "piedrambre"
  | "caido"
  | "filtro"
  // caos
  | "caldeador"
  // robo del día
  | "duelo"
  // puntos directos / robo
  | "papas"
  | "speed"
  | "pedo"
  // vidente
  | "saibamba"
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

/**
 * Outcome = la MECÁNICA de la carta (qué le hace a los puntos), reutilizable y
 * parametrizable. El set es cerrado y lo define el motor (cards.ts). Varias
 * cartas distintas comparten outcome con params distintos: doblete/diego/cábala/
 * honguito/mufa son todas `multiply_match` con otro `(scope, factor)`.
 *
 * Lo que el outcome NO define son `kind`/`target`/`blockable`/`window` (mufa y
 * doblete son ambas `multiply_match` pero una es ataque y la otra buff): esos son
 * atributos ortogonales de la carta. El outcome es solo la matemática de puntos.
 */
export type OutcomeSpec =
  /** Multiplica los puntos de un partido por `factor` (floor). */
  | { outcome: "multiply_match"; scope: "chosen" | "first_of_day" | "all_of_day"; factor: number }
  /** +`amount` al partido `scope` solo si ahí sumaste (>0). */
  | { outcome: "bonus_if_scored"; scope: "first_of_day"; amount: number }
  /** Piso de puntos por partido del día = lo de acertar el resultado (3/4). */
  | { outcome: "floor_match_points"; scope: "all_of_day" }
  /** 0 puntos en el día; `streak` controla qué pasa con la racha. */
  | { outcome: "zero_day"; streak: "protect_on_hit" | "skip" | "none" }
  /** +`amount` al próximo partido con puntos posterior a jugarla (standing). */
  | { outcome: "var_bonus"; amount: number }
  /** Roba todos los puntos del día de la víctima. */
  | { outcome: "steal_day_points" }
  /** ±puntos planos: `selfAmount` al dueño; si hay víctima, `victimAmount`. */
  | { outcome: "flat_points"; selfAmount: number; victimAmount?: number }
  /** Cobra los puntos del campeón (no se duplica si ya lo tenía). */
  | { outcome: "champion_points"; amount: number }
  /** Defensa standing: bloquea o rebota el próximo ataque. */
  | { outcome: "shield"; mode: "block" | "reflect" }
  /** La racha aguanta el próximo partido en cero (standing). */
  | { outcome: "streak_shield" }
  /** Reemplaza el pronóstico del día de la víctima (azar o invertido). Pre-base. */
  | { outcome: "upstream_forecast"; mode: "random" | "invert" }
  /** Overlay de ego (no toca puntos): apodo, foto o mensaje. */
  | { outcome: "social_overlay"; kind: "apodo" | "foto" | "mensaje" }
  /** Limpia los overlays sociales propios. */
  | { outcome: "clear_social" };

export type Outcome = OutcomeSpec["outcome"];

export type CardDef = {
  type: CardType;
  name: string;
  emoji: string;
  rarity: CardRarity;
  /** Mecánica de puntos (parametrizada). Ver OutcomeSpec. */
  spec: OutcomeSpec;
  /** buff/instant = te afecta a vos · attack = hostil · shield = defensa · social = ego · curse = te toca */
  kind: "buff" | "attack" | "shield" | "instant" | "social" | "curse";
  /** self · other (elegís víctima) */
  target: "self" | "other";
  window: CardWindow;
  /** efecto persistente hasta consumirse */
  standing: boolean;
  /** un escudo la bloquea / un espejito la rebota */
  blockable: boolean;
  /** input extra que pide la UI al jugarla ("partido": elegís a qué partido se ata) */
  input?: "apodo" | "mensaje" | "imagen" | "partido";
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
  // ---------- Primer partido del día (doblete/diego/mufa/yapa) + honguito/VAR ----------
  doblete: c({
    type: "doblete",
    spec: { outcome: "multiply_match", scope: "first_of_day", factor: 2 },
    name: "El que madruga, dobla",
    emoji: "🐓",
    rarity: "comun",
    kind: "buff",
    target: "self",
    window: "day",
    standing: false,
    blockable: false,
    description: "Tu primer partido del día suma puntos dobles. No importa cuándo la juegues: siempre pega en el primer partido de la jornada.",
  }),
  honguito: c({
    type: "honguito",
    spec: { outcome: "multiply_match", scope: "chosen", factor: 2 },
    name: "Honguito",
    emoji: "🍄",
    rarity: "rara",
    kind: "buff",
    target: "self",
    window: "match",
    standing: false,
    blockable: false,
    input: "partido",
    description: "Le ponés un honguito al partido del día que vos elijas (de los que todavía no arrancaron): ahí tus puntos cuentan doble.",
  }),
  yapa: c({
    type: "yapa",
    spec: { outcome: "bonus_if_scored", scope: "first_of_day", amount: 1 },
    name: "La Yapa",
    emoji: "🎁",
    rarity: "comun",
    kind: "buff",
    target: "self",
    window: "day",
    standing: false,
    blockable: false,
    description: "Si sumás en el primer partido del día, te llevás +1 de yapa. Si no sumás, no hay yapa.",
  }),
  mufa: c({
    type: "mufa",
    spec: { outcome: "multiply_match", scope: "first_of_day", factor: 0.5 },
    name: "Mufa",
    emoji: "🐈‍⬛",
    rarity: "rara",
    kind: "attack",
    target: "other",
    window: "day",
    standing: false,
    blockable: true,
    description: "El primer partido del día de tu víctima suma la mitad, redondeado para abajo (3 → 1).",
  }),
  diego: c({
    type: "diego",
    spec: { outcome: "multiply_match", scope: "first_of_day", factor: 3 },
    name: "El Diego",
    emoji: "🔟",
    rarity: "legendaria",
    kind: "buff",
    target: "self",
    window: "day",
    standing: false,
    blockable: false,
    description: "Tu primer partido del día suma triple. Barrilete cósmico, ¿de qué planeta viniste?",
  }),
  var: c({
    type: "var",
    spec: { outcome: "var_bonus", amount: 2 },
    name: "VAR a favor",
    emoji: "📺",
    rarity: "rara",
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
    spec: { outcome: "floor_match_points", scope: "all_of_day" },
    name: "Costillar 7 AM",
    emoji: "🥩",
    rarity: "legendaria",
    kind: "buff",
    target: "self",
    window: "day",
    standing: false,
    blockable: false,
    description: "Desayunaste costillar a las 7 AM y estás imparable: hoy en cada partido sumás al menos lo de acertar el resultado (3 en grupos, 4 en eliminatoria), pegues o falles. Si acertás más, te quedás con lo tuyo. La racha del día queda blindada.",
  }),
  cabala: c({
    type: "cabala",
    spec: { outcome: "multiply_match", scope: "all_of_day", factor: 2 },
    name: "Cábala del Echugo",
    emoji: "🍀",
    rarity: "legendaria",
    kind: "buff",
    target: "self",
    window: "day",
    standing: false,
    blockable: false,
    description: "El Echugo hizo la cábala y funcionó: hoy todos tus partidos suman puntos dobles.",
  }),

  // ---------- Ataques de día ----------
  piedrambre: c({
    type: "piedrambre",
    spec: { outcome: "upstream_forecast", mode: "invert" },
    name: "Piedrambre",
    emoji: "🪨",
    rarity: "legendaria",
    kind: "attack",
    target: "other",
    window: "day",
    standing: false,
    blockable: true,
    description: "A tu víctima se le dan vuelta los pronósticos del día: el marcador que cargó cuenta al revés (jugó 2-1, le vale como 1-2). Que rece que igual le pegue.",
  }),
  caido: c({
    type: "caido",
    spec: { outcome: "zero_day", streak: "protect_on_hit" },
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
    spec: { outcome: "zero_day", streak: "skip" },
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
    spec: { outcome: "upstream_forecast", mode: "random" },
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

  // ---------- Robo del día (type histórico "duelo") ----------
  duelo: c({
    type: "duelo",
    spec: { outcome: "steal_day_points" },
    name: "Matambre de cerdo",
    emoji: "🐷",
    rarity: "legendaria",
    kind: "attack",
    target: "other",
    window: "day",
    standing: false,
    blockable: true,
    description: "Le afanás el matambre de la parrilla: elegís a alguien y te llevás todos los puntos que sumó hoy. Sus partidos del día quedan en 0 y esos puntos pasan a tu cuenta. Un espejito te lo devuelve.",
  }),

  // ---------- Puntos directos / robo ----------
  papas: c({
    type: "papas",
    spec: { outcome: "flat_points", selfAmount: 5 },
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
    spec: { outcome: "flat_points", selfAmount: 2 },
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
    spec: { outcome: "flat_points", selfAmount: 5, victimAmount: -5 },
    name: "Pedo en la cara",
    emoji: "💨",
    rarity: "legendaria",
    kind: "attack",
    target: "other",
    window: null,
    standing: false,
    blockable: true,
    description: "Te le sentás en la cara y soltás: le robás 5 puntos y te los llevás puestos (vos +5, él -5).",
  }),

  // ---------- Vidente ----------
  saibamba: c({
    type: "saibamba",
    spec: { outcome: "champion_points", amount: 10 },
    name: "Sai Bamba",
    emoji: "🔮",
    rarity: "legendaria",
    kind: "instant",
    target: "self",
    window: null,
    standing: false,
    blockable: false,
    description: "Sai Bamba, el vidente, ya vio quién levanta la copa: cobrás los puntos del campeón (10) sí o sí, hayas puesto a quien hayas puesto. Si ya le habías pegado al campeón con tu pronóstico, no se duplica.",
  }),

  // ---------- Standings ----------
  escudo: c({
    type: "escudo",
    spec: { outcome: "shield", mode: "block" },
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
    spec: { outcome: "streak_shield" },
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
    spec: { outcome: "shield", mode: "reflect" },
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
    spec: { outcome: "zero_day", streak: "none" },
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
    spec: { outcome: "zero_day", streak: "none" },
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

/**
 * Cartas que NO tocan los puntos: puro ego (apodo, foto, mensaje) o limpieza.
 * El sorteo diario las saca el 40% de las veces (ver NO_EFFECT_SHARE): primero
 * tira si toca una de estas, y solo si no, va al sorteo por rareza con el resto.
 */
export const NO_EFFECT_CARDS: CardType[] = ["apodo", "foto", "microfono", "borron"];

/** Probabilidad de que el sorteo diario saque una carta sin efecto (sobre 100). */
export const NO_EFFECT_SHARE = 40;

/** Probabilidad de cada rareza DENTRO del sorteo con efecto (sobre 100). */
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

/** Opción del selector de partido del Honguito (un partido que todavía no arrancó). */
export type FunMatchOption = {
  id: string;
  /** Etiqueta principal: equipos (grupos) o fase (eliminatoria). */
  label: string;
  /** Subtítulo: grupo o ronda. */
  sub: string;
  /** Kickoff ISO con offset de la sede (la UI lo formatea). */
  kickoff: string;
};
