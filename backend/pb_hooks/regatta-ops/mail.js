// Outgoing email for mentions and notifications (PLAN.md §4.6).
//
// - send() delivers one plain-text message through PocketBase's mailer (SMTP settings from the
//   dashboard or from REGATTA_OPS_SMTP_* on start, see mail.pb.js). It never throws: an email problem must
//   never fail the edit that caused it.
// - Without SMTP configured, Regatta Ops does not fall back to the system `sendmail`: it writes the message
//   to the PocketBase log and moves on (local development).
// - REGATTA_OPS_MAIL_CAPTURE=1 turns every outgoing email into a mail_outbox row instead (mail.pb.js), so
//   tests can read what would have been sent.
// - Links in emails start with REGATTA_OPS_APP_URL (default http://localhost:5173, the Vite dev server).

function appUrl() {
  const raw = ($os.getenv('REGATTA_OPS_APP_URL') || '').trim() || 'http://localhost:5173';
  return raw.replace(/\/+$/, '');
}

function captureOn() {
  return ($os.getenv('REGATTA_OPS_MAIL_CAPTURE') || '').trim() === '1';
}

/** A user's preferences json as a plain object ({} when unset or unreadable). */
function preferences(user) {
  try {
    const parsed = JSON.parse(user.getString('preferences') || 'null');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch (_) {
    return {};
  }
}

/** { address, name } for a users record, or null when it has no email. */
function recipient(user) {
  const address = (user && user.email()) || '';
  if (!address) return null;
  return { address: address, name: user.getString('name') };
}

/**
 * @param app PocketBase app
 * @param opts { to: { address, name }, subject, text, kind: 'mention' | 'entry_change' | 'digest' }
 * @returns true when the message was handed to the mailer (or captured)
 */
function send(app, opts) {
  const to = opts.to;
  if (!to || !to.address) return false;
  const settings = app.settings();
  if (!settings.smtp.enabled && !captureOn()) {
    app
      .logger()
      .info(
        'Regatta Ops: email not sent because SMTP is not configured',
        'kind',
        opts.kind,
        'to',
        to.address,
        'subject',
        opts.subject,
        'text',
        opts.text,
      );
    return false;
  }
  try {
    const message = new MailerMessage({
      from: { address: settings.meta.senderAddress, name: settings.meta.senderName },
      to: [{ address: to.address, name: to.name || '' }],
      subject: opts.subject,
      text: opts.text,
      headers: { 'X-Regatta-Ops-Kind': opts.kind || 'other' },
    });
    app.newMailClient().send(message);
    return true;
  } catch (err) {
    app
      .logger()
      .error(
        'Regatta Ops: email failed',
        'kind',
        opts.kind,
        'to',
        to.address,
        'error',
        String(err),
      );
    return false;
  }
}

module.exports = { appUrl, captureOn, preferences, recipient, send };
