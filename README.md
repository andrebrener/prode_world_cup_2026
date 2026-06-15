# World Cup 2026 Prediction Pool 🏆

A **prediction pool** for the 2026 World Cup (USA · Mexico · Canada, Jun 11 – Jul 19, 2026).
Each player predicts match results and earns points for what they get right.
Create as many pools as you want, invite your friends, and whoever finishes on top of each table wins.

Built with **Next.js 16** (App Router) + **React 19**, a **SQLite/Turso** database via **Drizzle ORM**,
and styled with **Tailwind CSS 4**. Installable as a **PWA**.

---

## How to play

1. **Enter your name.** A player is created and stored in a cookie (~4 months, covers the whole tournament). No passwords — your name is your identity (case-insensitive, must be unique).
2. **Create a pool or join one.** Create your own group (`/crear`, public or private) and share the **invite code** / link, paste a code someone gave you, or join a **public pool** from the home list.
3. **Predict.** The score of each of the 72 group-stage matches (48 teams · 12 groups), plus the **extras**: champion, runner-up, top scorer, and player of the tournament.
4. **Knockouts.** Once the knockout stage starts, the **bracket** is generated from the group standings and you predict each tie (score + who advances, penalties included).
5. **Watch the tables move.** As matches are played, the **official results** are loaded (`/resultados`) and every pool's **standings table** updates automatically.

> **One set of predictions, many pools.** Your predictions are **global to you** — you edit them once and they count in *every* pool you're in. A pool is just a leaderboard (plus, optionally, its own cards & streaks). Joining a second pool doesn't mean re-predicting.

> ⏰ **Deadline.** Predictions lock when the first match kicks off (Jun 11, 2026, 13:00 Mexico City time). After that they're frozen (a small name-based whitelist can still edit, for late joiners).

> ⚠️ **Partial admin auth.** Pool and card management lives at `/p/[slug]/admin` and is gated by the membership role (`owner` / `admin` / `player`) — only owners/admins get there. The results page (`/resultados`) and the bracket generator are still **open to anyone** with the link; add access control there before using this for a real pool.

## Pools

- **Public or private** — public pools show up on the home page for anyone to join; private ones are invite-only.
- **Invite code + slug** — every pool gets a short code (paste-to-join) and a shareable URL (`/p/[slug]`). A **Share** widget surfaces both inside the pool.
- **Pool switcher** in the nav to jump between your pools; the home page lists *your* pools and other public ones.
- **Normal or Fun mode** — picked at creation, fixed afterwards. Fun adds cards + streaks (see below).
- **Roles & admin** — each membership has a role (`owner` / `admin` / `player`); the creator is an `owner` and a pool can have several. Owners and admins get an **Administrar ⚙️** button on the pool page that opens `/p/[slug]/admin` — the deck editor, draw config, and member roles. Owners manage roles; results loading is still open (see the warning above).

## Profile & avatars

`/perfil` lets each player set their **name**, a **profile photo** (cropped & compressed client-side, stored as a data URL), and an **email** for the Fun-mode daily digest. Avatars show up across leaderboards, the nav, and pool cards.

## Standings, simulator & match panel

- **Leaderboard** rows are clickable — tap a player to open a drawer with *all* their predictions. In Fun pools it also shows the **pure total** (points without cards) next to the card-adjusted total.
- **Match-day panel** shows the day's fixtures with everyone's predictions side by side, plus a **🔮 simulator**: punch in hypothetical scores and watch the projected table shift before the games are played.
- **Bracket view** and **group standings** (the basis for the knockout draw) render automatically from the loaded results.

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

When creating a pool you can pick **Fun mode**: everything from a normal pool, plus cards and streaks. These are **scoped to that pool** — your predictions stay global, but the chaos only affects that table.

