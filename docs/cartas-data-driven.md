# Cartas data-driven + admins por torneo — diseño

Estado: propuesta. Autor: diseño asistido. Fecha: 2026-06-13.

## Objetivo

Hoy cada carta **es** su efecto: `doblete` no es un nombre, es "×2 al primer
partido del día" cableado en un `switch` gigante ([cards.ts](../src/lib/cards.ts)
`applyCardEffects`). Las cartas (honguito, diego, mufa…) son chistes internos de
un grupo (kbarulo). Otro pool ("los forro") quiere **las mismas mecánicas con
sus propios chistes**.

La meta es separar dos cosas que hoy están pegadas:

- **Outcome (motor, en código):** la mecánica reutilizable y parametrizable.
  Ej: "multiplicar un partido por un factor". El set de outcomes es cerrado y lo
  define el código.
- **Carta (datos, del pool):** un nombre + emoji + descripción + rareza + **qué
  outcome usa** + **con qué params**. Vive en la DB, editable por los admins del
  pool.

Así "doblete" y "diego" dejan de ser efectos distintos: son el **mismo** outcome
(`multiply_match`) con factor 2 vs 3. Un admin puede crear "El Triple Mortal x4"
re-skineando ese outcome.

**Alcance de esta versión:**
- ✅ Cartas configurables por pool (re-skin de mecánicas existentes).
- ✅ Roles por pool (owner/admin/player) con gate de autorización compartido.
- ❌ El torneo sigue siendo el Mundial 2026 hardcodeado (fuera de alcance).
- ❌ No hay diseñador de efectos nuevos (DSL). El admin elige de una lista cerrada.
- ❌ Auth real: seguimos con honor-system (nombre en cookie). Los roles dan
  estructura, no seguridad criptográfica. Decisión consciente (ver §6).

---

## 1. Catálogo de primitivas (outcomes)

Las 26 cartas con tipo propio colapsan en **13 primitivas**. Esta tabla es la
prueba de feasibility: cada carta actual mapea a un `(outcome, params)` sin
perder comportamiento.

| # | Outcome | Params | Pase / lugar | Cartas actuales |
|---|---------|--------|--------------|-----------------|
| 1 | `multiply_match` | `scope: chosen \| first_of_day \| all_of_day`, `factor: number` (floor) | Pase 1 | honguito (chosen,2) · doblete (first,2) · diego (first,3) · cabala (all,2) · mufa (first,0.5) |
| 2 | `bonus_if_scored` | `scope`, `amount` | Pase 1 | yapa (first,+1) |
| 3 | `floor_match_points` | `scope` (piso = acertar resultado: 3 grupos / 4 KO) | Pase 1 | costillar (all) |
| 4 | `zero_day` | `streak: protect_on_hit \| skip \| none` | Pase 1 | caido (protect_on_hit) · filtro (skip) · nemo/heladera/matambrito (none) |
| 5 | `var_bonus` | `amount` | Pase 2 | var (+2) |
| 6 | `steal_day_points` | — | Pase 3 | duelo |
| 7 | `flat_points` | `selfAmount`, `victimAmount?` | Pase 4 | papas (+5) · speed (+2) · ramirez (−5) · pedo (+5/−5) |
| 8 | `champion_points` | `amount` | queries (extras) | saibamba (10) |
| 9 | `shield` | `mode: block \| reflect` | resolvePlay (standing) | escudo (block) · espejito (reflect) |
| 10 | `streak_shield` | — | racha (standing) | aguante |
| 11 | `upstream_forecast` | `mode: random \| invert` | queries (pre-base) | caldeador (random) · piedrambre (invert) |
| 12 | `social_overlay` | `kind: apodo \| foto \| mensaje` | overlay (no toca puntos) | apodo · foto · microfono |
| 13 | `clear_social` | — | overlay | borron |

**Atributos que dependen del outcome** (no los edita el admin, se derivan):
`window` (match/day/null), `kind` (buff/attack/shield/instant/social/curse),
`target` (self/other), `blockable`, `standing`, `input` (apodo/mensaje/imagen/partido).

Ej: `multiply_match` con `scope: chosen` ⇒ `window: match`, `input: partido`.
`zero_day` con `streak: none` ⇒ es maldición (`kind: curse`, se aplica sola).

**Lo que el admin SÍ edita por carta:** `name`, `emoji`, `description`,
`rarity`, `weight` (peso en el sorteo) y `enabled`. Opcionalmente, si abrimos
params: `factor`, `amount`, etc. — pero el MVP puede dejar params fijos por
outcome y exponer solo lo cosmético.

