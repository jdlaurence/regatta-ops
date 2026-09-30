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

SRT_APP_URL=https://srt.example.org   # start of links in emails; default http://localhost:5173
SRT_SMTP_HOST=smtp.example.org        # set to send email (see "Email" below)
SRT_SMTP_PORT=587                     # default 587
SRT_SMTP_USERNAME=...
SRT_SMTP_PASSWORD=...
SRT_SMTP_TLS=false                    # true for implicit TLS (usually port 465); else STARTTLS
SRT_SMTP_AUTH_METHOD=PLAIN            # PLAIN (default) or LOGIN
SRT_SMTP_LOCAL_NAME=                  # EHLO name, only some relays need it
SRT_MAIL_FROM=srt@example.org         # sender address (default: the dashboard's)
SRT_MAIL_FROM_NAME=SRT                # sender name
SRT_DIGEST_HOUR=6                     # local hour (regatta time zone) of the daily digest
SRT_MAIL_CAPTURE=1                    # store every email in mail_outbox instead of sending it
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
- **Phase 3 fields:** `comments.mentions` (users mentioned in the body; server-set),
  `load_items.loaded_by_name` / `returned_by_name` (the name typed on a share link; `loaded_by`
  stays empty then), `activity_log.team` (the team whose data changed: entries, seats,
  availability, share links), `share_links.created_by`. Show "loaded by" as the `loaded_by`
  user's name, else `loaded_by_name`. Activity rows from a share link have an empty `actor` and
  a summary ending in `(via share link, Sam)`.
- **Server-only collections:** `notification_log` and `mail_outbox` have no API rules; only
  hooks and superusers use them.
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
- `share.pb.js` (+ `srt/share.js`): share-link tokens and revocation, and the public routes
  (below).
- `comments.pb.js` (+ `srt/mentions.js`): `comments.mentions` and mention emails (below).
- `notify.pb.js` (+ `srt/notify.js`): change emails and the daily digest (below).
- `mail.pb.js` (+ `srt/mail.js`): SMTP settings from the environment, and mail capture.

## Share links

Coaches and admins list, create, and revoke share links through the normal collection API;
viewers see none; only admins delete them.

- **Create:** `pb.collection('share_links').create({ regatta, team?, can_check_load })`. Leave
  `team` empty for the whole regatta. The server generates `token` (40 random letters and
  numerals) and sets `created_by`; anything the client sends for them is ignored. The page for
  parents is the app's own route with the token in it (for example `/share/<token>`).
- **Revoke:** `update(id, { revoked_at: <anything> })`. The server stamps its own time. A revoked
  link cannot be restored (400); create a new one. `token`, `regatta`, `team`, and `created_by`
  never change; `can_check_load` may.
- Creating, revoking, and changing a link are in the activity log (without the token).

Two public routes, no sign-in: the token is the credential. Unknown, malformed, and revoked
tokens get 404. Responses carry `Cache-Control: no-store`. Requests are limited per client IP
per minute (600 reads, 600 check-offs, 30 unknown tokens; 429 beyond). Behind a proxy, set the
trusted proxy header in the dashboard (Settings > Application) so the limit sees visitors' IPs.

**`GET /api/srt/share/{token}`** returns a projection built field by field. It never contains
emails, notes, availability, rosters, or live (unpublished) entries: lineups come only from each
team's `regatta_teams.published_snapshot`.

```jsonc
{
  "generatedAt": "2026-05-16T14:02:11.000Z",
  "clubName": "Sammamish Rowing Association",
  "link": { "scope": "team", "teamId": "<team id>", "canCheckLoad": false }, // scope "regatta": teamId null
  "regatta": { "id", "name", "venue", "city", "startDate": "2026-05-16", "endDate", "timezone", "format", "status" },
  "teams": [
    // team-scoped: that team only; regatta-wide: every participating team, by sort order
    {
      "id", "name", "shortName", "colorKey",
      "published": true, "publishedAt": "2026-05-10T18:00:00.000Z",  // false / null: never published
      "entries": [
        // PublishedEntry (packages/domain/src/types.ts), copied field by field; '' or null when unset
        { "entryId", "label", "boatClass", "status", "eventId", "eventName", "eventNumber", "day",
          "scheduledAt", "stage", "shellId", "shellName", "oarSetId", "oarSetName", "hotSeatPlan",
          "seats": [{ "seat": "1", "athleteId", "athleteName": "Rowan Test" }] }
      ]
    }
  ],
  "schedule": [
    // live events, by day, then time (unscheduled last), then sort order. A team-scoped link
    // leaves out logistics lines filtered to other teams. teamIds: logistics filter (empty = all).
    { "id", "kind": "race", "eventNumber": "14", "name", "boatClass": "4+", "category", "day",
      "scheduledAt": "2026-05-16T16:40:00.000Z", "stage": "final", "progressionGroup", "teamIds": [] }
  ],
  "loadItems": [
    // only when canCheckLoad; the key is absent otherwise. By kind, then label.
    { "id", "kind": "gear", "label": "Cox boxes", "quantity": 4, "container": "Boys trailer bed",
      "trailerName": "Boys trailer", "loaded": true, "loadedAt": "2026-05-15T20:00:00.000Z",
      "loadedBy": "Sam", "returned": false, "returnedAt": null, "returnedBy": null }
  ]
}
```

