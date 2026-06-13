"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

// Pull-to-refresh manual: en PWA standalone el gesto nativo no existe (no hay
// barra de navegador), así que lo reimplementamos. Usa router.refresh() para
// re-fetchear los server components sin recargar la página (mantiene scroll e
// inputs); useTransition nos dice cuándo terminó para recoger el spinner.

const TRIGGER = 64; // distancia (px) para disparar el refresh
const MAX = 96; // tope visual del arrastre
const RESIST = 0.5; // resistencia (mitad del movimiento del dedo)

export default function PullToRefresh({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [pull, setPull] = useState(0);
  const [armed, setArmed] = useState(false); // pasó el umbral
  const [dragging, setDragging] = useState(false); // dedo arrastrando (para el render)
  const pulling = useRef(false);
  const startY = useRef<number | null>(null);
  const dist = useRef(0);

  useEffect(() => {
    const reset = () => {
      pulling.current = false;
      startY.current = null;
      dist.current = 0;
      setPull(0);
      setArmed(false);
      setDragging(false);
    };

    const onStart = (e: TouchEvent) => {
      // sólo arrancamos el gesto si estamos arriba de todo
      if (window.scrollY > 0 || e.touches.length !== 1) return;
      startY.current = e.touches[0].clientY;
      pulling.current = true;
      setDragging(true);
    };

    const onMove = (e: TouchEvent) => {
      if (!pulling.current || startY.current == null) return;
      const dy = e.touches[0].clientY - startY.current;
      // si tira para arriba o ya scrolleó, cancelamos y dejamos pasar el scroll
      if (dy <= 0 || window.scrollY > 0) {
        reset();
        return;
      }
      const d = Math.min(MAX, dy * RESIST);
      dist.current = d;
      setPull(d);
      setArmed(d >= TRIGGER);
      e.preventDefault(); // frena el overscroll/bounce nativo mientras tiramos
    };

    const onEnd = () => {
      if (!pulling.current) return;
      const trigger = dist.current >= TRIGGER;
      pulling.current = false;
      startY.current = null;
      dist.current = 0;
      setDragging(false);
      if (trigger) {
        setPull(TRIGGER); // mantenemos el spinner mientras refresca
        startTransition(() => router.refresh());
      } else {
        setPull(0);
        setArmed(false);
      }
    };

    document.addEventListener("touchstart", onStart, { passive: true });
    document.addEventListener("touchmove", onMove, { passive: false });
    document.addEventListener("touchend", onEnd, { passive: true });
    document.addEventListener("touchcancel", reset, { passive: true });
    return () => {
      document.removeEventListener("touchstart", onStart);
      document.removeEventListener("touchmove", onMove);
      document.removeEventListener("touchend", onEnd);
      document.removeEventListener("touchcancel", reset);
    };
  }, [router]);

  // Cuando el refresh termina (isPending pasa a false), recogemos el indicador.
  // Es justamente sincronizar UI local con el fin de una transición async: el
  // setState-in-effect acá es intencional, no un cálculo derivable en render.
  useEffect(() => {
    if (isPending) return;
    /* eslint-disable react-hooks/set-state-in-effect */
    setPull(0);
    setArmed(false);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [isPending]);

  const active = pull > 0 || isPending;
  // transición suave salvo cuando el dedo está arrastrando en vivo
  const smooth = !dragging;

  return (
    <div className="relative">
      {/* Indicador */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 z-10 flex justify-center"
        style={{
          transform: `translateY(${pull - 36}px)`,
          opacity: active ? 1 : 0,
          transition: smooth ? "transform 200ms, opacity 200ms" : "opacity 120ms",
        }}
      >
        <div className="mt-2 grid h-9 w-9 place-items-center rounded-full border border-border bg-surface shadow-lg">
          <svg
            viewBox="0 0 24 24"
            className={`h-5 w-5 text-primary ${isPending ? "animate-spin" : ""}`}
            style={
              isPending
                ? undefined
                : { transform: `rotate(${(pull / TRIGGER) * 270}deg)` }
            }
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
          >
            {isPending ? (
              <path d="M21 12a9 9 0 1 1-6.2-8.6" />
            ) : (
              <>
                <path
                  d="M21 12a9 9 0 1 1-2.6-6.3"
                  opacity={armed ? 1 : 0.4}
                />
                <path d="M21 4v5h-5" opacity={armed ? 1 : 0.4} />
              </>
            )}
          </svg>
        </div>
      </div>

      {/* Contenido: se desplaza con el tirón */}
      <div
        style={{
          transform: `translateY(${pull}px)`,
          transition: smooth ? "transform 200ms" : "none",
        }}
      >
        {children}
      </div>
    </div>
  );
}
