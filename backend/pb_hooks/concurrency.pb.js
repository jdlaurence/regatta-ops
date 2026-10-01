/// <reference path="../pb_data/types.d.ts" />
// Stale-write check (PLAN.md §8.3, §10.2). For events and load placements, a client may
// send `expected_updated` (the record's `updated` value as it last saw it) with an update. If the
// stored record has changed since, the write is refused with 409 and the client refetches.
// Without `expected_updated` the write is last-write-wins, as everywhere else.

onRecordUpdateRequest(
  (e) => {
    const body = e.requestInfo().body || {};
    const expected = body['expected_updated'];
    if (expected) {
      const norm = (v) =>
        String(v || '')
          .trim()
          .replace('T', ' ');
      const current = e.record.original().getString('updated');
      if (norm(expected) !== norm(current)) {
        throw new ApiError(
          409,
          'Someone else changed this since you loaded it. Refresh and try again.',
          {
            updated: current,
          },
        );
      }
    }
    e.next();
  },
  'events',
  'load_placements',
);