- **Daily card, forced play.** Every player draws one surprise card per day. Cards come in rarities (common / rare / legendary / curse), and the draw is **deterministic** per (pool, player, date) — no cron needed. The card **plays itself on draw**: there's no stash and no take-backs.
- **Card types.** Buffs (boost your own points), attacks (hit a rival), defenses (block or bounce back incoming attacks), social cards (no points — pure ego: nicknames, avatar swaps, pinned messages, all pool-scoped), and curses (just hit you).
- **Day-scoped, no standing cards.** Every effect resolves within its day — it covers that day's matches (the first one, a chosen one, or all of them). Defenses and buffs cover the whole day too; nothing persists across days waiting to trigger.
- **Fairness.** Effects resolve at pool-scoring time and never touch the underlying predictions. Unclaimed cards expire at midnight (America/Mexico_City).
- **Streaks.** Consecutive matches scoring >0 points pay milestone bonuses (3→+3, 5→+6, 8→+12, 12→+20). A 0-point match resets the streak (unless a protective card saves it).

### Data-driven cards: engine vs. deck 🎛️

The card system is split in two so the **same mechanics can be re-skinned per pool** — different names/emojis for the same effect (e.g. one group's inside jokes vs. another's):

- **The engine (code).** A closed set of reusable, parameterized **outcomes** — the *math* of a card — lives in [`src/lib/cards.ts`](src/lib/cards.ts): `multiply_match` (×2 / ×3 / ÷2 over the first match of the day, a chosen match, or the whole day), `flat_points`, `steal_day_points`, `var_bonus`, `zero_day`, `shield`, `upstream_forecast`, `social_overlay`, and more. Every card maps to one of these, so re-skinning a card **never** changes the scoring — the math always comes from here.
- **The deck (data, per pool).** Each Fun pool owns a **deck** (`card_defs` table): one row per card, with the editable bits — **name, emoji, description, rarity, enabled** — plus the `mechanic` it points at. A pool's deck is seeded from the **official deck** ([`DEFAULT_DECK`](src/lib/cardCatalog.ts), derived from `CARD_CATALOG`), and each pool renames, re-emojis, re-rarities, or disables its cards independently. Within a rarity every card has the same draw chance. The draw and the whole UI (feed, badges, emails) render each pool's own names/emojis.
- **Draw config, per pool.** `pool_fun_config` holds the odds: the **rarity weights** — common / rare / legendary / curse (default `50 / 26 / 9 / 15`). The draw is a single level by rarity (social/ego cards are just common cards — no separate "no-effect" tier).
- **Karma de tabla (optional).** A rubber-band toggle (off by default): when on, the daily draw's rarity weights are **biased by table position** — the leader gets more curse chance (and less legendary/common-rare), the last place the reverse, the middle unchanged (so a leader's curse odds jump from ~28% to ~44% with the default weights). It uses the position **at the start of the day** — a snapshot frozen on the pool's first claim that day (`pool_day_rank` table), order-independent and excluding the claimer's own card. Logic in [`karmaWeights`](src/lib/cards.ts).
- **Editing.** Owners/admins manage the deck and draw config from the pool's admin screen (`/p/[slug]/admin`), with cards grouped by rarity: rename / re-emoji / re-rarity / enable each card, add or remove cards (pick a mechanic), tune the per-rarity draw weights, and toggle Karma de tabla.
- Card catalog + outcome registry (data + helpers) in [`src/lib/cardCatalog.ts`](src/lib/cardCatalog.ts); sorteo + effects engine in [`src/lib/cards.ts`](src/lib/cards.ts), streaks in [`src/lib/streaks.ts`](src/lib/streaks.ts) (pure + unit-tested); per-pool deck/roles helpers in [`src/lib/db/decks.ts`](src/lib/db/decks.ts); resolution happens inside `getLeaderboard`. Design notes: [`docs/cartas-data-driven.md`](docs/cartas-data-driven.md).

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

## Progressive Web App

