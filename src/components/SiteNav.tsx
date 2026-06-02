"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Tabla" },
  { href: "/jugar", label: "Jugar" },
  { href: "/resultados", label: "Resultados oficiales" },
  { href: "/como-funciona", label: "Cómo funciona" },
];

export default function SiteNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // Cerrar el menú al navegar (reset de estado en render, sin efecto).
  const [prevPath, setPrevPath] = useState(pathname);
  if (pathname !== prevPath) {
    setPrevPath(pathname);
    setOpen(false);
  }

  // Bloquear el scroll del body mientras el menú móvil está abierto.
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur">
      <nav className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
        <Link href="/" className="group flex items-center gap-2">
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-primary font-black text-primary-ink">
            LF
          </span>
          <span className="leading-none">
            <span className="wordmark block text-lg text-foreground">
              LO <span className="text-primary">FORRO</span>
            </span>
            <span className="block text-[10px] font-semibold uppercase tracking-widest text-muted">
              Prode · Mundial 2026
            </span>
          </span>
        </Link>

        {/* Links de escritorio */}
        <div className="hidden items-center gap-1 text-sm sm:flex">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={`rounded-lg px-3 py-1.5 transition hover:bg-surface hover:text-foreground ${
                isActive(l.href) ? "font-semibold text-primary" : "text-muted"
              }`}
            >
              {l.label}
            </Link>
          ))}
        </div>

        {/* Botón hamburguesa (móvil) */}
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-label={open ? "Cerrar menú" : "Abrir menú"}
          aria-expanded={open}
          className="grid h-10 w-10 place-items-center rounded-lg border border-border text-foreground transition hover:bg-surface sm:hidden"
        >
          <span className="relative block h-4 w-5">
            <span
              className={`absolute left-0 block h-0.5 w-5 bg-current transition-all duration-200 ${
                open ? "top-1/2 -translate-y-1/2 rotate-45" : "top-0"
              }`}
            />
            <span
              className={`absolute left-0 top-1/2 block h-0.5 w-5 -translate-y-1/2 bg-current transition-all duration-200 ${
                open ? "opacity-0" : "opacity-100"
              }`}
            />
            <span
              className={`absolute left-0 block h-0.5 w-5 bg-current transition-all duration-200 ${
                open ? "top-1/2 -translate-y-1/2 -rotate-45" : "bottom-0"
              }`}
            />
          </span>
        </button>
      </nav>

      {/* Panel desplegable (móvil) */}
      {open && (
        <>
          <div
            className="fixed inset-0 top-[57px] z-20 bg-black/50 sm:hidden"
            onClick={() => setOpen(false)}
          />
          <div className="relative z-30 border-t border-border bg-background sm:hidden">
            <div className="mx-auto flex max-w-3xl flex-col px-2 py-2">
              {LINKS.map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  className={`rounded-lg px-4 py-3 text-base transition hover:bg-surface ${
                    isActive(l.href)
                      ? "font-semibold text-primary"
                      : "text-foreground"
                  }`}
                >
                  {l.label}
                </Link>
              ))}
            </div>
          </div>
        </>
      )}
    </header>
  );
}
