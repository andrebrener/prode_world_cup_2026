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
//
// No hay cartas "standing" (que se guarden hasta consumirse): TODAS son del día.
// Hasta las defensas (escudo/espejito/aguante) y la VAR valen para su jornada.
// - social:         no toca puntos; toca el ego (apodo, foto, mensaje). Dura
//                   hasta que la víctima juegue Borrón y cuenta nueva.

// "extra" NO es un tramo del sorteo por rareza (peso 0): es la categoría de las
// cartas posicionales (Caparazón/Golpe), que caen por su propia compuerta por puesto.
// Se usa solo para mostrarlas aparte (badge/color) y agruparlas en el admin.
export type CardRarity = "comun" | "rara" | "legendaria" | "maldicion" | "extra";

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
  | "vendetta"
  | "banio_realidad"
  // vidente
  | "saibamba"
  // defensas del día
  | "escudo"
  | "aguante"
  | "espejito"
  // maldiciones
  | "nemo"
  | "heladera"
  | "matambrito"
  | "ramirez"
  | "piedrambre"
  // sociales
  | "apodo"
  | "foto"
  | "microfono"
  | "borron"
  // posicionales (le caen solo a ciertos puestos de la tabla)
  | "caparazon"
  | "golpe"
  | "remontada";

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
  /** +`amount` a todos los partidos del día donde sumes puntos. */
  | { outcome: "var_bonus"; amount: number }
  /** Roba todos los puntos del día de la víctima. */
  | { outcome: "steal_day_points" }
  /** ±puntos planos: `selfAmount` al dueño; si hay víctima, `victimAmount`. */
  | { outcome: "flat_points"; selfAmount: number; victimAmount?: number }
  /** Cobra los puntos del campeón (no se duplica si ya lo tenía). */
  | { outcome: "champion_points"; amount: number }
  /** Defensa del día: bloquea o rebota todos los ataques que te tiren ese día. */
  | { outcome: "shield"; mode: "block" | "reflect" }
  /** La racha aguanta los ceros de ese día entero. */
  | { outcome: "streak_shield" }
  /** Reemplaza el pronóstico del día de la víctima (azar o invertido). Pre-base. */
  | { outcome: "upstream_forecast"; mode: "random" | "invert" }
  /** Overlay de ego (no toca puntos): apodo, foto o mensaje. */
  | { outcome: "social_overlay"; kind: "apodo" | "foto" | "mensaje" }
  /** Limpia los overlays sociales propios. */
  | { outcome: "clear_social" }
  /**
   * Penalización plana CONGELADA: el monto NO está en el spec — se calcula al caer
   * la carta (contra la tabla del momento) y se guarda en el payload de la fila
   * (`{ shell }`). El Caparazón Azul lo usa para restar lo justo y dejar al líder
   * igualado con el último. Se aplica una sola vez y no se recalcula.
   */
  | { outcome: "frozen_penalty" }
  // Ajuste plano CONGELADO al jugarse: deja al afectado con su Puro (puntos reales
  // sin cartas) en ese instante. El monto (Puro − total, ± según corresponda) se
  // calcula al jugar la carta y vive en su payload (`{ reality }`); no se recalcula.
  | { outcome: "frozen_delta" };

export type Outcome = OutcomeSpec["outcome"];

/**
 * Sorteo POSICIONAL: la carta NO entra al balde por rareza del sorteo normal. Le cae
 * solo a ciertos puestos de la tabla (`ranks`, 0-based: 0 = líder, 1 = 2º, …), cada
 * uno con probabilidad ~1/`oddsDenom` por día, y solo si el prode tiene al menos
 * `minPlayers`. `pickDailyCard` la excluye del sorteo normal; la reparte
 * `pickPositionalCard` con la posición congelada del día. Como son maldiciones, el
 * que no reclama igual se las come (funSweep), así no se esquivan escondiéndose.
 */
