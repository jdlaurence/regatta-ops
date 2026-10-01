// A few comments and activity log rows so the overview and entry threads have content. Presence
// and share links stay empty.

import {
  athleteName,
  stableId,
  type ActivityEntry,
  type Comment,
  type Entry,
  type Id,
  type World,
} from '@regatta-ops/domain';
import { SEED_REGATTA_IDS, SEED_TRAILER_IDS, SEED_USER_IDS, teamId, type TeamKey } from './ids';

function entryOf(w: World, regattaId: Id, team: TeamKey, label: string): Entry {
  const e = w.entries.find(
    (x) => x.regattaId === regattaId && x.teamId === teamId(team) && x.label === label,
  );
  if (!e) throw new Error(`No ${team} entry ${label} in ${regattaId}`);
  return e;
}

export function addComments(w: World): void {
  const nw = SEED_REGATTA_IDS.nwYouth2025;
  const hotl = SEED_REGATTA_IDS.headOfTheLake2026;
  const nwNovice8 = w.entries.find(
    (e) =>
      e.regattaId === nw &&
      e.label === 'N8 A' &&
      w.events.find((ev) => ev.id === e.eventId)?.stage === 'time_trial',
  )!;
  const boysPlan = w.load_plans.find(
    (p) => p.regattaId === nw && p.trailerId === SEED_TRAILER_IDS.boys,
  )!;
  const mixed8Event = w.events.find((e) => e.regattaId === hotl && e.name === 'Mixed Masters 8+')!;
  const comments: (Omit<Comment, 'id'> & { created: string })[] = [
    {
      targetType: 'entry',
      targetId: nwNovice8.id,
      authorId: SEED_USER_IDS.coachBoys,
      body: 'LLL comes straight off the 2V dock for this one. The novice cox meets them at the launch dock with the cox box.',
      created: '2025-05-13T02:10:00.000Z',
    },
    {
      targetType: 'load_plan',
      targetId: boysPlan.id,
      authorId: SEED_USER_IDS.admin,
      body: 'Spencer quad riggers ride in Truck 2 with the sculling riggers.',
      created: '2025-05-14T18:30:00.000Z',
    },
    {
      targetType: 'entry',
      targetId: entryOf(w, hotl, '5am', 'W8').id,
      authorId: SEED_USER_IDS.coachFiveAm,
      body: '@Dana Whitcombe can we take Hendo straight from your V8 B? Hand-off at dock B.',
      created: '2026-09-22T15:05:00.000Z',
    },
    {
      targetType: 'entry',
      targetId: entryOf(w, hotl, 'evening', 'M4+').id,
      authorId: SEED_USER_IDS.coachBoys,
      body: 'Kokanee is in the boys V4+ at 11:15. Could the evening crew take Trust instead?',
      created: '2026-09-24T03:40:00.000Z',
    },
    {
      targetType: 'event',
      targetId: mixed8Event.id,
      authorId: SEED_USER_IDS.coachEvening,
      body: 'Start moved from 14:45 to 15:00 in the latest regatta update.',
      created: '2026-09-25T17:20:00.000Z',
    },
  ];
  comments.forEach((c, i) => w.comments.push({ id: stableId(`comment:${i}`), ...c }));
}