The app is installable to the home screen on mobile and desktop: web app manifest ([`src/app/manifest.ts`](src/app/manifest.ts)), maskable icons, Apple web-app meta, and a service worker registered client-side ([`src/components/ServiceWorkerRegister.tsx`](src/components/ServiceWorkerRegister.tsx), [`public/sw.js`](public/sw.js)).

### Push notifications

Once installed, players can opt in to **Web Push** notifications from `/perfil` (the 🔔 toggle, [`src/components/PushToggle.tsx`](src/components/PushToggle.tsx)). Subscriptions are stored per device in the `push_subscriptions` table; sending and dead-subscription pruning live in [`src/lib/push.ts`](src/lib/push.ts) (the service worker shows the notification and focuses/opens the app on tap).

Three triggers are wired up:

- **⚽ Results & points** — when official results are loaded/changed, each player gets their points for that match (only when the result actually changed; grouped by score).
- **🃏 Cards** — when a card is played on you (attack landed / shield blocked / mirror bounced), alongside the existing instant email.
- **📰 Daily digest** — the daily cron also pushes the morning summary to fun-pool members who enabled notifications.

> **iOS:** Web Push only works when the app is **added to the home screen** (iOS 16.4+) and opened from that icon — the toggle shows an install hint until then. Android/Chrome and desktop work whether installed or not.

Generate a VAPID key pair once with `npx web-push generate-vapid-keys` and set:

| Var | Purpose |
|---|---|
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Public key — also used by the client to subscribe |
| `VAPID_PRIVATE_KEY` | Private key — signs the push messages (keep secret) |
| `VAPID_SUBJECT` | Contact for push services, e.g. `mailto:prode@prodemundial2026.xyz` |

With no VAPID keys configured, push is a no-op (nothing breaks). The new table needs a migration: run `npm run db:push` (locally and against Turso for prod).

---

## Structure

```
src/
  app/
    page.tsx              # Home — your pools + create/join + public pools
    crear/                # Create a pool (name, public/private, mode)
    p/[slug]/             # A pool: standings table, bracket, match panel, fun zone
    p/[slug]/jugar/       # Submit predictions (global) + knockout picks
    perfil/               # Profile: name, avatar, email
    resultados/           # Load official results and generate the bracket (open — no auth)
    como-funciona/        # Rules and scoring
    manifest.ts           # PWA manifest
    api/cron/daily-fun-email/  # Daily digest endpoint (Vercel Cron)
  components/             # Forms and views (PredictionForm, Leaderboard, KnockoutPredict,
                          #   ResultsEditor, FunZone, MatchdayPanel, CreatePoolForm, ...)
  lib/
    fixtures.ts           # Groups, teams, schedule, deadline, and scoring constants
    scoring.ts            # Points calculation (groups, knockout, extras)
    bracket.ts            # Knockout bracket builder
    standings.ts          # Group standings table
    cards.ts / streaks.ts # Fun-mode engine: outcomes, sorteo, effects, streaks
    cardCatalog.ts        # Card catalog + outcome specs + official deck (data-only)
    funText.ts / funDigest.ts  # Feed/notification copy (generic per mechanic, re-skin-aware)
    session.ts            # Player cookie
    actions.ts            # Server Actions (pools, predictions, results, cards, ...)
    db/                   # Drizzle schema, queries, and per-pool deck/roles helpers (decks.ts)
  ...
drizzle/                  # Generated SQL migrations (drizzle-kit)
docs/                     # Design notes (cartas-data-driven.md)
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
| `npm run test` | Run unit tests (Vitest) |
| `npm run db:push` | Apply the schema to the database |
| `npm run db:generate` | Generate migrations from the schema |
| `npm run db:studio` | Drizzle Studio |

## Deploy

Designed for [Vercel](https://vercel.com/new). Connect the repo, add `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN`
as environment variables (plus the mail vars for the digest and the VAPID vars for push notifications, both above), and you're set.
