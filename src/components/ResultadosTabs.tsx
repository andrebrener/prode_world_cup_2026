"use client";

import { useState, type ReactNode } from "react";

type TabKey = "resultados" | "posiciones";

export default function ResultadosTabs({
  resultados,
  posiciones,
}: {
  resultados: ReactNode;
  posiciones: ReactNode;
}) {
  const [tab, setTab] = useState<TabKey>("resultados");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex gap-2 rounded-2xl border border-border bg-surface p-1">
        <TabButton active={tab === "resultados"} onClick={() => setTab("resultados")}>
          Cargar resultados
        </TabButton>
        <TabButton active={tab === "posiciones"} onClick={() => setTab("posiciones")}>
          Posiciones por grupo
        </TabButton>
      </div>

      <div className={tab === "resultados" ? "flex flex-col gap-6" : "hidden"}>
        {resultados}
      </div>
      <div className={tab === "posiciones" ? "" : "hidden"}>{posiciones}</div>
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
        active
          ? "bg-primary text-primary-ink"
          : "text-muted hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}