export function addActivity(w: World): void {
  const nw = SEED_REGATTA_IDS.nwYouth2025;
  const hotl = SEED_REGATTA_IDS.headOfTheLake2026;
  const totl = SEED_REGATTA_IDS.tailOfTheLake2026;
  const archived = SEED_REGATTA_IDS.headOfTheLake2025;
  const shellName = (id: Id | null | undefined) => {
    const s = w.shells.find((x) => x.id === id);
    return s ? (s.nickname ?? s.name) : '';
  };
  const unavailable = w.availability.find((a) => a.regattaId === hotl && a.reason)!;
  const out = w.athletes.find((a) => a.id === unavailable.athleteId)!;
  const girlsV8 = entryOf(w, hotl, 'girls', 'V8 A');
  const fiveAmW8 = entryOf(w, hotl, '5am', 'W8');
  const eveningM4 = entryOf(w, hotl, 'evening', 'M4+');
  const nwEvents = w.events.filter((e) => e.regattaId === nw);
  const totlEvents = w.events.filter((e) => e.regattaId === totl);
  const rows: (Omit<ActivityEntry, 'id'> & { created: string })[] = [
    {
      regattaId: nw,
      actorId: SEED_USER_IDS.coachBoys,
      action: 'create',
      targetType: 'regattas',
      targetId: nw,
      summary: 'created regatta 2025 USRowing Northwest Youth Championships',
      created: '2025-04-20T02:00:00.000Z',
    },
    {
      regattaId: nw,
      actorId: SEED_USER_IDS.coachBoys,
      action: 'create',
      targetType: 'events',
      targetId: nwEvents[0]!.id,
      summary: `imported ${nwEvents.length} schedule lines from a pasted schedule`,
      created: '2025-04-20T02:12:00.000Z',
    },
    {
      regattaId: nw,
      actorId: SEED_USER_IDS.coachBoys,
      action: 'update',
      targetType: 'regatta_teams',
      targetId: stableId('regatta_team:nw-youth-2025:boys'),
      summary: 'published Junior boys lineups',
      created: '2025-05-14T04:00:00.000Z',
    },
    {
      regattaId: archived,
      actorId: SEED_USER_IDS.admin,
      action: 'update',
      targetType: 'regattas',
      targetId: archived,
      summary: 'archived regatta 2025 Head of the Lake',
      diff: { status: { from: 'final', to: 'archived' } },
      created: '2026-01-10T19:00:00.000Z',
    },
    {
      regattaId: hotl,
      actorId: SEED_USER_IDS.admin,
      action: 'create',
      targetType: 'regattas',
      targetId: hotl,
      summary: 'created regatta Head of the Lake',
      created: '2026-09-15T16:00:00.000Z',
    },
    {
      regattaId: hotl,
      actorId: SEED_USER_IDS.coachGirls,
      action: 'create',
      targetType: 'entries',
      targetId: girlsV8.id,
      summary: "added entry Girls V8 A in Event 8, Women's Youth 8+",
      created: '2026-09-20T01:30:00.000Z',
    },
    {
      regattaId: hotl,
      actorId: SEED_USER_IDS.coachFiveAm,
      action: 'update',
      targetType: 'entries',
      targetId: fiveAmW8.id,
      summary: `set shell ${shellName(fiveAmW8.shellId)} on 5am W8`,
      diff: { shell: { from: null, to: shellName(fiveAmW8.shellId) } },
      created: '2026-09-22T15:02:00.000Z',
    },
    {
      regattaId: hotl,
      actorId: SEED_USER_IDS.coachBoys,
      action: 'update',
      targetType: 'availability',
      targetId: unavailable.id,
      summary: `marked ${athleteName(out)} unavailable for Head of the Lake`,
      diff: { status: { from: 'available', to: 'unavailable' } },
      created: '2026-09-23T04:15:00.000Z',
    },
    {
      regattaId: hotl,
      actorId: SEED_USER_IDS.coachEvening,
      action: 'update',
      targetType: 'entries',
      targetId: eveningM4.id,
      summary: `set shell ${shellName(eveningM4.shellId)} on Evening M4+`,
      diff: { shell: { from: 'Trust', to: shellName(eveningM4.shellId) } },
      created: '2026-09-24T02:55:00.000Z',
    },
    {
      regattaId: totl,
      actorId: SEED_USER_IDS.coachGirls,
      action: 'create',
      targetType: 'events',
      targetId: totlEvents[0]!.id,
      summary: `imported ${totlEvents.length} events from a pasted schedule`,
      created: '2026-09-26T20:40:00.000Z',
    },
  ];
  rows.forEach((r, i) => w.activity_log.push({ id: stableId(`activity:${i}`), ...r }));
}
