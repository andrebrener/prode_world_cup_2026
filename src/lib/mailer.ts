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

export async function sendEmail(mail: Mail): Promise<{ ok: boolean; error?: string }> {
  if (process.env.RESEND_API_KEY) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from: FROM, to: [mail.to], subject: mail.subject, html: mail.html }),
    });
    if (!res.ok) return { ok: false, error: `Resend ${res.status}: ${await res.text()}` };
    return { ok: true };
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
