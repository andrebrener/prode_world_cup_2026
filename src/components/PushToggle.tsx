"use client";

// Activar/desactivar notificaciones push (PWA).
// - Android/Chrome: funciona instalada o no.
// - iPhone: solo si la app está agregada a la pantalla de inicio (iOS 16.4+).

import { useEffect, useState } from "react";
import { subscribeToPushAction, unsubscribeFromPushAction } from "@/lib/actions";

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

const VAPID = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

type State = "loading" | "unsupported" | "ios-need-install" | "on" | "off" | "denied";

export default function PushToggle() {
  const [state, setState] = useState<State>("loading");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function init() {
      const supported =
        typeof window !== "undefined" &&
        "serviceWorker" in navigator &&
        "PushManager" in window &&
        "Notification" in window;

      if (!supported || !VAPID) {
        // iPhone fuera de la pantalla de inicio: no soporta push hasta instalar.
        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
        const standalone =
          window.matchMedia?.("(display-mode: standalone)").matches ||
          // Safari iOS
          (navigator as unknown as { standalone?: boolean }).standalone === true;
        setState(isIOS && !standalone ? "ios-need-install" : "unsupported");
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

  async function enable() {
    setBusy(true);
    setError(null);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        setState(perm === "denied" ? "denied" : "off");
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID!),
      });
      const res = await subscribeToPushAction(JSON.parse(JSON.stringify(sub)));
      if (!res.ok) {
        setError(res.error ?? "No se pudo activar.");
        await sub.unsubscribe().catch(() => {});
        setState("off");
        return;
      }
      setState("on");
    } catch {
      setError("No se pudo activar las notificaciones.");
      setState("off");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    setError(null);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await unsubscribeFromPushAction(sub.endpoint);
        await sub.unsubscribe().catch(() => {});
      }
      setState("off");
    } catch {
      setError("No se pudo desactivar.");
    } finally {
      setBusy(false);
    }
  }

  if (state === "loading" || state === "unsupported") return null;

  return (
    <div className="mt-5 rounded-xl border border-border bg-background p-4">
      <div className="flex items-center gap-3">
        <span className="text-xl" aria-hidden>
          🔔
        </span>
        <div className="flex-1 text-sm">
          <span className="font-bold text-foreground">Notificaciones</span>{" "}
          <span className="text-muted">
            Resultados y puntos, cartas que te tiran y el resumen del día.
          </span>
        </div>
        {(state === "on" || state === "off") && (
          <button
            type="button"
            onClick={state === "on" ? disable : enable}
            disabled={busy}
            className={
              state === "on"
                ? "shrink-0 rounded-xl border border-border bg-background px-4 py-2 text-sm font-semibold text-muted transition hover:border-danger hover:text-danger disabled:opacity-60"
                : "shrink-0 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-ink transition hover:brightness-110 disabled:opacity-60"
            }
          >
            {busy ? "…" : state === "on" ? "Desactivar" : "Activar"}
          </button>
        )}
      </div>

      {state === "ios-need-install" && (
        <p className="mt-2 text-xs text-muted">
          📲 En iPhone: tocá <strong>Compartir</strong> → <strong>Agregar a inicio</strong>.
          Abrí la app desde el ícono y vas a poder activar las notificaciones.
        </p>
      )}
      {state === "denied" && (
        <p className="mt-2 text-xs text-muted">
          Bloqueaste las notificaciones. Habilitalas para este sitio en los ajustes del
          navegador y volvé a entrar.
        </p>
      )}
      {error && <p className="mt-2 text-xs text-danger">{error}</p>}
    </div>
  );
}
