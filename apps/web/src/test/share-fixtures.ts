// A world for share-link tests: the web fixture world plus a published boys snapshot (with
// fields the projection must drop), an unpublished girls draft, logistics lines, a load list,
// share links, and private notes that must never reach a link. Every name is invented.

import { zonedToInstant, type PublishedSnapshot, type World } from '@regatta-ops/domain';
import { MemoryStore } from '@/data/memory-store';
import { fixtureWorld, IDS } from '@/test/fixtures';

const TZ = 'America/Los_Angeles';

export const SHARE_IDS = {
  event3: 'event3000000001',
  entry8: 'entry8000000001',
  girlsDraft: 'entrygirls00001',
  lunch: 'eventlunch00001',
  girlsMeeting: 'eventgirlsmeet1',
  otherRegattaItem: 'itemforeign0001',
  coxBoxes: 'itemcoxboxes001',
  slings: 'itemslings00001',
  spencer: 'itemspencer0001',
  wideLink: 'linkwide0000001',
  boysLink: 'linkboys0000001',
  girlsLink: 'linkgirls000001',
  loadLink: 'linkload0000001',
  revokedLink: 'linkrevoked0001',
};

/** 40-character tokens, like the server's. */
export const TOKENS = {
  wide: 'WideRegattaToken0000000000000000000000000',
  boys: 'BoysOnlyToken000000000000000000000000000',
  girls: 'GirlsOnlyToken00000000000000000000000000',
  load: 'LoadListToken000000000000000000000000000',
  revoked: 'RevokedToken0000000000000000000000000000',
};

export const PUBLISHED_AT = '2026-10-30T04:00:00.000Z';

