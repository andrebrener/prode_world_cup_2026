import type { Metadata } from "next";
import { Geist } from "next/font/google";
import SiteNav from "@/components/SiteNav";
import WorldCupMark from "@/components/WorldCupMark";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Lo Forro — Prode Mundial 2026",
  description:
    "El prode del Mundial 2026 de Lo Forro. Pronosticá la fase de grupos, el campeón, el goleador y la figura.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es" className={`${geistSans.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        {/* Cinta Mundial 2026 — paleta oficial */}
        <div className="fifa-gradient text-white">
          <div className="mx-auto flex max-w-3xl items-center justify-center gap-2 px-4 py-1 text-center text-[11px] font-bold uppercase tracking-wider drop-shadow-[0_1px_1px_rgba(0,0,0,0.45)]">
            <span>🏆 Mundial 2026</span>
            <span aria-hidden className="opacity-60">·</span>
            <span>🇨🇦 🇲🇽 🇺🇸</span>
            <span aria-hidden className="opacity-60">·</span>
            <span className="hidden sm:inline">11 jun – 19 jul</span>
            <span className="sm:hidden">Jun–Jul</span>
          </div>
        </div>
        <SiteNav />
        <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">{children}</main>
        <footer className="flex flex-col items-center gap-3 border-t border-border py-8 text-center text-xs text-muted">
          <WorldCupMark size="sm" />
          <span>Lo Forro · Prode Mundial 2026 · hecho entre amigos</span>
        </footer>
      </body>
    </html>
  );
}
