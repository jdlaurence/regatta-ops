# SRT backend (PocketBase)

One PocketBase binary, pinned to **v0.40.4**, with SRT's collections and API rules in
`pb_migrations/`, server logic in `pb_hooks/`, and the seed loader in `seed/`. Spec: PLAN.md §8.

## Commands (from the repo root)

| Command                           | What it does                                                                                                                 |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `pnpm pb:download`                | Fetch the pinned binary for this OS and architecture into `backend/bin/` (checksum verified; does nothing if already there). |
| `pnpm dev`                        | PocketBase on http://127.0.0.1:8090 next to Vite. `pnpm pb:serve` runs PocketBase alone.                                     |
| `pnpm pb:reset`                   | Wipe `backend/pb_data`, migrate, create the local superuser, seed. Stop `pnpm dev` first.                                    |
| `pnpm pb:seed`                    | Upsert the seed world (`@srt/seed`) into the running server, or into `pb_data` through a temporary server. Safe to repeat.   |
| `pnpm pb:migrate`                 | Apply pending migrations to `pb_data` (serve also applies them on start).                                                    |
| `pnpm pb:types`                   | Regenerate `apps/web/src/data/pb-types.ts` from the migrations (throwaway server). Commit the result.                        |
| `pnpm --filter @srt/backend test` | Rule and hook tests against real PocketBase instances (skipped with a message when the binary is missing).                   |

## Local accounts

- Dashboard: http://127.0.0.1:8090/_/ as superuser `admin@srt.local` / `srt-local-dev`
  (override with `SRT_PB_SUPERUSER_EMAIL` / `SRT_PB_SUPERUSER_PASSWORD`). Superuser writes skip
  the activity log.
- App sign-in: the seed's email and password accounts, printed by `pb:seed` and `pb:reset`
  (password `srt-local-dev`), for example `admin@srt.local`, `coach.boys@srt.local`,
  `viewer@srt.local`.

## Configuration

`pnpm pb:serve` and `pnpm dev` load `backend/.env` (git-ignored) if present:

```sh
SRT_ALLOWED_DOMAIN=example.org        # sign-in domain allowlist; comma-separate several; unset = any
SRT_GOOGLE_CLIENT_ID=...apps.googleusercontent.com
SRT_GOOGLE_CLIENT_SECRET=...
```

Google sign-in stays disabled until `SRT_GOOGLE_CLIENT_ID` is set; on start, `auth.pb.js`
writes the provider into the `users` collection. In the Google Cloud console, the authorized
redirect URI is `<app origin>/api/oauth2-redirect`. With `SRT_ALLOWED_DOMAIN` set, the seed's
`@srt.local` accounts can no longer sign in.

## Record shapes (what `PocketBaseStore` maps)

Field names are the snake_case forms of `packages/domain/src/types.ts`, except relations drop the
`Id` suffix (`eventId` → `event`, `oarSetId` → `oar_set`, `authorId` → `author`); `*By` relations
keep their name (`created_by`, `hot_seat_ack_by`, `loaded_by`). `targetId` and `refId` are text.

- **Instants** (`scheduled_at`, `published_at`, `packed_at`, `loaded_at`, `returned_at`,
  `seen_at`, `revoked_at`, and `created`/`updated`) are date fields. PocketBase returns
  `'2025-05-16 15:00:00.000Z'` (space, not `T`) and `''` when unset. It accepts ISO on write.
- **Days** (`start_date`, `end_date`, `day`, `birthdate`) are text constrained to `YYYY-MM-DD`,
  returned exactly as written; `''` when unset.
- **Empty values:** single relations and selects `''`; multi relations (`team_filter`) and
  multi selects (`compatible_classes`, `allowed_classes`) `[]`; json `null`; numbers `0`
  (PocketBase numbers are never null, so optional numbers such as `year`, `length_cm`,
  `lanes_override`, `max_boats`, `post_offset_pct` read 0 when unset); bools `false`.
- **Files:** `users.avatar`, `shells.photo` are file names; build URLs with `pb.files.getURL`.
- **Emails** of other users are hidden unless the viewer is that user or an admin.
- **Batch API** is enabled (up to 200 writes per transaction). Swapping two athletes between
  seats needs a clear first (unique `(entry, athlete)`), so send the three writes as one batch.
- **Stale writes:** add `expected_updated: <the updated value you loaded>` to an update of
  `events` or `load_placements` to get 409 instead of overwriting a newer change.

## Hooks

- `auth.pb.js`: domain allowlist on Google sign-in (before an account exists), on every sign-in,
  and on user create or email change; new users get role `coach`; only admins change roles;
  Google provider from the environment.
- `stamp.pb.js`: the server sets `created_by`, `updated_by`, `comments.author`, `presence.user`,
  `load_items.loaded_by` / `returned_by` from the signed-in user.
- `entries.pb.js`: `entries.boat_class` follows its event (on create, on move, and when the event's
  class is edited); moving an entry or changing its shell clears `hot_seat_ack_by` unless the
  same write sets it.
- `activity.pb.js` (+ `srt/activity.js`): an `activity_log` row after each create, update, or
  delete of entries, seats, events, availability, placements, load items, shells, and oar sets.
  `summary` is a sentence without the actor, e.g. `moved entry Boys V4+ to Event 21`,
  `set seat 3 of Boys V8 to Sam Lee`; several changes are joined with `; `. `diff` is
  `{ field: { from, to } }`.
- `concurrency.pb.js`: the `expected_updated` 409 above.
- `housekeeping.pb.js`: one `club_settings` record only; presence rows older than 2 minutes are
  pruned every minute.

## Migrations

One migration per change, never edited after merge. `pnpm pb:serve` keeps PocketBase's
automigrate on, so collection edits in the dashboard write new files into `pb_migrations/`;
review them, then run `pnpm pb:types` and commit both.
