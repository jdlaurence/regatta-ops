// Sign-in domain allowlist (PLAN.md §2). REGATTA_OPS_ALLOWED_DOMAIN holds one domain, or several
// separated by commas. Unset means every domain is allowed (local development).
//
// Used by auth.pb.js on Google sign-in, on every successful sign-in (any method), and on user
// creation, so the same check guards all three paths.

function allowedDomains() {
  const raw = $os.getenv('REGATTA_OPS_ALLOWED_DOMAIN') || '';
  return raw
    .split(',')
    .map((d) => d.trim().toLowerCase().replace(/^@/, ''))
    .filter((d) => d !== '');
}

function isEmailAllowed(email) {
  const domains = allowedDomains();
  if (domains.length === 0) return true;
  const value = String(email || '')
    .trim()
    .toLowerCase();
  const at = value.lastIndexOf('@');
  if (at < 1) return false;
  return domains.indexOf(value.slice(at + 1)) !== -1;
}

const REJECTED_MESSAGE =
  'Sign in with your club Google account. Other accounts cannot use Regatta Ops.';

module.exports = { allowedDomains, isEmailAllowed, REJECTED_MESSAGE };
