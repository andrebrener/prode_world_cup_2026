---
name: analisis-suerte
description: Analiza TODO el juego de un prode en modo Diversión (Fun) y genera un HTML lindo. La suerte (el puntaje) es SOLO el sorteo de cartas (legendarias de más, maldiciones y cartas sociales muertas esquivadas, ajustado por el Karma de Tabla); de ahí sale el estado (Muy afortunado → Muy perjudicado). Las rachas (datos reales del motor) y la guerra de cartas (ataques que le tiraron y si le entraron/los frenó/los rebotó, defensas, bardeo social) se muestran al costado pero NO cuentan para el puntaje (eso no es suerte). Muestra KPIs/premios arriba. Usar cuando alguien pregunta "a quién le fue mejor/peor con las cartas", "quién tuvo más suerte", "quién la tiene más larga / mejor racha", "a quién le tiraron más", "hacé el análisis de suerte/juego del torneo X".
---

# Análisis del Juego (modo Fun)

Genera un reporte de **qué tan afortunado fue cada jugador con el sorteo de cartas** de un prode modo Diversión. La suerte = solo el mazo que te tocó. Aparte (informativo, sin sumar al puntaje) se muestran las rachas y lo que el resto le hizo (ataques, defensas, bardeo social) — eso no es suerte, y queda como dato y para los chistes.

Arriba van **KPIs/premios** (mejor racha, verdugo, el más picante, imán de ataques, punching ball, escudero, el más bardeado, el más afortunado/perjudicado) y abajo **una sola tabla** con el veredicto por jugador.

## Dónde vive (webapp)

El HTML se genera en **`public/informes/<slug>.html`** (uno por cada prode fun) y la webapp lo sirve en **`/p/<slug>/informe`** (hay un botón "📊 Informe" en la página del prode, solo modo fun). La ruta (`src/app/p/[slug]/informe/page.tsx`) lo muestra en un iframe.

**Se actualiza A MANO, una vez por día** (no hay cron). El flujo: correr el script para TODOS los prodes fun → escribir/actualizar los chistes → regenerar → commitear `public/informes/*.html` → deploy. El `<slug>.jokes.json` de cada prode queda en la skill (`output/`), no se sirve.

## Qué calcula

El **Score** (la suerte) de cada jugador = `🍀 Cartas`, **y nada más**. Las rachas y la guerra de cartas se muestran al costado y dan material para los chistes, pero **NO entran al puntaje**: eso no es suerte (es lo que hiciste o te hicieron), la suerte son las cartas que te tocaron.

- **🍀 Cartas** (suerte del sorteo, medida contra lo que le "tocaba" según su posición y el mazo) — **esto es el Score**:
  - Legendarias que sacó menos las que su posición predecía (replica el `karmaWeights` de `src/lib/cards.ts`).
  - Maldiciones que esquivó respecto de las que le tocaban (+ = zafó).
  - Cartas sociales muertas (micrófono/foto/apodo, que no suman) esquivadas vs el promedio del pool.
- **🔥 Racha** (informativo, NO cuenta): mejor cadena de partidos seguidos sumando + puntos de hito cobrados. **Dato real del motor** (`getLeaderboard`), no estimado.
- **⚔️ Juego** (informativo, NO cuenta — lo que el resto te hizo, medido **vs el promedio del grupo** porque los ataques son suma-cero):
  - `+1` por cada ataque que **rebotaste** con un espejito, `+½` por cada uno que **bloqueaste** con escudo.
  - Te atacaron **menos** que la media → suma; **más** → resta (×0,8). Igual con el bardeo social (×0,4).
  - Premio por rachón (racha larga = el juego tratándote bien).

Cada punto del Score ≈ una carta a favor/en contra. El estado:

| Score | Estado |
|---|---|
| ≥ +3.0 | 🍀 Muy afortunado |
| +1.5 a +3.0 | 😀 Afortunado |
| −1.0 a +1.5 | 😐 Normal |
| −2.5 a −1.0 | 😕 Perjudicado |
| ≤ −2.5 | 💀 Muy perjudicado |

## Cómo correrlo