export type PositionalDraw = {
  ranks: number[];
  oddsDenom: number;
  minPlayers: number;
  /**
   * Por defecto `ranks` se cuenta desde ARRIBA (0 = líder, 1 = 2º…). Con `fromBottom`
   * se cuenta desde el FONDO (0 = último, 1 = anteúltimo, 2 = antepenúltimo…), para
   * cartas que le caen a los de atrás sin importar cuántos jueguen.
   */
  fromBottom?: boolean;
};

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
  /** un escudo la bloquea / un espejito la rebota */
  blockable: boolean;
  /** input extra que pide la UI al jugarla ("partido": elegís a qué partido se ata) */
  input?: "apodo" | "mensaje" | "imagen" | "partido";
  /** Sorteo posicional (solo a ciertos puestos): fuera del balde por rareza. Ver PositionalDraw. */
  positional?: PositionalDraw;
  /**
   * Etiqueta de efecto a mano para el selector del admin ("Reward (qué hace)"). Si
   * falta, se deriva genéricamente del spec (outcomeLabel). La usan las cartas cuyo
   * spec es genérico pero querés un texto propio (ej. Golpe comparte flat_points con
   * Ramírez/papas, pero su label dice "al podio").
   */
  effectLabel?: string;
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
    window: "day",
    blockable: false,
    description: "Todos tus partidos del día donde sumes puntos reciben +2 del VAR. Revisalo, che.",
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
    blockable: false,
    description: "El Echugo hizo la cábala y funcionó: hoy todos tus partidos suman puntos dobles.",
  }),

  // ---------- Ataques de día ----------
  caido: c({
    type: "caido",
    spec: { outcome: "zero_day", streak: "protect_on_hit" },
    name: "Le tirás a otro para que no sume",
    emoji: "😭",
    rarity: "rara",
    kind: "attack",
    target: "other",
    window: "day",
    blockable: true,
    description: "Se la tirás a otro para que no sume: hoy no suma puntos, pero los partidos que igual acierte le mantienen la racha viva.",
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
    blockable: true,
    description: "Te le sentás en la cara y soltás: le robás 5 puntos y te los llevás puestos (vos +5, él -5).",
  }),
  vendetta: c({
    type: "vendetta",
    spec: { outcome: "multiply_match", scope: "first_of_day", factor: 0 },
    name: "Cero al primero",
    emoji: "🎯",
    rarity: "rara",
    kind: "attack",
    target: "other",
    window: "day",
    blockable: true,
    description: "Una carta con nombre y apellido: tu víctima no suma nada en su primer partido del día (queda en cero). El admin decide a quién apunta esta carta — al que la juega no le queda más que tirársela a esa persona.",
  }),
  banio_realidad: c({
    type: "banio_realidad",
    spec: { outcome: "frozen_delta" },
    name: "Baño de realidad",
    emoji: "🚿",
    rarity: "rara",
    kind: "instant",
    target: "self",
    window: null,
    blockable: false,
    effectLabel: "Te deja con tu Puro (puntos reales sin cartas), una sola vez",
    description: "Te pegás un baño de realidad: en el acto te suma o resta lo justo para dejarte con tu Puro — los puntos que tenés de verdad, sin cartas. Si las cartas te inflaron, bajás; si te perjudicaron, subís. Es de una sola vez: queda congelado en ese momento y después la tabla sigue normal (no vivís permanentemente en la realidad).",
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
    blockable: false,
    description: "Sai Bamba, el vidente, ya vio quién levanta la copa: cobrás los puntos del campeón (10) sí o sí, hayas puesto a quien hayas puesto. Si ya le habías pegado al campeón con tu pronóstico, no se duplica.",
  }),

  // ---------- Defensas del día ----------
  escudo: c({
    type: "escudo",
    spec: { outcome: "shield", mode: "block" },
    name: "Anulo mufa",
    emoji: "🛡️",
    rarity: "comun",
    kind: "shield",
    target: "self",
    window: "day",
    blockable: false,
    description: "Anulo mufa, beso: bloquea TODOS los ataques que te tiren ese día. No se consume.",
  }),
  aguante: c({
    type: "aguante",
    spec: { outcome: "streak_shield" },
    name: "Fernet de Fernemo",
    emoji: "🥃",
    rarity: "rara",
    kind: "buff",
    target: "self",
    window: "day",
    blockable: false,
    description: "El Fernemo te sirvió uno de los buenos: tu racha aguanta ese día entero aunque caigas en cero.",
  }),
  espejito: c({
    type: "espejito",
    spec: { outcome: "shield", mode: "reflect" },
    name: "Espejito rebotín",
    emoji: "🪞",
    rarity: "legendaria",
    kind: "shield",
    target: "self",
    window: "day",
    blockable: false,
    description: "Escudo con maldad: TODOS los ataques que te tiren ese día rebotan y le pegan al que los mandó.",
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
    blockable: false,
    description: "Había algo vivo al fondo de la heladera y te tocó a vos: perdés el día entero, 0 puntos.",
  }),
  matambrito: c({
    type: "matambrito",
    spec: { outcome: "zero_day", streak: "none" },
    name: "Matambrito de vaca",
    emoji: "🐄",
    rarity: "maldicion",
    kind: "curse",
    target: "self",
    window: "day",
    blockable: false,
    description: "Te hiciste el canchero haciendo el matambrito de vaca delante de todos: te fuiste humillado y hoy no sumás.",
  }),
  ramirez: c({
    type: "ramirez",
    spec: { outcome: "flat_points", selfAmount: -5 },
    name: "Le prestaste plata a un Ramirez",
    emoji: "💸",
    rarity: "maldicion",
    kind: "curse",
    target: "self",
    window: null,
    blockable: false,
    description: "Le prestaste plata a un Ramirez. Despedite: -5 puntos que no vuelven más.",
  }),
  piedrambre: c({
    type: "piedrambre",
    spec: { outcome: "upstream_forecast", mode: "invert" },
    name: "Piedrambre",
    emoji: "🪨",
    rarity: "maldicion",
    kind: "curse",
    target: "self",
    window: "day",
    blockable: false,
    description: "Se te dan vuelta los pronósticos del día: el marcador que cargaste cuenta al revés (pusiste 2-1, te vale como 1-2). Rezá que igual le pegues.",
  }),

  // ---------- Sociales (no tocan puntos: tocan el ego) ----------
  apodo: c({
    type: "apodo",
    spec: { outcome: "social_overlay", kind: "apodo" },
    name: "Los apodos del Droco",
    emoji: "🏷️",
    rarity: "comun",
    kind: "social",
    target: "other",
    window: null,
    blockable: true,
    input: "apodo",
    description: "El Droco bautiza de nuevo: tu víctima pasa a llamarse Nombre «Apodo» en este prode, hasta que se lo saque con Borrón y cuenta nueva.",
  }),
  foto: c({
    type: "foto",
    spec: { outcome: "social_overlay", kind: "foto" },
    name: "Foto trucha",
    emoji: "📸",
    rarity: "comun",
    kind: "social",
    target: "other",
    window: null,
    blockable: true,
    input: "imagen",
    description: "Le cambiás la foto de perfil de este prode por una que elijas vos, hasta que se la saque con Borrón y cuenta nueva. Puntos intactos, dignidad no.",
  }),
  microfono: c({
    type: "microfono",
    spec: { outcome: "social_overlay", kind: "mensaje" },
    name: "Micrófono abierto",
    emoji: "🎤",
    rarity: "comun",
    kind: "social",
    target: "other",
    window: null,
    blockable: true,
    input: "mensaje",
    description: "Fijás una declaración tuya (máx. 60 caracteres) al lado de su nombre en la tabla, hasta que se la saque con Borrón y cuenta nueva.",
  }),
  borron: c({
    type: "borron",
    spec: { outcome: "clear_social" },
    name: "Borrón y cuenta nueva",
    emoji: "🧽",
    rarity: "comun",
    kind: "buff",
    target: "self",
    window: null,
    blockable: false,
    description: "Te sacás de encima todos los apodos, fotos truchas y declaraciones que te colgaron. Volvés a ser vos.",
  }),

  // ---------- Posicionales (le caen solo a ciertos puestos de la tabla) ----------
  caparazon: c({
    type: "caparazon",
    spec: { outcome: "frozen_penalty" },
    name: "Caparazón Azul",
    emoji: "🐚",
    rarity: "extra",
    kind: "curse",
    target: "self",
    window: null,
    blockable: false,
    positional: { ranks: [0], oddsDenom: 4, minPlayers: 2 },
    effectLabel: "Deja al líder igualado con el último",
    description: "El caparazón azul de Mario Kart te busca por ir primero: te resta los puntos justos para dejarte igualado con el último de la tabla. Le cae SOLO al líder, más o menos una vez cada cuatro días. No se puede esquivar.",
  }),
  golpe: c({
    type: "golpe",
    spec: { outcome: "flat_points", selfAmount: -15 },
    name: "Golpe al Podio",
    emoji: "🥊",
    rarity: "extra",
    kind: "curse",
    target: "self",
    window: null,
    blockable: false,
    positional: { ranks: [1, 2], oddsDenom: 6, minPlayers: 3 },
    effectLabel: "-15 puntos al 2º y al 3º del podio",
    description: "Por andar cerca de la cima te llevás un golpe: -15 puntos. Le cae al 2º y al 3º de la tabla, más o menos una vez cada seis días. No se puede esquivar.",
  }),
  remontada: c({
    type: "remontada",
    spec: { outcome: "flat_points", selfAmount: 20 },
    name: "Remontada",
    emoji: "🚀",
    rarity: "extra",
    kind: "buff",
    target: "self",
    window: null,
    blockable: false,
    positional: { ranks: [0, 1, 2], oddsDenom: 5, minPlayers: 4, fromBottom: true },
    effectLabel: "+20 puntos a los últimos 3 de la tabla",
    description: "Un envión para los de atrás: +20 puntos al toque. Le cae SOLO a los últimos tres de la tabla, más o menos una vez cada cinco días. Hay que reclamar la carta del día para llevársela.",
  }),
};

