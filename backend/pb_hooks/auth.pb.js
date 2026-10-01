/// <reference path="../pb_data/types.d.ts" />
// Sign-in and roles (PLAN.md §8.3; backend/README.md "Hooks" and "Configuration"): the Google
// provider from the environment, the sign-in domain allowlist, and the default role.

onBootstrap((e) => {
  e.next();
  const clientId = ($os.getenv('REGATTA_OPS_GOOGLE_CLIENT_ID') || '').trim();
  const clientSecret = ($os.getenv('REGATTA_OPS_GOOGLE_CLIENT_SECRET') || '').trim();
  if (!clientId) return;
  try {
    const users = e.app.findCollectionByNameOrId('users');
    const current = users.oauth2.getProviderConfig('google');
    const found = current[1];
    const config = current[0];
    if (
      users.oauth2.enabled &&
      found &&
      config.clientId === clientId &&
      config.clientSecret === clientSecret
    ) {
      return;
    }
    unmarshal(
      {
        oauth2: {
          enabled: true,
          providers: [{ name: 'google', clientId: clientId, clientSecret: clientSecret }],
        },
      },
      users,
    );
    e.app.save(users);
    e.app.logger().info('Regatta Ops: Google sign-in enabled from REGATTA_OPS_GOOGLE_CLIENT_ID');
  } catch (err) {
    e.app.logger().error('Regatta Ops: could not configure Google sign-in', 'error', String(err));
  }
});

// Google sign-in: reject outside domains before an account exists; new accounts are coaches.
onRecordAuthWithOAuth2Request((e) => {
  const allowlist = require(`${__hooks}/regatta-ops/allowlist.js`);
  // The Go field OAuth2User is exposed as `oAuth2User` (see pb_data/types.d.ts). This is the
  // email the provider verified; empty when it could not verify one.
  const email = (e.oAuth2User && e.oAuth2User.email) || '';
  if (!allowlist.isEmailAllowed(email)) {
    throw new ForbiddenError(allowlist.REJECTED_MESSAGE);
  }
  if (e.isNewRecord) {
    // Ignore client-supplied createData: the account is built from the Google profile only.
    e.createData = { role: 'coach' };
  }
  e.next();
}, 'users');

// Every successful sign-in, any method (password, OAuth2, refresh).
onRecordAuthRequest((e) => {
  const allowlist = require(`${__hooks}/regatta-ops/allowlist.js`);
  if (!allowlist.isEmailAllowed(e.record.email())) {
    throw new ForbiddenError(allowlist.REJECTED_MESSAGE);
  }
  e.next();
}, 'users');

// Any new user: default role (before validation, so the required select passes).
onRecordCreate((e) => {
  if (!e.record.getString('role')) e.record.set('role', 'coach');
  e.next();
}, 'users');

// User creation through the API (admins in Settings, and Google's internal create request).
onRecordCreateRequest((e) => {
  if (e.hasSuperuserAuth()) return e.next();
  const allowlist = require(`${__hooks}/regatta-ops/allowlist.js`);
  if (!allowlist.isEmailAllowed(e.record.email())) {
    throw new ForbiddenError(allowlist.REJECTED_MESSAGE);
  }
  const isAdmin =
    e.auth && e.auth.collection().name === 'users' && e.auth.getString('role') === 'admin';
  if (!isAdmin) e.record.set('role', 'coach');
  e.next();
}, 'users');

// Updates: only admins change roles; emails stay inside the allowed domain.
onRecordUpdateRequest((e) => {
  if (e.hasSuperuserAuth()) return e.next();
  const original = e.record.original();
  const isAdmin =
    e.auth && e.auth.collection().name === 'users' && e.auth.getString('role') === 'admin';
  if (!isAdmin && original.getString('role') !== e.record.getString('role')) {
    throw new ForbiddenError('Only an admin can change roles.');
  }
  if (original.email() !== e.record.email()) {
    const allowlist = require(`${__hooks}/regatta-ops/allowlist.js`);
    if (!allowlist.isEmailAllowed(e.record.email())) {
      throw new ForbiddenError(allowlist.REJECTED_MESSAGE);
    }
  }
  e.next();
}, 'users');
