"use client";

import { useState, type ReactNode } from "react";

type TabKey = "previa" | "llaves";

export default function JugarTabs({
  previa,
  llaves,
  defaultTab,
  hasKnockout,
}: {
  previa: ReactNode;
  llaves: ReactNode;
  defaultTab: TabKey;
  /** Si el cuadro de llaves ya está generado (terminó la fase de grupos). */
  hasKnockout: boolean;
}) {
  const [tab, setTab] = useState<TabKey>(defaultTab);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex gap-2 rounded-2xl border border-border bg-surface p-1">
        <TabButton active={tab === "previa"} onClick={() => setTab("previa")}>
          ⚽ Grupos y apuestas
        </TabButton>
        <TabButton active={tab === "llaves"} onClick={() => setTab("llaves")}>
          🗝️ Llaves
        </TabButton>
      </div>

      {/* Ambas montadas (con hidden) para no perder lo tipeado al cambiar de tab. */}
      <div className={tab === "previa" ? "" : "hidden"}>{previa}</div>
      <div className={tab === "llaves" ? "" : "hidden"}>
        {hasKnockout ? (
          llaves
        ) : (
          <section className="rounded-2xl border border-border bg-surface p-6 text-center text-sm">
            <p className="font-semibold text-foreground">
              Las llaves todavía no están 🗝️
            </p>
            <p className="mt-1 text-muted">
              Se arman cuando termina la fase de grupos. Mientras tanto, completá tus
              pronósticos en <strong className="text-foreground">Grupos y apuestas</strong>
              .
            </p>
          </section>
        )}
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 rounded-xl px-4 py-2 text-sm font-bold transition ${
        active ? "bg-primary text-primary-ink" : "text-muted hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}
