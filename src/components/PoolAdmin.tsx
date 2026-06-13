"use client";

// Administración del prode (owner/admin): mazo de cartas (re-skin + agregar/quitar),
// config del sorteo (% sin efecto + pesos de rareza, con el desglose en dos niveles)
// y roles de los miembros. Todas las acciones pasan por el gate del servidor.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  saveCardDefAction,
  addCardDefAction,
  deleteCardDefAction,
  updateFunConfigAction,
  setMemberRolesAction,
  type CardDefPatch,
} from "@/lib/actions";
import { RARITY_LABEL, type CardRarity, type MechanicOption } from "@/lib/cardCatalog";
import type { PoolAdminData, PoolRole } from "@/lib/db/queries";

type DeckCard = PoolAdminData["deck"][number];
const RARITIES: CardRarity[] = ["comun", "rara", "legendaria", "maldicion"];

export default function PoolAdmin({
  slug,
  poolName,
  isFun,
  myRole,
  meId,
  data,
  mechanics,
}: {
  slug: string;
  poolName: string;
  isFun: boolean;
  myRole: PoolRole;
  meId: string;
  data: PoolAdminData;
  mechanics: MechanicOption[];
}) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, okText: string) =>
    start(async () => {
      const r = await fn();
      setMsg(r.ok ? { kind: "ok", text: okText } : { kind: "err", text: r.error ?? "Error" });
      if (r.ok) router.refresh();
    });

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="wordmark text-3xl">
            Administrar <span className="text-primary">{poolName}</span> ⚙️
          </h1>
          <p className="mt-1 text-sm text-muted">
            Editá el mazo, el sorteo y los roles. Los efectos no cambian — solo cómo se ven y con
            qué probabilidad salen.
          </p>
        </div>
        <Link href={`/p/${slug}`} className="text-sm text-primary underline">
          ← Volver a la tabla
        </Link>
      </header>

      {msg && (
        <div
          className={`rounded-xl border px-4 py-2 text-sm ${
            msg.kind === "ok"
              ? "border-primary/40 bg-primary/10 text-primary"
              : "border-danger/50 bg-danger/10 text-danger"
          }`}
        >
          {msg.text}
        </div>
      )}

      {isFun ? (
        <>
          <SorteoConfig slug={slug} config={data.config} busy={busy} run={run} />
          <Deck slug={slug} deck={data.deck} mechanics={mechanics} busy={busy} run={run} />
        </>
      ) : (
        <p className="rounded-xl border border-border bg-surface p-4 text-sm text-muted">
          Este prode es modo <strong>normal</strong>: no tiene mazo de cartas. Acá solo gestionás
          los roles de los miembros.
        </p>
      )}

      <Members slug={slug} members={data.members} myRole={myRole} meId={meId} busy={busy} run={run} />
    </div>
  );
}

// ---------- Config de sorteo ----------

