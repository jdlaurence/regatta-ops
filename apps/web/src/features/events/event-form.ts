// The event form (PLAN.md §4.3): a race or a logistics line. The form works in wall-clock
// time ('HH:mm', blank for TBD) on one of the regatta's days; the record stores an instant.

import { z } from 'zod';
import {
  BOAT_CLASSES,
  instantToZoned,
  zonedToInstant,
  type BoatClass,
  type EventStage,
  type RegattaEvent,
} from '@srt/domain';
import type { CreateInput } from '@/data';

export const STAGE_LABELS: Record<EventStage, string> = {
  race: 'Single race',
  heat: 'Heat',
  semi: 'Semifinal',
  final: 'Final',
  time_trial: 'Time trial',
};

export const STAGES = ['race', 'heat', 'semi', 'final', 'time_trial'] as const;

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/** The form schema for a regatta with these days. */
export function eventFormSchema(days: readonly string[]) {
  return z
    .object({
      kind: z.enum(['race', 'logistics']),
      eventNumber: z.string().trim().max(8, 'Keep the event number to 8 characters, like 14A'),
      name: z.string().trim().min(1, 'Enter a name'),
      boatClass: z.union([z.enum(BOAT_CLASSES), z.literal('')]),
      category: z.string().trim(),
      day: z.string().refine((d) => days.includes(d), 'Choose one of the regatta days'),
      time: z.string().refine((t) => t === '' || TIME.test(t), 'Enter a time like 09:40'),
      stage: z.enum(STAGES),
      progressionGroup: z.string().trim(),
      teamFilter: z.array(z.string()),
      notes: z.string().trim(),
    })
    .refine((v) => v.kind !== 'race' || v.boatClass !== '', {
      message: 'Choose a boat class for a race',
      path: ['boatClass'],
    });
}

export type EventFormValues = z.infer<ReturnType<typeof eventFormSchema>>;

export function newEventDefaults(opts: {
  day: string;
  kind?: RegattaEvent['kind'];
}): EventFormValues {
  return {
    kind: opts.kind ?? 'race',
    eventNumber: '',
    name: '',
    boatClass: '',
    category: '',
    day: opts.day,
    time: '',
    stage: 'race',
    progressionGroup: '',
    teamFilter: [],
    notes: '',
  };
}

export function eventToForm(e: RegattaEvent, timezone: string): EventFormValues {
  return {
    kind: e.kind,
    eventNumber: e.eventNumber ?? '',
    name: e.name,
    boatClass: e.boatClass ?? '',
    category: e.category ?? '',
    day: e.day,
    time: e.scheduledAt ? instantToZoned(e.scheduledAt, timezone).time : '',
    stage: e.stage ?? 'race',
    progressionGroup: e.progressionGroup ?? '',
    teamFilter: e.teamFilter ?? [],
    notes: e.notes ?? '',
  };
}

/**
 * The event fields the form sets. Races drop the team filter; logistics lines drop class and
 * stage. Empty text is stored as '' so an edit can clear a field.
 */
export function formToEventFields(
  v: EventFormValues,
  timezone: string,
): Omit<CreateInput<RegattaEvent>, 'regattaId' | 'sortOrder'> {
  const race = v.kind === 'race';
  return {
    kind: v.kind,
    eventNumber: v.eventNumber.trim(),
    name: v.name.trim(),
    boatClass: race ? (v.boatClass as BoatClass) : null,
    category: v.category.trim(),
    day: v.day,
    scheduledAt: v.time ? zonedToInstant(v.day, v.time, timezone) : null,
    stage: race ? v.stage : null,
    progressionGroup: race ? v.progressionGroup.trim() : '',
    teamFilter: race ? [] : v.teamFilter,
    notes: v.notes.trim(),
  };
}

/** The next sortOrder after every event of the regatta. */
export function nextSortOrder(events: readonly Pick<RegattaEvent, 'sortOrder'>[]): number {
  return events.reduce((m, e) => Math.max(m, e.sortOrder), 0) + 1;
}

/** "Event 14, Men's Junior 8+" or the logistics text. */
export function eventTitle(e: Pick<RegattaEvent, 'kind' | 'eventNumber' | 'name'>): string {
  if (e.kind === 'race' && e.eventNumber) return `Event ${e.eventNumber}, ${e.name}`;
  return e.name;
}
