"use client";

import { useEffect } from "react";

// Registra el service worker para habilitar la instalación como PWA.
export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .catch(() => {
        /* registro best-effort: si falla, la app sigue funcionando igual */
      });
  }, []);

  return null;
}
