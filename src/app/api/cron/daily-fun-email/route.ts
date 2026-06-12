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
import { buildPoolDigest, renderDigestEmail } from "@/lib/funDigest";
import { sendEmail } from "@/lib/mailer";
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
  let sent = 0;
  let failed = 0;
  const details: string[] = [];

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

      const res = await sendEmail({ to: member.email, subject: mail.subject, html: mail.html });
      if (res.ok) sent++;
      else {
        failed++;
        details.push(`${pool.slug}/${member.email}: ${res.error}`);
      }
    }
  }

  return NextResponse.json({ ok: true, pools: funPools.length, sent, failed, details });
}
