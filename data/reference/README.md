# Reference data

Derived from the club spreadsheets in `data/` on 2026-09-29. These files exist so the build team never has to open the workbooks.

| File | Source | Use |
|---|---|---|
| `shells.csv` | SRA Equipment Master List, Boats sheet | Seed the fleet. `nickname` is inferred from lineup and trailer sheets; verify with coaches. `compatible_classes`, `stroke_side`, and `cox_position` are inferred from the sheet's grouping, rig column, and the lineup workbook's boat list; verify before relying on them. |
| `oar-sets.csv` | SRA Equipment Master List, Oars sheet | Seed oar sets. Sweep sets are identified by color code at the trailer. Scull sets are named by color. |
| `schedule-sample-2025-nw-youth-champs.csv` | Junior boys lineups workbook, published 3-day schedule | Fixture for the schedule paste parser and for a seeded multi-day regatta. Athlete names removed. Afternoon times were written on a 12-hour clock in the sheet and have been converted. |
| `junior-rosters.sealed.json` | Junior boys and girls roster workbooks, through `pnpm pages:seal` | The published demo's athletes: first names and short last names, encrypted with the demo password (PLAN.md §18). Not readable without the password. |
| `trailer-layout-2026-regionals.md` | 2026 Regionals trailer layout sheet | The two trailers, what went on each, and the class-level grid coaches drew. |

Rules:

- The workbooks with rosters, absences, and lineups contain names of minors. They are ignored by git and must never be copied into code, seed data, tests, screenshots, or documentation. Seed athletes are invented. The one exception is `junior-rosters.sealed.json`, which holds shortened names encrypted with the published demo's password.
- `pnpm pb:seed`, `pb:reset`, and `pnpm demo` read the roster workbooks at run time (`packages/seed/src/local-rosters.ts`) and put the real junior athletes in the local database and the local demo only. Nothing derived from them is written to the repository. `REGATTA_OPS_SEED_INVENTED=1` keeps the invented athletes, for screenshots.
- Equipment names (shells, oar sets) are fine to use anywhere.
