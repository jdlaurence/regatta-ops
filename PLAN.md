# Regatta Ops

**Product spec.** Author: J.D. Laurence-Chasen with Claude.

This document is the spec for Regatta Ops: what the tool is for, who uses it, how it looks and feels, and how it is built. It describes the app as it stands. Questions still open for the owner are listed in §15.

---

## Table of contents

0. [How to use this document](#0-how-to-use-this-document)
1. [Vision and principles](#1-vision-and-principles)
2. [Users, roles, and permissions](#2-users-roles-and-permissions)
3. [Glossary](#3-glossary)
4. [Feature specification](#4-feature-specification)
5. [Design direction](#5-design-direction)
6. [Screen-by-screen spec](#6-screen-by-screen-spec)
7. [Architecture and stack](#7-architecture-and-stack)
8. [Data model](#8-data-model)
9. [Domain logic](#9-domain-logic)
10. [Realtime, concurrency, and offline](#10-realtime-concurrency-and-offline)
11. [Repository layout and conventions](#11-repository-layout-and-conventions)
12. [Phase demos](#12-phase-demos)
13. [Testing and quality](#13-testing-and-quality)
14. [Seed data](#14-seed-data)
15. [Open questions](#15-open-questions)
16. [Appendix A: Reference dimensions and trailer conventions](#16-appendix-a-reference-dimensions-and-trailer-conventions)
17. [Appendix B: Sample JSON](#17-appendix-b-sample-json)

---

## 0. How to use this document

- **Contributors, people and agents:** read §1 to §3 fully, then the sections your change touches. Conventions are in `CLAUDE.md`. §9 domain specs are contracts: the pure functions described there are what the UI consumes, and their test cases are acceptance criteria.
- **The owner:** §15 lists the questions that are still open.
- **Precedence:** if this document and the code disagree, this document wins until it is amended. Amend it in the same change that changes behavior, in the section the behavior belongs to. This document carries no changelog; git has the history.
- **Reference data:** `data/reference/` holds sanitized extracts of the club's spreadsheets (fleet, oar sets, a real three-day schedule, the trailer layout coaches drew). Use them for seed data and parser fixtures. The original workbooks with athlete names are git-ignored, and their names never enter the repository in plain text (`CLAUDE.md`).

---

## 1. Vision and principles

### 1.1 What Regatta Ops is

Regatta Ops replaces the per-team spreadsheets Sammamish Rowing Association (SRA) coaches use to plan regattas. It has two jobs:

1. **Regatta lineup and schedule planning.** Every team (junior boys, junior girls, 5am masters, evening masters, and so on) builds its lineups for a regatta in one place. The tool makes sure everyone who is coming gets boated, that the boat and oars picked for each entry are the right kind, and that no shell, oar set, or athlete is double-booked across teams. A central schedule shows the whole club's day.
2. **Equipment and trailer organizing.** From the lineups, the tool derives what has to go on the trailer, proposes where each shell goes on the racks, lets a coach adjust the layout by dragging boats around, and explains the rules it used in plain language so a non-technical coach can tweak them ("we can fit 3 fours in this rack").

### 1.2 Who it is for

Coaches. A diverse group: some run the boys' team with an elaborate spreadsheet, some run a masters squad with a text thread. Ages and comfort with software vary widely. Usage happens at a laptop the week before a regatta, and on a phone at the boathouse during trailer loading and at the regatta tent on race day, often with poor cell coverage. The club's data is small (about 120 shells, 40 oar sets, a few hundred athletes, a dozen regattas a year), so the backend stays deliberately small too.

### 1.3 Principles

1. **One source of truth.** The central schedule is not a separate thing anyone maintains. It is a view over every team's entries. Conflicts are computed, never bookkept by hand.
2. **Nothing falls through.** The tool's core promise is the crossed-off roster: if an available athlete is not in a boat, you see it. If a shell is in two places at once, you see it. If a shell in a lineup is not on the trailer, you see it.
3. **Explain, don't just decide.** The trailer auto-layout shows why each boat went where. Rules are readable sentences a coach can toggle or edit, not configuration.
4. **Fast for the expert, obvious for the newcomer.** Keyboard-first on desktop, big touch targets on mobile, no modal wizards for routine edits.
5. **Works at the trailer.** Read-only offline access to lineups, schedule, and the load plan is a requirement, not a nicety.
6. **Quiet design, one bold element per screen.** The lineup "boat strip" and the trailer diagram are the memorable visuals. Everything around them is calm.

### 1.4 Out of scope for v1

- Regatta entry submission to RegattaCentral or similar (import of published schedules is in scope).
- Practice lineups and daily attendance (the availability model is regatta-scoped).
- Results tracking, erg scores, seat racing.
- Billing, membership, or anything the club's registration system already does.
- Native mobile apps. The web app is installable as a PWA.

---

## 2. Users, roles, and permissions

Regatta Ops is a single-club tool. Every record belongs to SRA; there is no multi-tenant layer. (Adding one later means adding a `club` relation to each collection, which is a mechanical change.)

| Role | Who | Can do |
|---|---|---|
| **Admin** | Head coaches, boathouse manager, the owner | Everything. Manage users and roles, teams, fleet inventory, trailers, and default loading rules. Archive regattas. |
| **Coach** | Any coach | Create regattas. Create, edit, and delete entries for any team (confirmed by the owner; the club is small and cross-team borrowing is routine). Edit rosters and availability. Edit load plans and regatta-level rule overrides. Publish a team's lineups. Comment. |
| **Viewer** | Assistant coaches, board members, or athletes with an account | Read everything. Comment. No edits. |

Every edit is written to the activity log with the editor's name, so mistakes are visible and reversible.

**Sign-in.** Google sign-in through the club's Google Workspace domain (the owner confirmed every coach has one). Anyone who signs in with an account on that domain gets a Regatta Ops account automatically with the coach role; admins adjust roles in Settings. Accounts from any other domain are rejected. The domain is a configuration value (`REGATTA_OPS_ALLOWED_DOMAIN`, to be filled in; §15). Local development uses email and password accounts created by the seed, so no Google Cloud project is needed until deployment.

**Share links.** A regatta or a team's published lineups can be shared read-only via a tokenized link (no sign-in) so athletes and parents can see race times and boatings. Coaches and admins create, list, and revoke links; revoking is permanent. A link can also allow ticking the load list (§4.8).

---

## 3. Glossary

Rowing terms as used in this document and the UI. The UI uses these exact words.

| Term | Meaning |
|---|---|
| **Regatta** | A race day or multi-day event the club travels to. The parent entity for everything else in Regatta Ops. |
| **Team** | A squad with its own coaches and roster: Junior boys, Junior girls, 5am masters, Evening masters, and so on. |
| **Athlete** | A rower or coxswain on a team's roster. |
| **Availability** | Whether an athlete is coming to a given regatta. Default is available; coaches opt athletes out. |
| **Event** | A race on the regatta's published schedule, such as "Event 14, Men's Junior 4+, Heat 1, 9:40". Has a boat class and a scheduled time. |
| **Entry** | One crew a team is racing in an event: a boat class, a shell, an oar set, and athletes in seats. A team's lineups are its entries. |
| **Lineup** | The athletes-in-seats part of an entry. "Lineups" is the name of a team's page for a regatta. |
| **Seat** | Position in a boat. Seat 1 is bow; the highest-numbered seat is stroke. Coxswain is "cox". |
| **Boat class** | Hull type and rigging: 1x, 2x, 2-, 2+, 4x, 4x+, 4+, 4-, 8+. The `x` means sculling (two oars per rower), `+` means coxed, `-` means coxless sweep. |
| **Shell** | A physical boat in the club's fleet, such as "Monahan" (an 8+). |
| **Oar set** | A matched set of oars kept together: type (sweep or scull), count, and length. |
| **Rigging** | Sweep (one oar per rower, port or starboard) or scull (two oars per rower). Some shells are convertible. |
| **Port / starboard** | Sides of a sweep boat. Standard rig: stroke seat is port, alternating down to bow. |
| **Hot seat** | Two crews using the same shell back to back: crew one lands, crew two takes the boat straight out. Allowed, but tight. |
| **Fleet** | The club's equipment inventory: shells, oar sets, and gear. |
| **Trailer** | The club's boat trailer: a frame with uprights carrying horizontal racks at several heights. |
| **Rack / tier** | One horizontal level of the trailer, such as "top", "middle", "bottom". |
| **Shelf** | The app's term for one rack level on one side (or the full width, on goalpost-style trailers). A shelf has a width, a length, and holds boats in lanes. |
| **Lane** | A boat-width slot across a shelf. A shelf 240 cm wide fits three fours side by side, so it has three lanes for fours. |
| **Overhang** | How far a boat sticks out past the trailer frame at the front (over the tow vehicle) or the rear. |
| **Load plan** | The set of placements of shells on trailer shelves for a regatta, plus the checklist of oars and gear. |
| **Loading rule** | A constraint or preference the auto-layout follows, editable by coaches in plain language. |
| **Nickname** | The short name coaches actually use for a shell: "Peggy" for Peggy's Delight, "LLL" for Live.Laugh.Love. Shown everywhere the full name would not fit. |
| **Re-rig** | Converting a shell between sweep and sculling (or 4+ and 4-). Takes time and a rigger set, so it matters for turnaround. |
| **Publish** | Freezing a team's lineups for a regatta into the version athletes and parents see. Coaches keep editing the draft; the published copy changes only when they publish again. |
| **Logistics item** | A non-race line on the day's schedule: bus departure, coach meeting, lunch, awards. Printed in order with the races. |
| **Offset post** | SRA's trailer design: each rack level has a vertical post one third of the way across, so the narrow side holds one hull and the wide side holds two side by side, loaded from the outside in. |

---

## 4. Feature specification

### 4.1 Regattas

- Any coach or admin creates a regatta: name, venue, city, start date, end date (multi-day allowed), timezone (default America/Los_Angeles), notes.
- Regatta settings, with club-wide defaults editable by admins and per-regatta overrides:
  - `launchLeadMin` (default 40): minutes before race time a crew needs its shell.
  - `raceDurationMin` (default 10 for sprints, 20 for head races; the regatta picks a format).
  - `returnMin` (default 15): minutes from finish until the shell is back on the dock or in slings.
  - `hotSeatMinGapMin` (default 15): the smallest dock-to-race-start gap that a hot seat can survive.
  - `athleteMinGapMin` (default 30): the smallest gap between an athlete's races before a warning.
  - `rerigMin` (default 30): extra minutes a convertible shell needs when its rigging changes between two entries.
  Every timing value is editable per regatta because courses differ (confirmed by the owner); club defaults are only starting values, and the regatta settings dialog shows both.
- A regatta spans at most 14 days. Changing its timezone keeps the clock times of its events.
- Status: `planning`, `final`, `archived`. `final` shows a banner and asks before the first change to lineups or trailer load plans in a visit ("Don't ask again" lasts until reload); it does not lock. Load list ticks and share-link check-offs never ask, since they record what happened at the trailer, not a change of plan. Archived regattas are hidden from the default list.
- **Publishing.** The boys' team keeps a draft sheet and a published sheet per regatta. Regatta Ops keeps the same distinction per team: entries are always live for coaches, and **Publish lineups** on a team's page stores a snapshot (entries, seats, shells, oars, times) with a timestamp. The lineup page shows "Published 2 h ago · 3 changes since" (the changes listed as sentences; a seat swap counts as one) and the print and share views default to the published snapshot with a toggle to the live draft. The snapshot holds the team's non-scratched entries in schedule order and every seat of each boat class (an empty seat is null), with event, shell, oar set, and athlete names baked in so it reads the same after renames; a hot-seat pair's plans are joined (`buildPublishedSnapshot` and `snapshotChanges` in `packages/domain`).
- Regatta overview page: participating teams and their entry counts, conflict counts by severity, load plan status per team (the team's shells placed on any of the regatta's load plans; "Nothing loaded yet" before that), the day's timeline in miniature, recent activity, and the share links dialog.
- Duplicating a regatta copies settings, events, and the participating teams, not entries. The copy defaults to 364 days later, with the year in its name swapped.

### 4.2 Teams, rosters, and availability

- Admins manage teams: name, short name (used in chips), program (Juniors, Masters, Other), color from the team palette (§5), archived flag.
- Athletes belong to one home team. Fields: first name, last name, preferred name, side (port, starboard, both, none), can scull, can cox, birth year (the club's roster tracks birth year; a full birthdate is optional), gender (optional), graduation year (juniors), level (novice or experienced; the boys' sheet groups its roster this way and the lineup roster panel groups the same way), status (active, inactive), notes. From birth year Regatta Ops derives the junior age group (U15, U16, U17, U19) and the masters category letter (§9.1) and shows them as badges. Age badges use the current year in the club's timezone as the season year; juniors past U19 show "Open"; masters letters start at 21; on "other" teams the badge follows age. Athletes carry no weight.
- Roster import from CSV (paste or upload) with a column-mapping step; it skips duplicates by first and last name. Export to CSV. Athlete and team edits are in the activity log.
- **Availability** is per regatta and per athlete. Default is available. A coach toggles athletes to unavailable, with an optional reason. For multi-day regattas, availability can be set per day. Coaches enter it (confirmed by the owner).
- Availability lives on each team's page (§6.5): a season sheet with one row per active athlete and one column per regatta the team is entered in, a checkbox per cell, and a count "24 of 27 available". A name opens the athlete's season for per-day toggles, maybes, and reasons. On the lineups page, the roster panel marks an athlete unavailable or available for that regatta.
- **Absence form import.** The boys' team collects absences with a Google Form whose responses have one column per regatta. "Import from absence form" reads that CSV: the name and regatta columns are guessed (by name, initials like "HOTL", or a grid question's `[…]`), each distinct answer maps to available, unavailable, or maybe, the latest response per athlete wins, a blank answer leaves the athlete as is, and "available" deletes the record. The coach can uncheck any change in the preview. Checkbox-list questions are not supported (§15).

### 4.3 Events and schedule

- An event is one race on the regatta schedule: event number (text, since regattas use "14A"), name, boat class, category (free text like "Men's Junior Varsity", "Mixed Masters C"), day, scheduled time, stage (heat, semi, final, time trial, or single race), progression group (optional text that ties "Event 14 Heat 1" to "Event 14 Final"), notes.
- Events can be added one at a time or by **paste import**: the coach pastes rows copied from a regatta's published schedule (RegattaCentral, a PDF, a spreadsheet); the tool parses tab- or comma-separated lines, guesses columns, and shows a mapping step to confirm. Boat class is parsed from common patterns (`4+`, `4x+`, `Coxed Four`, `V8`, `JV4+`, `1x`). The import drops punctuation-only lines and puts rows dated outside the regatta on the chosen day.
- **Logistics items** live on the same schedule: "Bus departs hotel 6:15", "Coach and coxswain meeting", "Lunch", "Awards". They have a time (or none), a text, and an optional team filter, and they print in order with the races, matching the club's published day schedule.
- Times can be blank ("TBD"). Events with blank times sort to the end of the day and are excluded from time-based conflict checks, with a visible "unscheduled" tag.
- Schedule changes are common on race day. Editing an event time re-runs conflict detection immediately across all teams. Editing a race's boat class updates its entries in the same batch.

### 4.4 Lineup builder

The team's page for a regatta. This is where a coach spends most of their time.

- **Roster panel** (left): every athlete on the team who is available for this regatta, plus a collapsed "Unavailable" group and a "Borrowed" group for athletes from other teams added to this team's entries. Each athlete row shows name, side badge, and how many entries they are in. Athletes in at least one entry are **crossed off**: strikethrough in the team color, text in the secondary ink. The panel header shows "18 of 24 boated". Filters: side, scullers, coxswains, unboated only. Search.
- **Entries** (center): grouped by event in schedule order, with unscheduled entries at the end. Each entry is a card in a grid of equal columns (at least 224 px; three across at 1280 px): label and menu, status and badges, shell, oars, then the boat as a vertical **boat strip** (§5.4). Rows above the boat have fixed heights so seats line up across cards. The roster sits beside the entries when the builder has 728 px.
- **Creating an entry:** click "Add entry" on an event, or "Add entry" at the top and pick an event (or leave it unscheduled). The boat class comes from the event; for an unscheduled entry the coach picks the class. The seat template renders immediately. Crew letters fill from A.
- **Filling seats:** drag an athlete from the roster panel onto a seat, or click a seat to open a combobox filtered to sensible candidates (side match first, then everyone). Swapping two athletes: drag one onto the other's seat. Removing: click the seat's clear button or press Delete on a focused seat. Keyboard: focus a seat and type to search, Enter opens the picker, Space picks an athlete up and puts them down (a swap), Delete clears; Up and Down move within a boat, Home and End to its top and bottom, Left and Right to the same row of the neighboring card; filling a seat moves focus down. A cleared seat keeps its record with a null athlete; seats that don't exist in a new class are deleted when an entry moves.
- **Shell picker:** a combobox listing shells whose class is compatible with the event's class, grouped by home team (this team, then club boats, then other teams) and sorted by nickname, showing nickname, full name, weight class ("165-200 lb"), and stroke side. Each option shows status (in service, limited, out of service), and a live conflict hint: "Also used by Girls V4 at 10:20 (hot seat)" or "Busy: Boys 2V at 10:05". Incompatible shells are hidden by default with a "show all" toggle.
- **Oar picker:** same, filtered to the shell's rigging type and a count that covers the crew, with a hint when two crews split one set.
- **Entry details:** label (auto "V8", "2V4+", editable), status (draft, planned, confirmed, scratched), coach responsible (optional, the current sheet tracks this), notes, a re-rig flag when the shell's native class differs from the entry's class ("Lundberg rigged as 4x+"), and computed facts: average age with masters category, junior age-group eligibility, side balance. Publish status sits in the page header; an entry's comments sit in its details.
- **Seat order on screen and paper:** every boat reads cox first, then stroke down to bow, as coaches write lineups: the builder's boats stand on end (cox on top), horizontal strips read left to right from the cox, and the printed sheet and grid list the same order. The cox is always drawn first, including in bow-loaded fours (nothing yet marks a bow-loaded shell; §15).
- **Conflicts** appear inline as badges on the strip and in the right-hand conflicts panel for the whole regatta, filterable to "this team". Clicking a conflict jumps to both entries involved.
- **Hot seat acknowledgment:** a hot seat warning can be acknowledged with a short plan ("Girls cox meets Boys 2V at dock B"); the plan is required. Acknowledged hot seats show as a calm blue badge instead of an amber one, and the plan text prints on both teams' lineup sheets.
- **Views:** by event (default), by athlete (a matrix: athletes as rows, events as columns, seats as cells, useful for spotting who is racing three times), and a print view.
- **Copy and move:** duplicate an entry into another event (for heats and finals), move an entry to a different event, and "copy lineups from" a previous regatta for the same team.

### 4.5 Conflict engine and central schedule

- The conflict engine (§9.2) is a pure function run in the browser whenever entries, events, availability, or settings change. It produces a list of findings with severity `error`, `warning`, or `info`.
- **Schedule page** for the regatta: the whole club's day.
  - **List view:** every entry from every team in time order, with team chip, event, shell, oars, and conflict badges. Filter by team, boat class, shell, or day. A "Show entries" switch (on by default, remembered on the device) hides the entries, leaving races and logistics lines only.
  - **Timeline view:** a horizontal time axis per day. Rows can be grouped by **shell** (the default, because equipment conflicts are what this page exists to show), by team, or by oar set. Each entry is a bar spanning its busy window (launch lead to return), with the race itself drawn as a darker segment. Bars that overlap in time take separate lanes within a row. Conflicts render as a red hatched intersection and hot seats as an amber link between bars; both come from the engine's findings, not from bars overlapping, since every hot seat overlaps in its busy window. An acknowledged hot seat is drawn dashed as well as blue, so it doesn't rely on color. Clicking a bar opens the entry.
  - **Conflicts panel:** all findings for the regatta, grouped by severity, with one-click navigation and acknowledgment for hot seats.
- A shell's drawer in the fleet shows its usage across upcoming regattas; scratched entries don't count.

### 4.6 Communication

- **Activity log:** every create, update, and delete on regatta data, teams, athletes, and the fleet is recorded with who, when, and a compact diff. The regatta overview and the inspector share one activity feed, with links to what changed; entries show their last editor. Writes by the superuser (the seed, the dashboard) are not logged.
- **Comments:** on an entry, an event, and the load plan. Plain text with @-mentions of users, who get an email. Viewers can comment. Race rows on the schedule show their comment count and open the thread.
- **Presence:** avatars of who is currently viewing the same regatta, with "editing Girls lineups" hints, via a heartbeat record per browser tab (§8.1).
- **Notifications:** a daily digest email during regatta week listing schedule changes and changes to your team's entries, with a link to the conflicts panel (conflicts are computed in the browser, so the email cannot list them), and an email when someone outside your team changes one of its entries. Each user can turn either off. `backend/README.md` has the timing and the mail setup.

### 4.7 Fleet: equipment inventory

Three tabs: Shells, Oars, Gear.

- **Shells** (fields follow the club's equipment master list): name, nickname, boat class, compatible classes (the club's 4x/4- hulls and one 4+ used as a 4x+ show why this matters), rigging (sweep, scull, convertible), manufacturer, model ("Hudson S8.32"), serial number, year, weight class as the club writes it ("165-200", "LWT", "<240") parsed into a crew weight range, stroke side (port rig or starboard rig; drives seat sides), cox position (stern, bow), shoes, spread and span (cm, informational), level (beginner, intermediate, racer), gender affinity (women's, men's, any; the list is grouped this way), home team, boathouse location (`C5`, `Meadow`, `Berm`, `Rolling Rack`), status (in service, limited, out of service, retired; the sheet's "Unavailable?" and "do not row" notes map here), rigger type and count, length, beam, weight, private owner flag, notes, photo. Dimensions default from the boat class (§16) and can be overridden. Hull weight stays in kg; the crew weight range follows the viewer's unit. Photos are downscaled to 1600 px on the long edge in the browser before upload, and files the browser cannot decode (HEIC in Chrome) are refused.
- **Oar sets** (fields follow the master list): name ("24-C", "Blue"), type (sweep, scull), color code ("yellow-red"; how people find them at the trailer), count (oars; scull sets note "only 3 pairs"), blade and shaft ("S2V Skinny", "Fat2"), length (cm), inboard (cm), grip (mm), gender affinity, home team, status, notes. The color code is shown on every oar chip.
- **Gear:** category (cox box, slings, rigger set, tool kit, tent, launch, straps, spare parts, other), name, quantity, default-load flag (goes on every trailer by default), notes.
- Bulk CSV import and export for all three. Export uses the §8.1 snake_case column names; import creates records and skips names already in the fleet, never updating. Inline editing in tables. Status changes are logged. The class filter also matches compatible classes (filtering 4x+ finds Lundberg).

### 4.8 Load list and checklist

- Derived for a regatta from its entries: every shell used by a non-scratched entry, every oar set used, riggers for each shell (auto-generated from the shell's rigger count and type), and every gear item flagged default-load. Coaches add extras: a spare single, an extra oar set, a specific tool.
- Presented as a checklist grouped by kind. Each line has two checkboxes: **Loaded** (at the boathouse) and **Returned** (unloaded back at the boathouse after the regatta), each recording who and when. Athletes at the loading party can tick items on a phone using a share link with check permission, typing their name; ticks made with no signal wait on the phone and sync later (§10.4).
- Items on the load list without a placement on the trailer are flagged. Shells on the trailer that no entry uses are flagged as "spare" (allowed, but visible). The flags (not on a trailer, spare, no longer needed) are computed, not stored.
- Each line says where it rides: a trailer's bed zone (§4.9) or free text such as "Truck 1 bed". Riggers, oars, and slings default to their zone on the right trailer.
- A row is stored on its first tick or container change. "Save list" stores every line, so share links, which read stored rows, see the whole list.

### 4.9 Trailer model and load plan

**Trailer model.** A trailer is a frame of a given length with racks at several heights. Regatta Ops models it as a set of **shelves**. Each shelf is one rack level on one side (center-post trailers, where arms extend left and right from a spine) or one full-width rack level (goalpost trailers, where crossbars span between two uprights). Each shelf has:

- a label (for example "Top, driver side"), a tier index (1 = bottom) and a column key (`left`, `right`, or `full`),
- width (cm) and length (cm; usually the frame length),
- maximum front and rear overhang (cm), which can be larger on upper tiers because they clear the tow vehicle,
- allowed boat classes (optional; blank means any),
- a lane override (optional; otherwise lanes are computed from width and the boats' beams),
- a maximum boat count and maximum weight (optional),
- an access rank (1 = easiest to load and unload; used by the unload-order rule),
- an `active` flag (the removable top rack is sometimes left off).

Plus **compartments**: zones of the bed along the trailer's length, each from and to a distance from the front of the frame (cm; blank = front or back, both blank = the whole length), across the full width, with a kind, a capacity (number of oars, number of riggers), and a label; oar boxes and tubes, rigger racks, and storage boxes are compartments too.

**SRA's trailers.** The club has two: the boys' trailer and the smaller girls' trailer. Both have five rack levels. Each level is an **offset T**: a vertical post one third of the way across, so the narrow (left) side holds one hull and the wide (right) side holds two hulls side by side, slid in from the outside (there is no threading past the post). In Regatta Ops terms each level is two shelves: `left` with one lane and `right` with two lanes whose access is outer-first (the inner lane must be loaded before the outer and unloaded after). Riggers always come off and ride in the bottom of the trailer with oars and slings, so the bed is modeled as compartments along its length, not a rack: oars (long) take roughly the front half, slings a small section in the middle, and riggers the rest of the back, across the full width. The bed is a box about 2 ft deep; the first rack sits about 4 in above its walls. The convention is eights on the top two levels, fours below, small boats wherever they fit. Frame lengths and shelf widths are still to be measured (§15); the seed uses plausible values that make the 2026 Regionals layout in `data/reference/trailer-layout-2026-regionals.md` reproducible.

Admins define trailers in the Trailers admin page with a live diagram that updates as they type (§6.9). Deleting a trailer deletes its load plans. The model also covers center-post trailers (arms both sides of a spine) and goalpost trailers (crossbars between two uprights, three wide), so a borrowed or future trailer fits.

**Load plan.** One per regatta per trailer (multi-trailer regattas are supported). Coaches never create one: the trailer page *is* the load plan, and the record appears with the first change to that trailer at that regatta (a pack, a boat placed, a rule changed, the status set). A load plan is a list of placements: shell, shelf, lane index, position along the shelf (offset from the front, cm; negative means front overhang), bow orientation, and a `locked` flag for placements a coach set by hand. The plan also holds its regatta rule overrides; its effective rules are the trailer's current defaults with those overrides merged in, so later changes to a trailer's defaults still apply.

### 4.10 Auto-layout and the rules editor

- **Auto pack trailer** runs the packer (§9.3) over the load list and the effective rules. Locked placements are kept. The result replaces unlocked placements. Boats animate from old to new positions (the one orchestrated motion in the app). With nothing to pack, it says so in a dialog instead: no entry has a shell yet (with a link to the lineups), or every boat is on or headed for the other trailer. Packing a final plan asks first.
- **Auto pack both trailers** sends a team's boats to the trailer that shares a word with the team's name (Junior boys to the Boys trailer), other teams whole to the trailer with the most room, and overflow into free space on the other; boats already placed stay.
- **Interactive layout:** the primary view is the **end view**, a cross-section grid of tiers by lanes, exactly how people talk about the trailer at the boathouse ("top rack, driver side, outside"). Each cell shows the boat chips in it. Dragging a chip to another cell moves it and locks it ("Locked by Sam W."); if the move breaks a hard rule, the cell shows why and the drop is refused (or, with Alt or Option held, accepted, locked, and flagged). Hovering a boat over the other trailer's tab switches to it, and dropping on a tab places the boat in that trailer's best free spot; each tab shows its boat count. A secondary **plan view** (top-down, one tier at a time) shows length, end-to-end pairing of small boats, and overhang at each end with the legal flag threshold drawn as a dashed line, and a "Bed" level with the zones along the length. A read-only **isometric view** shows the whole trailer at once; its lengths are to scale and its heights are not.
- **Why here?** Clicking a placed boat shows the reasons: "Long boats go on the top rack (must)", "Heavier boats low (+12)", "Balances driver side (+6)", "Locked by Sarah". Unplaced boats show the rule that rejected every candidate: "No active shelf accepts an 8+ with 19.9 m free".
- **Rules editor:** a panel listing loading rules as sentences with a toggle and an edit control. Each rule is marked **Must** (hard) or **Prefer** (soft, with a weight slider shown as Low, Medium, High). Rules come from the trailer's defaults; a coach can change a rule for this regatta only (badge: "This regatta"), add a rule from a gallery, or reset to defaults. Rules can be edited before anything is loaded. After an edit the page says "Rules changed · Auto pack to apply" for the rest of the browser session. The gallery (catalog in §9.3.3):
  - Only certain boat classes on a shelf
  - A shelf fits N boats side by side (the "we can fit 3 fours here" override)
  - Don't use a shelf
  - Overhang limits for a tier
  - Prefer certain classes on a tier
  - Keep heavier boats low
  - Put weight forward, not behind
  - Balance the two sides
  - Boats racing first are easiest to reach
  - Keep a team's boats together
  - Pin a shell to a spot
- Rules are stored as JSON; the sentence is generated from the rule type and parameters so the same rule always reads the same way.

### 4.11 Print, share, and export

- Prints default to the published snapshot and say which version and when; the schedule's published or live choice is per team. Oar color codes come from the live oar set.
- **Lineup sheet** per team per day: printable, one page per team, entries in time order, the boat strip drawn compactly, hot seat plans, and a roster footer showing who is unboated. Print CSS, no PDF library needed; "Save as PDF" from the browser.
- **Lineup grid**, the layout the club publishes today: events as columns with their time trial and final times in the header rows, seats as rows (cox, then stroke down to bow), names in cells. One grid for eights, one for fours and smaller.
- **Day schedule**, also as published today: per day, one row per race with time, stage, cox, shell, oars, and the lineup as a name list, with logistics items (bus departures, lunch, awards) in order between them.
- **Master schedule** for the regatta: all teams, time order, with shells and oars. Coaches tape this to the trailer.
- **Schedule list**: the schedule page's list as it stands (its day, filters, and "Show entries" switch), with live lineups. The schedule's "Print" button opens it, for everyone; scratched crews are marked, and conflict badges and entries without an event stay off paper.
- **Load sheet** per trailer: shelf-by-shelf list with the end-view diagram, the bed zones and what rides in each, and the checklist: rows assigned to that trailer, shells placed on it, and spares on it, with rows that have no container flagged.
- **Share links:** a public page (`/share/:token`) for athletes and parents showing races with a published crew plus logistics lines; it refreshes every minute and keeps a copy on the device for offline reloads. Links with check permission add the phone checklist (`/share/:token/load`).
- **CSV export** of entries, roster, fleet.

### 4.12 Admin and settings

Users and roles, teams, fleet, trailers, club defaults (regatta timing settings, weight unit, first day of week), and the activity log with search. Users and roles keep at least one admin, and demoting yourself asks first. The weight unit only sets how the fleet shows a shell's crew weight range.

---

## 5. Design direction

### 5.1 Concept: the boathouse whiteboard, cleaned up

Every rowing club has a whiteboard by the bay doors with lineups written in marker: a boat name, then eight names down the side, then the cox. Coaches read it in five seconds from ten feet away. The app's visual language starts there: dense, legible, high contrast, names as the primary content, and boats drawn as boats.

Two elements carry the personality and get all the visual investment:

1. **The boat strip.** An entry is a long lozenge (a hull seen from above) with seats as segments, read the way coaches write lineups: the cox first, then stroke down to bow. Names sit inside seats. Horizontal, the rounded stern and the cox are on the left and the pointed bow on the right; vertical, the hull stands on end with the cox on top. It is the same shape on the lineup page, the schedule, the print sheet, and at 24 px tall in a table cell.
2. **The trailer diagram.** The end view of the trailer is a real cross-section: uprights, rack arms, and boat chips sitting on the arms, drawn to proportion. It should look like the thing in the parking lot.

Everything else is quiet: neutral surfaces, one accent, tables and forms that get out of the way.

### 5.2 Tokens

Colors are defined once as CSS custom properties on `:root`, redefined for dark mode under `@media (prefers-color-scheme: dark)` guarded by `:root:not([data-theme="light"])` and again under `:root[data-theme="dark"]`. Tailwind reads them through `@theme`.

**Base palette (light)**

| Token | Value | Use |
|---|---|---|
| `--bg` | `#F3F5F7` | Page background: cool hull white, not cream. |
| `--surface` | `#FFFFFF` | Cards, panels, table rows. |
| `--surface-2` | `#E8ECF0` | Hovered rows, empty seats, trailer arms. |
| `--line` | `#D3DAE2` | Borders and dividers. |
| `--line-strong` | `#7D8997` | Control boundaries that need 3:1 contrast: inputs, empty seats. |
| `--ink` | `#16213A` | Primary text: deep lake navy. |
| `--ink-2` | `#5A6675` | Secondary text. |
| `--accent` | `#0E6F76` | Interactive: buttons, links, focus, selected. Lake teal. |
| `--accent-ink` | `#FFFFFF` | Text on accent. |

**Semantic**

| Token | Value | Use |
|---|---|---|
| `--danger` | `#B42318` | Errors, hard conflicts. |
| `--warn` | `#B54708` | Warnings, unacknowledged hot seats. |
| `--ok` | `#1E7A46` | Confirmed, loaded, no issues. Used sparingly; absence of a badge is the normal "ok". |
| `--info` | `#1D5BBF` | Acknowledged hot seats, informational findings. |

The accent and each semantic color have a tint for backgrounds (`--accent-tint`, `--danger-tint`, and so on). `--scrim` dims the page behind dialogs and sheets.

**Team palette.** Eight hues, assigned to teams by admins. Used for team chips, roster cross-off strikes, timeline bars, and trailer boat chips. Each has a light tint (12% on white) for backgrounds.

`#2F5DA8` navy, `#B23A6E` raspberry, `#C9791C` ochre, `#3C8D5B` green, `#7A4FB5` violet, `#1F8A9E` cyan, `#8C6A2E` bronze, `#5B6B7C` slate.

**Dark mode** is required (5 a.m. masters). Background `#0F141B`, surface `#161C25`, surface-2 `#1F2731`, line `#2B3542`, ink `#E6EBF1`, ink-2 `#9AA6B4`, accent `#3FB4BB`. Team hues shift one step lighter. Semantic colors get lighter variants with the same hue.

**Type**

- Display: **Bricolage Grotesque** (Google Fonts). Page titles, regatta names, seat numbers, big counts like "18 of 24". Weight 600, tight tracking at large sizes.
- UI and body: **Instrument Sans** (Google Fonts). Everything else. Weights 400 and 500 only.
- Fallbacks: `ui-sans-serif, system-ui, sans-serif`.
- Scale (px): 12, 13, 14 (body), 16, 20, 24, 32, 40. Line heights 1.3 for UI, 1.5 for prose. `font-variant-numeric: tabular-nums` on times, seat numbers, and counts.
- No all-caps labels. No eyebrow labels. Section headings are just headings.

**Shape and space**

- 4 px base grid. Controls 36 px tall on desktop, 44 px on touch.
- Radius: 6 px on controls, 10 px on cards and panels, and full pill radius only on boat chips and boat strips. The pill shape means "boat" everywhere in the app; nothing else is a pill.
- Shadows: none on cards. Elevation is expressed by borders and background steps. Popovers and drawers get one shadow: `0 8px 24px rgba(22,33,58,0.12)`.

**Motion**

- Only in response to an action. Cross-off draws its strike left to right in 180 ms. Dropping an athlete into a seat settles in 120 ms. Re-packing the trailer animates chips to new cells over 400 ms with FLIP; this is the app's one orchestrated moment.
- `prefers-reduced-motion` disables all of it.

### 5.3 Layout

Desktop (≥ 1024 px): a 232 px left navigation, a content column, and an optional 336 px right inspector.

```
┌──────────┬────────────────────────────────────────────┬───────────────┐
│ Reg. Ops │ Regatta name                    [Pack] [⋯] │ Conflicts (3) │
│          │ Overview · Schedule · Lineups · Trailer    │ ─────────────  │
│ Regattas │                                            │ ● Error ...   │
│  ▸ HOTL  │        (content)                           │ ▲ Hot seat .. │
│  ▸ Tail  │                                            │ i Info ...    │
│ Fleet    │                                            │               │
│ Trailers │                                            │ Activity      │
│ Teams    │                                            │ Sarah moved ..│
│ Settings │                                            │               │
└──────────┴────────────────────────────────────────────┴───────────────┘
```

- Navigation lists regattas (upcoming first), then club-wide sections. The current regatta expands to show its tabs.
- Content is left-aligned and full width; tables stretch. No centered marketing-style columns.
- The inspector is context-sensitive: conflicts and activity by default, entry details when an entry is selected, "Why here?" on the trailer page. When more than one page component fills it, the last one mounted shows. It collapses with a keyboard shortcut (`]`).

Tablet (768 to 1023 px): navigation collapses to icons; inspector becomes a slide-over.

Phone (< 768 px): bottom tab bar within a regatta (Schedule, Lineups, Trailer, Load list), a top bar with the regatta name and a back button, 16 px side gutters, no horizontal scroll. The lineup builder on a phone is read-mostly with tap-to-edit seats via a bottom sheet; drag and drop is desktop and tablet only.

### 5.4 Core components

**Boat strip** (`<BoatStrip>`): props are boat class, seats (athlete or empty), orientation, size (`xs` 24 px for tables, `sm` 36 px for schedule, `md` 56 px for the builder, `print`), conflict state, team color. The cox is always drawn first, then stroke down to bow. Empty seats render as dashed segments with the seat number. The bow has a pointed end; the stern is rounded with the cox seat as a small circle. Sweep seats show a tiny port or starboard tick on their rigger side.

- **Horizontal** (the default; schedule, tables, share page): stern and cox on the left, bow pointing right, port ticks on top.
- **Vertical** (the lineup builder and the printed lineup sheet): the hull stands on end with the stern and cox on top, one seat per row from stroke down to bow, and the bow at the bottom.

```
  stern                                                                                              bow
  ╭──────────────────────────────────────────────────────────────────────────────────────────────────╲
  │ ◯ Cox: Ari │ 8 Zoe L. │ 7 Ivy M. │ 6 Sam T. │ 5 Jo R. │ 4 Lena K. │ 3 ─ ─ ─ │ 2 Maya P. │ 1 Ava Chen  ⟩
  ╰──────────────────────────────────────────────────────────────────────────────────────────────────╱
```

**Roster row**: name, side badge (P, S, P/S, or a scull icon), entry count. Crossed-off state: strikethrough in team color, text in the secondary ink, not faded, so it keeps 4.5:1. Scratched entries turn grayscale for the same reason. Draggable on desktop.

**Conflict badge**: a small badge with an icon and a count, at the 6 px control radius, not a pill, because pills mean boats; hover or tap for the finding. Icons: filled circle for error, triangle for warning, circle-i for info. Never color alone.

**Timeline bar**: a rounded bar with a darker race segment; conflicts hatched.

**Trailer end view** (`<TrailerEndView>`): draws the trailer's real cross-section for its style (offset post at one third for SRA, center post, or goalpost), rack arms per shelf, the bed compartment below, and boat chips as pills with the shell nickname, class badge, and team color. The frame is SVG; chips and drop lanes are HTML laid over it. Widths are to scale and rack spacing is fixed; chips are drawn 1.15 to 1.3 times the hull's beam so names fit. On an outer-first shelf the inner lane is drawn beside the outer one, with "Loads 1st" and "Loads 2nd" per column. Below 480 px, tiers show only their number. Overhang is shown on the plan view only.

**Rule card**: a sentence ("Top rack holds only eights and fours"), a Must/Prefer tag, a toggle, and an edit affordance. Regatta overrides carry a small "This regatta" tag.

**Empty states** say what to do: "No entries yet. Add one from an event on the schedule, or add an unscheduled entry."

### 5.5 Copy rules

Sentence case everywhere. Buttons say what happens: "Add entry", "Auto pack trailer", "Mark unavailable", "Acknowledge hot seat". The same verb through the flow: "Auto pack trailer" produces the toast "Trailer packed". Errors say what went wrong and what to do: "This shell is out of service. Pick another or change its status in Fleet." No exclamation points. No apologies.

### 5.6 Accessibility and quality floor

- All drag-and-drop has a keyboard and click equivalent.
- Focus visible on everything, 2 px accent ring with 2 px offset (inset on menu, select, and combobox rows).
- A dialog opens on its first field and gives focus back to what opened it.
- Color contrast 4.5:1 for text, 3:1 for UI boundaries, in both themes.
- Touch targets 44 px on phone. Small controls (checkboxes, switches, conflict badges) keep their look and gain a 44 px hit area.
- A table or list that scrolls is a focusable, labelled group while it overflows.
- Screen reader labels on boat strips read as "Seat 3, empty" or "Seat 3, Lena Kim, starboard".
- Every list has a loading skeleton, an empty state, and an error state with retry.

---

## 6. Screen-by-screen spec

Routes are shown with React Router path syntax. Every regatta-scoped page loads the regatta's full working set (events, entries, seats, availability, participating teams, athletes, shells, oar sets, load plans) once and subscribes to changes (§10).

### 6.1 Regattas list `/`

- Cards or rows for upcoming regattas, then past ones collapsed. Each shows dates, venue, teams participating, conflict count, load plan status.
- "New regatta" opens a short form (name, dates, venue, format). Creating lands on the overview.

### 6.2 Regatta overview `/regattas/:id`

```
┌ Head of the Lake · Nov 1, 2026 · Seattle, WA                     [Duplicate] [Settings] ┐
│                                                                                          │
│ Teams                    Entries   Boated     Conflicts      Load plan                   │
│ ● Junior boys              12      24 / 24     1 ▲           Draft · 18 of 22 placed     │
│ ● Junior girls             10      21 / 23     2 ●  1 ▲                                  │
│ ● 5am masters               4       9 / 9      —                                          │
│ + Add team                                                                               │
│                                                                                          │
│ Day at a glance  (mini timeline, shells as rows)                                          │
│ ▬▬▬  ▬▬   ▬▬▬▬▬     ▬▬                                                                    │
│                                                                                          │
│ Recent activity                                                                          │
│ Sarah W. moved "Girls V4+" from Event 12 to Event 14 · 2 min ago                         │
└──────────────────────────────────────────────────────────────────────────────────────────┘
```

- Day at a glance: hovering the miniature (or focusing a bar from the keyboard) shows a card for what is under the pointer. On a bar: the entry, its event and race time, shell, oars, busy window, and its conflicts and hot seats. On a conflict or hot seat: the finding's message and the two crews it joins. The pointer snaps to the nearest bar or mark within a few pixels, since the bars are thin; clicking there opens the entry. Touch skips the card (a tap opens the entry). The miniature is one tab stop with arrow keys, like the full timeline.

### 6.3 Schedule `/regattas/:id/schedule`

- Toolbar: day selector, view toggle (List, Timeline), group-by (Shell, Team, Oars), filters, "Add event", "Import events", "Print" (the list as on screen, §4.11).
- List: a table of events with their entries nested; each entry row has team chip, label, xs boat strip, shell, oars, badges.
- Timeline: described in §4.5. Time axis with 15-minute gridlines; now-line on race day.
- Event editing inline (time, name); bulk shift ("everything after 11:00 is 20 minutes late") applies as one batch, and a shift past midnight warns but doesn't change the event's day.
- Toolbar state (day, view, grouping, filters, and `entries=hide|show`) lives in the URL. `?event=<id>` opens a race.

### 6.4 Lineups `/regattas/:id/lineups/:teamId`

- Header: the team and regatta, the view toggle (By event, By athlete), publish status, "Share" (share links scoped to the team), and "Print".
- The roster panel is sticky. Dragging an athlete over a seat highlights it; over an occupied seat the overlay says "Swap".
- Entries are vertical cards under their event headings, unscheduled entries last (§4.4).
- The inspector on the right shows the selected entry's details, comments, and conflicts. The column starts closed when it would squeeze the builder into its narrow layout, without changing the remembered choice; `]` and an entry's details open it, and leaving the page restores it.
- On a phone, seats are rows, and tapping one opens a bottom sheet of athletes.
- `?entry=<id>` selects, scrolls to, and highlights an entry, redirecting to the right team if needed, then leaves the URL. Entry links everywhere use this form. `/regattas/:id/lineups` goes to the signed-in coach's default team if it is racing, else the first participating team.

### 6.5 Availability `/teams/:id/availability`

A tab of the team page: the season sheet, athletes by regattas, with a checkbox per cell and a count per regatta. A name opens the athlete's season (available, maybe, unavailable; per-day toggles on multi-day regattas; a reason). A column's menu opens the lineups, runs "Mark all available", or imports the absence form (§4.2). The cells form one keyboard grid: one tab stop, arrow keys between cells, Space to toggle. `/regattas/:id/availability` redirects to the regatta's lineups.

### 6.6 Trailer `/regattas/:id/trailer` (and `/regattas/:id/trailer/:trailerId`)

```
┌ Trailer · Big trailer (41 ft)                  [Auto pack trailer]  [Plan view]  [Print] ┐
│┌ To load (4 unplaced) ─┐ ┌ End view · Boys trailer ────────────────────┐ ┌ Rules ───┐ │
││ ▭ DonQ 8+     boys    │ │  level 5  [ Peggy 8+ ]║[ LLL 8+     ][ Waltar 8+ ]│ │Must      │ │
││ ▭ Snoopy 4x   girls   │ │  level 4  [ Woodman  ]║[ Sonic 8+   ][ DeReck 8+ ]│ │☑ Fits 2  │ │
││ ▭ Spencer 4+  boys    │ │  level 3  [ Dan 4+   ]║[ Alma 4+    ][ Kokanee   ]│ │  wide    │ │
││ ▭ Spare oars…         │ │  level 2  [ Thursday ]║[ —          ][ —         ]│ │Prefer    │ │
││                        │ │  level 1  [ —        ]║[ —          ][ —         ]│ │☑ Eights  │ │
││ Gear checklist  ▸      │ │   narrow side   post   wide side (outer first)   │ │  on top ▮▮▮│ │
│└────────────────────────┘ │  Weight and balance              1 warning  ▾   │ │☑ Fours   │ │
│                           └──────────────────────────────────────────────────┘ │  lower ▮▮▯│ │
│ Why here? Peggy: Prefer eights on levels 5 and 4 (+30) · Heavier boats low (−4)  │+ Add rule│ │
└──────────────────────────────────────────────────────────────────────────────────────────┘
```

- Left: unplaced shells (draggable), then the gear checklist. "To load" says "No boats yet" when no entry has a shell.
- Center: end view by default, drawn as the real cross-section (post at one third, one lane left, two lanes right, bed compartments below); plan view per level, and the isometric view, via the toggle. Selecting a cell or chip shows reasons in the inspector; after a move, focus follows the boat. A trailer switcher at the top moves between the boys' and girls' trailers; unplaced boats can be dragged onto either.
- Right: rules panel, folded under its "Loading rules" heading and closed when the page opens (the heading shows how many rules are this regatta's and "Changed" after an edit). Editing a rule and clicking "Auto pack trailer" re-packs; locked chips stay.
- Bottom: "Weight and balance", folded under its heading and closed when the page opens (the heading shows how many warnings the layout has): weight per side (on SRA's trailers the narrow side and the wide side's outer lane, the two that balance compares), per-tier overhang, warnings.

### 6.7 Load list `/regattas/:id/load`

Checklist grouped by Shells, Riggers, Oars, Gear, Extras; Loaded and Returned checkboxes; "Add item"; "Save list". Phone-first layout.

### 6.8 Fleet `/fleet/shells`, `/fleet/oars`, `/fleet/gear`

Editable tables with filters, bulk import, and a detail drawer per item showing upcoming usage. Drawers deep-link as `/fleet/shells?shell=<id>` and `/fleet/oars?set=<id>`.

### 6.9 Trailers admin `/trailers/:id`

Form on the left (frame length, shelves table, compartments with "From front" and "To", warning on overlaps), a live diagram of the unsaved draft on the right (end, plan, or isometric view), default rules editor below. Presets start a new trailer: SRA offset post, 41 ft goalpost, center post. A test pack (a sample load, a regatta's boats, or a load plan) checks the measurements.

### 6.10 Teams and roster `/teams/:id`

Team settings and two tabs. Roster: the athlete table with inline editing, import, and export; when it is grouped by level, the Level column is hidden. Availability: §6.5.

### 6.11 Settings `/settings`

Club defaults, users and roles, preferences, activity log. The open tab is kept in `?tab=`.

### 6.12 Print views `/print/...`

Server-free print routes with print CSS:

- `/print/regattas/:id/lineups/:teamId|all?day=&source=live&layout=grid&boats=names`
- `/print/regattas/:id/schedule?view=master|list&day=&team=&source=live`; the list view also takes `class=`, `shell=`, and `entries=hide`, and its toolbar offers the team, the day, and "Show entries". "Back" returns to the schedule with the same day and filters.
- `/print/regattas/:id/load/:trailerId`

---

## 7. Architecture and stack

### 7.1 Decisions

The owner wants to start locally, has no cloud accounts yet, and does not want a large backend for a small amount of data. The stack is chosen to run with one command on a laptop and to deploy later as a single process.

| Concern | Choice | Why |
|---|---|---|
| UI | **React 19 + TypeScript**, built with **Vite** | The owner asked for a flavor of React. A single-page app is right: it sits behind sign-in, has no SEO needs, and benefits from a rich client with a local working set. |
| Routing | **React Router v7** (library mode, data routers) | Simple, well known, loaders for the regatta working set. |
| Server state | **TanStack Query** | Caching, optimistic updates, persisted cache for offline reads. |
| Local UI state | **Zustand** (small stores per feature) | Drag state, selection, panel toggles. |
| Styling | **Tailwind CSS v4** with tokens in `@theme`, **shadcn/ui** components on Radix primitives | Accessible primitives agents know well; tokens keep the look consistent. |
| Drag and drop | **dnd-kit** | Accessible, keyboard support, handles seat drops and trailer cell drops. |
| Tables | **TanStack Table** | Sorting, filtering, inline editing for fleet and roster. |
| Forms | **react-hook-form + zod** | Zod schemas are shared with the domain package. |
| Dates | **date-fns** and **date-fns-tz** | Regatta timezone handling. |
| Icons | **Lucide** | Consistent line icons. |
| Visualizations | Hand-written **SVG** components | Boat strips, timeline, trailer views. No charting library. |
| Backend | **PocketBase** (single binary: SQLite, auth with Google OAuth2, realtime subscriptions, file storage, admin UI, JS hooks and migrations) | The whole backend is one ~30 MB executable and one data folder. `pnpm dev` starts it next to Vite with no accounts or Docker. It serves the built app itself, so production is the same binary on a small VPS. Realtime and Google sign-in are built in. |
| Server logic | **PocketBase JS hooks** (`pb_hooks/*.pb.js`) | Domain allowlist on sign-in, `updated_by` stamping, activity log, the stale-write check, share-link routes, mentions, and email jobs (§8.3). Everything else (conflicts, packing, load list) runs in the browser as pure functions. |
| Data access | A thin **`DataStore` interface** with two implementations: `PocketBaseStore` and `MemoryStore` | `MemoryStore` powers unit tests, the component gallery, and **demo mode** (`pnpm demo`: the full app on seed data in the browser, persisted to localStorage, no backend at all). Keeps the app honest about its data needs and makes a later backend swap mechanical. |
| Hosting | Later. Recommended: a small VPS or Fly.io running PocketBase with the app in `pb_public/`, behind the host's TLS | One process, one volume, nightly SQLite backup to object storage. PocketHost is the zero-ops alternative. Nothing is needed until the club wants to share it. |
| Published demo | **GitHub Pages** (`pnpm pages:build`) | The demo as a static site on `MemoryStore` under `/<repository>/`, behind one shared password that opens the encrypted junior rosters in the browser (§14). Each visitor's changes stay in their own browser. `.github/workflows/pages.yml` deploys on push to `main`. |
| PWA | **vite-plugin-pwa** | Installable, asset caching, persisted query cache for offline reads. |
| Testing | **Vitest**, **React Testing Library**, **Playwright**, PocketBase binary in CI | §13. |
| Tooling | **pnpm** workspaces, **ESLint**, **Prettier**, **TypeScript strict**, **GitHub Actions** | §11. |

Alternatives set aside: Supabase (Postgres with RLS is excellent, but local development needs Docker and a dozen containers, which is the "huge backend" the owner wants to avoid; the `DataStore` boundary means it could replace PocketBase later if the club outgrows SQLite, which at this data volume it will not). Next.js (no SSR need). Firebase (weaker relational modeling). Convex (good realtime, requires a cloud account from day one). Local-first sync engines (the right long-term answer if the club wants full offline editing).

### 7.2 System shape

```
┌───────────────────────────────┐        ┌──────────────────────────────┐
│ Browser (React SPA, PWA)      │        │ PocketBase (one process)     │
│                               │  HTTP  │                              │
│  packages/domain              │◀──────▶│  SQLite (pb_data/)           │
│   conflict engine (pure)      │        │  Auth: Google OAuth2, email  │
│   trailer packer (pure)       │  SSE   │  Realtime subscriptions      │
│   seat templates, formatters  │◀──────▶│  Files (photos)              │
│                               │        │  JS hooks: allowlist, log    │
│  DataStore ── PocketBaseStore │        │  Serves pb_public/ (the app) │
│           └── MemoryStore     │        └──────────────────────────────┘
│  TanStack Query cache (IDB)   │
└───────────────────────────────┘
```

- The browser loads a regatta's working set with a handful of list queries (PocketBase `expand` pulls relations), then runs all derived computation locally. Interactions are instant and the logic is testable without a database.
- Writes are small record-level mutations with optimistic updates. Realtime events invalidate the relevant query keys.

### 7.3 Package boundaries

- `packages/domain` has **no React and no PocketBase imports**. It exports types, zod schemas, seat templates, boat class defaults, the conflict engine, the trailer packer, the rule catalog, the load list derivation, the schedule paste parser, and formatting helpers.
- `apps/web` imports from `packages/domain`. All data access goes through `src/data/store.ts` (`DataStore`) and hooks built on it; components never touch the PocketBase SDK. Besides list, record, create, update, and delete, the store has `batch(ops)` (atomic), an `expectedUpdated` option on update (the stale-write check, §10.2), `subscribe`, and `uploadFile`, `removeFile`, and `fileUrl` for photos. Errors are `StoreError` with a code and a toast-ready message.
- `packages/seed` is pure too: it builds the seed world (§14) that both the PocketBase seed script and demo mode load.
- `backend/` holds PocketBase migrations (`pb_migrations/`, JS), hooks (`pb_hooks/`), a download script for the binary, and the seed loader. Generated TypeScript types for collections land in `apps/web/src/data/pb-types.ts` via `pocketbase-typegen` and are committed.

---

## 8. Data model

PocketBase collections. Every collection has `id`, `created`, and `updated` automatically. Relations are PocketBase relation fields; multi-value selects are used where Postgres would use arrays. Where noted, `created_by` and `updated_by` relate to `users` and are stamped by hooks. Soft deletes are not used; the activity log preserves history.

Field names are the snake_case forms of the domain names in `packages/domain/src/types.ts`. Relation fields drop the `Id` suffix (`eventId` → `event`); `*_by` fields keep theirs. Calendar days (`start_date`, `end_date`, `day`, `birthdate`) are text constrained to `YYYY-MM-DD`, not date fields, so they never shift across time zones. Collection ids are `srt_<name>`, after the app's first name (§11.2). `backend/README.md` lists the record shapes as the API returns them.

### 8.1 Collections

**users** (auth collection) — `name`, `email`, `role` select(`admin`,`coach`,`viewer`), `avatar` file, `default_team` relation(teams), `preferences` json (theme, weight unit, `emailDigest` and `emailOnChange`, both on by default). Created automatically on first Google sign-in when the email's domain matches `REGATTA_OPS_ALLOWED_DOMAIN` (hook), with role `coach`.

**teams** — `name`, `short_name`, `program` select(`juniors`,`masters`,`other`), `color_key` select, `sort_order` number, `archived` bool.

**athletes** — `team` relation, `first_name`, `last_name`, `preferred_name`, `side` select(`port`,`starboard`,`both`,`none`), `can_scull` bool, `can_cox` bool, `birth_year` number, `birthdate` day (optional), `gender`, `grad_year` number, `level` select(`novice`,`experienced`), `status` select(`active`,`inactive`), `notes`. Index on `(team, status)`.

**regattas** — `name`, `venue`, `city`, `start_date` day, `end_date` day, `timezone`, `format` select(`sprint`,`head`), `notes`, `status` select(`planning`,`final`,`archived`), `settings` json (timing values, §4.1), `created_by` relation.

**regatta_teams** — `regatta` relation, `team` relation, `notes`, `published_at` date, `published_snapshot` json (entries with seats, shells, oars, and event times as of publish). Unique index `(regatta, team)`.

**availability** — `regatta` relation, `athlete` relation, `status` select(`available`,`unavailable`,`maybe`), `days` json, `reason`, `updated_by` relation. Unique `(regatta, athlete)`. Absence of a record means available.

**events** — `regatta` relation, `kind` select(`race`,`logistics`), `event_number`, `name`, `boat_class` select(`1x`,`2x`,`2-`,`2+`,`4x`,`4x+`,`4+`,`4-`,`8+`), `category`, `day` day, `scheduled_at` date (nullable), `stage` select(`heat`,`semi`,`final`,`time_trial`,`race`), `progression_group`, `team_filter` relation(teams, multi; logistics only), `notes`, `sort_order` number, `source`. Index `(regatta, day, scheduled_at)`.

**entries** — `regatta` relation, `event` relation (nullable), `team` relation, `label`, `boat_class` select, `shell` relation (nullable), `oar_set` relation (nullable), `status` select(`draft`,`planned`,`confirmed`,`scratched`), `coach` relation(users, nullable), `notes`, `hot_seat_plan`, `hot_seat_ack_by` relation (nullable), `hot_seat_fingerprint`, `seat_sides` json (nullable), `created_by`, `updated_by`. `boat_class` is copied from the event on create and kept in sync by a hook when the entry moves events or the event's class is edited. `hot_seat_fingerprint` may hold several fingerprints, space-separated (§9.2). `seat_sides` holds bucket rigs, since shells have no rig-pattern field (§15). Indexes `(regatta, team)`, `(regatta, shell)`, `(regatta, oar_set)`.

**entry_seats** — `entry` relation, `seat` select(`1`..`8`,`cox`), `athlete` relation (nullable), `note`. Unique `(entry, seat)`; unique `(entry, athlete)` where athlete is set (SQLite partial index in the migration). An empty seat needs no record: a missing record and a null athlete both mean empty.

**shells** — `name`, `nickname`, `boat_class` select, `compatible_classes` select(multi), `rigging` select(`sweep`,`scull`,`convertible`), `manufacturer`, `model`, `serial`, `year` number, `length_cm`, `beam_cm`, `weight_kg`, `weight_class_label`, `crew_weight_min_kg`, `crew_weight_max_kg`, `stroke_side` select(`port`,`starboard`), `cox_position` select(`stern`,`bow`), `rigger_type` select(`wing`,`side`,`none`), `rigger_count` number, `shoes`, `spread_cm`, `span_cm`, `level` select(`beginner`,`intermediate`,`racer`), `gender_affinity` select(`women`,`men`,`any`), `home_team` relation (nullable), `location`, `status` select(`in_service`,`limited`,`out_of_service`,`retired`), `color`, `is_private` bool, `notes`, `photo` file.

**oar_sets** — `name`, `type` select(`sweep`,`scull`), `color`, `count` number, `blade`, `length_cm`, `inboard_cm`, `grip_mm`, `gender_affinity` select, `home_team` relation (nullable), `status` select(`in_service`,`limited`,`out_of_service`,`retired`), `notes`.

**gear_items** — `category` select, `name`, `quantity` number, `default_load` bool, `notes`.

**trailers** — `name`, `style` select(`offset_post`,`center_post`,`goalpost`), `frame_length_cm`, `width_cm`, `post_offset_pct` number (offset-post only; 33 for SRA), `bow_forward_default` bool, `notes`, `default_rules` json.

**trailer_shelves** — `trailer` relation, `label`, `tier` number, `column_key` select(`left`,`right`,`full`), `width_cm`, `length_cm`, `front_overhang_max_cm`, `rear_overhang_max_cm`, `allowed_classes` select(multi, optional), `lanes_override` number (optional), `lane_access` select(`any`,`outer_first`), `max_boats` number (optional), `max_weight_kg` number (optional), `access_rank` number, `active` bool, `sort_order` number.

**trailer_compartments** — `trailer` relation, `kind` select(`bed`,`oar_box`,`oar_tube`,`oar_rack`,`rigger_rack`,`storage`), `label`, `capacity` number, `capacity_unit`, `start_cm` number, `end_cm` number (position along the frame from its front; 0 reads blank).

**load_plans** — `regatta` relation, `trailer` relation, `status` select(`draft`,`final`), `rules` json, `packed_at` date, `notes`. Unique `(regatta, trailer)`.

**load_placements** — `load_plan` relation, `shell` relation, `shelf` relation, `lane` number, `offset_cm` number, `bow_forward` bool, `locked` bool, `reasons` json. Unique `(load_plan, shell)`.

**load_items** — `regatta` relation, `load_plan` relation (nullable; items in a truck bed have none), `kind` select(`shell`,`riggers`,`oar_set`,`gear`,`extra`), `ref_id`, `label`, `quantity` number, `container` (free text such as "Boys trailer bed" or "Truck 1 bed"), `loaded_at` date, `loaded_by` relation, `loaded_by_name`, `returned_at` date, `returned_by` relation, `returned_by_name`, `notes`. The `_name` fields hold what someone typed when ticking through a share link.

**comments** — `target_type`, `target_id`, `author` relation, `body`, `mentions` relation(users, multi; set by the server from the body). Index `(target_type, target_id)`.

**activity_log** — `regatta` relation (nullable), `team` relation (nullable), `actor` relation, `action`, `target_type`, `target_id`, `summary`, `diff` json. Written only by hooks; `summary` is a human sentence ("moved entry Girls V4+ to Event 14") so the UI does not reconstruct it.

**presence** — `user` relation, `regatta` relation, `page`, `team` relation, `seen_at` date. One row per browser tab. Heartbeat every 30 s; rows older than 2 min are ignored and pruned by a cron hook.

**club_settings** (single record) — `club_name`, `timezone`, `weight_unit` select(`kg`,`lb`), `week_starts_on` number, `timing_defaults` json (the §4.1 timing values for sprints), `head_race_duration_min` number. Read by everyone, written by admins. Holds the club defaults of §4.12.

**share_links** — `regatta` relation, `team` relation (nullable), `token` (unique; 40 random characters made by the server), `can_check_load` bool, `revoked_at` date, `created_by` relation.

**notification_log**, **mail_outbox** — server-only bookkeeping for email (§8.3): what is queued and what was sent, and, with `REGATTA_OPS_MAIL_CAPTURE=1`, the emails themselves in place of sending them.

### 8.2 API rules

PocketBase rules per collection, kept in the migrations:

- **List and view:** `@request.auth.id != ""` on every collection except `share_links` (coaches and admins) and the server-only `notification_log` and `mail_outbox`.
- **Create, update, delete:** `@request.auth.role = "coach" || @request.auth.role = "admin"` for regatta data (regattas, regatta_teams, availability, events, entries, entry_seats, load_plans, load_placements, load_items, share_links) and fleet (shells, oar_sets, gear_items); only admins delete share links. Anyone signed in, viewers included, may create comments and presence rows. Admin only for `users` (except a user's own record: name, avatar, preferences, default team), teams, trailers, trailer_shelves, trailer_compartments. `activity_log` create is locked to hooks.
- A rejected update returns 404, not 403 (PocketBase behavior).
- The batch API is enabled. Swapping two athletes is a clear-then-set batch because of the unique `(entry, athlete)` index.
- Share-link reads and check-offs go through two public routes in a hook: `GET /api/regatta-ops/share/{token}` returns the published snapshots, the schedule, and (with `can_check_load`) the load items; `POST /api/regatta-ops/share/{token}/load-items/{id}` ticks loaded or returned. The token is the credential.

### 8.3 Hooks

`backend/pb_hooks/`; `backend/README.md` documents each hook's contract.

- `auth.pb.js`: reject emails outside `REGATTA_OPS_ALLOWED_DOMAIN` on every sign-in; set `role = coach` on first sign-in; only admins change roles.
- `stamp.pb.js`: set `updated_by` (and `created_by` on create), comment authors, and presence users from the auth record.
- `activity.pb.js`: after create, update, and delete on teams, athletes, regattas, regatta_teams, entries, entry_seats, events, availability, load_placements, load_items, shells, oar_sets, and share_links, write an `activity_log` record with a sentence built from the record and its relations. Published snapshots and share-link tokens stay out of the diff. Superuser writes are not logged.
- `entries.pb.js`: keep `entries.boat_class` in sync with the event; clear `hot_seat_ack_by` on any shell or event change (the engine's fingerprint comparison is the finer check).
- `concurrency.pb.js`: if an update of an event or a load placement carries `expected_updated` and it does not match the stored `updated`, return 409 so the client refetches.
- `housekeeping.pb.js`: one `club_settings` record; prune stale presence rows.
- `share.pb.js`: share-link tokens, revocation, and the public routes (§8.2).
- `comments.pb.js`: resolve `comments.mentions` from the body and email the people mentioned.
- `notify.pb.js`: change emails and the daily digest, on PocketBase cron jobs.
- `mail.pb.js`: SMTP settings from the environment, and mail capture. Without SMTP, email goes to the PocketBase log.

### 8.4 Working-set queries

The app has no database views; the working set is loaded with a few list calls, expanded where useful:

- `entries` filtered by regatta with `expand=event,team,shell,oar_set`, and `entry_seats` filtered by `entry.regatta` with `expand=athlete`.
- `events`, `availability`, `regatta_teams` by regatta; `athletes` by the participating teams; `shells`, `oar_sets`, `gear_items`, `trailers` with shelves and compartments, `load_plans` with placements and items by regatta.

---

## 9. Domain logic

All of §9 lives in `packages/domain`, is pure TypeScript, deterministic, and unit-tested. Functions take plain objects and return plain objects; no dates from the environment, no randomness, no I/O.

### 9.1 Boat classes and seat templates

```ts
export type BoatClass = '1x'|'2x'|'2-'|'2+'|'4x'|'4x+'|'4+'|'4-'|'8+';
export type Seat = '1'|'2'|'3'|'4'|'5'|'6'|'7'|'8'|'cox';

export interface BoatClassSpec {
  cls: BoatClass;
  rowers: 1|2|4|8;
  coxed: boolean;
  rigging: 'sweep'|'scull';
  oarsNeeded: number;          // sweep: rowers; scull: rowers * 2
  defaultLengthCm: number;      // §16
  defaultBeamCm: number;
  defaultWeightKg: number;
  defaultRiggerCount: number;   // side-mounted riggers: one per rower; wing riggers: rowers / 2
}

export function seatsFor(cls: BoatClass): Seat[];            // ['1','2','3','4','cox'] for 4+
export function seatSide(cls: BoatClass, seat: Seat, override?: Record<Seat,'port'|'starboard'>): 'port'|'starboard'|null;
// Standard sweep rig: even seats port, odd seats starboard. Sculling seats return null.
export function isCompatible(shellClasses: BoatClass[], eventClass: BoatClass, convertible?: boolean): boolean;
export function juniorAgeGroup(birthYear: number, seasonYear: number): 'U15'|'U16'|'U17'|'U19'|'open';
// age = seasonYear - birthYear: <=14 → U15, 15 → U16, 16 → U17, 17 or 18 → U19, else open.
// Matches the club's fall age-group sheet (born 2009 → U19 in 2026, 2010 → U17, 2011 → U16, 2012 → U15).
export function mastersCategory(avgAge: number): 'AA'|'A'|'B'|'C'|'D'|'E'|'F'|'G'|'H'|'I'|'J'|'K';
// USRowing masters bands: AA 21+, A 27+, B 36+, C 43+, D 50+, E 55+, F 60+, G 65+, H 70+, I 75+, J 80+, K 85+.
```

Compatibility defaults (used when a shell has no explicit `compatible_classes`): a shell's own class only, except `4+`↔`4-` and `4x`↔`4x+` when the shell is marked convertible.

### 9.2 Conflict engine

```ts
export interface ConflictInput {
  settings: { launchLeadMin: number; raceDurationMin: number; returnMin: number;
              hotSeatMinGapMin: number; athleteMinGapMin: number; rerigMin: number };
  timezone: string;            // the regatta's zone, for times in messages
  seasonYear: number;          // for junior age groups
  events: RegattaEvent[]; entries: Entry[]; seats: EntrySeat[];
  athletes: Athlete[]; availability: Availability[];
  shells: Shell[]; oarSets: OarSet[]; teams: Team[];
  loadPlacements?: Pick<LoadPlacement, 'shellId'>[];   // optional: enables "not on trailer" findings
}

export type Severity = 'error'|'warning'|'info';

export interface Finding {
  id: string;                  // stable hash of code + subject ids, so acknowledgments persist
  code: FindingCode;
  severity: Severity;
  message: string;             // one sentence, ready to display
  entryIds: string[];
  teamIds: string[];
  resource?: { type: 'shell'|'oar_set'|'athlete'; id: string };
  day?: string;
  gapMin?: number;             // for hot seats and conflicts
  acknowledged?: boolean;      // set by the engine when the later entry's acknowledgment still matches
}

export function findConflicts(input: ConflictInput): Finding[];
export function unboatedAthletes(input: ConflictInput, teamId: string, options?: { anyTeam?: boolean }): Athlete[];
export function entryStats(entry, seats, athletes, seasonYear?): { avgAge?: number; mastersCategory?: string; ageGroup?: JuniorAgeGroup; portCount: number; starboardCount: number };
```

The race type is `RegattaEvent`, since `Event` collides with the DOM. `unboatedAthletes` counts only the team's own entries by default, so an athlete lent to another team still shows as unboated at home; `{ anyTeam: true }` counts every team.

**Busy window.** For an entry with a scheduled event at time `T`:

- `busyStart = T − launchLeadMin`
- `raceEnd = T + raceDurationMin`
- `busyEnd = raceEnd + returnMin`

Entries whose event has no time, or whose status is `scratched`, take no part in time-based checks.

**Resource pairs.** For each shell, oar set, and athlete, collect the scheduled entries that use it, sort by `T` within each day, and for each consecutive pair `(a, b)` compute `gap = b.T − a.busyEnd` (minutes from the boat being back on the dock to the next race start). Then:

| Condition | Code | Severity |
|---|---|---|
| `gap ≥ launchLeadMin` | none | — |
| `hotSeatMinGapMin ≤ gap < launchLeadMin` | `SHELL_HOT_SEAT` / `OARS_HOT_SEAT` | warning (info once acknowledged) |
| `gap < hotSeatMinGapMin` | `SHELL_CONFLICT` / `OARS_CONFLICT` | error |
| athlete: `gap ≥ athleteMinGapMin` | none | — |
| athlete: `0 ≤ gap < athleteMinGapMin` | `ATHLETE_TIGHT` | warning |
| athlete: `gap < 0` | `ATHLETE_DOUBLE_BOOKED` | error |

When two consecutive entries on the same shell use different boat classes (Lundberg as a 4+ at 10:00, then as a 4x+ at 11:30), convertible or not, `rerigMin` is added to `a.busyEnd` before computing the gap, and a `RERIG_NEEDED` info finding is emitted regardless of the gap so the loading crew knows to bring the second rigger set.

**Oar splits.** Two crews on one oar set only pair as a hot seat or conflict when together they need more oars than the set holds: two fours on a 9-oar sweep set is a split, as the club does it. Three crews sharing one set are not summed (consecutive pairs only).

Non-consecutive pairs never conflict more than consecutive ones do, so checking consecutive pairs is sufficient.

**Static checks** (run on every entry regardless of time):

| Code | Severity | Condition |
|---|---|---|
| `CLASS_MISMATCH` | error | shell not compatible with the entry's boat class |
| `RIGGING_MISMATCH` | error | oar set type ≠ boat class rigging |
| `OARS_SHORT` | warning | oar set count < `oarsNeeded` (not raised when `RIGGING_MISMATCH` already fires) |
| `SHELL_OUT_OF_SERVICE` | error | shell status `out_of_service` or `retired` |
| `SHELL_LIMITED` | info | shell status `limited` |
| `ATHLETE_UNAVAILABLE` | error | seated athlete marked unavailable for the regatta (or for that day); `maybe` counts as available |
| `ATHLETE_BORROWED` | info | seated athlete's home team ≠ entry team |
| `SEATS_EMPTY` | warning | one or more seats empty (message counts them) |
| `NO_SHELL` / `NO_OARS` | warning | pickers empty |
| `SIDE_MISMATCH` | info | sweep seat side ≠ athlete side, when athlete side is port or starboard. Seat sides come from `entrySeatSides(entry, shell)`: the entry's own sides, else the shell's rig (a starboard-rigged shell flips every seat), else the standard rig. The boat strip uses the same function. |
| `COX_NOT_COX` | info | cox seat holds an athlete without `can_cox` |
| `SCULLER_NOT_SCULLER` | info | scull entry holds an athlete without `can_scull` |
| `UNSCHEDULED` | info | entry has no event or the event has no time |
| `NOT_ON_TRAILER` | warning | `loadPlacements` given and the shell has none (status not scratched) |
| `RERIG_NEEDED` | info | consecutive entries on one shell the same day with different classes; the load list needs the second rigger set |
| `AGE_GROUP` | info | a seated athlete's junior age group is older than the event category implies ("U17 event; Sam is U19") when the category text contains U15, U16, U17, or U19 |

**Messages** are complete sentences with names, never ids: "Monahan is also used by Girls V8 at 10:20; only 12 minutes between the boat landing and the next race." The engine receives display names in its input so it never needs a lookup.

**Determinism and ids.** `Finding.id = hash(code, sorted subject ids)`. The UI stores hot-seat acknowledgments on the later entry (`hot_seat_ack_by`, `hot_seat_plan`), and the engine marks `acknowledged` when both entries of a hot-seat pair are unchanged in shell and time (it compares against a stored fingerprint in the acknowledgment; a change re-opens the warning). The fingerprint is readable, `shell:<id>|<entryA>@<ISO>|<entryB>@<ISO>`, and the stored field may hold several, space-separated, so one acknowledgment covers a shell and an oar handoff between the same two crews.

**Test cases** (each a Vitest case; the fixture builder in `packages/domain/test/fixtures.ts` makes these one-liners):

1. Same shell, races 3 h apart → no finding.
2. Same shell, races 45 min apart with defaults (gap = 45 − 10 − 15 = 20) → `SHELL_HOT_SEAT`, gapMin 20.
3. Same shell, races 20 min apart → `SHELL_CONFLICT`.
4. Same shell, three races; only consecutive pairs reported.
5. Scratched entry ignored.
6. Unscheduled entry yields `UNSCHEDULED` only.
7. Athlete in two entries 10 min apart → `ATHLETE_DOUBLE_BOOKED`.
8. Convertible 4+/4- shell in a 4- event → no `CLASS_MISMATCH`; non-convertible → error.
9. Sweep oars on a 4x → `RIGGING_MISMATCH`.
10. Unavailable athlete seated → `ATHLETE_UNAVAILABLE`; per-day unavailability on a two-day regatta only fires on that day.
11. Acknowledged hot seat with matching fingerprint → severity info; after the event time changes → warning again.
12. Multi-day: entries on different days never pair.
13. `unboatedAthletes` excludes unavailable athletes and includes borrowed-out athletes still on the roster.
14. Convertible shell as 4+ then 4x+ 60 min apart with defaults: gap = 60 − 10 − 15 − 30 = 5 → `SHELL_CONFLICT` plus `RERIG_NEEDED`; 90 min apart → `SHELL_HOT_SEAT` plus `RERIG_NEEDED`.
15. `juniorAgeGroup` and `mastersCategory` boundaries, including the season-year argument.

### 9.3 Trailer packer

#### 9.3.1 Types

```ts
export interface TrailerDef {
  id: string; name: string; style: 'offset_post'|'center_post'|'goalpost';
  postOffsetPct?: number;     // offset_post: where the post sits across the width (SRA: 33)
  frameLengthCm: number; widthCm: number;
  bowForwardDefault?: boolean;
  shelves: ShelfDef[];
  compartments: CompartmentDef[];
}

export interface CompartmentDef {
  id: string; kind: 'bed'|'oar_box'|'oar_tube'|'oar_rack'|'rigger_rack'|'storage'; label: string; capacity: number;
  startCm?: number; endCm?: number;   // a zone along the frame, cm from the front; both unset = the whole length
}

export interface ShelfDef {
  id: string; label: string; tier: number; columnKey: 'left'|'right'|'full';
  widthCm: number; lengthCm: number;
  frontOverhangMaxCm: number; rearOverhangMaxCm: number;
  allowedClasses?: BoatClass[]; lanesOverride?: number;
  laneAccess: 'any'|'outer_first';   // outer_first: lane 0 is nearest the post and is blocked by lane 1
  maxBoats?: number; maxWeightKg?: number;
  accessRank: number; active: boolean;
}

export interface PackBoat {
  shellId: string; name: string; cls: BoatClass; teamId: string; teamName: string;
  lengthCm: number; beamCm: number; weightKg: number;
  firstRaceAt?: string;       // ISO, earliest race using this shell; drives unload order
  fragile?: boolean;
}

export interface Placement {
  shellId: string; shelfId: string; lane: number; offsetCm: number; bowForward: boolean;
  locked: boolean; reasons: Reason[];
}
export interface Reason { ruleId: string; text: string; score?: number; hard: boolean }

export interface PackResult {
  placements: Placement[];
  unplaced: { shellId: string; reasons: Reason[] }[];
  metrics: { leftWeightKg: number; rightWeightKg: number; balancePct: number;
             perShelf: { shelfId: string; boats: number; lanesUsed: number; weightKg: number; frontOverhangCm: number; rearOverhangCm: number }[] };
  warnings: string[];
}

export function packTrailer(trailer: TrailerDef, boats: PackBoat[], rules: Rule[], existing: Placement[]): PackResult;
export function validatePlacement(trailer, boats, rules, placements, candidate: Placement): { ok: boolean; violations: Reason[] };
export function dropBoat(trailer, boats, rules, placements, shellId, target: { shelfId: string; lane: number }): DropResult;
export function explainPlacement(trailer, boats, rules, placements, shellId): Reason[];   // "Why here?"
export function layoutReport(trailer, boats, rules, placements): Pick<PackResult, 'metrics'|'warnings'>;
export function explain(rule: Rule, trailer: TrailerDef, context?: ExplainContext): string;   // the sentence shown on the rule card
```

`balancePct` is |L − R| / (L + R) × 100, where L and R are the weights that count toward each side: a boat in a lane over the trailer's centerline counts for neither (§9.3.3). `explain` takes optional shell and team names for pin and team sentences. Drag and drop uses `dropBoat`, which finds the offset the packer would use, instead of calling `validatePlacement` with a literal offset.

#### 9.3.2 Geometry

- A shelf is a rectangle `widthCm × lengthCm` seen from above, plus overhang zones at each end. Boats are placed lengthwise.
- **Lanes.** If `lanesOverride` is set, the shelf has that many lanes of equal width. Otherwise lanes are computed greedily per shelf from the beams of the boats placed there: a boat fits if the sum of `(beamCm + clearanceCm)` of boats already in the shelf's widest row plus the new boat's `(beamCm + clearanceCm)` ≤ `widthCm + clearanceCm`. `clearanceCm` defaults to 20 and is a parameter of the built-in `fit` rule. In practice this yields 3 lanes for fours and eights on a 240 cm goalpost shelf and 1 lane per side on a center-post trailer, which matches how manufacturers rate capacity (§16).
- **End to end.** Boats in the same lane are placed end to end with `gapCm` (default 30) between them. Their total length must fit in `lengthCm + frontOverhangMaxCm + rearOverhangMaxCm`. Placement order in a lane: the packer places the longer boat first and fills with shorter ones; `offsetCm` records each boat's start relative to the front of the frame.
- **Overhang.** For each lane, front overhang = `max(0, −minOffset)`, rear overhang = `max(0, maxEnd − lengthCm)`. Overhang limits are per shelf because they differ by tier: a 19.9 m eight on a 12.5 m frame needs about 7.5 m of overhang, which only the tiers above the tow vehicle can provide. This is why manufacturers rate a 5-tier trailer as nine eights (three tiers) plus six fours (two tiers), and the seeded trailer encodes it (§14). The packer prefers front overhang up to the shelf maximum before using rear overhang when the `forward-bias` rule is on (it is on by default; §16 explains why).
- **Lane access.** On an `outer_first` shelf (the two-wide side of SRA's trailers), lane 0 is against the post and lane 1 is outside it. A boat in lane 0 cannot come off until lane 1 is empty, so the `unload-order` rule treats lane 1 as more accessible and the plan view draws the loading order. Nothing else about fit changes.
- **Orientation.** `bowForward` defaults to true: SRA loads bows forward, over the tow vehicle. A trailer-level setting (`bowForwardDefault`) flips the default. Orientation does not affect fit in v1, and a single boat can't be turned on the trailer page yet.

#### 9.3.3 Rule catalog

Rules are JSON objects `{ id, type, hard, weight, enabled, origin: 'trailer'|'regatta', params }`. `weight` is 1 (Low), 2 (Medium), or 3 (High) and scales a soft rule's score. The sentence on the rule card is produced by `explain()` from the type and params.

| Type | Hard/soft | Params | Sentence | Semantics |
|---|---|---|---|---|
| `fit` (built-in, always on) | hard | `clearanceCm`, `gapCm` | "Boats must physically fit: 20 cm between hulls, 30 cm between ends" | Width and length checks above. |
| `shelf-classes` | hard | `shelfIds[]`, `classes[]` | "Top rack holds only 8+ and 4+" | Candidate rejected if class not in list. |
| `shelf-lanes` | hard | `shelfId`, `lanes`, `classes?` | "Middle rack, driver side fits 3 fours side by side" | Overrides computed lanes for the shelf (optionally only when all boats are in `classes`). This is the "we can fit 3 fours in this space" override. |
| `shelf-off` | hard | `shelfIds[]` | "Don't use the top rack" | Shelf treated as inactive. |
| `overhang` | hard | `tiers[]`, `frontMaxCm`, `rearMaxCm` | "Top rack may stick out 300 cm in front and 120 cm behind" | Overrides shelf overhang limits. |
| `max-boats` | hard | `shelfId`, `max` | "Bottom rack, curb side holds at most 2 boats" | Count limit. |
| `pin` | hard | `shellId`, `shelfId`, `lane?` | "Monahan goes on the top rack, driver side" | Forces placement; equivalent to a locked placement. |
| `class-tier` | soft | `classes[]`, `tiers[]` | "Prefer eights on the top rack" | +10 × weight when satisfied. With `hard: true` it is a Must: "Eights must go on the top rack". |
| `heavy-low` | soft | none | "Keep heavier boats low" | −(weightKg / 10) × (tier − 1) × weight. |
| `forward-bias` | soft | none | "Put overhang in front, over the truck, rather than behind" | −(rearOverhangCm / 50) × weight per lane. |
| `side-balance` | soft | `tolerancePct` (default 20) | "Balance weight between the two sides" | Global: −(|L − R| / W) × 100 × weight, where W is the weight of every boat in the pack, so a kilogram of difference costs the same however much is loaded. A lane over the trailer's centerline counts for neither side: the inner lane of an offset-post trailer's wide side, which sits between the wheels, and the middle third of a `full` shelf (which goes by lane position: left third, right third). The warning compares `balancePct` with `tolerancePct` and says which side is heavier and how far apart they are. |
| `unload-order` | soft | none | "Boats racing first should be easiest to reach" | +5 × weight when a boat with an earlier `firstRaceAt` is on a shelf with a better `accessRank`, and on the outer lane. |
| `team-together` | soft | `teamIds?` | "Keep each team's boats together" | +3 × weight for each same-team neighbor (same shelf, adjacent lane, or same tier adjacent shelf). |
| `fragile-inside` | soft | none | "Keep fragile boats in inside lanes" | +8 × weight for a `fragile` boat in a non-outer lane. |

Default rule set for SRA's trailers (seeded in §14, JSON in §17.2): `fit`; `class-tier` (8+ on levels 5 and 4, High); `class-tier` (4+, 4-, 4x, 4x+ on levels 3 and 2, Medium); `heavy-low` (Low, so it breaks ties without fighting the eights-on-top convention); `forward-bias` (Medium); `side-balance` (Low, comparing the narrow side against the wide side's outer lane by weight, with the default 20% tolerance; at High it takes eights off the top levels to ride in the inner lane); `unload-order` (Low); `team-together` (Low). No hard `shelf-classes` rule by default: the girls' 2026 layout put an eight on level 4 between two fours, so the convention is a preference.

The built-in fit rule's id is `fit`. A shelf's own limits (allowed classes, lane override, maximum boats and weight) report under rule ids `shelf:<id>:<key>`.

#### 9.3.4 Algorithm

Small inputs (at most ~40 boats, ~15 shelves) mean clarity beats cleverness. The packer is a deterministic greedy placement with a local-improvement pass.

1. **Normalize.** Apply `shelf-off`, `overhang`, `shelf-lanes`, and `max-boats` rules to produce effective shelves. Convert `pin` rules into locked placements. Keep `existing` locked placements; drop unlocked ones.
2. **Order boats.** Locked first (placed as given, validated; if invalid they are reported in `warnings` but kept). Then by class size descending (8+, then 4x/4+/4-, then 2x/2-/2+, then 1x), then weight descending, then earliest `firstRaceAt`, then name. Big boats first is what a loading crew does and it makes the greedy fill find room for small boats in leftover lane length.
3. **Candidates.** For each boat, enumerate `(shelf, lane, endPosition)` where `endPosition` is "front of lane" or "after the last boat in the lane". Reject candidates that violate any hard rule, recording the rejecting rule per candidate.
4. **Score.** Sum soft-rule scores for the candidate, computed against the partial layout so far. Add a small deterministic tiebreaker: prefer lower `accessRank`, then lower lane index, then front position.
5. **Place** the best candidate, attaching `reasons` (each hard rule that applied and each soft rule with nonzero score). If no candidate survives, add the boat to `unplaced` with the aggregated rejection reasons ("Every active shelf rejected this boat: 3 by 'Top rack holds only 8+ and 4+', 9 by 'must physically fit'").
6. **Improve.** Up to 200 iterations: pick the pair swap (two unlocked placements, or one placement and one empty candidate) that most improves the global score (side balance, unload order, team together); stop when no swap improves by more than 0.5. Swaps must keep all hard rules satisfied. Reasons are recomputed afterwards so they describe where each boat ended up, and boats left unplaced get one more try.
7. **Report** metrics and warnings (side imbalance beyond tolerance, rear overhang beyond a flag threshold, shelves over their weight limit, unplaced boats).

`validatePlacement` runs step 3's hard checks for a single candidate against the current layout and returns violations. `dropBoat` does the same for a drop into a cell, finding the offset first; a drop that breaks a hard rule is still returned, with `ok: false`, so the UI can refuse it or accept it flagged (§4.10).

#### 9.3.5 Test cases

1. Nine 8+ and six 4+ on a 41 ft, three-wide, five-level goalpost trailer definition (a test fixture, not a seeded trailer) all place (manufacturer rating, §16).
2. A tenth 8+ is unplaced with a reason naming the `fit` rule.
3. Two 1x (8.2 m each, 30 cm gap, 16.7 m total) pair end to end in one lane of a shelf with 18.0 m usable length; a third 1x goes to another lane; a 1x and a 2x (18.9 m with gap) do not pair on that shelf and the rejection names the `fit` rule.
4. `shelf-lanes` override to 3 on a shelf where computed lanes are 2 allows a third four.
5. `heavy-low` on a two-tier trailer puts the 8+ on tier 1 unless `shelf-classes` forbids it; with the default rule set, 8+ goes on top and the reasons name both rules.
6. `side-balance` on a center-post trailer alternates sides for equal boats; metrics report balance within tolerance.
7. Locked placement kept even when it scores badly; reported in warnings if it violates a hard rule.
8. `unload-order`: with two equal 4+ and one shelf ranked more accessible, the earlier-racing boat takes it.
9. Determinism: same input twice → deep-equal output.
10. `validatePlacement` rejects a move that would exceed lane length and names the rule.
11. `explain()` yields the sentences in the catalog table for each rule type with sample params.
12. Offset-post trailer: seven 8+ and five 4+ (the boys' 2026 Regionals load) all place on a five-level trailer with the SRA default rules, eights on the top levels, and the class grid matches `data/reference/trailer-layout-2026-regionals.md` up to the order within a level.
13. `outer_first` lane access: with two equal 4+ where one races first, the earlier boat lands in lane 1 (outside) and the reason names the unload-order rule.
14. `side-balance` on an offset-post trailer: the wide side's inner lane counts for neither side, so the coaches' boys' layout reports 339 kg against 294 kg with no warning; a load past the tolerance warns, naming the wide side's outer lane; a light load packs down the inner lane.

### 9.4 Load list derivation

```ts
export function deriveLoadList(input: { entries, shells, oarSets, gear, extras? }): DerivedLoadItem[];
export function mergeLoadItems(derived: DerivedLoadItem[], stored: LoadItem[]): MergedLoadList;
```

Shells from non-scratched entries (deduplicated), one `riggers` item per shell with quantity from `rigger_count` (skipped when `rigger_type = 'none'`), oar sets from entries (deduplicated; the quantity is the number of oars), gear with `default_load`, then extras. Both functions are pure; `mergeLoadItems` matches the result against stored `load_items` by `(kind, ref_id)` to preserve checkbox state, adding new rows and flagging orphaned ones.

### 9.5 Event schedule paste parser

```ts
export function parseSchedulePaste(text: string, options?: { year?: number; days?: string[] }): { rows: ParsedEvent[]; columns: ColumnGuess[]; confidence: number; raw: string[][] };
```

Splits on newlines, then tabs or commas (auto-detected), guesses columns by content (a token matching `^\d{1,3}[A-Z]?$` is an event number; `^\d{1,2}:\d{2}` is a time; a boat class regex finds `8+`, `4x+`, `2-`, `1x`, and words like "Eight", "Coxed Four", "Quad", "Double", "Single", "Pair"), and returns per-column guesses for the mapping step. A time from 1:00 to 5:59 without AM or PM reads as afternoon (§15). Tested against samples from RegattaCentral, a PDF copy-paste, and a Google Sheet.

---

## 10. Realtime, concurrency, and offline

### 10.1 Loading a regatta

One React Router loader per regatta route prefetches the working set through TanStack Query and the `DataStore` (§8.4). Query keys are namespaced by regatta id.

### 10.2 Writes

- Mutations are record-level and small: set a seat, change a shell, move an entry, toggle availability, move a placement.
- Optimistic updates through TanStack Query with rollback on error.
- Concurrency is last-write-wins at record granularity. Two coaches editing different entries never collide because seats are separate records. Two coaches editing the same seat within seconds resolve to the last write, and the loser's screen refreshes with a toast "Updated by Sarah W. just now".
- Those toasts are driven by `activity_log` rows (seats, events, placements, and load items carry no `updated_by`), coalesced within 2 s, and never shown for your own writes.
- Event times and load placements carry a stale-write check (`useGuardedUpdate`): the write sends the `updated` stamp the coach was looking at, and the server answers 409 if the record has changed since. The app rolls the change back, refetches, and says so. A coach's own rapid writes to one record queue instead of conflicting.

### 10.3 Realtime

- The `DataStore` exposes `subscribe(collection, handler)`. `PocketBaseStore` uses PocketBase realtime (server-sent events) and filters events to the open regatta client-side; `MemoryStore` emits the same events locally. On any change the store invalidates the affected query key; the working set refetches in the background and findings recompute.
- While a mutation is in flight, realtime refetches wait (up to 10 s), so the echo of your own write can't flicker the optimistic state.
- Presence: a `presence` collection with a 30 s heartbeat, one row per browser tab, renders avatars and "editing Girls lineups". Presence changes patch the cache instead of refetching.

### 10.4 Offline

- The PWA caches the app shell, and TanStack Query persists its cache to IndexedDB for 7 days, so a regatta opened recently is readable without a connection: schedule, lineups, load plan, load list.
- The saved copy is discarded when the app version or schema changes, skips presence, is restored only for the signed-in user, and is deleted on sign-out. Restored data is refetched in the background right after it loads, so a reload never shows a stale lineup for long.
- Offline, a banner shows and every action is disabled, comments included. A mutation refuses with one toast; writes never queue.
- The one exception is the share-link checklist (§4.8): ticks made offline queue in local storage on the phone and replay in order as desired states, so replaying is idempotent.
- Server-mode queries use `networkMode: 'online'` with a reachability probe; demo mode uses `'always'`. The service worker is off in `vite dev` unless `REGATTA_OPS_PWA_DEV=1`.

---

## 11. Repository layout and conventions

### 11.1 Layout

```
regatta-ops/
├── PLAN.md                      # this document
├── CLAUDE.md                    # conventions and commands
├── package.json                 # pnpm workspace root
├── pnpm-workspace.yaml
├── .github/workflows/           # ci.yml, pages.yml
├── apps/
│   └── web/
│       ├── index.html
│       ├── vite.config.ts
│       ├── scripts/             # icons, local rosters, the Pages build, roster sealing
│       ├── src/
│       │   ├── main.tsx
│       │   ├── app/             # router, providers, layout shell, theme, sign-in, the demo's unlock page
│       │   ├── components/      # shared UI: BoatStrip, ConflictBadge, chips, trailer/, ui/ (shadcn)
│       │   ├── features/
│       │   │   ├── regattas/
│       │   │   ├── events/
│       │   │   ├── schedule/
│       │   │   ├── lineups/
│       │   │   ├── availability/
│       │   │   ├── trailer/
│       │   │   ├── load-list/
│       │   │   ├── fleet/
│       │   │   ├── teams/
│       │   │   ├── trailers-admin/
│       │   │   ├── settings/
│       │   │   ├── share/
│       │   │   └── print/
│       │   ├── data/            # DataStore interface, PocketBaseStore, MemoryStore, hooks, pb-types.ts
│       │   ├── lib/             # utilities (dates, formatting, motion)
│       │   ├── pwa/             # offline banner, update prompt
│       │   └── styles/          # tokens.css, globals.css, print.css
│       └── e2e/                 # Playwright
├── backend/
│   ├── pb_migrations/           # PocketBase JS migrations (collections, rules, indexes)
│   ├── pb_hooks/                # sign-in allowlist, stamping, activity log, entries sync, share links, email
│   ├── seed/                    # loads the seed world into PocketBase
│   ├── scripts/                 # download.sh fetches the pinned binary into backend/bin/ (git-ignored)
│   ├── test/                    # rule and hook tests against a real PocketBase
│   └── pb_data/                 # local database (git-ignored)
├── data/
│   ├── reference/               # sanitized extracts used by seed and tests (committed)
│   └── *.xlsx                   # club workbooks; the ones with athlete names are git-ignored
├── packages/
│   ├── domain/                  # pure TS (§7.3, §9)
│   │   ├── src/
│   │   │   ├── boat-classes.ts
│   │   │   ├── conflicts/
│   │   │   ├── trailer/         # types, rules, packer, explain
│   │   │   ├── load-list.ts
│   │   │   ├── schedule-paste.ts
│   │   │   ├── publish.ts
│   │   │   ├── schemas/         # zod
│   │   │   └── index.ts
│   │   └── test/
│   └── seed/                    # pure TS: builds the seed world from data/reference (§14)
└── .gitignore                   # excludes roster and lineup workbooks, pb_data, bin
```

### 11.2 Conventions

`CLAUDE.md` holds the conventions and is the only copy: code style, package boundaries, data access, the rule that athlete names never enter the repository in plain text, UI wording, styling, accessibility, dependencies, migrations, commits, and the commands.

One naming note belongs here. The app was first named SRT (Sammamish Regatta Tool) and is now Regatta Ops, written in full in the UI, docs, and emails; identifiers use `regatta-ops` and environment variables `REGATTA_OPS_*`. Three things keep the old name on purpose: the migration files, which are never edited after merge; the collection ids (`srt_<name>`), which are stored in the database; and the seed's random prefix (`srt-seed:`), so the seed world stays the same.

### 11.3 CI

GitHub Actions on every pull request and on pushes to `main` and `dev`, in three jobs:

- **check:** typecheck, lint, the Prettier check, the domain package's coverage (threshold 90% of lines), unit tests, build.
- **backend:** the rule and hook tests against the pinned PocketBase binary.
- **e2e:** Playwright, after the other two: the phase demos on a demo-mode build, then a smoke suite on a real PocketBase migrated and seeded into a temporary data folder.

A second workflow, `pages.yml`, deploys the published demo (§7.1).

---

## 12. Phase demos

The app was built in four phases, each ending in a demo. The demos are the app's acceptance flows: `apps/web/e2e/phase0.spec.ts` to `phase3.spec.ts` run them (§13).

### 12.1 Demos

| Phase | Scope | Demo |
|---|---|---|
| **0. Foundations** | Repo, CI, design tokens, `DataStore` with both implementations, PocketBase collections and hooks, seed data, app shell, local sign-in | `pnpm dev` starts everything locally; sign in with a seeded account; see the navigation with seeded regattas; switch themes. `pnpm demo` shows the same app with no backend. |
| **1. Lineups** | Regattas, teams, rosters, availability, events, lineup builder, conflict engine, schedule, fleet inventory, print lineup sheet, realtime | Two coaches build boys' and girls' lineups for a seeded regatta, pick the same shell, see the hot seat, acknowledge it, print both sheets. |
| **2. Trailer** | Trailer admin, load list, packer, rules editor, interactive layout, load sheet, offline reads | Pack the trailer for that regatta, toggle a rule, drag a boat, read "Why here?", print the load sheet, open the load list on a phone in airplane mode. |
| **3. Reach and polish** | Share links, comments with mentions and email, CSV imports, athlete matrix view, notifications digest, isometric trailer view, offline checklist edits, photos | Parents open a share link on race day; the loading crew ticks the checklist on phones. |

---

## 13. Testing and quality

- **Unit (Vitest):** everything in `packages/domain` (90% of lines, every rule type and finding code). App-side utilities and data mappers.
- **Component (React Testing Library):** `BoatStrip` renders every class with correct seats and cox position; roster cross-off; pickers filter correctly; rule card sentences; trailer end view renders shelves and chips from a `PackResult`.
- **Integration (PocketBase local):** API rules per role; the domain allowlist hook; activity log hooks write the expected summaries; the entries sync hook; the 409 on stale writes; share links; mentions and email.
- **End to end (Playwright):** the phase demos in §12.1 as scripted flows on a demo-mode build (`pnpm test:e2e`), with a phone-viewport flow per phase, and a smoke suite on a real PocketBase migrated and seeded into a temporary data folder (`pnpm test:e2e:pb`). Both use invented athletes.
- **Accessibility:** Playwright runs axe (WCAG 2.1 A and AA, plus landmark and heading rules) on every main page in both themes and on a phone, checks reduced motion, checks for sideways scroll at 390 and 820 px and for 44 px targets on touch, and walks the keyboard paths of the lineup builder, dialogs, menus, schedule edits, and the trailer (`e2e/a11y.spec.ts`, `e2e/responsive.spec.ts`, `e2e/keyboard.spec.ts`).
- **Visual review:** UI changes are checked in light and dark at 1280 px and 390 px.
- **Performance budget:** regatta working set for 4 teams, 120 athletes, 60 events, 40 entries loads in under 1.5 s on a mid-range phone over 4G; findings recompute in under 50 ms; packing 40 boats in under 100 ms.

---

## 14. Seed data

`packages/seed` builds a realistic development world, pure and deterministic, so every screen has content. `backend/seed/` loads it into PocketBase and demo mode loads it into `MemoryStore`. The fleet is real (equipment names are not personal data). The seed exports its stable ids (`SEED_REGATTA_IDS`, `SEED_TEAM_IDS`, `SHELF_IDS`, `seedShellId`, and so on) for tests.

- **Club settings:** timezone America/Los_Angeles, weight unit lb, defaults: launch lead 40, race duration 10 (sprint) or 20 (head), return 15, hot seat min gap 15, athlete min gap 30, re-rig 30.
- **Users:** one admin, four coaches (one per team), one viewer, all email and password for local use.
- **Teams:** Junior boys (navy), Junior girls (raspberry), 5am masters (green), Evening masters (violet).
- **Athletes:** invented names. The junior teams have the shape of the club's fall 2026 rosters: 78 junior boys (9 coxswains) and 57 junior girls (8 coxswains) with the rosters' birth years (U15 to U19), novice and experienced levels, and the girls' grades, all active. Sides and a few scullers are assigned, since the rosters do not record them. 14 5am masters and 12 evening masters with ages spanning categories B to F; the one inactive athlete is on the evening masters.
- **Real junior rosters, locally:** `pnpm pb:seed`, `pb:reset`, and `pnpm demo` read the roster workbooks in `data/` (ignored by git; `@regatta-ops/seed/local-rosters`, a Node-only entry) and seed the real junior boys and girls, with the lineups and load plans built on them, in the local database and the local demo only; the production build carries none. A team without a workbook stays invented. `REGATTA_OPS_SEED_INVENTED=1` (set for the Playwright demo suite, and for any screenshot), the unit tests, CI, and the PocketBase e2e suite use the invented athletes. Roster athletes' ids come from their names, so they keep them as the roster changes. The boys' workbook marks new rowers in bold; they are seeded as novices. Names are never printed.
- **Published demo rosters:** `pnpm pages:seal` keeps first names and the fewest last-name letters that tell same-first-name teammates apart ("Avery R.", or "Avery Ro." and "Avery Ru."), and encrypts them with a password (PBKDF2-SHA256, 600,000 rounds, AES-256-GCM) into `data/reference/junior-rosters.sealed.json`, which is committed. The Pages build (§7.1) carries that file and opens on a password page in place of sign-in: the right password opens the rosters in the browser, the device remembers the key, and the app signs in as the admin. Sealing again with a new password makes every device ask again. The protection is light by design (the owner's call: one shared password, enough to keep strangers out). The site asks search engines not to index it.
- **Shells:** all 80 rows of `data/reference/shells.csv` (eights, fours, quads, pairs, doubles, singles, and the recreational fleet), with nicknames, weight classes, stroke sides, and locations. The two boats the sheet marks unusable are `out_of_service`; Fowler, whose notes say "do not row" though the sheet lists it as available, is `limited` (§15). Home team defaults from gender affinity (women's to Junior girls, men's to Junior boys) and can be corrected in the UI.
- **Oar sets:** all rows of `data/reference/oar-sets.csv` (16 men's and 15 women's sweep sets, 11 scull sets) with color codes, blades, lengths, inboards, grips.
- **Gear:** cox boxes (default load), slings (default load), tool kit (default load), tents, chairs, flags, caution tape, measuring tape, parts boxes, aluminum boat rack, straps (default load), from the trailer sheet's item lists.
- **Trailers:** "Boys trailer" and "Girls trailer", both `offset_post` with `post_offset_pct` 33 and five levels; each level is a `left` shelf (1 lane) and a `right` shelf (2 lanes, `outer_first`). Boats load bows forward. Dimensions are placeholders until measured (§15): boys' frame 1220 cm, girls' 1070 cm; left shelf width 75 cm, right shelf width 150 cm. Overhang is 250 cm front and 300 cm rear on the lower levels; the upper levels allow enough front overhang for a 19.9 m eight: 500 cm front on the boys' levels 3 to 5, and 600 cm front and 350 cm rear on the girls' levels 2 to 5. Bed zones, front to back: boys oars 0 to 610 cm, slings 610 to 760, riggers 760 to 1220; girls oars 0 to 535, slings 535 to 665, riggers 665 to 1070. Default rules per §9.3.3.
- **Regattas:**
  - *2025 USRowing Northwest Youth Championships* (Vancouver Lake, three days, status final) from `data/reference/schedule-sample-2025-nw-youth-champs.csv`: 44 boys' race rows forming 31 races (A and B crews share an event), with time trials on Friday and finals on Saturday and Sunday, plus the logistics items (bus departures, lunch, awards) and 14 invented girls' races. Junior boys entries are built for every race using the shells and oar sets the sheet names. The regatta carries `settings: { launchLeadMin: 75 }` (Vancouver Lake's long row to the start), which makes Live.Laugh.Love's turnaround from the 2V8 at 8:16 to the Novice 8 A at 9:52 a hot seat (§17.4); Lundberg as a 4x+ is the seeded re-rig. The boys' lineups are published. Draft load plans for both trailers mirror `trailer-layout-2026-regionals.md`, and a load list is seeded.
  - *Head of the Lake 2026* (Seattle, one day, head format, planning): 22 events, all four teams, 24 entries, availability set for a few athletes, and one cross-team hot seat and one shell conflict seeded on purpose.
  - *Tail of the Lake 2026*: events pasted, no entries.
  - *2025 Head of the Lake*, archived, with complete lineups for "copy lineups from".

---

## 15. Open questions

1. **Trailer measurements.** For each trailer: frame length, width of the one-hull side and the two-hull side, the bed zones, and roughly how far an eight hangs over the front and rear on the top level. A tape measure and two photos (end view, side view) settle it. Also: the 2026 layout sheet drew four levels of boats; is the fifth level normally used for boats, or is it effectively the bed?
2. **Google Workspace domain** for the sign-in allowlist, when deployment is near.
3. **Nicknames.** `data/reference/shells.csv` has an inferred `nickname` column from the lineup and trailer sheets. Two names used in schedules ("RSA", "Adrenaline") are not in the equipment master list; which shells are they?
4. **Truck loads.** The layout sheet puts slings and sculling riggers in truck beds. Is "container" free text enough, or should trucks be first-class like trailers?
5. **Oar identity.** Sweep sets are named "24-C" in the master list but "yellow-white" at the trailer. Every chip shows both, name first. Preference for which comes first?
6. **Absence form.** Keep the Google Form and import its CSV per regatta (§4.2), or retire it once coaches use Regatta Ops? The import does not read checkbox-list questions.
7. **Girls' team sheet.** The boys' workbook shaped the lineup builder; a look at how the girls' and masters' teams plan today would confirm nothing is missing for them.
8. **Hosting**, when ready: a $5 to $10 VPS or Fly.io app running PocketBase (recommended, one process, nightly backup), or PocketHost for zero ops.
9. **Club colors and logo** for the app icon and share pages; the accent stays lake teal until told otherwise.
10. **Afternoon times.** The paste parser reads 1:00 to 5:59 without AM or PM as afternoon, since club sheets write afternoon times on a 12-hour clock. Is that right for every schedule coaches paste?
11. **Rig patterns and bow-loaders.** Shells have no rig-pattern field, so bucket rigs are stored per entry as seat sides, and nothing marks a bow-loaded four. Worth two fields on the shell?
12. **Fowler.** Its notes say "do not row" but the sheet lists it as available; it is seeded `limited`. Is it out of service?
13. **Lane wording.** The trailer end view says "inner lane" and "outer lane" where pin rule sentences say "inside lane" and "outside lane". Which pair should both use?

---

## 16. Appendix A: Reference dimensions and trailer conventions

### 16.1 Boat class defaults

Used to prefill shell records and to size trailer placements. Lengths and beams vary by manufacturer and model; weights are World Rowing minimums, and club boats are usually heavier.

| Class | Rowers | Cox | Rigging | Oars | Length | Beam (max hull) | Min weight | Riggers (side / wing) |
|---|---|---|---|---|---|---|---|---|
| 1x | 1 | no | scull | 2 sculls | 8.2 m (27 ft) | 28 cm | 14 kg | 2 / 1 |
| 2x | 2 | no | scull | 4 sculls | 10.4 m (34 ft) | 35 cm | 27 kg | 4 / 2 |
| 2- | 2 | no | sweep | 2 sweeps | 10.4 m (34 ft) | 35 cm | 27 kg | 2 / 1 |
| 2+ | 2 | yes | sweep | 2 sweeps | 10.4 m (34 ft) | 38 cm | 32 kg | 2 / 1 |
| 4x | 4 | no | scull | 8 sculls | 13.4 m (44 ft) | 50 cm | 52 kg | 8 / 4 |
| 4x+ | 4 | yes | scull | 8 sculls | 13.4 m (44 ft) | 52 cm | 53 kg | 8 / 4 |
| 4+ | 4 | yes | sweep | 4 sweeps | 13.4 m (44 ft) | 52 cm | 51 kg | 4 / 2 |
| 4- | 4 | no | sweep | 4 sweeps | 13.4 m (44 ft) | 50 cm | 50 kg | 4 / 2 |
| 8+ | 8 | yes | sweep | 8 sweeps | 19.9 m (62 to 65 ft) | 57 cm | 96 kg | 8 / 4 |

Oars: sweep oars are about 370 to 376 cm; sculls about 285 to 292 cm. An oar box rated for a length of 380 cm holds either.

Sources: [World Rowing minimum weights and typical lengths](https://www.rowhq.app/us/glossary/rowing-shell), [Single scull](https://en.wikipedia.org/wiki/Single_scull), [Quadruple scull](https://en.wikipedia.org/wiki/Quadruple_scull), [Eight (rowing)](https://en.wikipedia.org/wiki/Eight_(rowing)), [Filippi F54 eight (51 cm beam)](https://www.filippiboats.com/eng/boats/competition/eight/f54), [Filippi singles (26 to 29.5 cm)](https://www.eliterowing.com/singles).

### 16.2 Trailer sizes and capacities

US manufacturers rate trailers by frame length, number of uprights ("racks") and arm levels per upright. The ratings imply a 3-boats-wide grid:

| Frame | Uprights × levels | Rated capacity | Implied grid |
|---|---|---|---|
| 41 ft | 3 × 5 | nine 8+ and six 4+ | 3 wide × 5 tiers = 15 bays |
| 39 ft | 3 × 4 | nine 8+ and three 4+ | 3 × 4 = 12 |
| 36 ft | 3 × 3 | six 8+ and three 4+ | 3 × 3 = 9 |
| 32 ft | 2 × 2 | three 4+ | small boats, customizable |

Other builders offer 3, 4, or 5 levels with a removable top rack, and either symmetrical columns (three equal, for fours and eights) or asymmetrical (narrow, wide, narrow, for clubs with many small boats). Legal trailer width in the US is 102 in (259 cm), so a full-width shelf is about 240 cm inside the uprights.

Sources: [MO Trailer Corp shell trailers](https://www.motrailers.com/shell-trailers/), [Vespoli trailers](https://vespoli.com/trailers/), [Perfect Balance Rowing trailers](https://www.perfectbalancerowing.com/trailers), [Mackay aluminium rowing shell series](https://mackaytrailers.com/aluminium-rowing-shell-series/).

### 16.3 Loading conventions (basis for the default rules)

- Long, unsplit boats (eights, fours) go on the top rack, where they clear the tow vehicle on turns; smaller boats fill lower tiers and leftover lane length, singles and doubles end to end.
- Put weight forward: overhang over the tow vehicle is preferred to overhang behind the trailer, and tongue weight should be near the maximum allowed for the hitch.
- Keep heavier boats low when the rack layout allows it.
- Boats are transported hull up with riggers removed; wing-riggered eights can be awkward on the outside of low tiers.
- Blunt ends (sterns) toward the tow vehicle is a common convention elsewhere; SRA loads bows forward, over the truck, and that is the default.

Sources: [X-Press Boat Club trailering guide](https://www.xpressbc.org.uk/safety/trailering), [rec.sport.rowing trailer loading thread](https://rec.sport.rowing.narkive.com/KJs7UNNV/trailer-loading), [SRA Rower's Handbook 2019 (trailer loading is a member responsibility; boats labeled by rack spot such as A6)](https://www.sammamishrowing.org/uploads/7/1/9/6/71968221/2019_sra_rowers_handbook.pdf).

### 16.4 SRA's trailers (from the owner and the 2026 Regionals layout sheet)

- Two trailers, boys' and girls' (smaller). Five rack levels each.
- Each level is an offset T: the post sits one third across; the narrow side takes one hull, the wide side takes two side by side, loaded from the outside in (no threading past the post). Three hulls per level, fifteen positions per trailer.
- Riggers always come off and ride in the bottom of the trailer with oars and slings, along its length: oars about the front half, slings a small section in the middle, riggers the rest of the back, full width. The bed is a box about 2 ft deep, and the first rack sits about 4 in above its walls.
- Convention: eights on the top two levels, fours below, small boats wherever they fit. The 2026 Regionals sheet shows the boys' trailer with seven eights and five fours (levels from the top: 8 8 8 / 8 8 8 / 8 4 4 / 4 4 4) and the girls' with four eights and seven fours (8 8 8 / 4+ 8 4+ / 4+ 4+ 4+ / — 4- 4-), so the convention is a strong preference, not a rule.
- Slings and sculling riggers rode in the tow trucks' beds that year; tents, chairs, and a parts box list travel with the trailers.

### 16.5 Overhang law (Washington)

- A load may not extend more than 15 ft beyond the center of the last axle (RCW 46.44.034).
- Loads extending more than 4 ft beyond the rear need red or orange flags at least 18 in square by day, and red lamps plus reflectors at night (RCW 46.37.140).
- Federal rules require states to allow boat transporters at least 3 ft of front and 4 ft of rear overhang; other states on SRA's travel routes (Oregon, British Columbia) have their own limits.

The packer treats these as parameters: the plan view draws a dashed line at the 4 ft flag threshold and warns beyond the shelf's rear maximum. Nothing in the tool is legal advice; the defaults should be checked against current law before each season.

Sources: [RCW 46.44.034](https://app.leg.wa.gov/RCW/default.aspx?cite=46.44.034), [RCW 46.37.140](https://app.leg.wa.gov/RCW/default.aspx?cite=46.37.140), [federal overhang minimums summary](https://heavyhaulandoversized.com/process/trailer-overhang-regulations/).

---

## 17. Appendix B: Sample JSON

### 17.1 Trailer definition (seeded "Boys trailer"; dimensions are placeholders until measured)

```json
{
  "id": "trl_boys",
  "name": "Boys trailer",
  "style": "offset_post",
  "postOffsetPct": 33,
  "frameLengthCm": 1220,
  "widthCm": 240,
  "bowForwardDefault": true,
  "shelves": [
    { "id": "l1", "label": "Level 1, narrow side", "tier": 1, "columnKey": "left",  "widthCm": 75,  "lengthCm": 1220, "frontOverhangMaxCm": 250, "rearOverhangMaxCm": 300, "laneAccess": "any",         "accessRank": 1, "active": true },
    { "id": "r1", "label": "Level 1, wide side",   "tier": 1, "columnKey": "right", "widthCm": 150, "lengthCm": 1220, "frontOverhangMaxCm": 250, "rearOverhangMaxCm": 300, "laneAccess": "outer_first", "accessRank": 1, "active": true },
    { "id": "l2", "label": "Level 2, narrow side", "tier": 2, "columnKey": "left",  "widthCm": 75,  "lengthCm": 1220, "frontOverhangMaxCm": 250, "rearOverhangMaxCm": 300, "laneAccess": "any",         "accessRank": 2, "active": true },
    { "id": "r2", "label": "Level 2, wide side",   "tier": 2, "columnKey": "right", "widthCm": 150, "lengthCm": 1220, "frontOverhangMaxCm": 250, "rearOverhangMaxCm": 300, "laneAccess": "outer_first", "accessRank": 2, "active": true },
    { "id": "l3", "label": "Level 3, narrow side", "tier": 3, "columnKey": "left",  "widthCm": 75,  "lengthCm": 1220, "frontOverhangMaxCm": 500, "rearOverhangMaxCm": 300, "laneAccess": "any",         "accessRank": 3, "active": true },
    { "id": "r3", "label": "Level 3, wide side",   "tier": 3, "columnKey": "right", "widthCm": 150, "lengthCm": 1220, "frontOverhangMaxCm": 500, "rearOverhangMaxCm": 300, "laneAccess": "outer_first", "accessRank": 3, "active": true },
    { "id": "l4", "label": "Level 4, narrow side", "tier": 4, "columnKey": "left",  "widthCm": 75,  "lengthCm": 1220, "frontOverhangMaxCm": 500, "rearOverhangMaxCm": 300, "laneAccess": "any",         "accessRank": 4, "active": true },
    { "id": "r4", "label": "Level 4, wide side",   "tier": 4, "columnKey": "right", "widthCm": 150, "lengthCm": 1220, "frontOverhangMaxCm": 500, "rearOverhangMaxCm": 300, "laneAccess": "outer_first", "accessRank": 4, "active": true },
    { "id": "l5", "label": "Top level, narrow side", "tier": 5, "columnKey": "left",  "widthCm": 75,  "lengthCm": 1220, "frontOverhangMaxCm": 500, "rearOverhangMaxCm": 300, "laneAccess": "any",         "accessRank": 5, "active": true },
    { "id": "r5", "label": "Top level, wide side",   "tier": 5, "columnKey": "right", "widthCm": 150, "lengthCm": 1220, "frontOverhangMaxCm": 500, "rearOverhangMaxCm": 300, "laneAccess": "outer_first", "accessRank": 5, "active": true }
  ],
  "compartments": [
    { "id": "oars",    "kind": "oar_rack",    "label": "Oars",    "capacity": 64, "startCm": 0,   "endCm": 610 },
    { "id": "slings",  "kind": "storage",     "label": "Slings",  "capacity": 16, "startCm": 610, "endCm": 760 },
    { "id": "riggers", "kind": "rigger_rack", "label": "Riggers", "capacity": 96, "startCm": 760, "endCm": 1220 }
  ]
}
```

### 17.2 Rule set

```json
[
  { "id": "r_fit", "type": "fit", "hard": true, "weight": 3, "enabled": true, "origin": "trailer",
    "params": { "clearanceCm": 15, "gapCm": 30 } },
  { "id": "r_eights_top", "type": "class-tier", "hard": false, "weight": 3, "enabled": true, "origin": "trailer",
    "params": { "classes": ["8+"], "tiers": [5, 4] } },
  { "id": "r_fours_mid", "type": "class-tier", "hard": false, "weight": 2, "enabled": true, "origin": "trailer",
    "params": { "classes": ["4+","4-","4x","4x+"], "tiers": [3, 2] } },
  { "id": "r_heavy_low", "type": "heavy-low", "hard": false, "weight": 1, "enabled": true, "origin": "trailer", "params": {} },
  { "id": "r_forward", "type": "forward-bias", "hard": false, "weight": 2, "enabled": true, "origin": "trailer", "params": {} },
  { "id": "r_balance", "type": "side-balance", "hard": false, "weight": 1, "enabled": true, "origin": "trailer",
    "params": { "tolerancePct": 20 } },
  { "id": "r_unload", "type": "unload-order", "hard": false, "weight": 1, "enabled": true, "origin": "trailer", "params": {} },
  { "id": "r_team", "type": "team-together", "hard": false, "weight": 1, "enabled": true, "origin": "trailer", "params": {} },
  { "id": "r_three_wide", "type": "shelf-lanes", "hard": true, "weight": 3, "enabled": true, "origin": "regatta",
    "params": { "shelfId": "r3", "lanes": 3, "classes": ["4+","4-","4x","4x+"] } }
]
```

The last rule is what a coach adds when they say "we can squeeze three fours on the wide side of level 3": it appears with the "This regatta" tag and can be turned off or deleted after the regatta. Side balance on an offset-post trailer compares the narrow side against the wide side's outer lane; the inner lane sits between the wheels and counts for neither. The tolerance is 20% on every trailer style, a 60/40 split between the two sides.

### 17.3 Pack result excerpt

```json
{
  "placements": [
    { "shellId": "sh_peggy", "shelfId": "r5", "lane": 1, "offsetCm": -500, "bowForward": true, "locked": false,
      "reasons": [
        { "ruleId": "r_fit", "hard": true, "text": "Fits: 19.9 m in 12.2 m plus 5.0 m front and 3.0 m rear overhang" },
        { "ruleId": "r_eights_top", "hard": false, "score": 30, "text": "Prefer eights on levels 5 and 4" },
        { "ruleId": "r_unload", "hard": false, "score": 5, "text": "Boats racing first should be easiest to reach (outer lane)" },
        { "ruleId": "r_forward", "hard": false, "score": -2, "text": "Put overhang in front, over the truck, rather than behind" }
      ] },
    { "shellId": "sh_laurel", "shelfId": "l2", "lane": 0, "offsetCm": 0, "bowForward": true, "locked": false,
      "reasons": [ { "ruleId": "r_fit", "hard": true, "text": "Fits end to end with Light Speed (16.7 m of 17.7 m including overhang)" } ] }
  ],
  "unplaced": [
    { "shellId": "sh_donq", "reasons": [ { "ruleId": "r_fit", "hard": true, "text": "No active shelf has a lane with 19.9 m free" } ] }
  ],
  "metrics": { "leftWeightKg": 192, "rightWeightKg": 384, "balancePct": 33.3, "perShelf": [] },
  "warnings": ["Wide side, outer lane is heavier than the narrow side: 33.3% apart (tolerance 20%)"]
}
```

### 17.4 Finding

```json
{
  "id": "f_8c1e…",
  "code": "SHELL_HOT_SEAT",
  "severity": "warning",
  "message": "Live.Laugh.Love (LLL) is also used by Novice 8+ A at 9:52; 71 minutes between the boat landing and the next race, less than the 75 minute launch lead.",
  "entryIds": ["ent_boys_2v8", "ent_boys_n8a"],
  "teamIds": ["team_boys"],
  "resource": { "type": "shell", "id": "sh_lll" },
  "day": "2025-05-16",
  "gapMin": 71,
  "acknowledged": false
}
```
