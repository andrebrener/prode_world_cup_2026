---
name: analisis-suerte
description: Analiza la suerte de cartas de un prode en modo Diversión (Fun) y genera un HTML lindo. Para cada jugador mide tres ejes de fortuna contra lo que le "tocaba" según su posición en la tabla (Karma de Tabla) y el mazo — legendarias de más, maldiciones esquivadas y cartas sociales muertas esquivadas — y le asigna un estado (Muy afortunado → Muy perjudicado). Usar cuando alguien pregunta "a quién le fue mejor/peor con las cartas", "quién tuvo más suerte", "hacé el análisis de suerte del torneo X", o pide la tabla de fortuna con la columna del bicho.
---

# Análisis de Suerte (modo Fun)

Genera un reporte de **qué tan afortunado fue cada jugador con el sorteo de cartas** en un prode modo Diversión, ajustando por el sesgo del Karma de Tabla (al que va último el motor le sube la chance de legendaria y le baja la de maldición, así que sacar legendarias yendo último vale menos).

## Qué calcula

Por jugador, tres ejes medidos **contra lo que le tocaba**, no contra el promedio pelado:

- **🟣 Leg Δ** — legendarias que sacó menos las que su posición predecía (replica `karmaWeights` de `src/lib/cards.ts`).
- **💀 Mal esq.** — maldiciones que esquivó respecto de las que le tocaban (positivo = zafó).
- **🎤 Soc. esq.** — cartas sociales muertas (micrófono/foto/apodo, que no suman puntos) esquivadas vs el promedio del pool.

**Score = Leg Δ + Mal esq. + Soc. esq.** (cada punto ≈ una carta a favor/en contra). El estado sale del score:

| Score | Estado |
|---|---|
| ≥ +3.0 | 🍀 Muy afortunado |
| +1.5 a +3.0 | 😀 Afortunado |
| −1.0 a +1.5 | 😐 Normal |
| −2.5 a −1.0 | 😕 Perjudicado |
| ≤ −2.5 | 💀 Muy perjudicado |

## Cómo correrlo

Requiere `TURSO_DATABASE_URL` y `TURSO_AUTH_TOKEN` en `.env.local` (lee **producción** en vivo). Correr desde la raíz del repo.

**Paso 1 — calcular y ver los datos** (escribe el HTML sin la columna de chistes e imprime un JSON con las métricas + la tabla real de posiciones):

```bash
node .agents/skills/analisis-suerte/scripts/luck-report.mjs kbarulo-fun
```

El argumento es el `slug` o el `name` del prode (default `kbarulo-fun`). El HTML queda en `.agents/skills/analisis-suerte/output/<slug>.html`.

**Paso 2 — agregar la columna "🎤 Bicho dice"** (chistes cortos, opcional pero recomendado).

Leé el JSON que imprimió el paso 1 — trae `score`, `rank` real en la tabla, y los tres ejes de cada jugador. Con eso escribí un chiste corto por jugador, **en la voz del bicho que codeó el juego** (el motor de cartas/karma hablando en primera persona, tono cargada/argentino). El jugo está en la ironía entre la suerte de cartas y la posición real (ej: el más afortunado que va último). Guardá un JSON `nombre-en-minúscula → chiste` en la carpeta `output/`:

```json
{
  "macharacha": "Le di un Ferrari y lo usó para comprar pan: el más bendecido y va último.",
  "droco forro": "Hizo el prode y me revelé. Me odia y aún así sobrevive. Respeto, forro."
}
```

**Paso 3 — regenerar con chistes:**

```bash
node .agents/skills/analisis-suerte/scripts/luck-report.mjs kbarulo-fun --jokes <slug>.jokes.json
```

(`--jokes` acepta una ruta absoluta o el nombre de archivo dentro de `output/`.) Abrí el HTML resultante en `output/<slug>.html`.

## Notas

- **No hay histórico de pesos de config**: el script usa los pesos de rareza **actuales** para todas las fechas. Si el admin cambió los `%` a mitad de torneo, las expectativas de legendaria/maldición de los días viejos quedan calculadas con los pesos nuevos (aproximación documentada, no afecta el orden general).
- Las cartas viejas sin `card_def_id` se clasifican por su mecánica (`card_type`) usando el mazo actual del prode.
- "Cartas muertas / sociales" = mecánicas con `kind: social` o `outcome: clear_social` (no dan puntos al que las saca).
- El reporte usa el **último snapshot** de `pool_day_rank` para la posición real en la tabla.