> Si algún outcome resulta demasiado idiosincrático para abrir, se marca como
> **carta de sistema**: sigue en código, el admin solo puede activarla/
> desactivarla, no recrearla. Hoy ninguna lo necesita, pero queda la salida.

---

## 2. Cambios de schema

ORM: Drizzle + SQLite ([schema.ts](../src/lib/db/schema.ts)).

### 2.1 Nueva tabla `card_defs` (las cartas configurables del pool)

```
card_defs
  id            text PK
  poolId        text FK → pools.id          -- el mazo es por pool
  slug          text                        -- estable, para el sorteo y refs
  outcome       text                        -- enum de las 13 primitivas
  params        text (JSON)                 -- { factor, amount, scope, ... }
  name          text                        -- editable por admin
  emoji         text                        -- editable
  description   text                        -- editable
  rarity        text                        -- comun|rara|legendaria|maldicion
  weight        integer default 1
  enabled       integer (bool) default 1
  createdAt     timestamp
  UNIQUE(poolId, slug)
```

### 2.2 `funCards` (instancias sorteadas/jugadas): de `cardType` a FK

Hoy `funCards.cardType` es un string hardcodeado. Pasa a referenciar el def:

```
funCards
  ...
  cardDefId   text FK → card_defs.id     -- reemplaza cardType
  ...
```

El motor ya no lee `card.cardType`; lee `cardDef.outcome` + `cardDef.params`.

### 2.3 `poolMembers`: agregar `role`

```
poolMembers
  poolId          text FK
  participantId   text FK
  role            text default 'player'   -- owner | admin | player
  joinedAt        timestamp
  PK(poolId, participantId)
```

El `pools.createdBy` se vuelve el `owner` inicial (migración 2.4).

### 2.4 Migración de datos

1. **Crear el mazo default**: las 32 cartas actuales → filas en `card_defs`. Por
   cada pool en modo `fun` se clona el mazo oficial (mismo slug, mismos params,
   nombres de kbarulo). Esto es además la verificación: si las 32 migran sin
   cambiar comportamiento, el set de primitivas está completo.
2. **Re-apuntar `funCards`**: para cada fila existente, `cardDefId` = def del
   mazo de su pool con `slug == cardType` viejo.
3. **Roles**: `createdBy` de cada pool ⇒ `role = owner`. El resto, `player`.

---

## 3. Refactor del motor (el cuello de botella)

Es el grueso del trabajo. Todo lo demás depende de esto.

### 3.1 `applyCardEffects` — de `switch (cardType)` a `switch (outcome)`

Cada `case` deja de hardcodear sus números y los lee de `params`:

```ts
// antes
case "diego": { ... m[id] = m[id] * 3; }      // factor cableado
// después
case "multiply_match": {
  const { scope, factor } = card.params;
  const ids = scope === "chosen" ? [card.effectMatchId]
            : scope === "all_of_day" ? dayIds(card)
            : [firstOfDay(card)];                 // first_of_day
  for (const id of ids) if (id && id in m) m[id] = Math.floor(m[id] * factor);
}
```

`PlayedCardEffect` lleva ahora `outcome` + `params` en vez de `cardType`.
`affectedIdOf`, `resolvePlay`, `bindWindow` leen `kind/target/window/blockable`
desde el def (que a su vez los deriva del outcome) en lugar de `CARD_CATALOG`.

### 3.2 Mover lo que vive fuera de `applyCardEffects`

- **`upstream_forecast`** (caldeador/piedrambre): hoy suelto en
  [getLeaderboard](../src/lib/db/queries.ts). Pasa a una primitiva formal que se
  resuelve en el mismo punto (pre-base), pero leyendo `params.mode`.
- **`champion_points`** (saibamba): vive en los extras del leaderboard; se lee
  `params.amount`.
- **`social_overlay` / `clear_social`**: overlay de apodos/fotos/mensajes, no
  toca puntos. Igual que hoy, parametrizado por `params.kind`.

### 3.3 Sorteo diario

`dailyCard()` hoy sortea de `ALL_CARDS` (catálogo fijo). Pasa a sortear de los
`card_defs` con `enabled = true` **de ese pool**, ponderado por `weight` y con la
misma partición rareza / sin-efecto. La lógica de roll determinístico
(`sha256(pool|participante|fecha)`) no cambia.

---

## 4. Cómo deriva los flags un outcome

