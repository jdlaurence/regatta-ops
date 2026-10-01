/// <reference path="../pb_data/types.d.ts" />
// Small guards and chores.
//
// - club_settings holds one record (§18): a second create is refused.
// - presence rows older than 2 minutes are pruned every minute (§8.1 presence). Deleted through
//   the app, so realtime subscribers see the deletes.

onRecordCreate((e) => {
  if (e.app.countRecords('club_settings') > 0) {
    throw new BadRequestError('Club settings already exist. Edit the existing record.');
  }
  e.next();
}, 'club_settings');

cronAdd('regatta_ops_presence_prune', '* * * * *', () => {
  const cutoff = new Date(Date.now() - 2 * 60 * 1000).toISOString().replace('T', ' ');
  const stale = $app.findRecordsByFilter(
    'presence',
    "seen_at < {:cutoff} || (seen_at = '' && updated < {:cutoff})",
    '',
    500,
    0,
    { cutoff: cutoff },
  );
  for (const record of stale) {
    try {
      $app.delete(record);
    } catch (err) {
      $app.logger().warn('Regatta Ops: presence prune failed', 'error', String(err));
    }
  }
});