function SorteoConfig({
  slug,
  config,
  busy,
  run,
}: {
  slug: string;
  config: PoolAdminData["config"];
  busy: boolean;
  run: (fn: () => Promise<{ ok: boolean; error?: string }>, okText: string) => void;
}) {
  const [noEffect, setNoEffect] = useState(config.noEffectShare);
  const [w, setW] = useState({
    comun: config.weightComun,
    rara: config.weightRara,
    legendaria: config.weightLegendaria,
    maldicion: config.weightMaldicion,
  });

  const sum = w.comun + w.rara + w.legendaria + w.maldicion;
  const effectShare = Math.max(0, 100 - noEffect);
  const pct = (weight: number) => (sum > 0 ? (effectShare * weight) / sum : effectShare / 4);

  return (
    <section className="rounded-2xl border border-border bg-surface p-5">
      <h2 className="wordmark text-2xl">Sorteo</h2>
      <p className="mt-1 text-sm text-muted">
        Cómo se reparten las cartas del día. Primero se decide si toca una carta{" "}
        <strong>sin efecto</strong> (puro ego); el resto se reparte por rareza.
      </p>

      {/* Nivel 1 */}
      <div className="mt-4">
        <label className="text-sm font-semibold text-foreground">
          Cartas sin efecto: <span className="text-primary">{noEffect}%</span>
        </label>
        <input
          type="range"
          min={0}
          max={100}
          value={noEffect}
          onChange={(e) => setNoEffect(Number(e.target.value))}
          className="mt-1 w-full accent-[var(--color-primary,#8b3cff)]"
        />
        <p className="text-xs text-muted">
          El otro <strong>{effectShare}%</strong> son cartas con efecto, repartidas así:
        </p>
      </div>

      {/* Nivel 2 */}
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {RARITIES.map((r) => (
          <div key={r} className="rounded-xl border border-border bg-background p-3">
            <div className="text-xs font-bold uppercase tracking-wide text-muted">
              {RARITY_LABEL[r]}
            </div>
            <input
              type="number"
              min={0}
              value={w[r]}
              onChange={(e) => setW({ ...w, [r]: Math.max(0, Math.trunc(Number(e.target.value) || 0)) })}
              className="mt-1 w-full rounded-lg border border-border bg-surface px-2 py-1 text-sm"
            />
            <div className="mt-1 text-xs text-muted">
              peso {w[r]} → <span className="font-semibold text-foreground">{pct(w[r]).toFixed(1)}%</span> del total
            </div>
          </div>
        ))}
      </div>
      <p className="mt-2 text-xs text-muted">
        Los pesos son relativos (no hace falta que sumen 100): cuentan en proporción al total ({sum}).
      </p>

      <button
        disabled={busy}
        onClick={() =>
          run(
            () =>
              updateFunConfigAction(slug, {
                noEffectShare: noEffect,
                weightComun: w.comun,
                weightRara: w.rara,
                weightLegendaria: w.legendaria,
                weightMaldicion: w.maldicion,
              }),
            "Sorteo guardado.",
          )
        }
        className="mt-4 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-ink transition hover:brightness-110 disabled:opacity-50"
      >
        Guardar sorteo
      </button>
    </section>
  );
}

// ---------- Mazo ----------

function Deck({
  slug,
  deck,
  mechanics,
  busy,
  run,
}: {
  slug: string;
  deck: DeckCard[];
  mechanics: MechanicOption[];
  busy: boolean;
  run: (fn: () => Promise<{ ok: boolean; error?: string }>, okText: string) => void;
}) {
  return (
    <section className="rounded-2xl border border-border bg-surface p-5">
      <h2 className="wordmark text-2xl">Mazo ({deck.length})</h2>
      <p className="mt-1 text-sm text-muted">
        Cada carta usa una mecánica fija (su efecto, abajo). Vos editás el nombre, emoji,
        descripción y la rareza, o la deshabilitás para que no salga. Dentro de una rareza todas
        salen con la misma chance.
      </p>

      {RARITIES.map((r) => {
        const cards = deck.filter((c) => c.rarity === r);
        return (
          <div key={r} className="mt-5">
            <h3 className="mb-2 text-xs font-bold uppercase tracking-widest text-muted">
              {RARITY_LABEL[r]} <span className="font-medium text-muted/70">· {cards.length}</span>
            </h3>
            {cards.length === 0 ? (
              <p className="text-xs text-muted/70">Sin cartas en esta rareza.</p>
            ) : (
              <div className="flex flex-col gap-3">
                {cards.map((card) => (
                  <CardRow key={card.id} slug={slug} card={card} busy={busy} run={run} />
                ))}
              </div>
            )}
          </div>
        );
      })}

      {/* Agregar carta: mismo formato que una carta, en un recuadro punteado */}
      <NewCardForm slug={slug} mechanics={mechanics} busy={busy} run={run} />
    </section>
  );
}