Requiere `TURSO_DATABASE_URL` y `TURSO_AUTH_TOKEN` en `.env.local` (lee **producción** en vivo). Se corre con **`tsx`** (está en `node_modules`) porque reusa el motor real del juego para las rachas y los totales. Correr desde la raíz del repo.

> Para regenerar TODOS los prodes fun de una (cada uno usa su `output/<slug>.jokes.json` si existe):
> ```bash
> npx tsx .agents/skills/analisis-suerte/scripts/game-report.mts --all
> ```
> Esto escribe `public/informes/<slug>.html` para cada prode fun. Después se commitea y deploya.

Para trabajar un prode puntual (típico al escribir/ajustar chistes):

**Paso 1 — calcular y ver los datos** (escribe el HTML e imprime un JSON con todas las métricas por jugador):

```bash
npx tsx .agents/skills/analisis-suerte/scripts/game-report.mts kbarulo-fun
```

El argumento es el `slug` o el `name` del prode (default `kbarulo-fun`). El HTML queda en `public/informes/<slug>.html`. Si ya existe `output/<slug>.jokes.json`, lo usa automáticamente (la columna "🎤 Bicho dice" aparece sola).

**Paso 2 — agregar la columna "🎤 Bicho dice"** (chistes cortos, opcional pero recomendado).

Leé el JSON del paso 1. Por jugador trae `score`/`cartas` (la suerte = solo el sorteo, que es lo que define el estado), `juego` y `estado`, `rank` (posición **en vivo**), `streakBest`/`streakBonus`, `totalReal`/`pure` y el objeto `war`. Además, a nivel pool, trae **`keyCards`** (línea de tiempo de las cartas importantes: swaps, robos y posicionales — ver abajo) y **`rankTimeline`** (la tabla ordenada día a día). Con TODO eso escribí un chiste corto por jugador, **en la voz del bicho que codeó el juego** (el motor de cartas/karma hablando en primera persona, tono cargada/argentino).

**El chiste es el lugar donde se cruzan las tres capas** (la suerte de cartas, las rachas y la guerra), justamente porque en el puntaje ya NO se mezclan. El jugo está en el contraste:

- **Cartas vs rachas**: "le di cartas malísimas pero lo salvaron las rachas" (`cartas` bajo/negativo + `streakBest` alto), o al revés "le di un mazo de oro y no enganchó una racha".
- **Cartas vs guerra**: "le di cartas buenas y sus 'amigos' lo liquidaron a ataques" (`cartas` alto + `war.recvLanded` alto), o "tuvo el mazo más mufa pero nadie lo tocó y zafó".
- **Suerte vs posición real**: el más afortunado con el mazo que va último, o el punching ball / el de cartas mufa que igual hace podio (`rank` vs `score`).

**CONTÁ LA HISTORIA, no solo los totales.** Cruzá `keyCards` con `rankTimeline` para narrar lo que pasó de verdad: quién le robó a quién y cómo se movió la tabla al otro día. Ej. real: Judith era 1ª por mérito (mejor `pure`), JVP le clavó un Game is game y se trepó él, y al día siguiente BJ le hizo lo mismo a JVP y lo mandó al fondo → tres chistes encadenados ("le robaste al ladrón que le robó a la reina").

**Mencioná las cartas importantes** cuando aparezcan en `keyCards` (son las que el grupo recuerda):
- **Game is game** (`game_is_game`): swap de puntos, roba la posición. El gran volteador de tablas.
- **Robo del día / Duelo** (`duelo`) y **Vendetta** (`vendetta`): robo de puntos directo.
- **Caparazón Azul** (`caparazon`): le cae SOLO al líder y lo iguala con el último. No se esquiva → "por ir 1º te buscó el caparazón".
- **Golpe al Podio** (`golpe`): −15 al 2º y 3º. No se esquiva → "andar cerca de la cima te costó caro".
- **Remontada** (`remontada`): el imán que levanta a los del fondo → "venías último y te salvó la remontada".

En `keyCards` cada evento trae `date`, `card` (nombre lindo), `mech`, `from` (quién la jugó, o a quién le cayó si es posicional), `to` (víctima; `null` en posicionales) y `result` (`hit`/`blocked`/`reflected`).

