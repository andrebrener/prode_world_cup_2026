"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { joinAction, updateAvatarAction } from "@/lib/actions";
import { fileToSquareDataUrl as fileToAvatar } from "@/lib/imageFile";
import Avatar from "./Avatar";

export default function ProfileForm({
  currentName,
  currentAvatar,
}: {
  currentName: string;
  currentAvatar: string | null;
}) {
  const [name, setName] = useState(currentName);
  const [avatar, setAvatar] = useState<string | null>(currentAvatar);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, start] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // permite re-elegir el mismo archivo
    if (!file) return;
    setError(null);
    setDone(false);
    try {
      setAvatar(await fileToAvatar(file));
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cargar la foto.");
    }
  }

  function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setDone(false);
    start(async () => {
      const r1 = await joinAction(name);
      if (!r1.ok) {
        setError(r1.error ?? "No se pudo guardar el nombre.");
        return;
      }
      const r2 = await updateAvatarAction(avatar);
      if (!r2.ok) {
        setError(r2.error ?? "No se pudo guardar la foto.");
        return;
      }
      setDone(true);
      router.refresh();
    });
  }

  return (
    <form
      onSubmit={save}
      className="mx-auto max-w-md rounded-3xl border border-border bg-surface p-8"
    >
      <h1 className="wordmark text-3xl">
        Mi <span className="text-primary">perfil</span>
      </h1>
      <p className="mt-2 text-sm text-muted">
        Cambiá tu nombre y tu foto. Así te ven en las tablas de tus prodes.
      </p>

      {/* Foto */}
      <div className="mt-6 flex items-center gap-4">
        <Avatar name={name || "?"} avatar={avatar} size={72} />
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="rounded-xl border border-border bg-background px-4 py-2 text-sm font-semibold text-foreground transition hover:border-primary"
          >
            {avatar ? "Cambiar foto" : "Subir foto"}
          </button>
          {avatar && (
            <button
              type="button"
              onClick={() => setAvatar(null)}
              className="text-left text-xs text-muted underline transition hover:text-danger"
            >
              Quitar foto
            </button>
          )}
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          onChange={onPick}
          className="hidden"
        />
      </div>

      {/* Nombre */}
      <label className="mt-6 block text-xs font-semibold uppercase tracking-wider text-muted">
        Nombre
      </label>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Tu nombre…"
        maxLength={40}
        className="mt-1.5 w-full rounded-xl border border-border bg-background px-4 py-3 text-foreground outline-none focus:border-primary"
      />

      {error && <p className="mt-3 text-sm text-danger">{error}</p>}
      {done && !error && <p className="mt-3 text-sm text-primary">Guardado ✓</p>}

      <button
        type="submit"
        disabled={pending}
        className="mt-5 w-full rounded-xl bg-primary px-5 py-3 font-bold text-primary-ink transition hover:brightness-110 disabled:opacity-60"
      >
        {pending ? "Guardando…" : "Guardar perfil"}
      </button>
    </form>
  );
}
