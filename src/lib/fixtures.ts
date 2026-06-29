// Mundial 2026 — USA / México / Canadá (11 jun – 19 jul 2026)
// 48 equipos · 12 grupos · 72 partidos de fase de grupos.
// Grupos confirmados en el sorteo del 5 dic 2025.
//
// Las parejas de cada grupo (round-robin de 4 equipos = 6 partidos) son exactas.
// Fechas, horarios y sedes son los del calendario oficial FIFA (ver SCHEDULE abajo).

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
  /** Nombre del estadio de la sede (derivado de la ciudad, 1 por sede). */
  stadium: string;
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

// Calendario oficial FIFA 2026 (sorteo del 5 dic 2025). Cada partido con su instante
// de inicio en hora LOCAL de la sede + offset UTC. EE.UU. y Canadá en horario de verano
// (DST) en junio; México no aplica DST. La fecha local se deriva del prefijo del kickoff.
// Fuente: páginas de cada grupo en Wikipedia (es.wikipedia / en.wikipedia).
const SCHEDULE: Record<string, { kickoff: string; city: string }> = {
  // Grupo A — MEX, RSA, KOR, CZE
  A1: { kickoff: "2026-06-11T13:00:00-06:00", city: "Ciudad de México" }, // MEX v RSA
  A2: { kickoff: "2026-06-11T20:00:00-06:00", city: "Guadalajara" },      // KOR v CZE
  A3: { kickoff: "2026-06-18T19:00:00-06:00", city: "Guadalajara" },      // MEX v KOR
  A4: { kickoff: "2026-06-18T12:00:00-04:00", city: "Atlanta" },          // CZE v RSA
  A5: { kickoff: "2026-06-24T19:00:00-06:00", city: "Ciudad de México" }, // CZE v MEX
  A6: { kickoff: "2026-06-24T19:00:00-06:00", city: "Monterrey" },        // RSA v KOR

  // Grupo B — CAN, BIH, QAT, SUI
  B1: { kickoff: "2026-06-12T15:00:00-04:00", city: "Toronto" },          // CAN v BIH
  B2: { kickoff: "2026-06-13T12:00:00-07:00", city: "San Francisco" },    // QAT v SUI
  B3: { kickoff: "2026-06-18T15:00:00-07:00", city: "Vancouver" },        // CAN v QAT
  B4: { kickoff: "2026-06-18T12:00:00-07:00", city: "Los Ángeles" },      // SUI v BIH
  B5: { kickoff: "2026-06-24T12:00:00-07:00", city: "Vancouver" },        // SUI v CAN
  B6: { kickoff: "2026-06-24T12:00:00-07:00", city: "Seattle" },          // BIH v QAT

  // Grupo C — BRA, MAR, HAI, SCO
  C1: { kickoff: "2026-06-13T18:00:00-04:00", city: "Nueva York/NJ" },    // BRA v MAR
  C2: { kickoff: "2026-06-13T21:00:00-04:00", city: "Boston" },           // HAI v SCO
  C3: { kickoff: "2026-06-19T20:30:00-04:00", city: "Filadelfia" },       // BRA v HAI
  C4: { kickoff: "2026-06-19T18:00:00-04:00", city: "Boston" },           // SCO v MAR
  C5: { kickoff: "2026-06-24T18:00:00-04:00", city: "Miami" },            // SCO v BRA
  C6: { kickoff: "2026-06-24T18:00:00-04:00", city: "Atlanta" },          // MAR v HAI

  // Grupo D — USA, PAR, AUS, TUR
  D1: { kickoff: "2026-06-12T18:00:00-07:00", city: "Los Ángeles" },      // USA v PAR
  D2: { kickoff: "2026-06-13T21:00:00-07:00", city: "Vancouver" },        // AUS v TUR
  D3: { kickoff: "2026-06-19T12:00:00-07:00", city: "Seattle" },          // USA v AUS
  D4: { kickoff: "2026-06-19T20:00:00-07:00", city: "San Francisco" },    // TUR v PAR
  D5: { kickoff: "2026-06-25T19:00:00-07:00", city: "Los Ángeles" },      // TUR v USA
  D6: { kickoff: "2026-06-25T19:00:00-07:00", city: "San Francisco" },    // PAR v AUS

  // Grupo E — GER, CUW, CIV, ECU
  E1: { kickoff: "2026-06-14T12:00:00-05:00", city: "Houston" },          // GER v CUW
  E2: { kickoff: "2026-06-14T19:00:00-04:00", city: "Filadelfia" },       // CIV v ECU
  E3: { kickoff: "2026-06-20T16:00:00-04:00", city: "Toronto" },          // GER v CIV
  E4: { kickoff: "2026-06-20T19:00:00-05:00", city: "Kansas City" },      // ECU v CUW
  E5: { kickoff: "2026-06-25T16:00:00-04:00", city: "Nueva York/NJ" },    // ECU v GER
  E6: { kickoff: "2026-06-25T16:00:00-04:00", city: "Filadelfia" },       // CUW v CIV

  // Grupo F — NED, JPN, SWE, TUN
  F1: { kickoff: "2026-06-14T15:00:00-05:00", city: "Dallas" },           // NED v JPN
  F2: { kickoff: "2026-06-14T20:00:00-06:00", city: "Monterrey" },        // SWE v TUN
  F3: { kickoff: "2026-06-20T12:00:00-05:00", city: "Houston" },          // NED v SWE
  F4: { kickoff: "2026-06-20T22:00:00-06:00", city: "Monterrey" },        // TUN v JPN
  F5: { kickoff: "2026-06-25T18:00:00-05:00", city: "Kansas City" },      // TUN v NED
  F6: { kickoff: "2026-06-25T18:00:00-05:00", city: "Dallas" },           // JPN v SWE

  // Grupo G — BEL, EGY, IRN, NZL
  G1: { kickoff: "2026-06-15T12:00:00-07:00", city: "Seattle" },          // BEL v EGY
  G2: { kickoff: "2026-06-15T18:00:00-07:00", city: "Los Ángeles" },      // IRN v NZL
  G3: { kickoff: "2026-06-21T12:00:00-07:00", city: "Los Ángeles" },      // BEL v IRN
  G4: { kickoff: "2026-06-21T18:00:00-07:00", city: "Vancouver" },        // NZL v EGY
  G5: { kickoff: "2026-06-26T20:00:00-07:00", city: "Vancouver" },        // NZL v BEL
  G6: { kickoff: "2026-06-26T20:00:00-07:00", city: "Seattle" },          // EGY v IRN

  // Grupo H — ESP, CPV, KSA, URU
  H1: { kickoff: "2026-06-15T12:00:00-04:00", city: "Atlanta" },          // ESP v CPV
  H2: { kickoff: "2026-06-15T18:00:00-04:00", city: "Miami" },            // KSA v URU
  H3: { kickoff: "2026-06-21T12:00:00-04:00", city: "Atlanta" },          // ESP v KSA
  H4: { kickoff: "2026-06-21T18:00:00-04:00", city: "Miami" },            // URU v CPV
  H5: { kickoff: "2026-06-26T18:00:00-06:00", city: "Guadalajara" },      // URU v ESP
  H6: { kickoff: "2026-06-26T19:00:00-05:00", city: "Houston" },          // CPV v KSA

  // Grupo I — FRA, SEN, IRQ, NOR
  I1: { kickoff: "2026-06-16T15:00:00-04:00", city: "Nueva York/NJ" },    // FRA v SEN
  I2: { kickoff: "2026-06-16T18:00:00-04:00", city: "Boston" },           // IRQ v NOR
  I3: { kickoff: "2026-06-22T17:00:00-04:00", city: "Filadelfia" },       // FRA v IRQ
  I4: { kickoff: "2026-06-22T20:00:00-04:00", city: "Nueva York/NJ" },    // NOR v SEN
  I5: { kickoff: "2026-06-26T15:00:00-04:00", city: "Boston" },           // NOR v FRA
  I6: { kickoff: "2026-06-26T15:00:00-04:00", city: "Toronto" },          // SEN v IRQ

  // Grupo J — ARG, ALG, AUT, JOR
  J1: { kickoff: "2026-06-16T20:00:00-05:00", city: "Kansas City" },      // ARG v ALG
  J2: { kickoff: "2026-06-16T21:00:00-07:00", city: "San Francisco" },    // AUT v JOR
  J3: { kickoff: "2026-06-22T12:00:00-05:00", city: "Dallas" },           // ARG v AUT
  J4: { kickoff: "2026-06-22T20:00:00-07:00", city: "San Francisco" },    // JOR v ALG
  J5: { kickoff: "2026-06-27T21:00:00-05:00", city: "Dallas" },           // JOR v ARG
  J6: { kickoff: "2026-06-27T21:00:00-05:00", city: "Kansas City" },      // ALG v AUT

  // Grupo K — POR, COD, UZB, COL
  K1: { kickoff: "2026-06-17T12:00:00-05:00", city: "Houston" },          // POR v COD
  K2: { kickoff: "2026-06-17T20:00:00-06:00", city: "Ciudad de México" }, // UZB v COL
  K3: { kickoff: "2026-06-23T12:00:00-05:00", city: "Houston" },          // POR v UZB
  K4: { kickoff: "2026-06-23T20:00:00-06:00", city: "Guadalajara" },      // COL v COD
  K5: { kickoff: "2026-06-27T19:30:00-04:00", city: "Miami" },            // COL v POR
  K6: { kickoff: "2026-06-27T19:30:00-04:00", city: "Atlanta" },          // COD v UZB

  // Grupo L — ENG, CRO, GHA, PAN
  L1: { kickoff: "2026-06-17T15:00:00-05:00", city: "Dallas" },           // ENG v CRO
  L2: { kickoff: "2026-06-17T19:00:00-04:00", city: "Toronto" },          // GHA v PAN
  L3: { kickoff: "2026-06-23T16:00:00-04:00", city: "Boston" },           // ENG v GHA
  L4: { kickoff: "2026-06-23T19:00:00-04:00", city: "Toronto" },          // PAN v CRO
  L5: { kickoff: "2026-06-27T17:00:00-04:00", city: "Nueva York/NJ" },    // PAN v ENG
  L6: { kickoff: "2026-06-27T17:00:00-04:00", city: "Filadelfia" },       // CRO v GHA
};