export function shareWorld(): World {
  const w = fixtureWorld();
  const regatta = w.regattas.find((r) => r.id === IDS.regatta)!;
  regatta.endDate = '2026-11-02';
  regatta.notes = 'Regatta notes';
  w.athletes[0]!.notes = 'Private note';
  w.entries[0]!.notes = 'Entry notes';

  w.events.push(
    {
      id: SHARE_IDS.event3,
      regattaId: IDS.regatta,
      kind: 'race',
      eventNumber: '20',
      name: "Men's Junior 8+",
      boatClass: '8+',
      day: '2026-11-02',
      scheduledAt: zonedToInstant('2026-11-02', '11:05', TZ),
      stage: 'final',
      sortOrder: 3,
      notes: 'Event notes',
    },
    {
      id: SHARE_IDS.lunch,
      regattaId: IDS.regatta,
      kind: 'logistics',
      name: 'Lunch at the tent',
      day: '2026-11-01',
      scheduledAt: zonedToInstant('2026-11-01', '12:00', TZ),
      sortOrder: 4,
      notes: 'Logistics notes',
    },
    {
      id: SHARE_IDS.girlsMeeting,
      regattaId: IDS.regatta,
      kind: 'logistics',
      name: 'Girls cox meeting',
      day: '2026-11-01',
      scheduledAt: zonedToInstant('2026-11-01', '08:00', TZ),
      teamFilter: [IDS.girls],
      sortOrder: 5,
    },
  );

  // The girls' coach has a draft that was never published: it must not show on any link.
  w.entries.push({
    id: SHARE_IDS.girlsDraft,
    regattaId: IDS.regatta,
    eventId: IDS.event2,
    teamId: IDS.girls,
    label: 'Girls draft crew',
    boatClass: '8+',
    status: 'draft',
  });

  const snapshot = {
    publishedAt: PUBLISHED_AT,
    publishedBy: IDS.coach,
    entries: [
      {
        entryId: IDS.entry1,
        label: 'V4+',
        boatClass: '4+',
        status: 'planned',
        eventId: IDS.event1,
        eventName: "Men's Junior 4+",
        eventNumber: '12',
        day: '2026-11-01',
        scheduledAt: zonedToInstant('2026-11-01', '09:40', TZ),
        stage: 'race',
        shellId: IDS.shell,
        shellName: 'Spencer',
        oarSetId: IDS.oars,
        oarSetName: '24-C',
        hotSeatPlan: 'Meet at dock B',
        seats: [
          { seat: '1', athleteId: 'athboys00000001', athleteName: 'Rowan Test' },
          { seat: '2', athleteId: 'athboys00000002', athleteName: 'Emery Sample' },
        ],
        // Not part of a published entry: the projection must drop it.
        notes: 'Snapshot secret',
        coachEmail: 'coach.boys@regatta-ops.local',
      },
      {
        entryId: SHARE_IDS.entry8,
        label: 'V8',
        boatClass: '8+',
        status: 'planned',
        eventId: SHARE_IDS.event3,
        eventName: "Men's Junior 8+",
        eventNumber: '20',
        day: '2026-11-02',
        scheduledAt: zonedToInstant('2026-11-02', '11:05', TZ),
        stage: 'final',
        shellId: IDS.shell2,
        shellName: 'Monahan',
        oarSetId: null,
        seats: [{ seat: '8', athleteId: 'athboys00000001', athleteName: 'Rowan Test' }],
      },
    ],
  } as unknown as PublishedSnapshot;
  const rtBoys = w.regatta_teams.find((r) => r.teamId === IDS.boys)!;
  rtBoys.publishedAt = PUBLISHED_AT;
  rtBoys.publishedSnapshot = snapshot;
  rtBoys.notes = 'Team notes';

  w.load_plans.push({
    id: IDS.plan,
    regattaId: IDS.regatta,
    trailerId: IDS.trailer,
    status: 'draft',
    rules: [],
    notes: 'Plan notes',
  });
  w.load_items.push(
    {
      id: SHARE_IDS.spencer,
      regattaId: IDS.regatta,
      loadPlanId: IDS.plan,
      kind: 'shell',
      refId: IDS.shell,
      label: 'Spencer',
      quantity: 1,
      container: '',
      loadedAt: '2026-10-31T23:10:00.000Z',
      loadedBy: IDS.coach,
      notes: 'Item notes',
    },
    {
      id: SHARE_IDS.slings,
      regattaId: IDS.regatta,
      loadPlanId: null,
      kind: 'gear',
      label: 'Slings',
      quantity: 6,
      container: 'Truck 1 bed',
    },
    {
      id: SHARE_IDS.coxBoxes,
      regattaId: IDS.regatta,
      loadPlanId: IDS.plan,
      kind: 'gear',
      label: 'Cox boxes',
      quantity: 4,
      container: 'Boys trailer bed',
    },
    {
      id: SHARE_IDS.otherRegattaItem,
      regattaId: IDS.other,
      kind: 'extra',
      label: 'Somebody else’s tent',
      quantity: 1,
    },
  );

  const link = (id: string, token: string, extra: object = {}) => ({
    id,
    regattaId: IDS.regatta,
    teamId: null,
    token,
    canCheckLoad: false,
    revokedAt: null,
    createdBy: IDS.coach,
    created: '2025-10-29T18:00:00.000Z',
    ...extra,
  });
  w.share_links.push(
    link(SHARE_IDS.wideLink, TOKENS.wide),
    link(SHARE_IDS.boysLink, TOKENS.boys, { teamId: IDS.boys }),
    link(SHARE_IDS.girlsLink, TOKENS.girls, { teamId: IDS.girls }),
    link(SHARE_IDS.loadLink, TOKENS.load, { canCheckLoad: true }),
    link(SHARE_IDS.revokedLink, TOKENS.revoked, { revokedAt: '2026-10-30T12:00:00.000Z' }),
  );
  return w;
}

/** A MemoryStore on the share world; nobody signed in unless asked (parents are not). */
export function shareStore(
  opts: { signedIn?: string | null; now?: () => string } = {},
): MemoryStore {
  return new MemoryStore({
    world: shareWorld(),
    userId: opts.signedIn ?? null,
    now: opts.now,
    reseed: shareWorld,
  });
}
