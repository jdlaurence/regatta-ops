/// <reference path="../pb_data/types.d.ts" />
// App settings: name, and the batch API (transactional multi-record writes, used by the seed and
// by the app for moves that touch several records, such as swapping two seats).

migrate(
  (app) => {
    const settings = app.settings();
    settings.meta.appName = 'SRT';
    settings.batch.enabled = true;
    settings.batch.maxRequests = 200;
    settings.batch.timeout = 10;
    app.save(settings);
  },
  (app) => {
    const settings = app.settings();
    settings.meta.appName = 'Acme';
    settings.batch.enabled = false;
    app.save(settings);
  },
);