// Estadio oficial de cada sede del Mundial 2026 (uno por ciudad anfitriona).
export const STADIUM_BY_CITY: Record<string, string> = {
  "Ciudad de México": "Estadio Azteca",
  Guadalajara: "Estadio Akron",
  Monterrey: "Estadio BBVA",
  Toronto: "BMO Field",
  Vancouver: "BC Place",
  Seattle: "Lumen Field",
  "San Francisco": "Levi's Stadium",
  "Los Ángeles": "SoFi Stadium",
  Houston: "NRG Stadium",
  Filadelfia: "Lincoln Financial Field",
  Dallas: "AT&T Stadium",
  Atlanta: "Mercedes-Benz Stadium",
  Miami: "Hard Rock Stadium",
  "Kansas City": "Arrowhead Stadium",
  Boston: "Gillette Stadium",
  "Nueva York/NJ": "MetLife Stadium",
};

export function stadiumForCity(city: string): string {
  return STADIUM_BY_CITY[city] ?? "";
}

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
        const id = `${g.letter}${n}`;
        const sched = SCHEDULE[id];
        if (!sched) throw new Error(`Falta horario en SCHEDULE para ${id}`);
        matches.push({
          id,
          group: g.letter,
          matchday,
          date: sched.kickoff.slice(0, 10), // fecha local de la sede
          kickoff: sched.kickoff,
          city: sched.city,
          stadium: stadiumForCity(sched.city),
          homeCode: g.teams[hi].code,
          awayCode: g.teams[ai].code,
        });
        n++;
      }
    }
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
// Es también el cierre por defecto: para un prode sin fecha de inicio (arranca
// con el torneo) los pronósticos se cierran acá.
export const PREDICTIONS_DEADLINE = "2026-06-11T13:00:00-06:00";

