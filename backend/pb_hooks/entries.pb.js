/// <reference path="../pb_data/types.d.ts" />
// Entry consistency (PLAN.md §8.1 entries, §8.3). Model hooks, so they hold for every write path
// (API, batch, other hooks, the dashboard).
//
// - boat_class is copied from the event when an entry is created in an event or moves to another
//   event, and follows the event when the event's own boat class is edited.
// - hot_seat_ack_by is cleared when the entry's shell or event changes, unless the same write sets
//   a new acknowledgment. The conflict engine also compares hot_seat_fingerprint (§9.2), so an
//   acknowledgment never outlives the pairing it was given for.

onRecordCreate((e) => {
  const eventId = e.record.getString('event');
  if (eventId) {
    try {
      const ev = e.app.findRecordById('events', eventId);
      if (ev.getString('boat_class')) e.record.set('boat_class', ev.getString('boat_class'));
    } catch (_) {
      // Missing event: relation validation reports it.
    }
  }
  e.next();
}, 'entries');

onRecordUpdate((e) => {
  const r = e.record;
  const o = r.original();
  const eventId = r.getString('event');
  const eventChanged = eventId !== o.getString('event');
  const shellChanged = r.getString('shell') !== o.getString('shell');
  if (eventChanged && eventId) {
    try {
      const ev = e.app.findRecordById('events', eventId);
      if (ev.getString('boat_class')) r.set('boat_class', ev.getString('boat_class'));
    } catch (_) {
      // Missing event: relation validation reports it.
    }
  }
  const ackSetNow = r.getString('hot_seat_ack_by') !== o.getString('hot_seat_ack_by');
  if ((eventChanged || shellChanged) && !ackSetNow && r.getString('hot_seat_ack_by')) {
    r.set('hot_seat_ack_by', '');
  }
  e.next();
}, 'entries');

onRecordUpdate((e) => {
  const before = e.record.original().getString('boat_class');
  const after = e.record.getString('boat_class');
  e.next();
  if (!after || before === after) return;
  const entries = e.app.findRecordsByFilter('entries', 'event = {:id}', '', 0, 0, {
    id: e.record.id,
  });
  for (const entry of entries) {
    if (entry.getString('boat_class') !== after) {
      entry.set('boat_class', after);
      e.app.save(entry);
    }
  }
}, 'events');
