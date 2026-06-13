// Mail saliente — agnóstico del proveedor (solo server).
//
// Elige según las env vars disponibles:
//  1. RESEND_API_KEY            → Resend (requiere dominio verificado; con
//     prodemundial2026.xyz verificado, MAIL_FROM=prode@prodemundial2026.xyz)
//  2. GMAIL_USER + GMAIL_APP_PASSWORD → SMTP de Gmail (sin dominio; app password
//     de Google, no la contraseña real: https://myaccount.google.com/apppasswords)
//  3. nada                      → log a consola (dev), no envía.

import nodemailer from "nodemailer";

export type Mail = { to: string; subject: string; html: string };

const FROM =
  process.env.MAIL_FROM ??
  process.env.GMAIL_USER ??
  "Prode Mundial <prode@prodemundial2026.xyz>";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// POST a Resend con reintento ante 429. El límite es 5 req/s (header
// `ratelimit-policy: 5;w=1`): mandar de a uno en ráfaga dejaba afuera a todos
// los destinatarios después del quinto. Reintentamos respetando el reset.
async function resendPost(
  path: string,
  body: unknown,
  tries = 4,
): Promise<{ ok: boolean; error?: string }> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`https://api.resend.com${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (res.ok) return { ok: true };
    if (res.status === 429 && attempt < tries - 1) {
      const reset = Number(
        res.headers.get("ratelimit-reset") ?? res.headers.get("retry-after") ?? 1,
      );
      await sleep(Math.max(1, reset) * 1000 + 100);
      continue;
    }
    return { ok: false, error: `Resend ${res.status}: ${await res.text()}` };
  }
}

export async function sendEmail(mail: Mail): Promise<{ ok: boolean; error?: string }> {
  if (process.env.RESEND_API_KEY) {
    return resendPost("/emails", {
      from: FROM,
      to: [mail.to],
      subject: mail.subject,
      html: mail.html,
    });
  }

  if (process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) {
    const transport = nodemailer.createTransport({
      service: "gmail",
      auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD },
    });
    try {
      await transport.sendMail({ from: FROM, to: mail.to, subject: mail.subject, html: mail.html });
      return { ok: true };
    } catch (e) {
      return { ok: false, error: `Gmail SMTP: ${e instanceof Error ? e.message : e}` };
    }
  }

  // Sin proveedor configurado: no-op con log (dev).
  console.log(`[mailer] (sin proveedor) → ${mail.to}: ${mail.subject}`);
  return { ok: false, error: "Sin proveedor de mail configurado (RESEND_API_KEY o GMAIL_*)." };
}

// Envío masivo (resumen diario). Con Resend usa el endpoint /emails/batch: hasta
// 100 mails personalizados en UNA sola request, así un prode entero entra en una
// llamada y no choca con el límite de 5 req/s que antes cortaba el envío.
export async function sendEmails(
  mails: Mail[],
): Promise<{ sent: number; failed: number; errors: string[] }> {
  if (mails.length === 0) return { sent: 0, failed: 0, errors: [] };

  if (process.env.RESEND_API_KEY) {
    let sent = 0;
    let failed = 0;
    const errors: string[] = [];
    for (let i = 0; i < mails.length; i += 100) {
      const chunk = mails.slice(i, i + 100);
      const res = await resendPost(
        "/emails/batch",
        chunk.map((m) => ({ from: FROM, to: [m.to], subject: m.subject, html: m.html })),
      );
      if (res.ok) sent += chunk.length;
      else {
        failed += chunk.length;
        errors.push(res.error ?? "Resend batch falló.");
      }
      if (i + 100 < mails.length) await sleep(250); // pacear entre requests (5 req/s)
    }
    return { sent, failed, errors };
  }

  if (process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) {
    const transport = nodemailer.createTransport({
      service: "gmail",
      auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD },
    });
    let sent = 0;
    let failed = 0;
    const errors: string[] = [];
    for (const m of mails) {
      try {
        await transport.sendMail({ from: FROM, to: m.to, subject: m.subject, html: m.html });
        sent++;
      } catch (e) {
        failed++;
        errors.push(`${m.to}: ${e instanceof Error ? e.message : e}`);
      }
      await sleep(120); // respiro para Gmail
    }
    return { sent, failed, errors };
  }

  for (const m of mails) console.log(`[mailer] (sin proveedor) → ${m.to}: ${m.subject}`);
  return { sent: 0, failed: mails.length, errors: ["Sin proveedor de mail configurado."] };
}
