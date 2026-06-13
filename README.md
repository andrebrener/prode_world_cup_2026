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

## Fun mode 🃏✨

When creating a pool you can pick **Fun mode**: everything from a normal pool, plus cards and streaks (scoped to that pool — predictions stay global).

- **Daily card draw, forced play**: every player gets one surprise card per day (common 50% / rare 26% / legendary 9% / **curse 15%**, per-card weights tunable in the catalog). The card **plays itself on draw**: buffs activate instantly, attacks/socials immediately ask you to pick the victim (no stash, no take-backs), curses just hit you. Effects stack in play order (zeros always win). Unclaimed cards expire at midnight (America/Mexico_City). The draw is deterministic per (pool, player, date) — no cron needed.
- **Two effect windows**: surgical *next-match* cards (Doblete ×2, El Diego ×3, La Yapa, Mufa, VAR a favor) and *whole-day* cards (Cábala del Echugo ×2, Piedrambre, Filtro 5mm, Se me cayó el Fernet, Costillar 7 AM…). Day effects only cover matches that haven't kicked off yet — no retroactive plays.
- **Chaos**: Caldeador de las tinieblas replaces a rival's predictions for the day with seeded-random scores; Caparazón azul auto-targets the pool leader and drops them to last−1; Robo de identidad swaps total points (both snapshot at play time).
- **Duels**: Duelo de matambres — most day points doubles, loser zeroes (one duel per person per day).
- **Defenses**: Anulo mufa blocks the next attack; Espejito rebotín bounces it back to the attacker.
- **Social cards** (no points, pure ego): Los apodos del Droco (sticky nickname rendered as Name «Apodo»), Foto trucha (pool-scoped avatar swap), Micrófono abierto (pinned message) — all until the victim plays Borrón y cuenta nueva. Pool-scoped: real name/avatar untouched elsewhere.
- **Fairness**: max one active effect per player per match; effects resolve at pool-scoring time and never touch predictions.
- **Streaks**: consecutive matches scoring >0 points pay milestone bonuses (3→+3, 5→+6, 8→+12, 12→+20). A 0-point match resets (unless protected by Fernet de Fernemo / Costillar).
- Catalog (data-only, easy to tune) in [`src/lib/cardCatalog.ts`](src/lib/cardCatalog.ts); engine in [`src/lib/cards.ts`](src/lib/cards.ts) + [`src/lib/streaks.ts`](src/lib/streaks.ts) (pure + unit-tested); resolution happens inside `getLeaderboard`.

### Daily email digest (fun pools)

Fun-pool members who leave their email (banner in the pool, or `/perfil`) get a morning digest: reminder to claim today's card, standings (total + pure), yesterday's results and yesterday's plays. Powered by **Vercel Cron** (`vercel.json`, 13:00 UTC = 07:00 CDMX) hitting `/api/cron/daily-fun-email`.

Env vars:

| Var | Purpose |
|---|---|
| `CRON_SECRET` | Required in prod — Vercel sends it as `Authorization: Bearer …` |
| `RESEND_API_KEY` | Option A: send via Resend (needs the domain verified in Resend) |
| `GMAIL_USER` + `GMAIL_APP_PASSWORD` | Option B: send via Gmail SMTP ([app password](https://myaccount.google.com/apppasswords), not the real password) |
| `MAIL_FROM` | From address, e.g. `Prode Mundial <prode@prodemundial2026.xyz>` |
| `APP_BASE_URL` | Links in the email (default `https://prodemundial2026.xyz`) |

Besides the daily digest, victims get an **instant email** when a card is played on them (attack landed / shield blocked it / mirror bounced it back) — sent via `next/server` `after()` so plays are never delayed. With neither provider configured everything logs to console instead (dev). Local preview: `GET /api/cron/daily-fun-email?debug=1` returns the first rendered email as HTML (non-production only).

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
