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
  // defensas del día
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
  piedrambre: c({
    type: "piedrambre",
    spec: { outcome: "upstream_forecast", mode: "invert" },
    name: "Piedrambre",
    emoji: "🪨",
    rarity: "legendaria",
    kind: "attack",
    target: "other",
    window: "day",
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
    description: "Te hiciste el canchero haciendo el matambrito de vaca delante de todos: te fue para el orto y hoy no sumás.",
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
    rarity: "rara",
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

/** ¿La carta es "sin efecto" (puro ego)? Se decide por su mecánica, no por su nombre. */
export function isNoEffect(def: Pick<CardDef, "spec">): boolean {
  return def.spec.outcome === "social_overlay" || def.spec.outcome === "clear_social";
}

/** Resumen neutro (sin el nombre) de qué hace una mecánica — para la UI de admin. */
export function outcomeLabel(spec: OutcomeSpec): string {
  switch (spec.outcome) {
    case "multiply_match": {
      const scope =
        spec.scope === "chosen"
          ? "un partido que elegís"
          : spec.scope === "all_of_day"
            ? "todos tus partidos del día"
            : "tu primer partido del día";
      const f = spec.factor === 0.5 ? "a la mitad" : `×${spec.factor}`;
      return `Multiplica ${f} ${scope}`;
    }
    case "bonus_if_scored":
      return `+${spec.amount} si sumás en tu primer partido del día`;
    case "floor_match_points":
      return "Piso de puntos en cada partido del día";
    case "zero_day":
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
      return spec.mode === "reflect" ? "Rebota el próximo ataque" : "Bloquea el próximo ataque";
    case "streak_shield":
      return "Tu racha aguanta un partido en cero";
    case "upstream_forecast":
      return spec.mode === "invert"
        ? "Da vuelta los pronósticos del día de la víctima"
        : "Reemplaza los pronósticos del día de la víctima por azar";
    case "social_overlay":
      return spec.kind === "apodo"
        ? "Le pone un apodo a la víctima"
        : spec.kind === "foto"
          ? "Le cambia la foto a la víctima"
          : "Fija un mensaje sobre la víctima";
    case "clear_social":
      return "Te saca los apodos/fotos/mensajes colgados";
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
};

export const MECHANIC_OPTIONS: MechanicOption[] = ALL_CARDS.map((card) => ({
  mechanic: card.type,
  defaultName: card.name,
  emoji: card.emoji,
  description: card.description,
  rarity: card.rarity,
  effect: outcomeLabel(card.spec),
  kind: card.kind,
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
  weight: number;
  enabled: boolean;
  sortOrder: number;
};

/**
 * Mazo oficial (las cartas de kbarulo), derivado del catálogo en su orden de
 * declaración. Es el punto de partida que se clona a cada prode fun.
 */
export const DEFAULT_DECK: DeckEntry[] = ALL_CARDS.map((c, i) => ({
  mechanic: c.type,
  name: c.name,
  emoji: c.emoji,
  description: c.description,
  rarity: c.rarity,
  weight: c.weight ?? 1,
  enabled: true,
  sortOrder: i,
}));

/** Config de sorteo por prode (el 40% sin efecto + los pesos de rareza). */
export type FunConfig = {
  noEffectShare: number;
  weights: Record<CardRarity, number>;
};

/** Config de sorteo default (los valores oficiales). */
export const DEFAULT_FUN_CONFIG: FunConfig = {
  noEffectShare: NO_EFFECT_SHARE,
  weights: { ...RARITY_WEIGHTS },
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
