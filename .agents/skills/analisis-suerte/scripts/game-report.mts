// Análisis del JUEGO COMPLETO de un prode en modo Diversión (Fun).
//
// Tres capas:
//   1) 🍀 SUERTE del sorteo (vs lo que le "tocaba" según el Karma de Tabla):
//        legΔ (legendarias de más), malAvoid (maldiciones esquivadas),
//        socAvoid (cartas sociales muertas esquivadas).
//   2) 🔥 RACHAS: mejor racha de partidos seguidos sumando + puntos de hito
//        ganados (datos REALES del motor del juego, vía getLeaderboard).
//   3) ⚔️ GUERRA DE CARTAS: ataques que tiró / que le tiraron (y si pegaron,
//        los bloqueó con escudo o los rebotó con espejito), defensas jugadas
//        y cartas sociales que le colgaron.
// Score = 🍀 Cartas + ⚔️ Juego → estado (Muy afortunado → Muy perjudicado).
//
// Genera el HTML que sirve la webapp: public/informes/<slug>.html (uno por pool).
// Los chistes ("🎤 Bicho dice") viven en la skill: output/<slug>.jokes.json.
//
// Correr con tsx (está en node_modules):
//   npx tsx .agents/skills/analisis-suerte/scripts/game-report.mts [poolSlugOrName] [--jokes archivo.json]
//   npx tsx .agents/skills/analisis-suerte/scripts/game-report.mts --all   (TODOS los prodes fun)
// Con --all cada pool usa automáticamente su output/<slug>.jokes.json si existe.
//
// Requiere TURSO_DATABASE_URL y TURSO_AUTH_TOKEN en .env.local (lee remoto = prod).

import { createClient } from "@libsql/client";
import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, "../../../.."); // scripts -> skill -> skills -> .agents -> repo
const JOKES_DIR = path.resolve(__dirname, "../output"); // input de autoría (chistes)
const HTML_DIR = path.resolve(REPO, "public/informes"); // lo que sirve la webapp

// ---------- args ----------
const argv = process.argv.slice(2);
let poolArg: string | null = null;
let jokesPath: string | null = null;
let all = false;
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === "--jokes") jokesPath = argv[++i];
  else if (argv[i] === "--all") all = true;
  else poolArg = argv[i];
}
if (!all && !poolArg) poolArg = "kbarulo-fun";