export const ALL_CARDS: CardDef[] = Object.values(CARD_CATALOG);

/**
 * Cartas que NO tocan los puntos: puro ego (apodo, foto, mensaje) o limpieza.
 * Se sortean como cualquier otra carta según su rareza (todas en común); no tienen
 * un tramo aparte. La lista sigue marcando cuáles no suman puntos (para la UI).
 */
export const NO_EFFECT_CARDS: CardType[] = ["apodo", "foto", "microfono", "borron"];

/**
 * Probabilidad de cada rareza en el sorteo diario (sobre 100). "extra" pesa 0: las
 * posicionales no entran al sorteo por rareza (tienen su propia compuerta), así que
 * sumar/sacar extras no mueve las chances de las demás.
 */
export const RARITY_WEIGHTS: Record<CardRarity, number> = {
  comun: 50,
  rara: 26,
  legendaria: 9,
  maldicion: 15,
  extra: 0,
};

export const RARITY_LABEL: Record<CardRarity, string> = {
  comun: "Común",
  rara: "Rara",
  legendaria: "Legendaria",
  maldicion: "Maldición",
  extra: "Extra",
};

/** ¿La carta es "sin efecto" (puro ego)? Se decide por su mecánica, no por su nombre. */
export function isNoEffect(def: Pick<CardDef, "spec">): boolean {
  return def.spec.outcome === "social_overlay" || def.spec.outcome === "clear_social";
}

