// Últimos 5 partidos de cada selección ANTES del Mundial 2026 (corte: 11 jun 2026).
// Datos verificados contra ESPN + crónicas de prensa (jun 2026). Marcador siempre
// con los goles del equipo primero. Orden: del más viejo al más reciente.
//
// Penales (criterio del form guide de referencia): si el equipo GANÓ la tanda en un
// cruce de eliminación (ej. repechaje) se marca "W"; si quedó eliminado por penales,
// o si fue un amistoso definido por penales, se marca empate ("D"). La aclaración va
// en `competition`. Se omiten partidos de ensayo no oficiales (ej. amistosos a 3
// tiempos / con muchos cambios que FIFA no cuenta como "A").

export type FormMatch = {
  date: string; // ISO yyyy-mm-dd
  opponent: string; // nombre del rival en español
  score: string; // goles propios primero, ej "2-1"
  result: "W" | "D" | "L";
  competition: string;
};

const m = (
  date: string,
  opponent: string,
  score: string,
  result: FormMatch["result"],
  competition: string,
): FormMatch => ({ date, opponent, score, result, competition });

export const TEAM_FORM: Record<string, FormMatch[]> = {
  // ── Grupo A ──────────────────────────────────────────────────────────────
  MEX: [
    m("2026-03-28", "Portugal", "0-0", "D", "Amistoso"),
    m("2026-03-31", "Bélgica", "1-1", "D", "Amistoso"),
    m("2026-05-22", "Ghana", "2-0", "W", "Amistoso"),
    m("2026-05-30", "Australia", "1-0", "W", "Amistoso"),
    m("2026-06-04", "Serbia", "5-1", "W", "Amistoso"),
  ],
  RSA: [
    m("2026-01-04", "Camerún", "1-2", "L", "Copa Africana"),
    m("2026-03-27", "Panamá", "1-1", "D", "Amistoso"),
    m("2026-03-31", "Panamá", "1-2", "L", "Amistoso"),
    m("2026-05-29", "Nicaragua", "0-0", "D", "Amistoso"),
    m("2026-06-06", "Jamaica", "1-1", "D", "Amistoso"),
  ],
  KOR: [
    m("2025-11-18", "Ghana", "1-0", "W", "Amistoso"),
    m("2026-03-28", "Costa de Marfil", "0-4", "L", "Amistoso"),
    m("2026-03-31", "Austria", "0-1", "L", "Amistoso"),
    m("2026-05-30", "Trinidad y Tobago", "5-0", "W", "Amistoso"),
    m("2026-06-03", "El Salvador", "1-0", "W", "Amistoso"),
  ],
  CZE: [
    m("2025-11-17", "Gibraltar", "6-0", "W", "Eliminatorias UEFA"),
    m("2026-03-26", "Irlanda", "2-2", "W", "Repechaje UEFA (ganó por penales)"),
    m("2026-03-31", "Dinamarca", "2-2", "W", "Repechaje UEFA, final (ganó por penales)"),
    m("2026-05-31", "Kosovo", "2-1", "W", "Amistoso"),
    m("2026-06-04", "Guatemala", "3-1", "W", "Amistoso"),
  ],

  // ── Grupo B ──────────────────────────────────────────────────────────────
  CAN: [
    m("2026-01-17", "Guatemala", "1-0", "W", "Amistoso"),
    m("2026-03-28", "Islandia", "2-2", "D", "Amistoso"),
    m("2026-03-31", "Túnez", "0-0", "D", "Amistoso"),
    m("2026-06-01", "Uzbekistán", "2-0", "W", "Amistoso"),
    m("2026-06-05", "Irlanda", "1-1", "D", "Amistoso"),
  ],
  BIH: [
    m("2025-11-18", "Austria", "1-1", "D", "Eliminatorias UEFA"),
    m("2026-03-26", "Gales", "1-1", "W", "Repechaje UEFA (ganó por penales)"),
    m("2026-03-31", "Italia", "1-1", "W", "Repechaje UEFA, final (ganó por penales)"),
    m("2026-05-29", "Macedonia del Norte", "0-0", "D", "Amistoso"),
    m("2026-06-06", "Panamá", "1-1", "D", "Amistoso"),
  ],
  QAT: [
    m("2025-12-01", "Palestina", "0-1", "L", "Copa Árabe"),
    m("2025-12-04", "Siria", "1-1", "D", "Copa Árabe"),
    m("2025-12-07", "Túnez", "0-3", "L", "Copa Árabe"),
    m("2026-05-28", "Irlanda", "0-1", "L", "Amistoso"),
    m("2026-06-06", "El Salvador", "0-0", "D", "Amistoso"),
  ],
  SUI: [
    m("2025-11-18", "Kosovo", "1-1", "D", "Eliminatorias UEFA"),
    m("2026-03-27", "Alemania", "3-4", "L", "Amistoso"),
    m("2026-03-31", "Noruega", "0-0", "D", "Amistoso"),
    m("2026-05-31", "Jordania", "4-1", "W", "Amistoso"),
    m("2026-06-06", "Australia", "1-1", "D", "Amistoso"),
  ],

  // ── Grupo C ──────────────────────────────────────────────────────────────
  BRA: [
    m("2025-11-18", "Túnez", "1-1", "D", "Amistoso"),
    m("2026-03-26", "Francia", "1-2", "L", "Amistoso"),
    m("2026-03-31", "Croacia", "3-1", "W", "Amistoso"),
    m("2026-06-01", "Panamá", "6-2", "W", "Amistoso"),
    m("2026-06-06", "Egipto", "2-1", "W", "Amistoso"),
  ],
  MAR: [
    m("2026-03-27", "Ecuador", "1-1", "D", "Amistoso"),
    m("2026-03-31", "Paraguay", "2-1", "W", "Amistoso"),
    m("2026-05-26", "Burundi", "5-0", "W", "Amistoso"),
    m("2026-06-02", "Madagascar", "4-0", "W", "Amistoso"),
    m("2026-06-07", "Noruega", "1-1", "D", "Amistoso"),
  ],
  HAI: [
    m("2025-11-18", "Nicaragua", "2-0", "W", "Eliminatorias Concacaf"),
    m("2026-03-28", "Túnez", "0-1", "L", "Amistoso"),
    m("2026-03-31", "Islandia", "1-1", "D", "Amistoso"),
    m("2026-06-02", "Nueva Zelanda", "4-0", "W", "Amistoso"),
    m("2026-06-05", "Perú", "1-2", "L", "Amistoso"),
  ],
  SCO: [
    m("2025-11-18", "Dinamarca", "4-2", "W", "Eliminatorias UEFA"),
    m("2026-03-28", "Japón", "0-1", "L", "Amistoso"),
    m("2026-03-31", "Costa de Marfil", "0-1", "L", "Amistoso"),
    m("2026-05-30", "Curazao", "4-1", "W", "Amistoso"),
    m("2026-06-06", "Bolivia", "4-0", "W", "Amistoso"),
  ],

  // ── Grupo D ──────────────────────────────────────────────────────────────
  USA: [
    m("2025-11-18", "Uruguay", "5-1", "W", "Amistoso"),
    m("2026-03-28", "Bélgica", "2-5", "L", "Amistoso"),
    m("2026-03-31", "Portugal", "0-2", "L", "Amistoso"),
    m("2026-05-31", "Senegal", "3-2", "W", "Amistoso"),
    m("2026-06-06", "Alemania", "1-2", "L", "Amistoso"),
  ],
  PAR: [
    m("2025-11-15", "Estados Unidos", "1-2", "L", "Amistoso"),
    m("2025-11-18", "México", "2-1", "W", "Amistoso"),
    m("2026-03-27", "Grecia", "1-0", "W", "Amistoso"),
    m("2026-03-31", "Marruecos", "1-2", "L", "Amistoso"),
    m("2026-06-05", "Nicaragua", "4-0", "W", "Amistoso"),
  ],
  AUS: [
    m("2025-11-18", "Colombia", "0-3", "L", "Amistoso"),
    m("2026-03-27", "Camerún", "1-0", "W", "Amistoso"),
    m("2026-03-31", "Curazao", "5-1", "W", "Amistoso"),
    m("2026-05-30", "México", "0-1", "L", "Amistoso"),
    m("2026-06-06", "Suiza", "1-1", "D", "Amistoso"),
  ],
  TUR: [
    m("2025-11-18", "España", "2-2", "D", "Eliminatorias UEFA"),
    m("2026-03-26", "Rumania", "1-0", "W", "Repechaje UEFA"),
    m("2026-03-31", "Kosovo", "1-0", "W", "Repechaje UEFA, final"),
    m("2026-06-01", "Macedonia del Norte", "4-0", "W", "Amistoso"),
    m("2026-06-06", "Venezuela", "2-1", "W", "Amistoso"),
  ],

  // ── Grupo E ──────────────────────────────────────────────────────────────
  GER: [
    m("2025-11-14", "Luxemburgo", "2-0", "W", "Eliminatorias UEFA"),
    m("2025-11-17", "Eslovaquia", "6-0", "W", "Eliminatorias UEFA"),
    m("2026-03-27", "Suiza", "4-3", "W", "Amistoso"),
    m("2026-03-30", "Ghana", "2-1", "W", "Amistoso"),
    m("2026-06-06", "Estados Unidos", "2-1", "W", "Amistoso"),
  ],
  CUW: [
    m("2025-11-18", "Jamaica", "0-0", "D", "Eliminatorias Concacaf"),
    m("2026-03-27", "China", "0-2", "L", "Amistoso"),
    m("2026-03-31", "Australia", "1-5", "L", "Amistoso"),
    m("2026-05-30", "Escocia", "1-4", "L", "Amistoso"),
    m("2026-06-06", "Aruba", "4-0", "W", "Amistoso"),
  ],
  CIV: [
    m("2026-01-06", "Burkina Faso", "3-0", "W", "Copa Africana"),
    m("2026-01-10", "Egipto", "2-3", "L", "Copa Africana"),
    m("2026-03-28", "Corea del Sur", "4-0", "W", "Amistoso"),
    m("2026-03-31", "Escocia", "1-0", "W", "Amistoso"),
    m("2026-06-04", "Francia", "2-1", "W", "Amistoso"),
  ],
  ECU: [
    m("2025-11-18", "Nueva Zelanda", "2-0", "W", "Amistoso"),
    m("2026-03-27", "Marruecos", "1-1", "D", "Amistoso"),
    m("2026-03-31", "Países Bajos", "1-1", "D", "Amistoso"),
    m("2026-05-30", "Arabia Saudita", "2-1", "W", "Amistoso"),
    m("2026-06-07", "Guatemala", "3-0", "W", "Amistoso"),
  ],

  // ── Grupo F ──────────────────────────────────────────────────────────────
  NED: [
    m("2025-11-17", "Lituania", "4-0", "W", "Eliminatorias UEFA"),
    m("2026-03-27", "Noruega", "2-1", "W", "Amistoso"),
    m("2026-03-31", "Ecuador", "1-1", "D", "Amistoso"),
    m("2026-06-03", "Argelia", "0-1", "L", "Amistoso"),
    m("2026-06-08", "Uzbekistán", "2-1", "W", "Amistoso"),
  ],
  JPN: [
    m("2025-11-14", "Ghana", "2-0", "W", "Amistoso"),
    m("2025-11-18", "Bolivia", "3-0", "W", "Amistoso"),
    m("2026-03-28", "Escocia", "1-0", "W", "Amistoso"),
    m("2026-03-31", "Inglaterra", "1-0", "W", "Amistoso"),
    m("2026-05-31", "Islandia", "1-0", "W", "Amistoso"),
  ],
  SWE: [
    m("2025-11-18", "Eslovenia", "1-1", "D", "Eliminatorias UEFA"),
    m("2026-03-26", "Ucrania", "3-1", "W", "Repechaje UEFA"),
    m("2026-03-31", "Polonia", "3-2", "W", "Repechaje UEFA, final"),
    m("2026-06-01", "Noruega", "1-3", "L", "Amistoso"),
    m("2026-06-04", "Grecia", "2-2", "D", "Amistoso"),
  ],
  TUN: [
    m("2026-01-03", "Malí", "1-1", "D", "Copa Africana (eliminado por penales)"),
    m("2026-03-28", "Haití", "1-0", "W", "Amistoso"),
    m("2026-03-31", "Canadá", "0-0", "D", "Amistoso"),
    m("2026-06-01", "Austria", "0-1", "L", "Amistoso"),
    m("2026-06-06", "Bélgica", "0-5", "L", "Amistoso"),
  ],

  // ── Grupo G ──────────────────────────────────────────────────────────────
  BEL: [
    m("2025-11-18", "Liechtenstein", "7-0", "W", "Eliminatorias UEFA"),
    m("2026-03-28", "Estados Unidos", "5-2", "W", "Amistoso"),
    m("2026-03-31", "México", "1-1", "D", "Amistoso"),
    m("2026-06-02", "Croacia", "2-0", "W", "Amistoso"),
    m("2026-06-06", "Túnez", "5-0", "W", "Amistoso"),
  ],
  EGY: [
    m("2026-01-17", "Nigeria", "0-0", "D", "Copa Africana, 3.er puesto (eliminado por penales)"),
    m("2026-03-27", "Arabia Saudita", "4-0", "W", "Amistoso"),
    m("2026-03-31", "España", "0-0", "D", "Amistoso"),
    m("2026-05-28", "Rusia", "1-0", "W", "Amistoso"),
    m("2026-06-06", "Brasil", "1-2", "L", "Amistoso"),
  ],
  IRN: [
    m("2025-11-18", "Uzbekistán", "0-0", "D", "Amistoso"),
    m("2026-03-27", "Nigeria", "1-2", "L", "Amistoso"),
    m("2026-03-31", "Costa Rica", "5-0", "W", "Amistoso"),
    m("2026-05-29", "Gambia", "3-1", "W", "Amistoso"),
    m("2026-06-04", "Malí", "2-0", "W", "Amistoso"),
  ],
  NZL: [
    m("2025-11-18", "Ecuador", "0-2", "L", "Amistoso"),
    m("2026-03-27", "Finlandia", "0-2", "L", "Amistoso"),
    m("2026-03-30", "Chile", "4-1", "W", "Amistoso"),
    m("2026-06-03", "Haití", "0-4", "L", "Amistoso"),
    m("2026-06-06", "Inglaterra", "0-1", "L", "Amistoso"),
  ],

  // ── Grupo H ──────────────────────────────────────────────────────────────
  ESP: [
    m("2025-11-18", "Turquía", "2-2", "D", "Eliminatorias UEFA"),
    m("2026-03-27", "Serbia", "3-0", "W", "Amistoso"),
    m("2026-03-31", "Egipto", "0-0", "D", "Amistoso"),
    m("2026-06-04", "Irak", "1-1", "D", "Amistoso"),
    m("2026-06-08", "Perú", "3-1", "W", "Amistoso"),
  ],
  CPV: [
    m("2025-11-17", "Egipto", "1-1", "D", "Amistoso"),
    m("2026-03-26", "Chile", "2-4", "L", "Amistoso"),
    m("2026-03-29", "Finlandia", "1-1", "D", "Amistoso"),
    m("2026-05-31", "Serbia", "3-0", "W", "Amistoso"),
    m("2026-06-06", "Bermudas", "3-0", "W", "Amistoso"),
  ],
  KSA: [
    m("2026-03-27", "Egipto", "0-4", "L", "Amistoso"),
    m("2026-03-31", "Serbia", "1-2", "L", "Amistoso"),
    m("2026-05-30", "Ecuador", "1-2", "L", "Amistoso"),
    m("2026-06-05", "Puerto Rico", "3-0", "W", "Amistoso"),
    m("2026-06-09", "Senegal", "0-0", "D", "Amistoso"),
  ],
  URU: [
    m("2025-10-13", "Uzbekistán", "2-1", "W", "Amistoso"),
    m("2025-11-15", "México", "0-0", "D", "Amistoso"),
    m("2025-11-18", "Estados Unidos", "1-5", "L", "Amistoso"),
    m("2026-03-27", "Inglaterra", "1-1", "D", "Amistoso"),
    m("2026-03-31", "Argelia", "0-0", "D", "Amistoso"),
  ],

  // ── Grupo I ──────────────────────────────────────────────────────────────
  FRA: [
    m("2025-11-16", "Azerbaiyán", "3-1", "W", "Eliminatorias UEFA"),
    m("2026-03-26", "Brasil", "2-1", "W", "Amistoso"),
    m("2026-03-29", "Colombia", "3-1", "W", "Amistoso"),
    m("2026-06-04", "Costa de Marfil", "1-2", "L", "Amistoso"),
    m("2026-06-08", "Irlanda del Norte", "3-1", "W", "Amistoso"),
  ],
  SEN: [
    m("2026-01-18", "Marruecos", "0-3", "L", "Copa Africana, final"),
    m("2026-03-28", "Perú", "2-0", "W", "Amistoso"),
    m("2026-03-31", "Gambia", "3-1", "W", "Amistoso"),
    m("2026-05-31", "Estados Unidos", "2-3", "L", "Amistoso"),
    m("2026-06-09", "Arabia Saudita", "0-0", "D", "Amistoso"),
  ],
  IRQ: [
    m("2025-12-09", "Argelia", "0-2", "L", "Copa Árabe"),
    m("2025-12-12", "Jordania", "0-1", "L", "Copa Árabe, cuartos"),
    m("2026-03-31", "Bolivia", "2-1", "W", "Repechaje intercontinental"),
    m("2026-05-29", "Andorra", "1-0", "W", "Amistoso"),
    m("2026-06-04", "España", "1-1", "D", "Amistoso"),
  ],
  NOR: [
    m("2025-11-16", "Italia", "4-1", "W", "Eliminatorias UEFA"),
    m("2026-03-27", "Países Bajos", "1-2", "L", "Amistoso"),
    m("2026-03-31", "Suiza", "0-0", "D", "Amistoso"),
    m("2026-06-01", "Suecia", "3-1", "W", "Amistoso"),
    m("2026-06-07", "Marruecos", "1-1", "D", "Amistoso"),
  ],

  // ── Grupo J ──────────────────────────────────────────────────────────────
  ARG: [
    m("2025-11-14", "Angola", "2-0", "W", "Amistoso"),
    m("2026-03-27", "Mauritania", "2-1", "W", "Amistoso"),
    m("2026-03-31", "Zambia", "5-0", "W", "Amistoso"),
    m("2026-06-06", "Honduras", "2-0", "W", "Amistoso"),
    m("2026-06-09", "Islandia", "3-0", "W", "Amistoso"),
  ],
  ALG: [
    m("2026-01-10", "Nigeria", "0-2", "L", "Copa Africana"),
    m("2026-03-27", "Guatemala", "7-0", "W", "Amistoso"),
    m("2026-03-31", "Uruguay", "0-0", "D", "Amistoso"),
    m("2026-06-03", "Países Bajos", "1-0", "W", "Amistoso"),
    m("2026-06-10", "Bolivia", "4-0", "W", "Amistoso"),
  ],
  AUT: [
    m("2025-11-15", "Chipre", "2-0", "W", "Eliminatorias UEFA"),
    m("2025-11-18", "Bosnia y Herzegovina", "1-1", "D", "Eliminatorias UEFA"),
    m("2026-03-27", "Ghana", "5-1", "W", "Amistoso"),
    m("2026-03-31", "Corea del Sur", "1-0", "W", "Amistoso"),
    m("2026-06-01", "Túnez", "1-0", "W", "Amistoso"),
  ],
  JOR: [
    m("2025-12-18", "Marruecos", "2-3", "L", "Copa Árabe, final (prórroga)"),
    m("2026-03-27", "Costa Rica", "2-2", "D", "Amistoso"),
    m("2026-03-31", "Nigeria", "2-2", "D", "Amistoso"),
    m("2026-05-31", "Suiza", "1-4", "L", "Amistoso"),
    m("2026-06-07", "Colombia", "0-2", "L", "Amistoso"),
  ],

  // ── Grupo K ──────────────────────────────────────────────────────────────
  POR: [
    m("2025-11-16", "Armenia", "9-1", "W", "Eliminatorias UEFA"),
    m("2026-03-28", "México", "0-0", "D", "Amistoso"),
    m("2026-03-31", "Estados Unidos", "2-0", "W", "Amistoso"),
    m("2026-06-06", "Chile", "2-1", "W", "Amistoso"),
    m("2026-06-10", "Nigeria", "2-1", "W", "Amistoso"),
  ],
  COD: [
    m("2026-01-06", "Argelia", "0-1", "L", "Copa Africana"),
    m("2026-03-25", "Bermudas", "2-0", "W", "Amistoso"),
    m("2026-03-31", "Jamaica", "1-0", "W", "Repechaje intercontinental"),
    m("2026-06-03", "Dinamarca", "0-0", "D", "Amistoso"),
    m("2026-06-09", "Chile", "1-2", "L", "Amistoso"),
  ],
  UZB: [
    // Se omiten dos amistosos de ensayo no oficiales (Irán nov-25 e China ene-26,
    // a 3 tiempos / definidos por penales) que FIFA no cuenta como "A".
    m("2025-11-14", "Egipto", "2-0", "W", "Amistoso"),
    m("2026-03-27", "Gabón", "3-1", "W", "Amistoso"),
    m("2026-03-30", "Venezuela", "0-0", "D", "Amistoso (penales)"),
    m("2026-06-01", "Canadá", "0-2", "L", "Amistoso"),
    m("2026-06-08", "Países Bajos", "1-2", "L", "Amistoso"),
  ],
  COL: [
    m("2025-11-18", "Australia", "3-0", "W", "Amistoso"),
    m("2026-03-26", "Croacia", "1-2", "L", "Amistoso"),
    m("2026-03-29", "Francia", "1-3", "L", "Amistoso"),
    m("2026-06-01", "Costa Rica", "3-1", "W", "Amistoso"),
    m("2026-06-07", "Jordania", "2-0", "W", "Amistoso"),
  ],

  // ── Grupo L ──────────────────────────────────────────────────────────────
  ENG: [
    m("2025-11-16", "Albania", "2-0", "W", "Eliminatorias UEFA"),
    m("2026-03-27", "Uruguay", "1-1", "D", "Amistoso"),
    m("2026-03-31", "Japón", "0-1", "L", "Amistoso"),
    m("2026-06-06", "Nueva Zelanda", "1-0", "W", "Amistoso"),
    m("2026-06-10", "Costa Rica", "3-0", "W", "Amistoso"),
  ],
  CRO: [
    m("2025-11-17", "Montenegro", "3-2", "W", "Eliminatorias UEFA"),
    m("2026-03-26", "Colombia", "2-1", "W", "Amistoso"),
    m("2026-03-31", "Brasil", "1-3", "L", "Amistoso"),
    m("2026-06-02", "Bélgica", "0-2", "L", "Amistoso"),
    m("2026-06-07", "Eslovenia", "2-1", "W", "Amistoso"),
  ],
  GHA: [
    m("2025-11-18", "Corea del Sur", "0-1", "L", "Amistoso"),
    m("2026-03-27", "Austria", "1-5", "L", "Amistoso"),
    m("2026-03-30", "Alemania", "1-2", "L", "Amistoso"),
    m("2026-05-22", "México", "0-2", "L", "Amistoso"),
    m("2026-06-02", "Gales", "1-1", "D", "Amistoso"),
  ],
  PAN: [
    m("2026-03-27", "Sudáfrica", "1-1", "D", "Amistoso"),
    m("2026-03-31", "Sudáfrica", "2-1", "W", "Amistoso"),
    m("2026-06-01", "Brasil", "2-6", "L", "Amistoso"),
    m("2026-06-03", "República Dominicana", "4-2", "W", "Amistoso"),
    m("2026-06-06", "Bosnia y Herzegovina", "1-1", "D", "Amistoso"),
  ],
};
