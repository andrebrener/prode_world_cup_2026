// Modo Diversión — resumen diario por mail (solo server).
//
// Cada mañana (cron de Vercel) los miembros de prodes Diversión que dejaron su
// mail reciben: cómo viene la tabla, los resultados de ayer, lo que se tiraron
// en el libro de pases, y el recordatorio de reclamar la carta del día.

import { MATCHES, teamFlag, teamName } from "./fixtures";
import { koKickoff } from "./bracket";
import { funToday, matchDay } from "./cards";
import { playText } from "./funText";
import { type CardType } from "./cardCatalog";
import {
  getLeaderboard,
  getFunState,
  getResultsMap,
  getBracketState,
  type LeaderboardRow,
  type Pool,
} from "./db/queries";

export const APP_BASE_URL = process.env.APP_BASE_URL ?? "https://prodemundial2026.xyz";

// ---------- Mail instantáneo: te jugaron una carta ----------

/**
 * Mail para la víctima cuando le juegan una carta encima (o cuando su defensa
 * la salvó). Se manda al momento de la jugada, no espera al resumen diario.
 */
export function renderAttackEmail(opts: {
  pool: Pool;
  attackerName: string;
  victimName: string;
  cardType: CardType;
  /** Nombre/emoji/descripción del mazo del prode (re-skin). */
  cardName: string;
  cardEmoji: string;
  cardDescription: string;
  detail: string | null;
  blocked: boolean;
  reflected: boolean;
}): { subject: string; html: string } {
  const {
    pool,
    attackerName,
    victimName,
    cardType,
    cardName,
    cardEmoji,
    cardDescription,
    detail,
    blocked,
    reflected,
  } = opts;
  const poolUrl = `${APP_BASE_URL}/p/${pool.slug}`;
  const headline = playText({
    cardType,
    name: cardName,
    emoji: cardEmoji,
    ownerName: attackerName,
    targetName: victimName,
    detail,
    blocked,
    reflected,
  });

  let subject: string;
  let title: string;
  let body: string;
  let cta: string;
  if (blocked) {
    subject = `🛡️ Tu escudo te salvó de ${attackerName}`;
    title = `🛡️ ¡Bloqueado!`;
    body = `${attackerName} te quiso tirar <strong>${esc(cardName)}</strong> y tu escudo se lo comió entero. Sigue activo el resto del día… pero ahora cantaste que lo tenías.`;
    cta = "Ver el papelón en el libro de pases";
  } else if (reflected) {
    subject = `🪞 Tu espejito le devolvió ${cardName} a ${attackerName}`;
    title = `🪞 ¡Rebotó!`;
    body = `${attackerName} te quiso tirar <strong>${esc(cardName)}</strong>… y tu espejito se la devolvió en la cara. Ahora la sufre él. Sigue activo el resto del día, pero ya saben que lo tenías.`;
    cta = "Ver cómo le explotó";
  } else {
    subject = `${cardEmoji} ${attackerName} te jugó ${cardName} en ${pool.name}`;
    title = `${cardEmoji} Te la jugaron`;
    body = `<strong>${esc(headline)}</strong>.<br/>${esc(cardDescription)}`;
    cta = "Entrar y devolverla 😈";
  }

  const html = `
  <div style="font-family:system-ui,-apple-system,sans-serif;max-width:560px;margin:0 auto;padding:24px;background:#ffffff;color:#1a1a1a;">
    <p style="margin:0;font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#8b3cff;font-weight:800;">
      Prode Mundial 2026 · ${esc(pool.name)} ✨
    </p>
    <h1 style="margin:8px 0 0;font-size:24px;">${title}</h1>
    <p style="margin:12px 0 16px;color:#333;font-size:15px;line-height:1.5;">${body}</p>
    <a href="${poolUrl}" style="display:inline-block;background:linear-gradient(115deg,#ff3d8b,#8b3cff);color:#fff;font-weight:800;padding:12px 22px;border-radius:12px;text-decoration:none;">
      ${cta} →
    </a>
    <p style="margin:24px 0 0;font-size:12px;color:#999;">
      Recibís este mail porque dejaste tu dirección en el prode «${esc(pool.name)}».
      <a href="${APP_BASE_URL}/perfil" style="color:#8b3cff;">Sacarme de la lista</a>
    </p>
  </div>`;

  return { subject, html };
}

export type PoolDigest = {
  yesterday: string;
  results: string[];
  plays: string[];
  rows: LeaderboardRow[];
};

/** Fecha (huso MX) del día anterior al actual. */
export function funYesterday(now: Date = new Date()): string {
  return funToday(new Date(now.getTime() - 24 * 60 * 60 * 1000));
}

