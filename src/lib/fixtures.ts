// Mundial 2026 — USA / México / Canadá (11 jun – 19 jul 2026)
// 48 equipos · 12 grupos · 72 partidos de fase de grupos.
// Grupos confirmados en el sorteo del 5 dic 2025.
//
// Las parejas de cada grupo (round-robin de 4 equipos = 6 partidos) son exactas.
// Sedes y horarios exactos pueden ajustarse: tomar como referencia.

export type Team = {
  /** Código corto estable, usado como id en pronósticos de campeón/subcampeón. */
  code: string;
  name: string;
  flag: string;
};

export type Group = {
  letter: string;
  /** Equipos en orden de cabeza de serie (posición 1..4 dentro del grupo). */
  teams: Team[];
};

export type Match = {
  /** id estable: `${grupo}${nro}` ej "A1" */
  id: string;
  group: string;
  matchday: 1 | 2 | 3;
  date: string; // ISO yyyy-mm-dd (fecha local de la sede)
  /** Instante de inicio absoluto, ISO 8601 con offset de la sede. Ej "2026-06-11T13:00:00-06:00". */
  kickoff: string;
  city: string;
  homeCode: string;
  awayCode: string;
};

const t = (code: string, name: string, flag: string): Team => ({ code, name, flag });

export const GROUPS: Group[] = [
  {
    letter: "A",
    teams: [
      t("MEX", "México", "🇲🇽"),
      t("RSA", "Sudáfrica", "🇿🇦"),
      t("KOR", "Corea del Sur", "🇰🇷"),
      t("CZE", "Chequia", "🇨🇿"),
    ],
  },
  {
    letter: "B",
    teams: [
      t("CAN", "Canadá", "🇨🇦"),
      t("BIH", "Bosnia y Herzegovina", "🇧🇦"),
      t("QAT", "Qatar", "🇶🇦"),
      t("SUI", "Suiza", "🇨🇭"),
    ],
  },
  {
    letter: "C",
    teams: [
      t("BRA", "Brasil", "🇧🇷"),
      t("MAR", "Marruecos", "🇲🇦"),
      t("HAI", "Haití", "🇭🇹"),
      t("SCO", "Escocia", "🏴󠁧󠁢󠁳󠁣󠁴󠁿"),
    ],
  },
  {
    letter: "D",
    teams: [
      t("USA", "Estados Unidos", "🇺🇸"),
      t("PAR", "Paraguay", "🇵🇾"),
      t("AUS", "Australia", "🇦🇺"),
      t("TUR", "Turquía", "🇹🇷"),
    ],
  },
  {
    letter: "E",
    teams: [
      t("GER", "Alemania", "🇩🇪"),
      t("CUW", "Curazao", "🇨🇼"),
      t("CIV", "Costa de Marfil", "🇨🇮"),
      t("ECU", "Ecuador", "🇪🇨"),
    ],
  },
  {
    letter: "F",
    teams: [
      t("NED", "Países Bajos", "🇳🇱"),
      t("JPN", "Japón", "🇯🇵"),
      t("SWE", "Suecia", "🇸🇪"),
      t("TUN", "Túnez", "🇹🇳"),
    ],
  },
  {
    letter: "G",
    teams: [
      t("BEL", "Bélgica", "🇧🇪"),
      t("EGY", "Egipto", "🇪🇬"),
      t("IRN", "Irán", "🇮🇷"),
      t("NZL", "Nueva Zelanda", "🇳🇿"),
    ],
  },
  {
    letter: "H",
    teams: [
      t("ESP", "España", "🇪🇸"),
      t("CPV", "Cabo Verde", "🇨🇻"),
      t("KSA", "Arabia Saudita", "🇸🇦"),
      t("URU", "Uruguay", "🇺🇾"),
    ],
  },
  {
    letter: "I",
    teams: [
      t("FRA", "Francia", "🇫🇷"),
      t("SEN", "Senegal", "🇸🇳"),
      t("IRQ", "Irak", "🇮🇶"),
      t("NOR", "Noruega", "🇳🇴"),
    ],
  },
  {
    letter: "J",
    teams: [
      t("ARG", "Argentina", "🇦🇷"),
      t("ALG", "Argelia", "🇩🇿"),
      t("AUT", "Austria", "🇦🇹"),
      t("JOR", "Jordania", "🇯🇴"),
    ],
  },
  {
    letter: "K",
    teams: [
      t("POR", "Portugal", "🇵🇹"),
      t("COD", "RD del Congo", "🇨🇩"),
      t("UZB", "Uzbekistán", "🇺🇿"),
      t("COL", "Colombia", "🇨🇴"),
    ],
  },
  {
    letter: "L",
    teams: [
      t("ENG", "Inglaterra", "🏴󠁧󠁢󠁥󠁮󠁧󠁿"),
      t("CRO", "Croacia", "🇭🇷"),
      t("GHA", "Ghana", "🇬🇭"),
      t("PAN", "Panamá", "🇵🇦"),
    ],
  },
];

// Fechas por grupo y matchday (mismo patrón que el calendario oficial).
const GROUP_DATES: Record<string, [string, string, string]> = {
  A: ["2026-06-11", "2026-06-18", "2026-06-24"],
  B: ["2026-06-12", "2026-06-18", "2026-06-24"],
  C: ["2026-06-13", "2026-06-19", "2026-06-24"],
  D: ["2026-06-13", "2026-06-19", "2026-06-25"],
  E: ["2026-06-14", "2026-06-20", "2026-06-25"],
  F: ["2026-06-14", "2026-06-20", "2026-06-25"],
  G: ["2026-06-15", "2026-06-21", "2026-06-26"],
  H: ["2026-06-15", "2026-06-21", "2026-06-26"],
  I: ["2026-06-16", "2026-06-22", "2026-06-26"],
  J: ["2026-06-16", "2026-06-22", "2026-06-27"],
  K: ["2026-06-17", "2026-06-23", "2026-06-27"],
  L: ["2026-06-17", "2026-06-23", "2026-06-27"],
};

