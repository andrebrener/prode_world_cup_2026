"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Avatar from "./Avatar";

type NavPool = { name: string; slug: string; mode?: "normal" | "fun" };
type NavMe = { name: string; avatar: string | null };

export default function SiteNav({
  pools = [],
  me = null,
}: {
  pools?: NavPool[];
  me?: NavMe | null;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [switcherOpen, setSwitcherOpen] = useState(false);

  // Prode actual a partir de la URL: /p/[slug](/...)
  const match = pathname.match(/^\/p\/([^/]+)/);
  const currentSlug = match?.[1] ?? null;
  const currentPool = pools.find((p) => p.slug === currentSlug) ?? null;

  // Links según el contexto (dentro de un prode o no).
  const links = currentSlug
    ? [
        { href: `/p/${currentSlug}`, label: "Tabla" },
        { href: `/p/${currentSlug}/jugar`, label: "Jugar" },
        { href: "/resultados", label: "Resultados oficiales" },
        { href: "/como-funciona", label: "Cómo funciona" },
      ]
    : [
        { href: "/", label: "Mis prodes" },
        { href: "/resultados", label: "Resultados oficiales" },
        { href: "/como-funciona", label: "Cómo funciona" },
      ];

  // Cerrar menús al navegar.
  const [prevPath, setPrevPath] = useState(pathname);
  if (pathname !== prevPath) {
    setPrevPath(pathname);
    setOpen(false);
    setSwitcherOpen(false);
  }

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    if (href === `/p/${currentSlug}`) return pathname === href;
    return pathname.startsWith(href);
  };

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur">
      <nav className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
        <Link href="/" className="group flex items-center gap-2">
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-primary font-black text-primary-ink">
            ⚽
          </span>
          <span className="leading-none">
            <span className="wordmark block text-lg text-foreground">
              PRO<span className="text-primary">DE</span>
            </span>
            <span className="block text-[10px] font-semibold uppercase tracking-widest text-muted">
              Mundial 2026
            </span>
          </span>
        </Link>

        <div className="flex items-center gap-2">
          {/* Switcher de prode (cuando hay prodes) */}
          {pools.length > 0 && (
            <div className="relative">
              <button
                type="button"
                onClick={() => setSwitcherOpen((o) => !o)}
                className="flex max-w-[40vw] items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-sm font-semibold text-foreground transition hover:bg-surface"
              >
                {currentPool?.mode === "fun" && <span aria-hidden>✨</span>}
                <span className="truncate">{currentPool?.name ?? "Mis prodes"}</span>
                <span className="text-muted">▾</span>
              </button>
              {switcherOpen && (
                <>
                  <div
                    className="fixed inset-0 z-30"
                    onClick={() => setSwitcherOpen(false)}
                  />
                  <div className="absolute right-0 z-40 mt-1 w-56 overflow-hidden rounded-xl border border-border bg-background shadow-xl">
                    <div className="max-h-72 overflow-y-auto py-1">
                      {pools.map((p) => (
                        <Link
                          key={p.slug}
                          href={`/p/${p.slug}`}
                          className={`block px-4 py-2 text-sm transition hover:bg-surface ${
                            p.slug === currentSlug
                              ? "font-bold text-primary"
                              : "text-foreground"
                          }`}
                        >
                          {p.mode === "fun" && <span aria-hidden>✨ </span>}
                          {p.name}
                        </Link>
                      ))}
                    </div>
                    <div className="border-t border-border">
                      <Link
                        href="/"
                        className="block px-4 py-2 text-sm text-muted transition hover:bg-surface"
                      >
                        Ver todos
                      </Link>
                      <Link
                        href="/crear"
                        className="block px-4 py-2 text-sm font-semibold text-primary transition hover:bg-surface"
                      >
                        + Crear prode
                      </Link>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Links de escritorio */}
          <div className="hidden items-center gap-1 text-sm sm:flex">
            {links.map((l) => (
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

          {/* Avatar -> Mi perfil */}
          {me && (
            <Link
              href="/perfil"
              aria-label="Mi perfil"
              className={`rounded-full transition hover:opacity-80 ${
                pathname === "/perfil" ? "ring-2 ring-primary ring-offset-2 ring-offset-background" : ""
              }`}
            >
              <Avatar name={me.name} avatar={me.avatar} size={32} />
            </Link>
          )}

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
        </div>
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
              {links.map((l) => (
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
