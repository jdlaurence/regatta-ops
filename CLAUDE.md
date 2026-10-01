# Regatta Ops

Regatta lineup planning and trailer loading for Sammamish Rowing Association coaches.
**`PLAN.md` is the spec and wins over code until amended**: amend it in the same change that
changes behavior, in the section the behavior belongs to (it carries no changelog). Read §1–§3
before any work, then the sections your change touches.

## Commands

```sh
pnpm install            # pnpm 10 via corepack (packageManager pins it)
pnpm dev                # PocketBase + Vite together (needs `pnpm pb:download` once)
pnpm demo               # the app on seed data in the browser, MemoryStore, no backend
pnpm test               # all unit tests (Vitest)
pnpm --filter @regatta-ops/domain test  # one package
pnpm test:e2e           # Playwright phase demos on demo mode (apps/web/e2e)
pnpm test:e2e:pb        # Playwright smoke suite on a real, seeded PocketBase (e2e/pb)
pnpm lint && pnpm typecheck
pnpm build              # web app into backend/pb_public/
pnpm pb:download | pb:migrate | pb:seed | pb:reset | pb:types
```

## Layout

```
apps/web/            React 19 + Vite SPA (router, features/, components/, data/)
packages/domain/     pure TS: types, schemas, boat classes, conflicts, trailer packer, parsers
packages/seed/       pure TS: builds the seed World from data/reference (used by pb:seed and demo)
backend/             PocketBase: pb_migrations/, pb_hooks/, seed/, scripts/download.sh
data/reference/      sanitized club data (fleet, oars, schedule, trailer layout)
```

## Contracts (read before coding)

- `packages/domain/src/types.ts`: every entity, camelCase. PocketBase fields are the snake_case
  forms. `CollectionMap` maps collection names to types; `World` is a whole dataset.
- `packages/domain/src/trailer/types.ts`: packer types and the `Rule` union (§9.3).
- `packages/domain/src/conflicts/types.ts`: `ConflictInput`, `Finding`, finding codes (§9.2).
- The race type is `RegattaEvent` (not `Event`, which collides with the DOM).
- Instants are ISO UTC strings; days are `YYYY-MM-DD` in the regatta timezone; convert with
  `zonedToInstant` / `instantToZoned` / `clockAt` from `time.ts`.
- PocketBase field names drop the `Id` suffix of relations (`eventId` → `event`); days are text;
  empty relations come back as `''`. `apps/web/src/data/pb-mapper.ts` + `schema.ts` own the
  mapping (one line per field); `backend/README.md` lists the record shapes.

## App building blocks (apps/web/src)

- Data: `useRegattaWorkingSet(id)` (everything a regatta page needs), `useFindings(id)` (the
  conflict engine on it), `useList` / `useRecord` / `useCreate` / `useUpdate` / `useDelete` /
  `useBatch` (optimistic), `useGuardedUpdate` (409 on stale event times and placements),
  `useCan(action)` (role + online), `useCurrentUser`. All exported from `@/data`.
- Shared UI: `BoatStrip`, chips (`TeamChip`, `ShellChip`, `OarChip`, `SideBadge`, `ClassBadge`),
  `ConflictBadge`, `ConflictsPanel`, `DayTimeline`, `Inspector` (portal into the right panel),
  `DataTable`, `CsvImport`, `CommentsThread`, `ActivityFeed`, `PublishStatus`,
  `ShareLinksDialog`, `components/trailer/*` (`TrailerEndView`, `RulesEditor`,
  `TrailerIsometric`), `components/ui/*` (button, dialog/sheet, combobox, select, tabs, menus).
- Quality helpers: `ScrollRegion` (a box that scrolls: focusable while it overflows),
  `BackLink`, the `touch-hit` utility (44 px hit area on touch without changing the look),
  `lib/motion.ts` (reduced motion for scripted motion). New pages go in `e2e/quality.ts`
  `PAGES`, which the axe, no-sideways-scroll, and touch-target specs walk.
- Edits to a final regatta go through `useConfirmFinalEdit` (features/regattas).
- Deep links: entries `/regattas/:id/lineups/:teamId?entry=<id>`, events
  `/regattas/:id/schedule?event=<id>`, fleet `/fleet/shells?shell=<id>`.
- Seed and PocketBase ids are 15 lowercase alphanumerics; `stableId(key)` makes them.

## Conventions (mandatory)

- TypeScript strict everywhere; no `any` without a comment saying why.
- `packages/domain` has no React, no PocketBase, no `Date.now()`, no `Math.random()`
  (ESLint enforces it). Functions take plain objects and return plain objects.
- Feature folders (`apps/web/src/features/<name>/`) own their components, hooks, and stores.
  Shared components go in `components/` only when two or more features use them.
- Data access: components never import the PocketBase SDK. All reads and writes go through the
  `DataStore` (`apps/web/src/data/store.ts`) via hooks in `apps/web/src/data/`.
- **Athlete names from the club's workbooks never enter the repository in plain text**: not in
  seed, tests, fixtures, screenshots, or docs. Seed athletes are invented. `pb:seed` and
  `pnpm demo` read the ignored roster workbooks at run time (`@regatta-ops/seed/local-rosters`), so
  the local database and the local demo show real juniors: never print or log the names, and run the
  demo with `REGATTA_OPS_SEED_INVENTED=1` for any screenshot or recording. The one exception is
  `data/reference/junior-rosters.sealed.json` from `pnpm pages:seal`: first names and short last
  names, encrypted with the published demo's password (PLAN.md §14). Equipment names are fine.
- UI words follow the glossary (§3) exactly. Sentence case. Buttons say what happens. No
  exclamation points, no apologies, no all-caps or eyebrow labels (§5.5).
- Styling: Tailwind utilities with the tokens in `apps/web/src/styles/tokens.css`. No inline hex
  colors, no component CSS files except print styles. Pills mean "boat" and nothing else.
- Accessibility is part of done: keyboard equivalents for drag and drop, visible focus, 4.5:1
  contrast in both themes, 44 px touch targets on phones, labels on boat strips (§5.6).
- Every list has a loading skeleton, an empty state that says what to do, and an error with retry.
- Dependencies: add one only when an existing one cannot do the job; say why in the commit.
- PocketBase migrations: one JS migration per change, never edited after merge; run
  `pnpm pb:types` and commit the regenerated `apps/web/src/data/pb-types.ts`.
- Comments say what the code does now and what is not obvious about it: no build history, no
  usage samples that repeat a call site, no restating the code below. Cite `PLAN.md` only where
  a section is the contract the code implements, such as the data model (§8), the domain logic
  (§9), and the reference dimensions (§16).
- Commits: Conventional Commits (`feat(lineups): drag athlete into seat`).

## Testing

- Domain: Vitest, 90% line coverage; every finding code and rule type has a test (§13).
- Web: Vitest + React Testing Library for components; Playwright for the phase demos (§12.1).
- Backend: rule tests against a local PocketBase started from `backend/bin/`.
- UI changes: check light and dark at 1280 px and 390 px.
