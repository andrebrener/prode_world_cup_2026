"use client";

import type { ChangeEvent } from "react";

/**
 * Input de goles con auto-avance: al tipear el primer dígito en un campo
 * vacío, el foco salta al siguiente input de goles habilitado en la página.
 * Para marcadores de dos dígitos (rarísimos) se puede volver al campo y
 * agregar el segundo dígito.
 */
export default function GoalInput({
  value,
  onChange,
  disabled = false,
  className = "h-10 w-10 rounded-lg border border-border bg-background text-center text-foreground outline-none focus:border-primary disabled:opacity-60",
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  className?: string;
}) {
  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    const clean = e.target.value.replace(/[^0-9]/g, "").slice(0, 2);
    onChange(clean);
    if (value === "" && clean.length === 1) {
      const inputs = Array.from(
        document.querySelectorAll<HTMLInputElement>("input[data-goal-input]"),
      ).filter((el) => !el.matches(":disabled"));
      const next = inputs[inputs.indexOf(e.currentTarget) + 1];
      next?.focus();
    }
  }

  return (
    <input
      data-goal-input
      inputMode="numeric"
      disabled={disabled}
      value={value}
      onChange={handleChange}
      placeholder="–"
      className={className}
    />
  );
}