/**
 * Mecánicas que pueden ser SEÑUELO de una defensa secreta: positivas (suman puntos o
 * dan un boost al puntaje) y auto-target (sin víctima). Se filtra por OUTCOME, no por
 * carta: quedan afuera las defensas, sociales, maldiciones, robos, lo negativo y las
 * que adivinan al campeón (`champion_points`, ej. Sai Bamba). Así el señuelo parece
 * una jugada normal y buena, sin delatar que en realidad es una defensa.
 */
export const DECOY_POOL: CardType[] = ALL_CARDS.filter((c) => {
  if (c.target !== "self") return false;
  switch (c.spec.outcome) {
    case "multiply_match":
      return c.spec.factor >= 1; // doblar/triplicar; nunca la mufa (×0.5, y es ataque)
    case "bonus_if_scored":
    case "floor_match_points":
    case "var_bonus":
      return true;
    case "flat_points":
      return c.spec.selfAmount > 0; // papas/speed sí; Ramirez (−5) no
    default:
      return false; // shield, champion_points, social, zero_day, robos, etc.
  }
}).map((c) => c.type);

/** Hash determinístico de un string → entero (estable entre renders y deploys). */
function decoyHash(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return h;
}

/**
 * Señuelo (mecánica) de una defensa secreta, determinístico por `seed` (el id de la
 * carta) y pesado por rareza con los pesos normales del juego, para que la mezcla se
 * vea natural. Se calcula una vez al jugar la defensa y se guarda, así no se mueve.
 */