/** Junta los datos del resumen de un prode (compartidos entre destinatarios). */
export async function buildPoolDigest(pool: Pool, now: Date = new Date()): Promise<PoolDigest> {
  const yesterday = funYesterday(now);
  const [rows, state, results, bracket] = await Promise.all([
    getLeaderboard(pool),
    getFunState(pool, "-"),
    getResultsMap(),
    getBracketState(),
  ]);

  // Resultados de ayer (grupos + llaves).
  const resultLines: string[] = [];
  for (const m of MATCHES) {
    const r = results[m.id];
    if (!r || matchDay(m.kickoff) !== yesterday) continue;
    resultLines.push(
      `${teamFlag(m.homeCode)} ${teamName(m.homeCode)} ${r.homeGoals}-${r.awayGoals} ${teamName(m.awayCode)} ${teamFlag(m.awayCode)}`,
    );
  }
  for (const m of bracket.matches) {
    const k = koKickoff(m.id);
    if (!m.result || !m.home || !m.away || !k || matchDay(k) !== yesterday) continue;
    resultLines.push(
      `${teamFlag(m.home)} ${teamName(m.home)} ${m.result.homeGoals}-${m.result.awayGoals} ${teamName(m.away)} ${teamFlag(m.away)}${m.result.penalties ? " (p)" : ""}`,
    );
  }

  // Jugadas de ayer, del libro de pases.
  const plays = state.feed
    .filter((f) => f.day === yesterday)
    .map((f) =>
      playText({
        cardType: f.cardType,
        name: f.name,
        emoji: f.emoji,
        ownerName: f.ownerName,
        targetName: f.targetName,
        detail: f.detail,
        blocked: f.blocked,
        reflected: f.reflected,
      }),
    );

  return { yesterday, results: resultLines, plays, rows };
}

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** HTML del mail para un destinatario (estilos inline, email-safe). */
export function renderDigestEmail(opts: {
  pool: Pool;
  recipientId: string;
  digest: PoolDigest;
}): { subject: string; html: string } {
  const { pool, recipientId, digest } = opts;
  const me = digest.rows.find((r) => r.id === recipientId);
  const myPos = digest.rows.findIndex((r) => r.id === recipientId) + 1;
  const poolUrl = `${APP_BASE_URL}/p/${pool.slug}`;

  const displayName = (r: LeaderboardRow) =>
    r.fun?.overlay?.nickname ? `${r.name} «${r.fun.overlay.nickname.text}»` : r.name;

  const top = digest.rows.slice(0, 5);
  const standingsRows = top
    .map(
      (r, i) => `
      <tr>
        <td style="padding:4px 8px;color:#888;">${i + 1}</td>
        <td style="padding:4px 8px;font-weight:${r.id === recipientId ? "800" : "400"};">
          ${esc(displayName(r))}${r.fun && r.fun.streakCurrent >= 3 ? ` 🔥${r.fun.streakCurrent}` : ""}
        </td>
        <td style="padding:4px 8px;text-align:right;font-weight:700;">${r.total}</td>
        <td style="padding:4px 8px;text-align:right;color:#888;">${r.fun?.pureTotal ?? r.total}</td>
      </tr>`,
    )
    .join("");

  const list = (items: string[]) =>
    items.length
      ? `<ul style="margin:6px 0 0;padding-left:18px;">${items
          .map((i) => `<li style="margin:3px 0;">${esc(i)}</li>`)
          .join("")}</ul>`
      : `<p style="margin:6px 0 0;color:#888;">Día tranquilo: no pasó nada.</p>`;

  const html = `
  <div style="font-family:system-ui,-apple-system,sans-serif;max-width:560px;margin:0 auto;padding:24px;background:#ffffff;color:#1a1a1a;">
    <p style="margin:0;font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#8b3cff;font-weight:800;">
      Prode Mundial 2026 · ${esc(pool.name)} ✨
    </p>
    <h1 style="margin:8px 0 0;font-size:24px;">
      🎴 Tu carta de hoy te espera${me ? `, ${esc(me.name)}` : ""}
    </h1>
    <p style="margin:8px 0 16px;color:#555;">
      Si no la reclamás antes de la medianoche de México 🇲🇽, se pierde. Puede ser gloria
      o maldición ☠️ — pero la que no se reclama, seguro no es nada.
    </p>
    <a href="${poolUrl}" style="display:inline-block;background:linear-gradient(115deg,#ff3d8b,#8b3cff);color:#fff;font-weight:800;padding:12px 22px;border-radius:12px;text-decoration:none;">
      ✨ Reclamar mi carta
    </a>

    ${
      me
        ? `<p style="margin:20px 0 0;font-size:14px;color:#555;">
            Vas <strong>${myPos}°</strong> con <strong>${me.total} pts</strong>
            (${me.fun?.pureTotal ?? me.total} puros)${
              me.fun && me.fun.streakCurrent > 0
                ? ` y una racha de <strong>🔥${me.fun.streakCurrent}</strong>`
                : ""
            }.
          </p>`
        : ""
    }

    <h2 style="margin:20px 0 0;font-size:16px;">📊 Cómo viene la tabla</h2>
    <table style="border-collapse:collapse;width:100%;font-size:14px;margin-top:6px;">
      <tr style="color:#888;text-align:left;">
        <th style="padding:4px 8px;">#</th><th style="padding:4px 8px;">Jugador</th>
        <th style="padding:4px 8px;text-align:right;">Total</th>
        <th style="padding:4px 8px;text-align:right;">Puro</th>
      </tr>
      ${standingsRows}
    </table>

    <h2 style="margin:20px 0 0;font-size:16px;">⚽ Resultados de ayer</h2>
    ${list(digest.results)}

    <h2 style="margin:20px 0 0;font-size:16px;">📖 El libro de pases de ayer</h2>
    ${list(digest.plays)}

    <p style="margin:24px 0 0;font-size:12px;color:#999;">
      Recibís este mail porque dejaste tu dirección en el prode «${esc(pool.name)}».
      <a href="${APP_BASE_URL}/perfil" style="color:#8b3cff;">Sacarme de la lista</a>
    </p>
  </div>`;

  return {
    subject: `🎴 ${pool.name}: tu carta de hoy te espera (vas ${myPos > 0 ? `${myPos}°` : "—"})`,
    html,
  };
}
