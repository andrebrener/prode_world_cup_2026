// Modo Diversión — catálogo de cartas.
//
// El catálogo es DATA, separado del motor (cards.ts): cambiar nombres, emojis,
// rarezas o sumar/quitar cartas no toca la lógica. Importable desde el cliente
// (sin crypto ni db).

export type CardRarity = "comun" | "rara" | "legendaria";

export type CardType =
  | "doblete"
  | "escudo"
  | "yapa"
  | "afano"
  | "mufa"
  | "aguante"
  | "diego"
  | "var";

export type CardDef = {
  type: CardType;
  name: string;
  emoji: string;
  rarity: CardRarity;
  /** buff = te afecta a vos · attack = elegís una víctima · shield = bloquea ataques */
  kind: "buff" | "attack" | "shield";
  /** true → al jugarla queda atada al próximo partido (tuyo o de la víctima) */
  bindsMatch: boolean;
  /** efecto persistente hasta consumirse (escudo, aguante, var) */
  standing: boolean;
  description: string;
};

const c = (def: CardDef): CardDef => def;

export const CARD_CATALOG: Record<CardType, CardDef> = {
  doblete: c({
    type: "doblete",
    name: "Doblete",
    emoji: "✌️",
    rarity: "comun",
    kind: "buff",
    bindsMatch: true,
    standing: false,
    description: "Tu próximo partido suma puntos dobles.",
  }),
  escudo: c({
    type: "escudo",
    name: "Escudo",
    emoji: "🛡️",
    rarity: "comun",
    kind: "shield",
    bindsMatch: false,
    standing: true,
    description: "Bloquea el próximo ataque que te tiren. Se consume solo.",
  }),
  yapa: c({
    type: "yapa",
    name: "La Yapa",
    emoji: "🎁",
    rarity: "comun",
    kind: "buff",
    bindsMatch: true,
    standing: false,
    description: "Si sumás en tu próximo partido, te llevás +1 de yapa.",
  }),
  afano: c({
    type: "afano",
    name: "Afano",
    emoji: "🥷",
    rarity: "rara",
    kind: "attack",
    bindsMatch: false,
    standing: false,
    description: "Le robás 2 puntos a quien elijas. Al contado.",
  }),
  mufa: c({
    type: "mufa",
    name: "Mufa",
    emoji: "🐈‍⬛",
    rarity: "rara",
    kind: "attack",
    bindsMatch: true,
    standing: false,
    description: "El próximo partido de tu víctima suma la mitad (redondeado para abajo).",
  }),
  aguante: c({
    type: "aguante",
    name: "Aguante",
    emoji: "💪",
    rarity: "rara",
    kind: "buff",
    bindsMatch: false,
    standing: true,
    description: "Tu racha sobrevive un partido en cero. Se consume solo.",
  }),
  diego: c({
    type: "diego",
    name: "El Diego",
    emoji: "🔟",
    rarity: "legendaria",
    kind: "buff",
    bindsMatch: true,
    standing: false,
    description: "Tu próximo partido suma puntos triples. Barrilete cósmico.",
  }),
  var: c({
    type: "var",
    name: "VAR a favor",
    emoji: "📺",
    rarity: "legendaria",
    kind: "buff",
    bindsMatch: false,
    standing: true,
    description: "El VAR revisa tu próximo partido con puntos y te regala +2.",
  }),
};

export const ALL_CARDS: CardDef[] = Object.values(CARD_CATALOG);

/** Probabilidad de cada rareza en el sorteo diario (sobre 100). */
export const RARITY_WEIGHTS: Record<CardRarity, number> = {
  comun: 60,
  rara: 30,
  legendaria: 10,
};

export const RARITY_LABEL: Record<CardRarity, string> = {
  comun: "Común",
  rara: "Rara",
  legendaria: "Legendaria",
};

/** Máximo de cartas en mano por prode: con la mano llena no se puede reclamar la del día. */
export const MAX_HELD_CARDS = 3;

// ---------- Rachas ----------

/**
 * Hitos de racha: partidos seguidos sumando puntos (>0). Un partido en 0 corta la
 * racha (salvo Aguante). Cada racha puede cobrar cada hito una vez.
 */
export const STREAK_MILESTONES: { len: number; bonus: number }[] = [
  { len: 3, bonus: 3 },
  { len: 5, bonus: 6 },
  { len: 8, bonus: 12 },
  { len: 12, bonus: 20 },
];

export type PoolMode = "normal" | "fun";
