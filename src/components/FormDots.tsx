"use client";

import { useEffect, useRef, useState } from "react";
import { TEAM_FORM, type FormMatch } from "@/lib/teamForm";

const DOT: Record<FormMatch["result"], string> = {
  W: "bg-primary",
  D: "bg-muted/60",
  L: "bg-danger",
};

const LABEL: Record<FormMatch["result"], string> = {
  W: "Ganó",
  D: "Empató",
  L: "Perdió",
};

const fmtDate = (iso: string) =>
  new Date(iso + "T12:00:00").toLocaleDateString("es-AR", {
    day: "numeric",
    month: "short",
    year: "2-digit",
  });

/**
 * Pastilla con los últimos 5 partidos del equipo antes del Mundial:
 * verde = ganó, gris = empató, rojo = perdió (más reciente a la derecha).
 * Desktop: el tooltip aparece al pasar el mouse. Mobile: se toca el punto
 * para abrirlo (y se cierra tocando afuera o el mismo punto).
 * `align` ubica el tooltip para que no se escape del borde de la tarjeta.
 */
export default function FormDots({
  code,
  align = "start",
}: {
  code: string;
  align?: "start" | "end";
}) {
  const form = TEAM_FORM[code];
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  const ref = useRef<HTMLSpanElement>(null);

  // Cerrar el tooltip abierto al tocar/clickear fuera de la pastilla.
  useEffect(() => {
    if (openIdx === null) return;
    const onDocPointer = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpenIdx(null);
    };
    document.addEventListener("pointerdown", onDocPointer);
    return () => document.removeEventListener("pointerdown", onDocPointer);
  }, [openIdx]);

  if (!form?.length) return null;

  return (
    <span
      ref={ref}
      className="inline-flex items-center rounded-full border border-border bg-background/60 px-1.5 py-0.5"
      aria-label="Últimos 5 partidos antes del Mundial"
    >
      {form.map((f, i) => (
        // <span> (no <button>) a propósito: las filas viven dentro de un
        // <fieldset disabled> y un button quedaría inerte en modo lectura.
        <span
          key={f.date}
          role="button"
          tabIndex={0}
          onClick={() => setOpenIdx((cur) => (cur === i ? null : i))}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              setOpenIdx((cur) => (cur === i ? null : i));
            }
          }}
          className="group/dot relative flex cursor-pointer items-center p-0.5"
          aria-label={`${LABEL[f.result]} ${f.score} vs ${f.opponent}`}
        >
          <span className={`h-2 w-2 rounded-full ${DOT[f.result]}`} />
          <span
            className={`pointer-events-none absolute bottom-full z-30 mb-1.5 w-max max-w-56 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-left shadow-lg group-hover/dot:block ${
              openIdx === i ? "block" : "hidden"
            } ${align === "end" ? "right-0" : "left-0"}`}
          >
            <span className="block text-xs font-semibold text-foreground">
              {LABEL[f.result]} {f.score} vs {f.opponent}
            </span>
            <span className="block text-[11px] text-muted">
              {f.competition} · {fmtDate(f.date)}
            </span>
          </span>
        </span>
      ))}
    </span>
  );
}
