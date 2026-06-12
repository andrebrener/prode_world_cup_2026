import type { Metadata } from "next";
import { Geist } from "next/font/google";
import SiteNav from "@/components/SiteNav";
import WorldCupMark from "@/components/WorldCupMark";
import { getParticipantId } from "@/lib/session";
import { getParticipant, getUserPools } from "@/lib/db/queries";
import "./globals.css";

export const dynamic = "force-dynamic";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Prode Mundial 2026",
  description:
    "Prode del Mundial 2026. Creá tu prode con amigos: pronosticá la fase de grupos, el campeón, el goleador y la figura.",
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const id = await getParticipantId();
  const [myPools, me] = await Promise.all([
    id ? getUserPools(id) : Promise.resolve([]),
    id ? getParticipant(id) : Promise.resolve(null),
  ]);
  const navPools = myPools.map((p) => ({ name: p.name, slug: p.slug }));
  const navMe = me ? { name: me.name, avatar: me.avatar ?? null } : null;
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
        <SiteNav pools={navPools} me={navMe} />
        <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">{children}</main>
        <footer className="flex flex-col items-center gap-3 border-t border-border py-8 text-center text-xs text-muted">
          <WorldCupMark size="sm" />
          <span>Prode Mundial 2026 · hecho entre amigos</span>
        </footer>
      </body>
    </html>
  );
}