const TOURNAMENT_TZ = "America/Mexico_City";
function tournamentDay(kickoffIso: string): string {
  // yyyy-mm-dd en el huso del torneo (en-CA formatea ISO).
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TOURNAMENT_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(kickoffIso));
}

/**
 * Cierre de pronósticos para un prode según su fecha de inicio (startDate, el día
 * desde el cual los partidos suman). Es el kickoff del primer partido que cuenta
 * para ese prode. null = arranca con el torneo → PREDICTIONS_DEADLINE.
 */
export function predictionsDeadlineFor(startDate?: string | null): string {
  if (!startDate) return PREDICTIONS_DEADLINE;
  let earliest: string | null = null;
  let earliestT = Infinity;
  for (const m of MATCHES) {
    if (tournamentDay(m.kickoff) < startDate) continue;
    const t = new Date(m.kickoff).getTime();
    if (t < earliestT) {
      earliestT = t;
      earliest = m.kickoff;
    }
  }
  // Si la fecha cae después de toda la fase de grupos, cerramos al arrancar ese día.
  return earliest ?? `${startDate}T00:00:00-06:00`;
}

/**
 * Los pronósticos son globales (valen en TODOS tus prodes), así que el cierre es
 * el más temprano entre todos los prodes en los que estás: en cuanto arranca el
 * primero, no podés editar (afectaría a los que ya empezaron). Lista vacía =
 * cierre por defecto del torneo.
 */