export function pickDecoyMechanic(seed: string): CardType {
  const weightOf = (m: CardType) => RARITY_WEIGHTS[CARD_CATALOG[m].rarity] ?? 1;
  const total = DECOY_POOL.reduce((a, m) => a + weightOf(m), 0);
  let acc = decoyHash(seed) % total;
  for (const m of DECOY_POOL) {
    acc -= weightOf(m);
    if (acc < 0) return m;
  }
  return DECOY_POOL[DECOY_POOL.length - 1];
}

/** Resumen neutro (sin el nombre) de qué hace una mecánica — para la UI de admin. */
export function outcomeLabel(spec: OutcomeSpec, target: CardDef["target"] = "self"): string {
  switch (spec.outcome) {
    case "multiply_match": {
      const scope =
        spec.scope === "chosen"
          ? "un partido que elegís"
          : spec.scope === "all_of_day"
            ? "todos tus partidos del día"
            : "tu primer partido del día";
      if (spec.factor === 0) return `Anula ${scope} (0 puntos)`;
      if (spec.factor === 0.5) return `Parte al medio ${scope} (mitad de puntos)`;
      return `Multiplica ×${spec.factor} ${scope}`;
    }
    case "bonus_if_scored":
      return `+${spec.amount} si sumás en tu primer partido del día`;
    case "floor_match_points":
      return "Piso de puntos en cada partido del día";
    case "zero_day":
      if (target === "other") {
        return spec.streak === "skip"
          ? "Le tirás a otro para que no sume (no le cuenta para la racha)"
          : spec.streak === "protect_on_hit"
            ? "Le tirás a otro para que no sume (le banca la racha)"
            : "Le tirás a otro para que no sume";
      }
      return spec.streak === "skip"
        ? "0 puntos en el día (no cuenta para la racha)"
        : spec.streak === "protect_on_hit"
          ? "0 puntos en el día (te banca la racha)"
          : "0 puntos en el día";
    case "var_bonus":
      return `+${spec.amount} a tus partidos del día donde sumes`;
    case "steal_day_points":
      return "Le roba a la víctima sus puntos del día";
    case "flat_points":
      return spec.victimAmount != null
        ? `${spec.selfAmount >= 0 ? "+" : ""}${spec.selfAmount} a vos / ${spec.victimAmount} a la víctima`
        : `${spec.selfAmount >= 0 ? "+" : ""}${spec.selfAmount} puntos al toque`;
    case "champion_points":
      return `Cobra los puntos del campeón (${spec.amount})`;
    case "shield":
      return spec.mode === "reflect"
        ? "Rebota todos los ataques del día"
        : "Bloquea todos los ataques del día";
    case "streak_shield":
      return "Tu racha aguanta el día entero en cero";
    case "upstream_forecast":
      return spec.mode === "invert"
        ? "Se te dan vuelta TUS pronósticos del día (cuentan al revés)"
        : "Reemplaza los pronósticos del día de la víctima por azar";
    case "social_overlay":
      return spec.kind === "apodo"
        ? "Le pone un apodo a la víctima"
        : spec.kind === "foto"
          ? "Le cambia la foto a la víctima"
          : "Fija un mensaje sobre la víctima";
    case "clear_social":
      return "Te saca los apodos/fotos/mensajes colgados";
    case "frozen_penalty":
      return "Deja al líder igualado con el último";
    case "frozen_delta":
      return target === "other"
        ? "Deja a la víctima con su Puro (puntos reales sin cartas)"
        : "Te deja con tu Puro (puntos reales sin cartas)";
  }
}