function NewCardForm({
  slug,
  mechanics,
  busy,
  run,
}: {
  slug: string;
  mechanics: MechanicOption[];
  busy: boolean;
  run: (fn: () => Promise<{ ok: boolean; error?: string }>, okText: string) => void;
}) {
  const first = mechanics[0];
  const [mech, setMech] = useState<string>(first?.mechanic ?? "");
  const [draft, setDraft] = useState({
    name: first?.defaultName ?? "",
    emoji: first?.emoji ?? "🃏",
    description: first?.description ?? "",
    rarity: (first?.rarity ?? "comun") as CardRarity,
  });

  // Al elegir un reward, precargamos sus valores por defecto (después los editás).
  const pick = (m: string) => {
    setMech(m);
    const opt = mechanics.find((o) => o.mechanic === m);
    if (opt)
      setDraft({
        name: opt.defaultName,
        emoji: opt.emoji,
        description: opt.description,
        rarity: opt.rarity,
      });
  };

  return (
    <div className="mt-6 rounded-xl border-2 border-dashed border-border/70 p-4">
      <h3 className="mb-3 text-xs font-bold uppercase tracking-widest text-muted">+ Agregar carta</h3>

      {/* Reward: qué hace la carta */}
      <label className="mb-1 block text-xs font-semibold text-muted">Reward (qué hace)</label>
      <select
        value={mech}
        onChange={(e) => pick(e.target.value)}
        className="w-full rounded-lg border border-border bg-background px-2 py-1.5 text-sm"
      >
        {mechanics.map((m) => (
          <option key={m.mechanic} value={m.mechanic}>
            {m.emoji} {m.effect}
          </option>
        ))}
      </select>

      {/* Misma estructura que una carta: emoji + nombre + rareza, y descripción */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input
          value={draft.emoji}
          onChange={(e) => setDraft({ ...draft, emoji: e.target.value })}
          className="w-12 rounded-lg border border-border bg-surface px-2 py-1.5 text-center text-lg"
          aria-label="Emoji"
        />
        <input
          value={draft.name}
          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          placeholder="Nombre"
          className="min-w-[8rem] flex-1 rounded-lg border border-border bg-surface px-2 py-1.5 text-sm font-semibold"
          aria-label="Nombre"
        />
        <select
          value={draft.rarity}
          onChange={(e) => setDraft({ ...draft, rarity: e.target.value as CardRarity })}
          className="rounded-lg border border-border bg-surface px-2 py-1.5 text-sm"
          aria-label="Rareza"
        >
          {RARITIES.map((r) => (
            <option key={r} value={r}>
              {RARITY_LABEL[r]}
            </option>
          ))}
        </select>
      </div>
      <textarea
        value={draft.description}
        onChange={(e) => setDraft({ ...draft, description: e.target.value })}
        placeholder="Descripción"
        rows={3}
        className="mt-2 w-full resize-y rounded-lg border border-border bg-surface px-2 py-1.5 text-xs leading-snug"
        aria-label="Descripción"
      />

      <div className="mt-3 flex justify-end">
        <button
          disabled={busy || !mech || !draft.name.trim()}
          onClick={() => run(() => addCardDefAction(slug, mech, draft), "Carta agregada.")}
          className="rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-ink transition hover:brightness-110 disabled:opacity-50"
        >
          + Agregar al mazo
        </button>
      </div>
    </div>
  );
}

function CardRow({
  slug,
  card,
  busy,
  run,
}: {
  slug: string;
  card: DeckCard;
  busy: boolean;
  run: (fn: () => Promise<{ ok: boolean; error?: string }>, okText: string) => void;
}) {
  const [draft, setDraft] = useState({
    name: card.name,
    emoji: card.emoji,
    description: card.description,
    rarity: card.rarity as CardRarity,
  });
  const dirty =
    draft.name !== card.name ||
    draft.emoji !== card.emoji ||
    draft.description !== card.description ||
    draft.rarity !== card.rarity;

  const save = () => run(() => saveCardDefAction(slug, card.id, draft as CardDefPatch), "Carta guardada.");
  const toggle = () =>
    run(() => saveCardDefAction(slug, card.id, { enabled: !card.enabled }), card.enabled ? "Deshabilitada." : "Habilitada.");
  const remove = () => {
    if (confirm(`¿Borrar "${card.name}" del mazo?`)) run(() => deleteCardDefAction(slug, card.id), "Carta borrada.");
  };

  return (
    <div
      className={`rounded-xl border p-3 ${card.enabled ? "border-border bg-background" : "border-border/50 bg-background/40 opacity-60"}`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={draft.emoji}
          onChange={(e) => setDraft({ ...draft, emoji: e.target.value })}
          className="w-12 rounded-lg border border-border bg-surface px-2 py-1.5 text-center text-lg"
          aria-label="Emoji"
        />
        <input
          value={draft.name}
          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          className="min-w-[8rem] flex-1 rounded-lg border border-border bg-surface px-2 py-1.5 text-sm font-semibold"
          aria-label="Nombre"
        />
        <select
          value={draft.rarity}
          onChange={(e) => setDraft({ ...draft, rarity: e.target.value as CardRarity })}
          className="rounded-lg border border-border bg-surface px-2 py-1.5 text-sm"
          aria-label="Rareza"
        >
          {RARITIES.map((r) => (
            <option key={r} value={r}>
              {RARITY_LABEL[r]}
            </option>
          ))}
        </select>
      </div>

      <textarea
        value={draft.description}
        onChange={(e) => setDraft({ ...draft, description: e.target.value })}
        rows={3}
        className="mt-2 w-full resize-y rounded-lg border border-border bg-surface px-2 py-1.5 text-xs leading-snug"
        aria-label="Descripción"
      />

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs text-muted">🎛️ {card.effect}</span>
        <div className="flex items-center gap-2">
          <button
            disabled={busy}
            onClick={toggle}
            className="rounded-lg border border-border px-2 py-1 text-xs font-semibold text-foreground transition hover:bg-surface disabled:opacity-50"
          >
            {card.enabled ? "Deshabilitar" : "Habilitar"}
          </button>
          <button
            disabled={busy}
            onClick={remove}
            className="rounded-lg border border-danger/50 px-2 py-1 text-xs font-semibold text-danger transition hover:bg-danger/10 disabled:opacity-50"
          >
            Borrar
          </button>
          <button
            disabled={busy || !dirty}
            onClick={save}
            className="rounded-lg bg-primary px-3 py-1 text-xs font-bold text-primary-ink transition hover:brightness-110 disabled:opacity-40"
          >
            Guardar
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------- Miembros / roles ----------

function Members({
  slug,
  members,
  myRole,
  meId,
  busy,
  run,
}: {
  slug: string;
  members: PoolAdminData["members"];
  myRole: PoolRole;
  meId: string;
  busy: boolean;
  run: (fn: () => Promise<{ ok: boolean; error?: string }>, okText: string) => void;
}) {
  const canEditRoles = myRole === "owner";
  // Borrador de roles (id → rol). Se persiste en lote con un solo botón.
  const [roles, setRoles] = useState<Record<string, PoolRole>>(() =>
    Object.fromEntries(members.map((m) => [m.id, m.role])),
  );
  const changes = members
    .filter((m) => roles[m.id] !== m.role)
    .map((m) => ({ participantId: m.id, role: roles[m.id] }));

  return (
    <section className="rounded-2xl border border-border bg-surface p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="wordmark text-2xl">Miembros ({members.length})</h2>
          <p className="mt-1 text-sm text-muted">
            {canEditRoles
              ? "Como owner podés promover a admin (gestiona mazo y sorteo) o degradar a jugador."
              : "Solo un owner puede cambiar roles."}
          </p>
        </div>
        {canEditRoles && (
          <button
            disabled={busy || changes.length === 0}
            onClick={() => run(() => setMemberRolesAction(slug, changes), "Roles guardados.")}
            className="rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-ink transition hover:brightness-110 disabled:opacity-40"
          >
            Guardar cambios{changes.length > 0 ? ` (${changes.length})` : ""}
          </button>
        )}
      </div>
      <div className="mt-4 flex flex-col divide-y divide-border/60">
        {members.map((m) => (
          <MemberRow
            key={m.id}
            member={m}
            canEdit={canEditRoles}
            isMe={m.id === meId}
            role={roles[m.id] ?? m.role}
            onChangeRole={(r) => setRoles((prev) => ({ ...prev, [m.id]: r }))}
          />
        ))}
      </div>
    </section>
  );
}

const ROLE_CHIP: Record<PoolRole, { label: string; cls: string }> = {
  owner: { label: "Owner", cls: "border-gold/50 bg-gold/10 text-gold" },
  admin: { label: "Admin", cls: "border-primary/50 bg-primary/10 text-primary" },
  player: { label: "Jugador", cls: "border-border bg-background text-muted" },
};

function RoleChip({ role }: { role: PoolRole }) {
  const c = ROLE_CHIP[role];
  return (
    <span
      className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${c.cls}`}
    >
      {c.label}
    </span>
  );
}

function MemberRow({
  member,
  canEdit,
  isMe,
  role,
  onChangeRole,
}: {
  member: PoolAdminData["members"][number];
  canEdit: boolean;
  isMe: boolean;
  role: PoolRole;
  onChangeRole: (role: PoolRole) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2 py-2">
      <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <span>
          {member.name}
          {isMe && <span className="ml-1 text-xs font-normal text-muted">(vos)</span>}
        </span>
        <RoleChip role={member.role} />
      </span>
      {canEdit && (
        <select
          value={role}
          onChange={(e) => onChangeRole(e.target.value as PoolRole)}
          className="rounded-lg border border-border bg-background px-2 py-1 text-sm"
        >
          <option value="owner">Owner</option>
          <option value="admin">Admin</option>
          <option value="player">Jugador</option>
        </select>
      )}
    </div>
  );
}
