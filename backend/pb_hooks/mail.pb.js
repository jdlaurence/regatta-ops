/// <reference path="../pb_data/types.d.ts" />
// Mail setup (PLAN.md §4.6). See backend/README.md "Email".
//
// - SMTP from the environment on start: when SRT_SMTP_HOST is set, the SMTP settings (and the
//   sender from SRT_MAIL_FROM / SRT_MAIL_FROM_NAME) are written into PocketBase's settings, the
//   same ones the dashboard edits (Settings > Mail settings). Without SRT_SMTP_HOST the dashboard
//   values stand.
// - SRT_MAIL_CAPTURE=1: every outgoing email, SRT's and PocketBase's own, is stored in the
//   mail_outbox collection and not sent. Tests read it with a superuser client.

onBootstrap((e) => {
  e.next();
  const env = (name) => ($os.getenv(name) || '').trim();
  const host = env('SRT_SMTP_HOST');
  const from = env('SRT_MAIL_FROM');
  const fromName = env('SRT_MAIL_FROM_NAME');
  if (!host && !from && !fromName) return;
  try {
    const settings = e.app.settings();
    let changed = false;
    const put = (obj, key, value) => {
      if (obj[key] !== value) {
        obj[key] = value;
        changed = true;
      }
    };
    if (host) {
      const port = parseInt(env('SRT_SMTP_PORT') || '587', 10);
      put(settings.smtp, 'enabled', true);
      put(settings.smtp, 'host', host);
      put(settings.smtp, 'port', isNaN(port) ? 587 : port);
      put(settings.smtp, 'username', env('SRT_SMTP_USERNAME'));
      put(settings.smtp, 'password', env('SRT_SMTP_PASSWORD'));
      put(settings.smtp, 'tls', env('SRT_SMTP_TLS').toLowerCase() === 'true');
      put(settings.smtp, 'authMethod', env('SRT_SMTP_AUTH_METHOD').toUpperCase() || 'PLAIN');
      put(settings.smtp, 'localName', env('SRT_SMTP_LOCAL_NAME'));
    }
    if (from) put(settings.meta, 'senderAddress', from);
    if (fromName) put(settings.meta, 'senderName', fromName);
    if (changed) {
      e.app.save(settings);
      e.app.logger().info('SRT: mail settings applied from the environment', 'host', host);
    }
  } catch (err) {
    e.app.logger().error('SRT: could not apply mail settings', 'error', String(err));
  }
});

onMailerSend((e) => {
  if (($os.getenv('SRT_MAIL_CAPTURE') || '').trim() !== '1') return e.next();
  const m = e.message;
  const to = [];
  for (let i = 0; i < m.to.length; i++) to.push(m.to[i].address);
  let kind = '';
  try {
    kind = (m.headers && m.headers['X-SRT-Kind']) || '';
  } catch (_) {
    kind = '';
  }
  const record = new Record(e.app.findCollectionByNameOrId('mail_outbox'));
  record.set('to', to);
  record.set('subject', m.subject);
  record.set('text', m.text);
  record.set('html', m.html);
  record.set('kind', kind);
  e.app.save(record);
  // No e.next(): the message stops here and is not sent.
});
