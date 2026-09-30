# SRT: Sammamish Regatta Tool

Regatta lineup planning and trailer loading for Sammamish Rowing Association coaches.

- **Lineups and schedule.** Every team builds its lineups for a regatta in one place. SRT
  crosses athletes off the roster as they're boated, checks that each boat and oar set fits
  the event, and finds equipment and athlete conflicts across teams (hot seats, double
  bookings, re-rigs). The club's whole day is one schedule, derived from every team's entries.
- **Equipment and trailer.** From the lineups SRT derives the load list, proposes where each
  shell goes on the trailer, lets a coach drag boats around, and explains its rules in plain
  sentences ("Prefer eights on levels 5 and 4").

The spec is [`PLAN.md`](PLAN.md). Conventions for contributors (people and agents) are in
[`CLAUDE.md`](CLAUDE.md).

## Try it without a backend

```sh
corepack enable pnpm   # pnpm 10, pinned in package.json
pnpm install
pnpm demo              # http://localhost:5173, seed data in the browser, nothing to install
```

Demo mode keeps its data in the browser's local storage. Sign in by picking one of the seeded
accounts. "Reset demo data" is in the user menu.

## Run it locally with PocketBase

```sh
pnpm pb:download   # fetch the pinned PocketBase binary into backend/bin/ (once)
pnpm pb:reset      # create the database, migrate, and load the seed world
pnpm dev           # PocketBase on :8090 and the app on :5173
```

Sign in with `coach.boys@srt.local` (or `admin@`, `coach.girls@`, `coach.5am@`,
`coach.evening@`, `viewer@srt.local`); every seeded password is `srt-local-dev`. The PocketBase
dashboard is at http://127.0.0.1:8090/_/ with the same admin credentials. See
[`backend/README.md`](backend/README.md) for Google sign-in and the domain allowlist.

## Repository

| Path              | What it is                                                                      |
| ----------------- | ------------------------------------------------------------------------------- |
| `apps/web`        | The React app (Vite, React Router, TanStack Query, Tailwind, dnd-kit)           |
| `packages/domain` | Pure TypeScript: types, schemas, conflict engine, trailer packer, parsers       |
| `packages/seed`   | Builds the development world from `data/reference` (invented athletes only)     |
| `backend`         | PocketBase migrations, hooks, seed loader, and rule tests                       |
| `data/reference`  | Sanitized extracts of the club's spreadsheets (fleet, oars, a schedule, layout) |

## Checks

```sh
pnpm test        # unit tests in every package (the backend suite needs pnpm pb:download)
pnpm typecheck
pnpm lint
pnpm test:e2e    # Playwright: the phase demos on demo mode
pnpm test:e2e:pb # Playwright: smoke suite on a temporary, seeded PocketBase (needs pb:download)
pnpm build       # the app into backend/pb_public/, served by PocketBase in production
```

The club's workbooks with athlete names stay out of git (see `.gitignore` and
`data/reference/README.md`); no real athlete name belongs anywhere in this repository.