// ---------- env ----------
function loadEnv() {
  const p = path.join(REPO, ".env.local");
  if (!fs.existsSync(p)) throw new Error(`No encuentro ${p}`);
  for (const line of fs.readFileSync(p, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
    if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
loadEnv();
// El cliente del app (src/lib/db) usa SIEMPRE local.db salvo que esto esté en 1.
process.env.USE_REMOTE_DB = "1";

// El catálogo (data, sin db) y el motor del juego se importan DESPUÉS de fijar el
// env: queries.ts arrastra el cliente de db, que lee las credenciales al cargarse.
const { CARD_CATALOG } = await import(
  pathToFileURL(path.join(REPO, "src/lib/cardCatalog.ts")).href
);
const { getPoolBySlug, getLeaderboard } = await import(
  pathToFileURL(path.join(REPO, "src/lib/db/queries.ts")).href
);

type Mech = keyof typeof CARD_CATALOG;
const defOf = (m: string) => CARD_CATALOG[m as Mech] ?? null;

// Clasificación de una mecánica.
function clase(t: string): "social" | "escudo" | "maldicion" | "ataque" | "puntos" | "otro" {
  const d = defOf(t);
  if (!d) return "otro";
  if (d.spec.outcome === "social_overlay" || d.spec.outcome === "clear_social") return "social";
  if (d.kind === "shield") return "escudo";
  if (d.kind === "curse") return "maldicion";
  if (d.kind === "attack") return "ataque";
  return "puntos";
}

// ---------- karma de tabla (réplica de src/lib/cards.ts, sin luckScore) ----------
const S = 0.5, SHRINK = 0.25, CAP = 0.9;
type W = { comun: number; rara: number; legendaria: number; maldicion: number };
function karmaWeights(w: W, rank: number, total: number): W {
  if (total <= 1) return { ...w };
  const t = Math.max(0, Math.min(1, rank / (total - 1)));
  const sTable = 1 - 2 * t;
  const tilt = Math.max(-CAP, Math.min(CAP, sTable * S));
  const sh = Math.max(0, 1 - SHRINK * (Math.abs(tilt) / S));
  return {
    comun: w.comun * sh,
    rara: w.rara * sh,
    legendaria: w.legendaria * (1 - tilt),
    maldicion: w.maldicion * (1 + tilt),
  };
}
function rarProbs(w: W) {
  const s = w.comun + w.rara + w.legendaria + w.maldicion;
  return { leg: w.legendaria / s, mal: w.maldicion / s };
}

// ---------- estado de fortuna ----------
function estadoDe(score: number) {
  if (score >= 3.0) return { label: "Muy afortunado", cls: "muy-bien", emoji: "🍀" };
  if (score >= 1.5) return { label: "Afortunado", cls: "bien", emoji: "😀" };
  if (score > -1.0) return { label: "Normal", cls: "normal", emoji: "😐" };
  if (score > -2.5) return { label: "Perjudicado", cls: "mal", emoji: "😕" };
  return { label: "Muy perjudicado", cls: "muy-mal", emoji: "💀" };
}

// Racha larga = el juego tratándote bien. Escala suave.
function streakFortune(best: number): number {
  return best >= 12 ? 2.5 : best >= 8 ? 1.5 : best >= 5 ? 0.8 : 0;
}

// ---------- guerra de cartas ----------
type War = {
  atkThrown: number; atkLanded: number; atkBlocked: number; atkBackfired: number;
  recvTotal: number; recvLanded: number; recvBlocked: number; recvReflected: number;
  socThrown: number; socRecv: number; socRecvLanded: number; socRecvBlocked: number; socRecvReflected: number;
  defs: number; defEscudo: number; defEspejito: number; defAguante: number;
};
const blankWar = (): War => ({
  atkThrown: 0, atkLanded: 0, atkBlocked: 0, atkBackfired: 0,
  recvTotal: 0, recvLanded: 0, recvBlocked: 0, recvReflected: 0,
  socThrown: 0, socRecv: 0, socRecvLanded: 0, socRecvBlocked: 0, socRecvReflected: 0,
  defs: 0, defEscudo: 0, defEspejito: 0, defAguante: 0,
});

type Player = {
  id: string; name: string; n: number;
  legA: number; legE: number; malA: number; malE: number; socA: number; socE: number;
  pts: number; pctUtil: number;
  legD: number; malAvoid: number; socAvoid: number;
  cartas: number; juego: number; score: number;
  rank: number | null; total: number;
  streakBest: number; streakBonus: number; pure: number; totalReal: number;
  war: War;
};

// ---------- helpers HTML ----------
const sgn = (x: number) => (x > 0 ? `+${x}` : `${x}`);
const esc = (s: any) => String(s).replace(/[&<>]/g, (ch) => (({ "&": "&amp;", "<": "&lt;", ">": "&gt;" } as any)[ch]));

// ---------- db (libsql crudo, para leer tablas) ----------
const c = createClient({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

// ---------- procesamiento de UN pool ----------
async function processPool(pool: any, explicitJokes: string | null) {
  const defs = (await c.execute({ sql: `SELECT id,mechanic,rarity FROM card_defs WHERE pool_id=?`, args: [pool.id] })).rows as any[];
  const rarByMech: Record<string, string> = {};
  const rarById: Record<string, string> = {};
  for (const d of defs) { rarByMech[d.mechanic] = d.rarity; rarById[d.id] = d.rarity; }

  // config de pesos
  const cfgRow = (await c.execute({ sql: `SELECT * FROM pool_fun_config WHERE pool_id=?`, args: [pool.id] })).rows[0] as any;
  const curW: W = cfgRow
    ? { comun: cfgRow.weight_comun, rara: cfgRow.weight_rara, legendaria: cfgRow.weight_legendaria, maldicion: cfgRow.weight_maldicion }
    : { comun: 50, rara: 25, legendaria: 10, maldicion: 15 };
  const karmaOn = cfgRow ? !!cfgRow.karma_tabla : false;

  // miembros
  const mem = (
    await c.execute({
      sql: `SELECT p.id,p.name FROM pool_members m JOIN participants p ON p.id=m.participant_id WHERE m.pool_id=?`,
      args: [pool.id],
    })
  ).rows as any[];

  // ranks por participante (para el karma del día) + último snapshot
  const rankRows = (await c.execute({ sql: `SELECT date,participant_id,rank,total FROM pool_day_rank WHERE pool_id=?`, args: [pool.id] })).rows as any[];
  const rkByPart: Record<string, Record<string, { rank: number; total: number }>> = {};
  let lastDate = "";
  for (const r of rankRows) {
    (rkByPart[r.participant_id] ??= {})[r.date] = { rank: r.rank, total: r.total };
    if (r.date > lastDate) lastDate = r.date;
  }
  const curRank: Record<string, { rank: number; total: number }> = {};
  for (const r of rankRows) if (r.date === lastDate) curRank[r.participant_id] = { rank: r.rank, total: r.total };

  // TODAS las cartas del pool (una sola pasada): suerte + guerra de cartas
  const allCards = (
    await c.execute({
      sql: `SELECT participant_id, target_participant_id, card_type, status, reflected, draw_date, card_def_id FROM fun_cards WHERE pool_id=?`,
      args: [pool.id],
    })
  ).rows as any[];

  const socRate = allCards.length ? allCards.filter((r) => clase(r.card_type) === "social").length / allCards.length : 0;

  // ---------- rachas + totales REALES (motor del juego) ----------
  const poolFull = await getPoolBySlug(pool.slug);
  const lb = poolFull ? await getLeaderboard(poolFull) : [];
  const engineById: Record<string, { total: number; pure: number; streakBest: number; streakCur: number; streakBonus: number }> = {};
  // Posición EN VIVO (con swaps de Game is game ya aplicados): getLeaderboard ya viene
  // ordenado por total real. Distinta del snapshot de pool_day_rank (congelado al
  // arranque del día), que se usa solo para el karma de los ejes de cartas.
  const liveRank: Record<string, { rank: number; total: number }> = {};
  (lb as any[]).forEach((row, i) => {
    liveRank[row.id] = { rank: i, total: lb.length };
    engineById[row.id] = {
      total: row.total ?? 0,
      pure: row.fun?.pureTotal ?? 0,
      streakBest: row.fun?.streakBest ?? 0,
      streakCur: row.fun?.streakCurrent ?? 0,
      streakBonus: row.fun?.streakBonus ?? 0,
    };
  });

  const war: Record<string, War> = {};
  for (const m of mem) war[m.id] = blankWar();

  for (const r of allCards) {
    if (r.status === "held") continue; // en mano, nunca jugada
    const cl = clase(r.card_type);
    const pid = r.participant_id;
    const vic = r.target_participant_id;
    const reflected = !!r.reflected;
    const blocked = r.status === "blocked";

    // defensas (escudo / espejito) + aguante (Fernet, escudo de racha)
    if (cl === "escudo" || r.card_type === "aguante") {
      const w = war[pid]; if (!w) continue;
      w.defs++;
      if (r.card_type === "escudo") w.defEscudo++;
      else if (r.card_type === "espejito") w.defEspejito++;
      else if (r.card_type === "aguante") w.defAguante++;
      continue;
    }

    // ataques (mufa, caído, filtro, caldeador, duelo, pedo, vendetta, game is game...)
    if (cl === "ataque" && vic) {
      const a = war[pid]; const v = war[vic];
      if (a) {
        a.atkThrown++;
        if (blocked) a.atkBlocked++;
        else if (reflected) a.atkBackfired++; // rebotó: se la comió el que la tiró
        else a.atkLanded++;
      }
      if (v) {
        v.recvTotal++;
        if (blocked) v.recvBlocked++;          // la víctima la frenó con un Anulo mufa
        else if (reflected) v.recvReflected++; // la víctima la rebotó con un Espejito
        else v.recvLanded++;
      }
      continue;
    }

    // sociales contra otro (apodo / foto / micrófono)
    if (cl === "social" && vic && vic !== pid) {
      const a = war[pid]; const v = war[vic];
      if (a) a.socThrown++;
      if (v) {
        v.socRecv++;
        if (blocked) v.socRecvBlocked++;
        else if (reflected) v.socRecvReflected++;
        else v.socRecvLanded++;
      }
    }
  }

  // Promedios del grupo: ataques y bardeo son suma-cero, así que la fortuna se mide
  // CONTRA el promedio (igual que el sorteo mide vs lo que "te tocaba").
  const N = mem.length;
  let sumRecvLanded = 0, sumSocLanded = 0;
  for (const m of mem) { const w = war[m.id]; sumRecvLanded += w.recvLanded; sumSocLanded += w.socRecvLanded; }
  const avgRecvLanded = N ? sumRecvLanded / N : 0;
  const avgSocLanded = N ? sumSocLanded / N : 0;

  // Fortuna de CANCHA: lo que el resto te hizo (y cómo zafaste), vs el promedio.
  const gameFortune = (w: War, streakBest: number): number =>
    w.recvReflected * 1.0 +                  // rebotaste el ataque: golazo de fortuna
    w.recvBlocked * 0.5 +                     // lo frenaste con escudo
    (avgRecvLanded - w.recvLanded) * 0.8 +   // te entraron menos (+) / más (−) que la media
    (avgSocLanded - w.socRecvLanded) * 0.4 + // te bardearon menos (+) / más (−) que la media
    streakFortune(streakBest);

  // ---------- fortuna del juego (por jugador) ----------
  const players: Player[] = [];
  for (const pp of mem) {
    const rows = allCards.filter((r) => r.participant_id === pp.id);
    const rk = rkByPart[pp.id] ?? {};
    let legA = 0, malA = 0, socA = 0, pts = 0, legE = 0, malE = 0;
    for (const r of rows) {
      const rar = (r.card_def_id ? rarById[r.card_def_id] : null) || rarByMech[r.card_type] || defOf(r.card_type)?.rarity || "comun";
      const cl = clase(r.card_type);
      if (rar === "legendaria") legA++;
      if (rar === "maldicion") malA++;
      if (cl === "social") socA++;
      if (cl === "puntos") pts++;
      const pos = rk[r.draw_date];
      const pw = karmaOn && pos ? karmaWeights(curW, pos.rank, pos.total) : curW;
      const q = rarProbs(pw);
      legE += q.leg;
      malE += q.mal;
    }
    const n = rows.length;
    const socE = socRate * n;
    const legD = legA - legE, malAvoid = malE - malA, socAvoid = socE - socA;
    const cur = liveRank[pp.id] ?? curRank[pp.id]; // vivo; si falta, snapshot
    const eng = engineById[pp.id] ?? { total: 0, pure: 0, streakBest: 0, streakCur: 0, streakBonus: 0 };
    const w = war[pp.id] ?? blankWar();
    const cartas = legD + malAvoid + socAvoid;
    const juego = gameFortune(w, eng.streakBest);
    const score = cartas + juego;
    players.push({
      id: pp.id, name: pp.name, n,
      legA, legE: +legE.toFixed(1), malA, malE: +malE.toFixed(1), socA, socE: +socE.toFixed(1),
      pts, pctUtil: n ? Math.round((100 * pts) / n) : 0,
      legD: +legD.toFixed(1), malAvoid: +malAvoid.toFixed(1), socAvoid: +socAvoid.toFixed(1),
      cartas: +cartas.toFixed(1), juego: +juego.toFixed(1), score: +score.toFixed(1),
      rank: cur ? cur.rank + 1 : null, total: cur ? cur.total : mem.length,
      streakBest: eng.streakBest, streakBonus: eng.streakBonus, pure: eng.pure, totalReal: eng.total,
      war: w,
    });
  }
  players.sort((a, b) => b.score - a.score);

  // ---------- "por qué" del veredicto (cuenta TODO el juego) ----------
  const porQue = (p: Player): string => {
    const w = p.war;
    const cand: [number, string][] = [];
    if (p.legD >= 1) cand.push([Math.abs(p.legD), `${p.legA} legendarias, por encima de lo previsto`]);
    else if (p.legD <= -1) cand.push([Math.abs(p.legD), `${p.legA || "0"} legendarias (le tocaban ~${p.legE})`]);
    if (p.malAvoid >= 1.5) cand.push([Math.abs(p.malAvoid), `esquivó ~${Math.round(p.malAvoid)} maldiciones que le tocaban`]);
    else if (p.malAvoid <= -1.5) cand.push([Math.abs(p.malAvoid), `comió ${p.malA} maldiciones (le tocaban ~${p.malE})`]);
    if (p.socAvoid >= 1.5) cand.push([Math.abs(p.socAvoid), `casi sin cartas muertas (${p.socA} sociales)`]);
    else if (p.socAvoid <= -1.5) cand.push([Math.abs(p.socAvoid), `${p.socA} cartas sociales muertas`]);
    if (p.streakBest >= 5) cand.push([streakFortune(p.streakBest), `rachón de ${p.streakBest} seguidos${p.streakBonus ? ` (+${p.streakBonus} de hitos)` : ""}`]);
    if (w.recvLanded >= 2) cand.push([w.recvLanded * 0.8, `lo cagaron a ataques (${w.recvLanded} le entraron de ${w.recvTotal})`]);
    if (w.recvReflected >= 1) cand.push([w.recvReflected * 1.0, `rebotó ${w.recvReflected} ataque${w.recvReflected > 1 ? "s" : ""} con el espejito`]);
    else if (w.recvBlocked >= 2) cand.push([w.recvBlocked * 0.5, `bloqueó ${w.recvBlocked} ataques con escudo`]);
    if (w.socRecvLanded >= 2) cand.push([w.socRecvLanded * 0.4, `lo bardearon (${w.socRecvLanded} sociales colgadas)`]);
    cand.sort((a, b) => b[0] - a[0]);
    const top = cand.slice(0, 3).map((c) => c[1]);
    if (top.length === 0) return `Salió cerca de lo previsto en todo. Nadie lo molestó mucho.`;
    return top.join("; ") + ".";
  };

  // ---------- jokes ----------
  let jokes: Record<string, string> = {};
  const jokeCandidate = explicitJokes ?? `${pool.slug}.jokes.json`;
  const jp = path.isAbsolute(jokeCandidate) ? jokeCandidate : path.join(JOKES_DIR, path.basename(jokeCandidate));
  if (fs.existsSync(jp)) jokes = JSON.parse(fs.readFileSync(jp, "utf8"));
  else if (fs.existsSync(jokeCandidate)) jokes = JSON.parse(fs.readFileSync(jokeCandidate, "utf8"));
  const hasJokes = Object.keys(jokes).length > 0;

  // ---------- premios ----------
  const topBy = (val: (p: Player) => number) => {
    let best: { item: Player; v: number } | null = null;
    for (const it of players) { const v = val(it); if (best === null || v > best.v) best = { item: it, v }; }
    return best && best.v > 0 ? best : null;
  };
  const award = (emoji: string, title: string, who: string | null, detail: string) =>
    who ? `<div class="award"><div class="aw-emoji">${emoji}</div><div class="aw-body"><div class="aw-title">${esc(title)}</div><div class="aw-who">${esc(who)}</div><div class="aw-det">${esc(detail)}</div></div></div>` : "";

  const aBestStreak = topBy((p) => p.streakBest);
  const aAggro = topBy((p) => p.war.atkThrown);
  const aVerdugo = topBy((p) => p.war.atkLanded);
  const aTarget = topBy((p) => p.war.recvTotal);
  const aMartyr = topBy((p) => p.war.recvLanded);
  const aShield = topBy((p) => p.war.defs);
  const aSocial = topBy((p) => p.war.socRecv);
  const aLucky = players[0]?.score > 0 ? { item: players[0], v: players[0].score } : null;
  const aUnlucky = players.length ? { item: players[players.length - 1], v: players[players.length - 1].score } : null;

  const awardsHtml = [
    aBestStreak && award("🔥", "Mejor racha", aBestStreak.item.name, `${aBestStreak.v} partidos seguidos sumando (+${aBestStreak.item.streakBonus} de hitos)`),
    aVerdugo && award("🗡️", "Verdugo", aVerdugo.item.name, `${aVerdugo.v} ataques que pegaron`),
    aAggro && award("😈", "El más picante", aAggro.item.name, `tiró ${aAggro.v} ataques`),
    aTarget && award("🎯", "Imán de ataques", aTarget.item.name, `le tiraron ${aTarget.v} cartas`),
    aMartyr && award("🩸", "Punching ball", aMartyr.item.name, `${aMartyr.v} ataques le entraron de lleno`),
    aShield && award("🛡️", "El amarrete / escudero", aShield.item.name, `jugó ${aShield.v} defensas`),
    aSocial && award("🤡", "El más bardeado", aSocial.item.name, `${aSocial.v} sociales colgadas`),
    aLucky && award("🍀", "El más afortunado", aLucky.item.name, `fortuna ${sgn(aLucky.item.score)} en todo el juego`),
    aUnlucky && aUnlucky.item.score < 0 && award("💀", "El más perjudicado", aUnlucky.item.name, `fortuna ${sgn(aUnlucky.item.score)} en todo el juego`),
  ].filter(Boolean).join("");

  // chips de resumen
  const counts: Record<string, number> = {};
  for (const p of players) { const e = estadoDe(p.score).label; counts[e] = (counts[e] || 0) + 1; }
  const chips = Object.entries(counts).map(([k, v]) => `<span class="chip">${esc(k)}: <b>${v}</b></span>`).join("");

  // ---------- "No tan (fun)": chiste para los que más mala suerte tuvieron ----------
  // El prode se llama Fun, pero de divertido tiene poco cuando siempre te embocan a vos.
  const fmtNames = (ns: string[]) =>
    ns.length <= 1 ? (ns[0] ?? "") : ns.slice(0, -1).join(", ") + " y " + ns[ns.length - 1];
  const noFun = (() => {
    const muyMal = players.filter((p) => estadoDe(p.score).cls === "muy-mal");
    const last = players[players.length - 1];
    const list = muyMal.length ? muyMal : last && last.score < -0.5 ? [last] : [];
    if (!list.length) return "";
    const names = esc(fmtNames(list.map((p) => p.name)));
    const txt = list.length === 1
      ? `A <b>${names}</b> el prode se le hizo cuesta arriba: dice <b>Fun</b> en el nombre, pero de divertido tiene poco cuando el barrio entero te emboca a vos.`
      : `Para <b>${names}</b> esto no tuvo nada de divertido. Sí, el prode se llama <b>Fun</b>… pero de <em>fun</em> tiene poco cuando siempre te embocan a vos.`;
    return `<div class="nofun"><span class="nf-emoji">😵‍💫</span><div class="nf-body"><div class="nf-title">No tan (fun)</div><div class="nf-txt">${txt}</div></div></div>`;
  })();

  // ---------- tabla única ----------
  const rowsHtml = players
    .map((p, i) => {
      const e = estadoDe(p.score);
      const joke = jokes[p.name.toLowerCase()] || "";
      const scoreCls = p.score > 0.5 ? "pos" : p.score < -0.5 ? "neg" : "neu";
      const streakCell = p.streakBest > 0
        ? `${p.streakBest}${p.streakBonus > 0 ? `<span class="dim"> +${p.streakBonus}🔥</span>` : ""}`
        : "—";
      return `
      <tr class="${e.cls}">
        <td class="rank" data-label="#">${i + 1}</td>
        <td class="name" data-label="">${esc(p.name)}${p.rank ? `<span class="tablepos">tabla ${p.rank}º/${p.total}</span>` : ""}</td>
        <td class="num ${p.cartas >= 0 ? "pos" : "neg"}" data-label="🍀 Cartas">${sgn(p.cartas)}</td>
        <td class="num ${p.streakBest >= 5 ? "pos" : ""}" data-label="🔥 Racha">${streakCell}</td>
        <td class="num ${p.juego >= 0 ? "pos" : "neg"}" data-label="⚔️ Juego">${sgn(+p.juego.toFixed(1))}</td>
        <td class="score ${scoreCls}" data-label="Score">${sgn(p.score)}</td>
        <td data-label="Estado"><span class="badge ${e.cls}">${e.emoji} ${e.label}</span></td>
        <td class="why" data-label="Por qué">${esc(porQue(p))}</td>
        ${hasJokes ? `<td class="joke" data-label="🎤 Bicho dice">${joke ? esc(joke) : ""}</td>` : ""}
      </tr>`;
    })
    .join("");

  // Acordeón para mobile (mismas filas, colapsables; todas cerradas por defecto).
  const accHtml = players
    .map((p, i) => {
      const e = estadoDe(p.score);
      const joke = jokes[p.name.toLowerCase()] || "";
      const scoreCls = p.score > 0.5 ? "pos" : p.score < -0.5 ? "neg" : "neu";
      const streakCell = p.streakBest > 0
        ? `${p.streakBest}${p.streakBonus > 0 ? `<span class="dim"> +${p.streakBonus}🔥</span>` : ""}`
        : "—";
      return `
      <details class="acc ${e.cls}">
        <summary>
          <span class="acc-rank">${i + 1}</span>
          <span class="acc-name">${esc(p.name)}${p.rank ? `<span class="tablepos">tabla ${p.rank}º/${p.total}</span>` : ""}</span>
          <span class="acc-score ${scoreCls}">${sgn(p.score)}</span>
          <span class="acc-chev">▾</span>
        </summary>
        <div class="acc-body">
          <div class="acc-row"><span class="lbl">Estado</span><span class="badge ${e.cls}">${e.emoji} ${e.label}</span></div>
          <div class="acc-row"><span class="lbl">🍀 Cartas</span><span class="${p.cartas >= 0 ? "pos" : "neg"}">${sgn(p.cartas)}</span></div>
          <div class="acc-row"><span class="lbl">🔥 Racha</span><span>${streakCell}</span></div>
          <div class="acc-row"><span class="lbl">⚔️ Juego</span><span class="${p.juego >= 0 ? "pos" : "neg"}">${sgn(+p.juego.toFixed(1))}</span></div>
          <div class="acc-why">${esc(porQue(p))}</div>
          ${hasJokes && joke ? `<div class="acc-joke">🎤 ${esc(joke)}</div>` : ""}
        </div>
      </details>`;
    })
    .join("");

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Análisis del Juego — ${esc(pool.name)}</title>
<style>
  :root{ --bg:#0d1117; --card:#161b22; --line:#30363d; --txt:#e6edf3; --dim:#8b949e;
    --pos:#3fb950; --neg:#f85149; --neu:#8b949e; --gold:#e3b341; }
  *{box-sizing:border-box}
  body{margin:0;background:radial-gradient(1200px 600px at 50% -10%, #1b2330 0%, var(--bg) 60%);
    color:var(--txt);font:15px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;padding:24px 18px 36px}
  .wrap{max-width:1180px;margin:0 auto}
  header{text-align:center;margin-bottom:22px}
  h1{margin:0 0 6px;font-size:26px;letter-spacing:.3px}
  /* Acordeón (mobile): una tarjeta colapsable por jugador, todas cerradas. */
  .accordion{display:none;flex-direction:column;gap:8px}
  .acc{background:var(--card);border:1px solid var(--line);border-radius:14px;overflow:hidden}
  .acc[open]{border-color:#3a4250}
  .acc summary{list-style:none;cursor:pointer;display:flex;align-items:center;gap:10px;padding:12px 14px}
  .acc summary::-webkit-details-marker{display:none}
  .acc-rank{color:var(--dim);font-variant-numeric:tabular-nums;font-size:13px;min-width:16px}
  .acc-name{font-weight:800;flex:1;min-width:0;line-height:1.25}
  .acc-name .tablepos{display:block;font-weight:400;font-size:11px;color:var(--dim)}
  .acc-score{font-weight:800;font-size:17px;font-variant-numeric:tabular-nums}
  .acc-score.pos,.acc-row .pos{color:var(--pos)} .acc-score.neg,.acc-row .neg{color:var(--neg)} .acc-score.neu{color:var(--neu)}
  .acc-chev{color:var(--dim);font-size:12px;transition:transform .15s}
  .acc[open] .acc-chev{transform:rotate(180deg)}
  .acc-body{padding:10px 14px 13px;border-top:1px solid var(--line)}
  .acc-row{display:flex;justify-content:space-between;gap:12px;padding:3px 0;font-size:14px}
  .acc-row .lbl{color:var(--dim)}
  .acc-why{margin-top:9px;font-size:13px;color:var(--dim)}
  .acc-joke{margin-top:9px;font-size:13px;font-style:italic;color:#d2a8ff}
  @media (max-width:640px){
    body{padding:14px 10px 28px}
    h1{font-size:20px}
    .awards{grid-template-columns:1fr;gap:8px}
    .tablewrap{display:none}
    .accordion{display:flex}
    .legend{margin-top:18px}
  }
  h1 .cup{filter:drop-shadow(0 2px 6px rgba(227,179,65,.4))}
  .sub{color:var(--dim);font-size:14px}
  .chips{display:flex;gap:8px;flex-wrap:wrap;justify-content:center;margin:16px 0 4px}
  .chip{background:var(--card);border:1px solid var(--line);border-radius:999px;padding:5px 12px;font-size:13px;color:var(--dim)}
  .chip b{color:var(--txt)}
  .nofun{display:flex;align-items:center;gap:14px;background:rgba(248,81,73,.08);border:1px solid rgba(248,81,73,.3);border-radius:14px;padding:13px 16px;margin:14px 0 2px;text-align:left}
  .nf-emoji{font-size:30px;line-height:1;flex:0 0 auto}
  .nf-title{font-size:11px;text-transform:uppercase;letter-spacing:.5px;color:#ff7b72;font-weight:700}
  .nf-txt{font-size:14px;color:var(--txt);margin-top:2px}
  .nf-txt b{color:#ff7b72}
  .awards{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:10px;margin:18px 0 6px;text-align:left}
  .award{display:flex;align-items:center;gap:12px;background:var(--card);border:1px solid var(--line);border-radius:12px;padding:12px 14px}
  .aw-emoji{font-size:26px;line-height:1;flex:0 0 auto}
  .aw-body{min-width:0}
  .aw-title{font-size:11px;text-transform:uppercase;letter-spacing:.5px;color:var(--dim);font-weight:700}
  .aw-who{font-weight:800;font-size:15px;margin:1px 0}
  .aw-det{font-size:12px;color:var(--dim)}
  .tablewrap{overflow-x:auto;border:1px solid var(--line);border-radius:14px;background:var(--card);box-shadow:0 8px 30px rgba(0,0,0,.35)}
  table{border-collapse:collapse;width:100%;min-width:760px}
  th,td{padding:11px 12px;text-align:left;border-bottom:1px solid var(--line);vertical-align:top}
  thead th{position:sticky;top:0;background:#1b212b;color:var(--dim);font-weight:600;font-size:12px;text-transform:uppercase;letter-spacing:.5px;white-space:nowrap}
  tbody tr:last-child td{border-bottom:none}
  tbody tr:hover{background:rgba(255,255,255,.025)}
  td.rank{color:var(--dim);font-variant-numeric:tabular-nums;width:34px}
  td.name{font-weight:700;white-space:nowrap}
  .tablepos{display:block;font-weight:400;font-size:11px;color:var(--dim)}
  td.num,td.score{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
  td.num.pos,.score.pos{color:var(--pos)} td.num.neg,.score.neg{color:var(--neg)} .score.neu{color:var(--neu)}
  td.score{font-weight:800;font-size:16px}
  .dim{color:var(--dim);font-weight:400}
  .badge{display:inline-block;padding:3px 10px;border-radius:999px;font-size:12px;font-weight:700;white-space:nowrap;border:1px solid transparent}
  .badge.muy-bien{background:rgba(63,185,80,.16);color:#56d364;border-color:rgba(63,185,80,.35)}
  .badge.bien{background:rgba(63,185,80,.10);color:#7ee787;border-color:rgba(63,185,80,.22)}
  .badge.normal{background:rgba(139,148,158,.14);color:#c9d1d9;border-color:rgba(139,148,158,.3)}
  .badge.mal{background:rgba(248,81,73,.10);color:#ff7b72;border-color:rgba(248,81,73,.22)}
  .badge.muy-mal{background:rgba(248,81,73,.18);color:#ff7b72;border-color:rgba(248,81,73,.4)}
  tr.muy-bien td.name{color:var(--gold)}
  tr.muy-mal td.name{color:#ff7b72}
  td.why{color:var(--dim);font-size:13px;max-width:280px}
  td.joke{font-size:13px;font-style:italic;color:#d2a8ff;max-width:300px}
  .legend{margin-top:14px;color:var(--dim);font-size:12.5px;line-height:1.7}
  .legend code{background:var(--card);border:1px solid var(--line);border-radius:5px;padding:1px 6px;color:var(--txt)}
  footer{text-align:center;color:var(--dim);font-size:12px;margin-top:28px}
</style>
</head>
<body>
<div class="wrap">
  <header>
    <h1><span class="cup">🏆</span> Análisis del Juego — ${esc(pool.name)}</h1>
    <div class="sub">${players.length} jugadores · ${allCards.length} cartas sorteadas · karma de tabla ${karmaOn ? "ON" : "OFF"} · pesos ${curW.comun}/${curW.rara}/${curW.legendaria}/${curW.maldicion}</div>
    <div class="awards">${awardsHtml}</div>
  </header>

  <div class="sub" style="margin-bottom:10px">Qué tan afortunado fue cada uno con TODO el juego: las cartas que le tocaron, las rachas, y cómo lo trató el resto (ataques que le entraron, los que frenó, el bardeo).</div>
  <div class="chips">${chips}</div>
  ${noFun}
  <div class="tablewrap" style="margin-top:12px">
    <table>
      <thead>
        <tr>
          <th>#</th><th>Jugador</th>
          <th title="Suerte del sorteo: legendarias de más + maldiciones esquivadas + cartas muertas esquivadas">🍀 Cartas</th>
          <th title="Mejor racha de partidos seguidos sumando (+ bonus de hitos)">🔥 Racha</th>
          <th title="Lo que el resto te hizo vs el promedio del grupo: ataques rebotados/bloqueados (+), te atacaron/bardearon menos (+) o más (−) que la media, más el premio por rachón">⚔️ Juego</th>
          <th title="Cartas + Juego">Score</th><th>Estado</th><th>Por qué</th>${hasJokes ? "<th>🎤 Bicho dice</th>" : ""}
        </tr>
      </thead>
      <tbody>${rowsHtml}
      </tbody>
    </table>
  </div>
  <div class="accordion">${accHtml}</div>
  <div class="legend">
    <b>Cómo leer:</b>
    <code>🍀 Cartas</code> suerte del sorteo (legendarias de más + maldiciones y cartas muertas esquivadas) ·
    <code>🔥 Racha</code> mejor cadena de partidos seguidos sumando; <code>+N🔥</code> = puntos de hito cobrados (3/5/8/12 seguidos) ·
    <code>⚔️ Juego</code> lo que el resto te hizo vs el promedio: ataques que rebotaste (+1) o bloqueaste (+½), y si te atacaron/bardearon menos que la media sumás, si más restás, más el premio por rachón ·
    <code>Score</code> = 🍀 Cartas + ⚔️ Juego → define el estado. Cada punto ≈ una carta a favor/en contra.
  </div>

  <footer>Generado por la skill <b>analisis-suerte</b> · rachas, ataques y defensas en vivo del motor del juego · datos de producción</footer>
</div>
</body>
</html>`;

  fs.mkdirSync(HTML_DIR, { recursive: true });
  const outFile = path.join(HTML_DIR, `${pool.slug}.html`);
  fs.writeFileSync(outFile, html);
  console.error(`✅ ${pool.name} → ${path.relative(REPO, outFile)}${hasJokes ? " (con chistes)" : " (sin chistes)"}`);

  return {
    pool: pool.name, slug: pool.slug, cards: allCards.length, karmaOn, hasJokes,
    players: players.map((p) => ({
      name: p.name, rank: p.rank, total: p.total,
      score: p.score, cartas: p.cartas, juego: p.juego, estado: estadoDe(p.score).label,
      legD: p.legD, malAvoid: p.malAvoid, socAvoid: p.socAvoid,
      streakBest: p.streakBest, streakBonus: p.streakBonus, totalReal: p.totalReal, pure: p.pure,
      war: p.war,
    })),
  };
}

// ---------- resolver pools y correr ----------
let poolRows: any[];
if (all) {
  poolRows = (await c.execute({ sql: `SELECT id,name,slug,mode FROM pools WHERE mode='fun' ORDER BY name` })).rows as any[];
  if (poolRows.length === 0) throw new Error("No hay prodes en modo fun.");
} else {
  const pool = (
    await c.execute({
      sql: `SELECT id,name,slug,mode FROM pools WHERE lower(slug)=lower(?) OR lower(name)=lower(?) LIMIT 1`,
      args: [poolArg, poolArg],
    })
  ).rows[0] as any;
  if (!pool) throw new Error(`No encontré el prode "${poolArg}"`);
  if (pool.mode !== "fun") console.warn(`Ojo: "${pool.name}" no es modo fun (mode=${pool.mode}).`);
  poolRows = [pool];
}

const results = [];
for (const pr of poolRows) {
  results.push(await processPool(pr, all ? null : jokesPath));
}

// Con un solo pool imprimimos el JSON completo (para escribir los chistes).
// Con --all, un resumen por pool (los datos finos salen corriendo cada uno aparte).
if (!all) {
  console.log(JSON.stringify(results[0], null, 2));
} else {
  console.log(JSON.stringify(results.map((r) => ({ slug: r.slug, jugadores: r.players.length, conChistes: r.hasJokes })), null, 2));
}
