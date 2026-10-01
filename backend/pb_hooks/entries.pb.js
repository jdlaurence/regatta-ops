/// <reference path="../pb_data/types.d.ts" />
// Entry consistency (PLAN.md §8.3): boat_class follows the entry's event, and a hot seat
// acknowledgment is cleared when the shell or event changes, unless the same write sets a new
// one. Model hooks, so they hold for every write path (API, batch, other hooks, the dashboard).

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