export function effectivePredictionsDeadline(
  startDates: ReadonlyArray<string | null>,
): string {
  let min: string | null = null;
  let minT = Infinity;
  for (const sd of startDates) {
    const d = predictionsDeadlineFor(sd);
    const t = new Date(d).getTime();
    if (t < minT) {
      minT = t;
      min = d;
    }
  }
  return min ?? PREDICTIONS_DEADLINE;
}

export function predictionsLocked(
  deadlineISO: string = PREDICTIONS_DEADLINE,
  now: Date = new Date(),
): boolean {
  return now.getTime() >= new Date(deadlineISO).getTime();
}

const KICKOFF_BY_MATCH: Record<string, string> = Object.fromEntries(
  MATCHES.map((m) => [m.id, m.kickoff]),
);

/**
 * Un partido ya arrancó (su pronóstico queda congelado, no importa el cierre del
 * prode). Vale aun cuando el form sigue abierto: en prodes que arrancan a mitad
 * de camino no podés tocar los partidos ya jugados.
 */
export function matchStarted(matchId: string, now: Date = new Date()): boolean {
  const k = KICKOFF_BY_MATCH[matchId];
  return k ? now.getTime() >= new Date(k).getTime() : false;
}

/** IDs de los partidos de grupo que ya arrancaron a la hora dada. */
export function startedMatchIds(now: Date = new Date()): string[] {
  return MATCHES.filter((m) => now.getTime() >= new Date(m.kickoff).getTime()).map((m) => m.id);
}

// Participantes con permiso para editar sus pronósticos incluso después del cierre.
// Se compara por token del nombre, sin distinguir mayúsculas (ej "Oscar Brener" → "oscar").
const EDIT_AFTER_DEADLINE_NAMES = new Set<string>();

export function canEditAfterDeadline(name: string | null | undefined): boolean {
  if (!name) return false;
  return name
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .some((token) => EDIT_AFTER_DEADLINE_NAMES.has(token));
}

/** Como predictionsLocked, pero deja pasar a los participantes con permiso especial. */
export function predictionsLockedForName(
  name: string | null | undefined,
  deadlineISO: string = PREDICTIONS_DEADLINE,
  now: Date = new Date(),
): boolean {
  if (canEditAfterDeadline(name)) return false;
  return predictionsLocked(deadlineISO, now);
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
    winner: 4, // acierta el resultado (ganador o empate) — excluyente con el exacto
    penaltyWinner: 2, // bonus: si fue a penales y vos lo predijiste (pusiste empate)
  },
};