**Para los del fondo a los que el mazo NO les fue tan mal** (cartas cerca de 0 o incluso +, pero van últimos): la culpa es de ellos, no mía. Tono cargada del bicho tipo *"algún resultado le tenés que pegar vos también, no podés depender de mí en todo"*. Distinto del que va último **por** cartas mufa (ahí sí: "todo mérito del mazo que te tiré").

Guardá un JSON `nombre-en-minúscula → chiste` en `output/`:

```json
{
  "macharacha": "Le di un Ferrari y lo usó para comprar pan: el más bendecido y va último.",
  "oscar": "Le tiré con todo el barrio: 8 ataques que entraron y 7 bardeos. Sobrevive de milagro."
}
```

### Reglas para los chistes (importante)

- **NO confundas ataque real con social.** En `war` están separados:
  - **Ataques reales** (tocan los puntos: mufa, caído, filtro, caldeador, duelo, pedo, vendetta, game is game): `atkThrown`/`atkLanded` (los que tiró) y `recvTotal`/`recvLanded` (los que le tiraron y le entraron). Estos sí "hacen daño".
  - **Sociales / bardeo** (solo ego, no tocan puntos: apodo/foto/micrófono): `socThrown` (los que tiró) y `socRecv`/`socRecvLanded` (los que le colgaron). Esto es **bardeo**, NO un ataque a los puntos.
  - Si alguien "atacó" o "lo atacaron" pero todo era social, decilo como bardeo inofensivo (la "pistola de agua"): tiró/recibió mucho pero **cero daño real**. Casos típicos: el que tiró solo sociales (`atkThrown===0`, `socThrown` alto) o al que solo le colgaron sociales (`recvLanded===0`, `socRecvLanded` alto).
- **Variá la metáfora del bardeo inofensivo**: no repitas "pistola de agua" en todos. Usá imágenes distintas por jugador (cotillón sin pólvora, globos de cumpleaños, serpentina, confeti, cosquillas, etc.).
- Defensas (`defs`, `recvBlocked` con 🛡️, `recvReflected` con 🪞) y rachas (`streakBest`/`streakBonus`) también dan material.

Otros campos de `war`: `recvBlocked` (frenó con escudo), `recvReflected` (rebotó con espejito), `atkBlocked`/`atkBackfired` (le frenaron/rebotaron lo que tiró), `defs`/`defEscudo`/`defEspejito`/`defAguante`.

**Paso 3 — regenerar con chistes:**

```bash
npx tsx .agents/skills/analisis-suerte/scripts/game-report.mts kbarulo-fun --jokes <slug>.jokes.json
```

(`--jokes` acepta una ruta absoluta o el nombre de archivo dentro de `output/`. Sin `--jokes` igual toma `output/<slug>.jokes.json` si existe.) El HTML queda en `public/informes/<slug>.html`; mirable en local en `/p/<slug>/informe` o abriendo el archivo. Commitealo + deploy para que lo vea el grupo.

## Notas

- **Salida = `public/informes/<slug>.html`** (lo sirve la webapp en `/p/<slug>/informe`). Los chistes (`output/<slug>.jokes.json`) viven en la skill, no se sirven. Con `--all` se regeneran todos los prodes fun de una.
- **Posición mostrada = tabla EN VIVO**: la columna "tabla Xº/N" sale de `getLeaderboard` (ordenado por total real, con los swaps de Game is game ya aplicados). NO usa el último snapshot de `pool_day_rank` (que está congelado al arranque del día). El snapshot se usa **solo** para el karma del eje 🍀 Cartas (así lo calcula el juego: con la posición del arranque del día).
- **Ataques/defensas** salen de `fun_cards`: `target_participant_id` = a quién se la tiraron; `status='blocked'` = la frenó un escudo; `reflected=true` = la rebotó un espejito; si no, entró. Las cartas en mano (`status='held'`, nunca jugadas) no cuentan.
- **No hay histórico de pesos de config**: usa los pesos de rareza **actuales** para todas las fechas (aproximación documentada, no afecta el orden general).
- Cartas viejas sin `card_def_id` se clasifican por su mecánica (`card_type`) usando el catálogo (`src/lib/cardCatalog.ts`).
- "Cartas muertas / sociales" = mecánicas con `outcome: social_overlay` o `clear_social` (no dan puntos al que las saca).
