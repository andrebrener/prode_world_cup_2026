"use client";

import { useEffect, useRef } from "react";

// Muestra el informe (HTML estático mismo-origen) sin scroll interno: ajusta la
// altura del iframe al alto real del contenido, así scrollea la página entera una
// sola vez. Un ResizeObserver sobre el documento interno re-mide ante cualquier
// cambio de alto — clave para el acordeón (abrir/cerrar un jugador) y para los
// emojis/fuentes que reacomodan después del primer paint.
export default function ReportFrame({ src, title }: { src: string; title: string }) {
  const ref = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    const f = ref.current;
    if (!f) return;
    let ro: ResizeObserver | null = null;

    const fit = () => {
      try {
        const doc = f.contentWindow?.document;
        if (doc) f.style.height = `${doc.documentElement.scrollHeight}px`;
      } catch {
        /* otro origen: no debería pasar (mismo origen) */
      }
    };

    const attach = () => {
      try {
        const doc = f.contentWindow?.document;
        if (!doc?.body) return;
        fit();
        ro?.disconnect();
        ro = new ResizeObserver(fit);
        ro.observe(doc.body); // body crece con el contenido (documentElement = alto del iframe, fijo)
        doc.addEventListener("toggle", fit, true); // <details> abrir/cerrar
      } catch {
        /* noop */
      }
    };

    f.addEventListener("load", attach);
    attach(); // por si ya cargó
    window.addEventListener("resize", fit);
    const timers = [0, 150, 500, 1200].map((ms) => setTimeout(fit, ms));

    return () => {
      f.removeEventListener("load", attach);
      window.removeEventListener("resize", fit);
      ro?.disconnect();
      timers.forEach(clearTimeout);
    };
  }, [src]);

  return (
    <iframe
      ref={ref}
      src={src}
      title={title}
      scrolling="no"
      className="block w-full border-0 bg-[#0d1117]"
      style={{ height: "70vh" }}
    />
  );
}
