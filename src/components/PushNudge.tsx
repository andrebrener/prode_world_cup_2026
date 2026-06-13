"use client";

// Cartel personal arriba de la tabla: si en ESTE dispositivo no tenés las
// notificaciones prendidas, te avisa y te manda al perfil a activarlas.
// Solo se muestra DENTRO de la PWA instalada; en el navegador manda el banner
// de instalación (InstallAppBanner), así no se pisan los dos carteles.
// La activación con todos sus casos borde vive en PushToggle (perfil); acá solo
// detectamos y empujamos.

import { useEffect, useState } from "react";
import Link from "next/link";

const VAPID = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

// Solo nos importa si conviene empujar al perfil o no.
//  - "off": soporta y puede activar → empujar.
//  - "denied": las bloqueó → empujar (en el perfil le explicamos cómo reactivar).
//  - "on" / "unsupported" / "loading": no mostramos nada.
type State = "loading" | "unsupported" | "on" | "off" | "denied";

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

export default function PushNudge() {
  const [state, setState] = useState<State>("loading");

  useEffect(() => {
    async function init() {
      // En el navegador no empujamos las notis: primero que instale la app
      // (de eso se encarga InstallAppBanner). Acá solo dentro de la PWA.
      if (!isStandalone()) {
        setState("unsupported");
        return;
      }

      const supported =
        typeof window !== "undefined" &&
        "serviceWorker" in navigator &&
        "PushManager" in window &&
        "Notification" in window;

      if (!supported || !VAPID) {
        setState("unsupported");
        return;
      }

      if (Notification.permission === "denied") {
        setState("denied");
        return;
      }

      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      setState(sub ? "on" : "off");
    }
    init().catch(() => setState("unsupported"));
  }, []);

  // Ya las tiene, no se puede, o todavía no sabemos: no molestamos.
  if (state === "loading" || state === "unsupported" || state === "on") return null;

  const hint =
    state === "denied"
      ? "Las tenés bloqueadas. Reactivalas desde tu perfil."
      : "No te pierdas los resultados, los puntos y las cartas que te tiran.";

  return (
    <Link
      href="/perfil"
      className="flex items-center gap-3 rounded-xl border border-primary/40 bg-primary/5 p-4 transition hover:bg-primary/10"
    >
      <span className="text-xl" aria-hidden>
        🔔
      </span>
      <div className="flex-1 text-sm">
        <span className="font-bold text-foreground">No tenés las notificaciones prendidas.</span>{" "}
        <span className="text-muted">{hint}</span>
      </div>
      <span className="shrink-0 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-ink">
        Activar →
      </span>
    </Link>
  );
}
