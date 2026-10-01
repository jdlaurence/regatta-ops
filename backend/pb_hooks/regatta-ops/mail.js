// Outgoing email for mentions and notifications (backend/README.md "Email"). send() delivers one
// plain-text message through PocketBase's mailer, writes it to the log when SMTP is not
// configured, or stores it in mail_outbox under REGATTA_OPS_MAIL_CAPTURE=1. It never throws: an
// email problem must never fail the edit that caused it.

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
