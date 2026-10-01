/// <reference path="../pb_data/types.d.ts" />
// The app is called Regatta Ops (PLAN.md §18). PocketBase puts the app name in its own emails
// and the dashboard.

migrate(
  (app) => {
    const settings = app.settings();
    settings.meta.appName = 'Regatta Ops';
    app.save(settings);
  },
  (app) => {
    const settings = app.settings();
    settings.meta.appName = 'SRT';
    app.save(settings);
  },
);
