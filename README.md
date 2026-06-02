# World Cup 2026 Prediction Pool 🏆

A **prediction pool** for the 2026 World Cup (USA · Mexico · Canada, Jun 11 – Jul 19, 2026).
Each player predicts match results and earns points for what they get right.
Whoever finishes on top of the table wins.

Built with **Next.js 16** (App Router) + **React 19**, a **SQLite/Turso** database via **Drizzle ORM**,
and styled with **Tailwind CSS 4**.

---

## How to play

1. **Sign in with your name** (`/jugar`). A player is created and stored in a cookie (~4 months, covers the whole tournament). No passwords.
2. **Predict the group stage**: the score of each of the 72 matches (48 teams · 12 groups).
3. **Predict the extras**: champion, runner-up, top scorer, and player of the tournament.
4. Once the knockout stage starts, the **bracket** is generated and you predict each tie (score + who advances, penalties included).
5. As matches are played, the **real results** are loaded (`/resultados`) and the **standings table** updates automatically.

> ⚠️ **Note:** in this version the results page (`/resultados`) is **open to anyone** — there's no admin authentication. Whoever has the link can load or edit official results and generate the bracket. Add proper access control before using this for a real pool.

## Scoring

| Correct prediction | Points |
|---|---|
| **Group stage** — exact score | 5 |
| **Group stage** — outcome (winner/draw) without the exact score | 3 |
| **Knockout** — exact score (90'/extra time) | 6 |
| **Knockout** — picking who advances | 4 |
| **Knockout** — bonus if it went to penalties and you nailed the winner | +2 |
| **Extra** — champion | 10 |
| **Extra** — runner-up | 7 |
| **Extra** — top scorer | 8 |
| **Extra** — player of the tournament | 8 |

> Values are defined in [`src/lib/fixtures.ts`](src/lib/fixtures.ts) (`SCORING`) and the logic lives in [`src/lib/scoring.ts`](src/lib/scoring.ts).

---

## Structure

```
src/
  app/
    page.tsx            # Home / standings table
    jugar/              # Sign in and submit predictions
    resultados/         # Load real results and generate the bracket (open — no auth)
    como-funciona/      # Rules and scoring
  components/           # Forms and views (PredictionForm, Leaderboard, KnockoutPredict, ResultsEditor, ...)
  lib/
    fixtures.ts         # Groups, teams, schedule, and scoring constants
    scoring.ts          # Points calculation (groups, knockout, extras)
    bracket.ts          # Knockout bracket builder
    standings.ts        # Group standings table
    session.ts          # Player cookie
    actions.ts          # Server Actions (save predictions, results, etc.)
    db/                 # Drizzle schema and queries
```

## Getting started

Install dependencies and start the dev server:

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Locally you **don't need any configuration**: if no environment variables are set, it uses a SQLite file (`file:local.db`).
To create/update the tables:

```bash
npm run db:push      # apply the schema to the database
npm run db:studio    # visual database explorer (optional)
```

## Database (production · Turso)

In production the app uses [Turso](https://turso.tech) (libSQL). Set these variables (see [`.env.example`](.env.example)):

```bash
TURSO_DATABASE_URL=libsql://your-db.turso.io
TURSO_AUTH_TOKEN=eyJ...
```

Create the database with the Turso CLI, then run `npm run db:push` pointing at those credentials.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm run start` | Serve the build |
| `npm run lint` | ESLint |
| `npm run db:push` | Apply the schema to the database |
| `npm run db:generate` | Generate migrations from the schema |
| `npm run db:studio` | Drizzle Studio |

## Deploy

Designed for [Vercel](https://vercel.com/new). Connect the repo, add `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN`
as environment variables, and you're set.
