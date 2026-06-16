// Cron diario (Vercel Cron, ver vercel.json): manda el resumen del modo
// Diversión a los miembros de prodes fun que dejaron su mail.
//
// Protección: Vercel manda "Authorization: Bearer ${CRON_SECRET}" si la env
// var está configurada. Sin CRON_SECRET solo funciona fuera de producción.
//
// Debug (solo dev): GET /api/cron/daily-fun-email?debug=1 devuelve el HTML del
// primer mail en vez de enviarlo.

import { NextRequest, NextResponse } from "next/server";
import { eq, isNotNull, and } from "drizzle-orm";
import { db } from "@/lib/db";
import { pools, poolMembers, participants } from "@/lib/db/schema";
import { buildPoolDigest, funYesterday, renderDigestEmail } from "@/lib/funDigest";
import { autoCurseUnclaimed } from "@/lib/funSweep";
import { sendEmails, type Mail } from "@/lib/mailer";
import { sendPushToParticipants } from "@/lib/push";
import type { Pool } from "@/lib/db/queries";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const isProd = process.env.NODE_ENV === "production";
  const secret = process.env.CRON_SECRET;
  if (secret) {
    if (req.headers.get("authorization") !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "No autorizado." }, { status: 401 });
    }
  } else if (isProd) {
    return NextResponse.json({ error: "Falta CRON_SECRET." }, { status: 401 });
  }

  const debug = !isProd && req.nextUrl.searchParams.get("debug") === "1";

  const funPools = await db.select().from(pools).where(eq(pools.mode, "fun"));

  // Juntamos todos los mails de todos los prodes y los mandamos en batch al
  // final: Resend acepta hasta 100 por request, evitando el límite de 5 req/s
  // que antes dejaba afuera a todos menos los primeros cinco destinatarios.
  const mails: Mail[] = [];
  // Para la push del resumen: todos los miembros del prode (tengan mail o no);
  // sendPushToParticipants ya filtra a los que activaron notificaciones.
  const pushJobs: { pool: Pool; memberIds: string[] }[] = [];

  // Día que recién cerró (huso MX): a las 07:00 MX que corre el cron, "ayer" ya
  // terminó. Es el día que barremos para auto-maldecir a los que no sacaron carta.
  const yesterday = funYesterday();
  let cursed = 0;

  for (const poolRow of funPools) {
    const pool: Pool = {
      id: poolRow.id,
      name: poolRow.name,
      slug: poolRow.slug,
      code: poolRow.code,
      isPublic: poolRow.isPublic,
      mode: "fun",
      createdBy: poolRow.createdBy,
    };

    const allMembers = await db
      .select({ id: poolMembers.participantId })
      .from(poolMembers)
      .where(eq(poolMembers.poolId, pool.id));
    const memberIds = allMembers.map((m) => m.id);
    if (memberIds.length > 0) {
      pushJobs.push({ pool, memberIds });
    }

    // Auto-maldición de los que no sacaron carta ayer (antes del digest, para que
    // el resumen ya refleje las maldiciones aplicadas). Solo aplica en prodes con
    // Karma de Tabla; el resto no se toca. En debug no mutamos la BD.
    if (!debug) {
      cursed += await autoCurseUnclaimed(pool, yesterday, memberIds);
    }

    // Miembros con mail cargado.
    const memberRows = await db
      .select({ id: participants.id, email: participants.email })
      .from(poolMembers)
      .innerJoin(participants, eq(participants.id, poolMembers.participantId))
      .where(and(eq(poolMembers.poolId, pool.id), isNotNull(participants.email)));
    if (memberRows.length === 0) continue;

    const digest = await buildPoolDigest(pool);

    for (const member of memberRows) {
      if (!member.email) continue;
      const mail = renderDigestEmail({ pool, recipientId: member.id, digest });

      if (debug) {
        // Solo dev: devolver el primer mail renderizado para inspección.
        return new NextResponse(mail.html, {
          headers: { "Content-Type": "text/html; charset=utf-8" },
        });
      }

      mails.push({ to: member.email, subject: mail.subject, html: mail.html });
    }
  }

  const { sent, failed, errors } = await sendEmails(mails);

  // Push del resumen diario a los que activaron notificaciones.
  let pushSent = 0;
  for (const job of pushJobs) {
    const r = await sendPushToParticipants(job.memberIds, {
      title: `📰 Tu resumen del día · ${job.pool.name}`,
      body: "Cómo viene la tabla, qué se tiraron ayer y tu carta de hoy 👀",
      url: `/p/${job.pool.slug}`,
      tag: `digest-${job.pool.id}`,
    });
    pushSent += r.sent;
  }

  return NextResponse.json({
    ok: true,
    pools: funPools.length,
    recipients: mails.length,
    sent,
    failed,
    errors,
    pushSent,
    cursed,
  });
}
