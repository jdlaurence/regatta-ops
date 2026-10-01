// The published demo's door (PLAN.md §14): one shared password opens the sealed junior rosters
// in this browser. It stands in for sign-in; the app then opens signed in as the admin.

import { useState, type FormEvent } from 'react';
import type { RosterAthlete } from '@regatta-ops/seed';
import { BoatStrip } from '@/components/BoatStrip';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/input';
import { Wordmark } from '../shell/Logo';
import { deriveKey, openRoster, rememberKey, type SealedRoster } from './sealed-roster';

export function UnlockPage({
  sealed,
  onUnlock,
}: {
  sealed: SealedRoster;
  onUnlock: (athletes: RosterAthlete[]) => void;
}) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!password) {
      setError('Enter the password.');
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const key = await deriveKey(password, sealed);
      const athletes = await openRoster(sealed, key);
      await rememberKey(key);
      onUnlock(athletes);
    } catch {
      setError('That password does not match. Check it with the coach who sent the link.');
      setBusy(false);
    }
  };

  return (
    <main className="min-h-dvh bg-bg px-4 py-8 md:px-10 md:py-14">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-10 md:flex-row md:items-start md:gap-16">
        <div className="flex flex-col gap-6 md:w-[420px] md:shrink-0">
          <Wordmark />
          <div className="flex flex-col gap-2">
            <h1 className="font-display text-2xl font-semibold md:text-3xl">Enter the password</h1>
            <p className="max-w-prose text-md leading-prose text-ink-2">
              A demo of lineups, the club schedule, and trailer loading for Sammamish Rowing
              coaches.
            </p>
          </div>
          <form onSubmit={(e) => void onSubmit(e)} noValidate className="flex flex-col gap-4">
            <Field id="password" label="Password" error={error ?? undefined}>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                autoFocus
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                aria-invalid={!!error}
                aria-describedby={error ? 'password-error' : undefined}
              />
            </Field>
            <Button type="submit" variant="primary" disabled={busy}>
              {busy ? 'Opening…' : 'Open the demo'}
            </Button>
          </form>
          <p className="rounded-control border border-line bg-surface-2 px-3 py-2 text-base leading-prose text-ink-2">
            Changes are saved only in this browser. Nobody else sees them, and you won't see anyone
            else's. Feel free to experiment: "Reset demo data" in the user menu starts over.
          </p>
        </div>
        <div aria-hidden className="hidden min-w-0 flex-1 flex-col gap-3 md:flex">
          <BoatStrip boatClass="8+" teamColor="navy" size="md" stretch label="An empty eight" />
          <BoatStrip boatClass="4x+" teamColor="raspberry" size="sm" label="An empty coxed quad" />
        </div>
      </div>
    </main>
  );
}
