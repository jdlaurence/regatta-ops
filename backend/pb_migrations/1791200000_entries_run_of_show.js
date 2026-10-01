/// <reference path="../pb_data/types.d.ts" />
// The run of show (PLAN.md §4.11, §8.1).
//
// - entries gain bow_number, clams, and oar_carriers (text), and warm_up_before_race_min,
//   boat_meeting_before_race_min, and launch_before_race_min: times typed for the crew in whole
//   minutes before its race. PocketBase has no null number, so 0 reads as "not typed".
// - club_settings.timing_defaults gains boat_meeting and warm-up leads (camelCase inside the JSON,
//   as the app writes it) where the stored record lacks them.

const TEXT = [
  ['bow_number', 20],
  ['clams', 40],
  ['oar_carriers', 200],
];
const MINUTES = ['warm_up_before_race_min', 'boat_meeting_before_race_min', 'launch_before_race_min'];
const TIMING = { boatMeetingLeadMin: 15, warmUpLeadMin: 30 };

// A json field reads back as raw bytes in the JS VM; its string form is the JSON text.
function timingOf(record) {
  const raw = record.getString('timing_defaults');
  const parsed = raw ? JSON.parse(raw) : null;
  return parsed && typeof parsed === 'object' ? parsed : {};
}

migrate(
  (app) => {
    const entries = app.findCollectionByNameOrId('srt_entries');
    for (const [name, max] of TEXT) {
      entries.fields.add(new Field({ id: 'entries__' + name, type: 'text', name: name, max: max }));
    }
    for (const name of MINUTES) {
      entries.fields.add(
        new Field({ id: 'entries__' + name, type: 'number', name: name, onlyInt: true }),
      );
    }
    app.save(entries);

    for (const record of app.findAllRecords('club_settings')) {
      record.set('timing_defaults', Object.assign({}, TIMING, timingOf(record)));
      app.save(record);
    }
  },
  (app) => {
    const entries = app.findCollectionByNameOrId('srt_entries');
    for (const [name] of TEXT) entries.fields.removeByName(name);
    for (const name of MINUTES) entries.fields.removeByName(name);
    app.save(entries);

    for (const record of app.findAllRecords('club_settings')) {
      const stored = timingOf(record);
      for (const key of Object.keys(TIMING)) delete stored[key];
      record.set('timing_defaults', stored);
      app.save(record);
    }
  },
);