Para no obligar al admin a entender `window`/`kind`/`blockable`, cada outcome
trae una "firma" en código:

```ts
const OUTCOME_META: Record<Outcome, {
  window: CardWindow; kind: CardKind; target: Target;
  blockable: boolean; standing: boolean; input?: Input;
  // params que el admin puede editar y sus límites
  editableParams: { factor?: {min,max}, amount?: {min,max}, scope?: [...] };
}> = { ... }
```

La UI de admin lee `OUTCOME_META[outcome]` para saber qué campos mostrar.

---

## 5. Roles y autorización

### 5.1 Helper único

```ts
// canManagePool(participantId, poolId): owner | admin pueden gestionar
async function canManagePool(pid: string, poolId: string): Promise<boolean>
```

### 5.2 Acciones detrás del gate

Hoy estas están **abiertas a cualquiera logueado** ([actions.ts](../src/lib/actions.ts)):

- Editar el mazo de cartas (nuevo) — owner/admin.
- `updateResultAction` / `saveResultsBatchAction` (cargar resultados) — hoy abierto.
- `updateBracketAction` (armar llaves) — hoy abierto.
- Promover/degradar miembros — solo owner.

Aprovechamos el refactor para cerrar resultados y bracket con el mismo helper.

### 5.3 Reemplazo del hack hardcodeado

El `Set(["bj"])` de [fixtures.ts](../src/lib/fixtures.ts) (`canEditAfterDeadline`)
es un permiso ad-hoc por nombre. No es estrictamente parte de este trabajo, pero
queda como deuda a migrar al sistema de roles (un flag `canEditAfterDeadline` por
pool-member, o un rol). **No lo tocamos en esta tanda** salvo que moleste.

### 5.4 Caveat de seguridad (decisión consciente)

Auth = nombre en cookie, sin credenciales: cualquiera puede tipear "BJ" y serlo.
El rol "admin" es tan fuerte como el honor-system. Para pools de amigos alcanza.
Si más adelante hace falta, se suma auth real (PIN por pool / magic link) sin
tirar la estructura de roles. Se documenta y se sigue.

---

## 6. UI de admin

Pantalla por pool, visible solo a owner/admin:

- **Mazo**: lista de cartas del pool. Cada fila muestra la mecánica read-only
  ("🎲 Multiplica ×2 el primer partido del día") y los campos editables al lado:
  nombre, emoji, descripción, rareza, weight, toggle enabled. Botón "nueva carta"
  ⇒ elegís outcome de la lista cerrada y completás lo cosmético.
- **Miembros**: lista con su rol; owner promueve/degrada. Owner no se puede
  auto-degradar si es el único.

Sin diseñador de efectos: el admin nunca toca lógica.

---

## 7. Plan de implementación (por fases)

Cada fase es mergeable y deja el sistema funcionando.

1. **Refactor del motor a outcomes+params, SIN tocar DB ni UI.** El catálogo
   sigue en código pero expresado como `{outcome, params}`; `applyCardEffects`
   switchea sobre `outcome`. Las 32 cartas migran a esta forma. **Criterio de
   éxito: el leaderboard da idéntico antes y después** (snapshot test). Es el
   cuello de botella y el mayor riesgo: se hace aislado.
2. **Schema + migración**: `card_defs`, `funCards.cardDefId`, seed del mazo
   default por pool, re-apuntado de instancias. El motor empieza a leer de DB.
3. **Roles**: `poolMembers.role`, `canManagePool`, gate en cartas + resultados +
   bracket. Migración de `createdBy → owner`.
4. **UI de admin**: editor de mazo + gestión de miembros.

---

## 8. Riesgos y decisiones abiertas

- **R1 — Comportamiento idéntico tras el refactor (fase 1).** Mitigación: test de
  snapshot del leaderboard con cartas jugadas reales antes de tocar nada.
- **R2 — Params abiertos = cartas rotas/desbalanceadas.** Mitigación: límites por
  param en `OUTCOME_META` (factor ∈ [0,5], etc.); o no abrir params en el MVP y
  exponer solo lo cosmético.
- **R3 — Honor-system (§5.4).** Aceptado para esta versión.
- **D1 — ¿Mazo por pool o mazos compartibles/plantillas?** Propuesta: por pool,
  clonando el oficial al crear. Plantillas, después.
- **D2 — ¿Abrimos params en el MVP o solo lo cosmético?** Propuesta: solo
  cosmético primero (es lo que pediste: mismo comportamiento, otro nombre).
```
