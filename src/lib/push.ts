// Notificaciones push (Web Push / PWA) — solo server.
//
// Requiere claves VAPID en las env vars:
//   NEXT_PUBLIC_VAPID_PUBLIC_KEY  (la usa también el cliente para suscribirse)
//   VAPID_PRIVATE_KEY
// Generalas una sola vez con:  npx web-push generate-vapid-keys
//
// Sin claves configuradas todo es no-op (no rompe nada en dev).

import webpush from "web-push";
import { inArray, eq } from "drizzle-orm";
import { db } from "./db";
import { pushSubscriptions } from "./db/schema";

const PUBLIC = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const PRIVATE = process.env.VAPID_PRIVATE_KEY;
const SUBJECT = process.env.VAPID_SUBJECT ?? "mailto:prode@prodemundial2026.xyz";

let configured = false;
export function pushConfigured(): boolean {
  if (configured) return true;
  if (!PUBLIC || !PRIVATE) return false;
  webpush.setVapidDetails(SUBJECT, PUBLIC, PRIVATE);
  configured = true;
  return true;
}

// Lo que viaja en el mensaje; el service worker lo lee en el evento `push`.
export type PushPayload = {
  title: string;
  body: string;
  url?: string; // a dónde lleva el click (default "/")
  tag?: string; // notificaciones con el mismo tag se reemplazan, no se apilan
};

type StoredSub = {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

/**
 * Manda una push a todos los dispositivos de los participantes dados.
 * Poda las suscripciones que el navegador ya rechazó (404/410).
 * Best-effort: nunca tira, devuelve cuántas salieron.
 */
export async function sendPushToParticipants(
  participantIds: string[],
  payload: PushPayload,
): Promise<{ sent: number; failed: number }> {
  if (!pushConfigured() || participantIds.length === 0) {
    return { sent: 0, failed: 0 };
  }

  const subs = (await db
    .select({
      id: pushSubscriptions.id,
      endpoint: pushSubscriptions.endpoint,
      p256dh: pushSubscriptions.p256dh,
      auth: pushSubscriptions.auth,
    })
    .from(pushSubscriptions)
    .where(inArray(pushSubscriptions.participantId, participantIds))) as StoredSub[];

  if (subs.length === 0) return { sent: 0, failed: 0 };

  const body = JSON.stringify(payload);
  const dead: string[] = [];
  let sent = 0;
  let failed = 0;

  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          body,
        );
        sent++;
      } catch (e: unknown) {
        failed++;
        const status = (e as { statusCode?: number })?.statusCode;
        if (status === 404 || status === 410) dead.push(s.id);
      }
    }),
  );

  if (dead.length > 0) {
    try {
      await db.delete(pushSubscriptions).where(inArray(pushSubscriptions.id, dead));
    } catch {
      /* limpieza best-effort */
    }
  }

  return { sent, failed };
}

/** Datos de suscripción que manda el cliente (PushSubscription.toJSON()). */
export type ClientSubscription = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
};

/** Guarda (o actualiza el dueño de) una suscripción del navegador. */
export async function savePushSubscription(
  participantId: string,
  sub: ClientSubscription,
  id: string,
): Promise<void> {
  if (!sub?.endpoint || !sub.keys?.p256dh || !sub.keys?.auth) return;
  await db
    .insert(pushSubscriptions)
    .values({
      id,
      participantId,
      endpoint: sub.endpoint,
      p256dh: sub.keys.p256dh,
      auth: sub.keys.auth,
      createdAt: new Date(),
    })
    // Mismo endpoint (mismo dispositivo): reasignarlo al participante actual.
    .onConflictDoUpdate({
      target: pushSubscriptions.endpoint,
      set: { participantId, p256dh: sub.keys.p256dh, auth: sub.keys.auth },
    });
}

/** Borra una suscripción por endpoint (al desactivar las notis). */
export async function deletePushSubscription(endpoint: string): Promise<void> {
  if (!endpoint) return;
  await db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, endpoint));
}
