# Regatta Ops

Regatta lineup planning and trailer loading for Sammamish Rowing Association coaches.

- **Lineups and schedule.** Every team builds its lineups for a regatta in one place. Regatta Ops
  crosses athletes off the roster as they're boated, checks that each boat and oar set fits
  the event, and finds equipment and athlete conflicts across teams (hot seats, double
  bookings, re-rigs). The club's whole day is one schedule, derived from every team's entries.
- **Equipment and trailer.** From the lineups Regatta Ops derives the load list, proposes where each
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
With the club's roster workbooks in `data/`, the junior teams are the real athletes (they stay
out of git); `REGATTA_OPS_SEED_INVENTED=1 pnpm demo` uses invented ones.

## Publish the demo on GitHub Pages

The demo builds as a static site: the app and the seed data run in each visitor's browser, behind
one shared password that unlocks the junior rosters (first names and short last names, encrypted
in the repository). Each visitor's changes stay in their own browser.

```sh
pnpm pages:seal      # rosters in data/ → data/reference/junior-rosters.sealed.json; asks for the password
pnpm pages:build     # the site in apps/web/dist/pages, for /regatta-ops/
pnpm pages:preview   # check it at http://localhost:4173/regatta-ops/
```

Commit the sealed file. Once, in the repository's Settings → Pages, set Source to "GitHub
Actions"; `.github/workflows/pages.yml` then deploys every push to `main` (or run it from the
Actions tab) to `https://<owner>.github.io/<repository>/`. To change the password, seal again and
commit.

## Run it locally with PocketBase

```sh
pnpm pb:download   # fetch the pinned PocketBase binary into backend/bin/ (once)
pnpm pb:reset      # create the database, migrate, and load the seed world (real junior
                   # rosters from data/ when present; see backend/README.md)
pnpm dev           # PocketBase on :8090 and the app on :5173
```

Sign in with `coach.boys@regatta-ops.local` (or `admin@`, `coach.girls@`, `coach.5am@`,
`coach.evening@`, `viewer@regatta-ops.local`); every seeded password is `regatta-ops-local-dev`.
The PocketBase dashboard is at http://127.0.0.1:8090/_/ with the same admin credentials. See
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
