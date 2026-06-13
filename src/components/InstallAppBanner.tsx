"use client";

// Cartel para instalar la app: aparece solo si estás en el navegador (no en la
// PWA ya instalada). En Android/Chrome usa el prompt nativo de instalación; en
// iPhone no hay API, así que mostramos las instrucciones (Compartir → Agregar a
// inicio). Dentro de la PWA no muestra nada.

import { useEffect, useState } from "react";

// Evento no estándar de Chrome para disparar la instalación nosotros.
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

// iPad moderno (iPadOS 13+) miente y manda un UA de Mac de escritorio: lo
// reconocemos por "Macintosh" + pantalla táctil. Junto con iPhone/iPod es iOS:
// se instala igual (Compartir → Agregar a inicio).
function isIOS(): boolean {
  if (typeof window === "undefined") return false;
  const ua = navigator.userAgent;
  const iPadOS = /Macintosh/.test(ua) && navigator.maxTouchPoints > 1;
  return /iPad|iPhone|iPod/.test(ua) || iPadOS;
}

// Mobile (celu/tablet): la app se instala y las notis sirven. En desktop no
// empujamos la instalación. UA + falta de hover/puntero fino como respaldo.
function isMobile(): boolean {
  if (typeof window === "undefined") return false;
  if (isIOS()) return true; // iPad/iPhone, incluido el iPad con UA de Mac
  const uaData = (navigator as unknown as { userAgentData?: { mobile?: boolean } }).userAgentData;
  if (typeof uaData?.mobile === "boolean") return uaData.mobile;
  if (/Android|Mobile/i.test(navigator.userAgent)) return true;
  return window.matchMedia?.("(pointer: coarse)").matches ?? false;
}

type Mode = "hidden" | "ios" | "prompt";

export default function InstallAppBanner() {
  const [mode, setMode] = useState<Mode>("hidden");
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    if (isStandalone()) return; // ya instalada: nada que hacer
    if (!isMobile()) return; // en desktop no empujamos la instalación

    if (isIOS()) {
      // diferido: evita el setState síncrono dentro del effect
      const id = setTimeout(() => setMode("ios"), 0);
      return () => clearTimeout(id);
    }

    // Android/Chrome: el navegador nos avisa cuándo es instalable.
    function onBeforeInstall(e: Event) {
      e.preventDefault(); // evitamos el mini-banner del navegador, mostramos el nuestro
      setDeferred(e as BeforeInstallPromptEvent);
      setMode("prompt");
    }
    function onInstalled() {
      setMode("hidden");
      setDeferred(null);
    }
    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  async function install() {
    if (!deferred) return;
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    if (outcome === "accepted") setMode("hidden");
    setDeferred(null);
  }

  if (mode === "hidden") return null;

  return (
    <div className="flex items-center gap-3 rounded-xl border border-primary/40 bg-primary/5 p-4">
      <span className="text-xl" aria-hidden>
        📲
      </span>
      <div className="flex-1 text-sm">
        <span className="font-bold text-foreground">Instalá la app.</span>{" "}
        <span className="text-muted">
          {mode === "ios"
            ? "Tocá Compartir → Agregar a inicio. Abrila desde el ícono para recibir notificaciones."
            : "Más cómoda y te permite recibir notificaciones de resultados, puntos y cartas."}
        </span>
      </div>
      {mode === "prompt" && (
        <button
          type="button"
          onClick={install}
          className="shrink-0 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-ink transition hover:brightness-110"
        >
          Instalar
        </button>
      )}
    </div>
  );
}