/** Opciones de mecánica para el selector "agregar carta" del admin (una por carta del catálogo). */
export type MechanicOption = {
  mechanic: CardType;
  defaultName: string;
  emoji: string;
  description: string;
  rarity: CardRarity;
  effect: string;
  kind: CardDef["kind"];
  /** self/other: si lleva víctima (para mostrar el selector de blanco fijo al crearla). */
  target: CardDef["target"];
};

export const MECHANIC_OPTIONS: MechanicOption[] = ALL_CARDS.map((card) => ({
  mechanic: card.type,
  defaultName: card.name,
  emoji: card.emoji,
  description: card.description,
  rarity: card.rarity,
  effect: card.effectLabel ?? outcomeLabel(card.spec, card.target),
  kind: card.kind,
  target: card.target,
}));

/** Campos cosméticos editables por prode (re-skin). */
export type CardCosmetic = {
  name: string;
  emoji: string;
  description: string;
  rarity: CardRarity;
};

/**
 * CardDef "de display" = la MECÁNICA del registro (por `mechanic`) con lo cosmético
 * del mazo del prode superpuesto. Si no hay override (carta vieja sin def del mazo),
 * cae al catálogo oficial. Devuelve null si la mecánica no existe.
 */
export function cardView(
  mechanic: string,
  override?: Partial<CardCosmetic> | null,
): CardDef | null {
  const base = CARD_CATALOG[mechanic as CardType];
  if (!base) return null;
  if (!override) return base;
  return {
    ...base,
    name: override.name ?? base.name,
    emoji: override.emoji ?? base.emoji,
    description: override.description ?? base.description,
    rarity: override.rarity ?? base.rarity,
  };
}

// ---------- Mazo default por prode (re-skin) ----------

/** Una carta del mazo de un prode: mecánica de origen + lo cosmético/sorteo editable. */
export type DeckEntry = {
  mechanic: CardType;
  name: string;
  emoji: string;
  description: string;
  rarity: CardRarity;
  enabled: boolean;
  sortOrder: number;
};

/**
 * Mazo oficial (las cartas de kbarulo), derivado del catálogo en su orden de
 * declaración. Es el punto de partida que se clona a cada prode fun.
 *
 * Las cartas POSICIONALES (Caparazón/Golpe) quedan FUERA del mazo default: son
 * opt-in. No se siembran en ningún prode; aparecen solo en el selector "+ Agregar
 * carta" (MECHANIC_OPTIONS, que sí las incluye) y el admin que las quiera las
 * agrega a mano (addCardDefAction valida contra el catálogo, no contra este mazo).
 */
export const DEFAULT_DECK: DeckEntry[] = ALL_CARDS.filter((c) => !c.positional).map((c, i) => ({
  mechanic: c.type,
  name: c.name,
  emoji: c.emoji,
  description: c.description,
  rarity: c.rarity,
  enabled: true,
  sortOrder: i,
}));

/** Config de sorteo por prode (los pesos de rareza + el karma de tabla). */
export type FunConfig = {
  weights: Record<CardRarity, number>;
  // Karma de tabla: sesga los pesos de rareza por posición en la tabla.
  karmaTabla: boolean;
};

/** Config de sorteo default (los valores oficiales). */
export const DEFAULT_FUN_CONFIG: FunConfig = {
  weights: { ...RARITY_WEIGHTS },
  karmaTabla: false,
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