// Ciudad principal por grupo y matchday (referencial).
const GROUP_CITIES: Record<string, [string, string]> = {
  A: ["Ciudad de México", "Guadalajara"],
  B: ["Toronto", "Vancouver"],
  C: ["Nueva York/NJ", "Boston"],
  D: ["Los Ángeles", "San Francisco"],
  E: ["Houston", "Filadelfia"],
  F: ["Dallas", "Monterrey"],
  G: ["Vancouver", "Los Ángeles"],
  H: ["Atlanta", "Miami"],
  I: ["Nueva York/NJ", "Boston"],
  J: ["Kansas City", "Dallas"],
  K: ["Houston", "Miami"],
  L: ["Dallas", "Toronto"],
};

// Offset UTC de cada sede en junio 2026. EE.UU. y Canadá con horario de verano
// (DST, mar–nov); México no aplica DST desde 2022. Referencial.
const CITY_OFFSET: Record<string, string> = {
  "Ciudad de México": "-06:00",
  Guadalajara: "-06:00",
  Monterrey: "-06:00",
  Toronto: "-04:00",
  Vancouver: "-07:00",
  "Nueva York/NJ": "-04:00",
  Boston: "-04:00",
  "Los Ángeles": "-07:00",
  "San Francisco": "-07:00",
  Houston: "-05:00",
  Filadelfia: "-04:00",
  Dallas: "-05:00",
  Atlanta: "-04:00",
  Miami: "-04:00",
  "Kansas City": "-05:00",
};

// Franjas horarias locales de inicio (hora de la sede). Referenciales: se reparten
// los partidos de cada día en estos horarios. El primero del día arranca 13:00 local
// (coincide con el debut México vs Sudáfrica, base del cierre de pronósticos).
const KICKOFF_SLOTS = [13, 16, 19, 22];

// Patrón FIFA de enfrentamientos según posición de cabeza de serie (1..4):
//   Fecha 1: 1v2, 3v4
//   Fecha 2: 1v3, 4v2
//   Fecha 3: 4v1, 2v3
const PAIRINGS: { matchday: 1 | 2 | 3; pairs: [number, number][] }[] = [
  { matchday: 1, pairs: [[0, 1], [2, 3]] },
  { matchday: 2, pairs: [[0, 2], [3, 1]] },
  { matchday: 3, pairs: [[3, 0], [1, 2]] },
];

function buildMatches(): Match[] {
  const matches: Match[] = [];
  for (const g of GROUPS) {
    let n = 1;
    for (const { matchday, pairs } of PAIRINGS) {
      for (const [hi, ai] of pairs) {
        const cities = GROUP_CITIES[g.letter];
        matches.push({
          id: `${g.letter}${n}`,
          group: g.letter,
          matchday,
          date: GROUP_DATES[g.letter][matchday - 1],
          kickoff: "", // se completa abajo
          city: cities[matchday === 3 ? 1 : matchday - 1] ?? cities[0],
          homeCode: g.teams[hi].code,
          awayCode: g.teams[ai].code,
        });
        n++;
      }
    }
  }

  // Asignar horario de inicio: por cada día, repartir los partidos en franjas locales.
  const byDate = new Map<string, Match[]>();
  for (const m of matches) {
    const list = byDate.get(m.date) ?? [];
    list.push(m);
    byDate.set(m.date, list);
  }
  for (const list of byDate.values()) {
    list.sort((a, b) => a.id.localeCompare(b.id));
    list.forEach((m, i) => {
      const hour = KICKOFF_SLOTS[i % KICKOFF_SLOTS.length];
      const off = CITY_OFFSET[m.city] ?? "-05:00";
      m.kickoff = `${m.date}T${String(hour).padStart(2, "0")}:00:00${off}`;
    });
  }

  return matches;
}

export const MATCHES: Match[] = buildMatches();

export const TEAMS_BY_CODE: Record<string, Team> = Object.fromEntries(
  GROUPS.flatMap((g) => g.teams).map((team) => [team.code, team]),
);

export const ALL_TEAMS: Team[] = GROUPS.flatMap((g) => g.teams).sort((a, b) =>
  a.name.localeCompare(b.name, "es"),
);

export function teamName(code: string): string {
  return TEAMS_BY_CODE[code]?.name ?? code;
}

export function teamFlag(code: string): string {
  return TEAMS_BY_CODE[code]?.flag ?? "🏳️";
}

// El primer partido (México vs Sudáfrica) arranca 11 jun 2026, 13:00 hora de México (UTC-6).
// Hasta ese momento se pueden cargar/editar pronósticos. Después, cerrado.
export const PREDICTIONS_DEADLINE = "2026-06-11T13:00:00-06:00";

export function predictionsLocked(now: Date = new Date()): boolean {
  return now.getTime() >= new Date(PREDICTIONS_DEADLINE).getTime();
}

// Puntajes del prode.
export const SCORING = {
  // Fase de grupos
  exact: 5, // marcador exacto
  outcome: 3, // acierta ganador/empate pero no el marcador
  // Extras
  champion: 10,
  runnerUp: 7,
  topScorer: 8,
  figure: 8,
  // Llaves / eliminatorias (Fase 2). En knockout puede haber penales.
  knockout: {
    exact: 6, // marcador exacto de los 90'/alargue
    winner: 4, // acierta quién pasa de ronda (gane como gane)
    penaltyWinner: 2, // bonus: si fue a penales y acertás quién gana en los penales
  },
};