Entry times in `teams[].entries` are as published; `schedule` is live, so join on `eventId` for
the current time.

**`POST /api/srt/share/{token}/load-items/{id}`** with `{ "loaded"?: boolean, "returned"?:
boolean, "by"?: string }` (at least one of the two flags; body at most 4 KB; `by` trimmed to 60
characters) ticks or unticks an item and returns `{ "item": <load item as above> }`. Ticking an
item that is already ticked keeps the first time and name. 403 when the link cannot check off the
load list, 404 when the item is not on the link's regatta, 400 for a bad body. The activity log
gets `checked off Cox boxes as loaded (via share link, Sam)` with no actor, and realtime
subscribers see the update.

## Email

SRT sends three kinds of email, all plain text, one message per recipient. Links start with
`SRT_APP_URL`.

- **Mentions.** A comment's `@Name` (full name, any case), `@email-local-part`, or `@First` (when
  exactly one user has that first name) mentions a user; the match must end at a non-word
  character. On create, every mentioned user except the author gets "Cam Coach mentioned you on
  Boys V4+" with the comment quoted and a link (`/regattas/<id>/lineups/<team>?entry=<id>`,
  `/regattas/<id>/schedule?event=<id>`, or `/regattas/<id>/trailer/<trailer>`). Editing a comment
  emails only people mentioned for the first time.
- **Change emails.** When a signed-in user changes an entry or its seats and is not a coach of
  that team, the team's coaches get "Cy Coach changed Boys V4+ (Event 14)" with one line per
  change. A team's coaches are users with role coach or admin whose `default_team` is that team.
  Changes queue and go out from a job that runs every minute, so a batch lands in one email; after
  an email, the next one for the same entry waits 10 minutes and carries everything changed
  meanwhile. Opt out with `users.preferences.emailOnChange = false`.
- **Daily digest.** Hourly, for regattas that are not archived, have not ended, and start within
  7 days, at `SRT_DIGEST_HOUR`:00 (default 6) in the regatta's time zone, each coach whose team
  takes part gets the last 24 hours: schedule changes, their team's entry changes, and a count of
  other teams' entry changes. Conflicts are computed in the browser, so the digest links to the
  conflicts panel instead of listing them. Sent once per coach, regatta, and day; nothing is sent
  when nothing changed. Opt out with `users.preferences.emailDigest = false`.

**SMTP.** Either set `SRT_SMTP_HOST` (and friends, above) in `backend/.env`, which `mail.pb.js`
writes into PocketBase's settings on every start, or fill in Settings > Mail settings in the
dashboard (and leave `SRT_SMTP_HOST` unset). The sender is `SRT_MAIL_FROM` / `SRT_MAIL_FROM_NAME`
or the dashboard's. Without SMTP, SRT does not fall back to `sendmail`: each email is written to
the PocketBase log (dashboard > Logs, message "SRT: email not sent...") and skipped.

**Capture.** With `SRT_MAIL_CAPTURE=1`, every outgoing email (SRT's and PocketBase's own) is
stored in `mail_outbox` (`to` as an array of addresses, `subject`, `text`, `html`, `kind`:
`mention`, `entry_change`, `digest`, or '' for PocketBase's) and not sent. The backend tests use
this; it also works for local development (read it in the dashboard).

**Jobs on demand** (superuser only; tests use them):

- `POST /api/srt/jobs/notify` `{ now?: ISO }` sends change emails due at `now` → `{ sent }`.
- `POST /api/srt/jobs/digest` `{ now?: ISO, anyHour?: boolean }` runs the digest as of `now`.
  `anyHour` defaults to true here (every regatta in the window is due); the hourly job passes
  false. → `{ emails: [{ to, subject, regattas }] }`.

## Migrations

One migration per change, never edited after merge. `pnpm pb:serve` keeps PocketBase's
automigrate on, so collection edits in the dashboard write new files into `pb_migrations/`;
review them, then run `pnpm pb:types` and commit both.
