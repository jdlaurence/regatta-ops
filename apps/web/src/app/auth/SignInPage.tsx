// Sign-in (PLAN.md §2): email and password for local accounts, Google through PocketBase
// OAuth2 (works once a Google client id is configured), and in demo mode a list of the seeded
// accounts to pick from.

import { useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useAuthActions, useCurrentUser, useDataMode, useList, ROLE_LABELS } from '@/data';
import { StoreError } from '@/data';
import { BoatStrip } from '@/components/BoatStrip';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/controls';
import { Avatar } from '../shell/UserMenu';
import { Wordmark } from '../shell/Logo';

const schema = z.object({
  email: z.email('Enter an email address.'),
  password: z.string().min(1, 'Enter your password.'),
});

type FormValues = z.infer<typeof schema>;

function safeNext(next: string | null): string {
  // Only same-site paths, so a crafted link cannot send someone elsewhere after sign-in.
  return next && next.startsWith('/') && !next.startsWith('//') ? next : '/';
}

function GoogleMark() {
  return (
    <svg viewBox="0 0 18 18" className="size-4" aria-hidden>
      <path
        fill="currentColor"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62ZM9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18ZM3.97 10.72A5.4 5.4 0 0 1 3.68 9c0-.6.1-1.18.29-1.72V4.95H.96A9 9 0 0 0 0 9c0 1.45.35 2.83.96 4.05l3.01-2.33ZM9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58Z"
      />
    </svg>
  );
}

function DemoAccounts({ onPick, busy }: { onPick: (email: string) => void; busy: boolean }) {
  const users = useList('users', { sort: ['role', 'name'] });
  if (!users.data || users.data.length === 0) return null;
  return (
    <section aria-labelledby="demo-accounts" className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h2 id="demo-accounts" className="text-md font-medium">
          Demo accounts
        </h2>
        <p className="text-base leading-prose text-ink-2">
          Demo mode runs in this browser with invented athletes. Pick anyone; changes stay on this
          device until you reset them.
        </p>
      </div>
      <ul className="flex flex-col gap-1.5">
        {users.data.map((u) => (
          <li key={u.id}>
            <button
              type="button"
              disabled={busy}
              onClick={() => onPick(u.email)}
              className="flex w-full items-center gap-3 rounded-control border border-line bg-surface px-3 py-2 text-left hover:border-line-strong hover:bg-surface-2 disabled:opacity-50 pointer-coarse:py-3"
            >
              <Avatar name={u.name} />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate font-medium">{u.name}</span>
                <span className="truncate text-sm text-ink-2">{u.email}</span>
              </span>
              <span className="shrink-0 text-sm text-ink-2">{ROLE_LABELS[u.role]}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function SignInPage() {
  const user = useCurrentUser();
  const mode = useDataMode();
  const auth = useAuthActions();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: '', password: '' },
  });

  if (user) return <Navigate to={next} replace />;

  const run = async (fn: () => Promise<unknown>) => {
    setError(null);
    setBusy(true);
    try {
      await fn();
      navigate(next, { replace: true });
    } catch (err) {
      setError(err instanceof StoreError ? err.message : 'Sign-in did not work. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const onSubmit = form.handleSubmit((v) =>
    run(() => auth.signInWithPassword(v.email, v.password)),
  );
  const { errors } = form.formState;

  return (
    <div className="min-h-dvh bg-bg px-4 py-8 md:px-10 md:py-14">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-10 md:flex-row md:items-start md:gap-16">
        <div className="flex flex-col gap-6 md:w-[420px] md:shrink-0">
          <Wordmark />
          <div className="flex flex-col gap-2">
            <h1 className="font-display text-2xl font-semibold md:text-3xl">Sign in</h1>
            <p className="max-w-prose text-md leading-prose text-ink-2">
              Lineups, the club schedule, and trailer loading for Sammamish Rowing coaches.
            </p>
          </div>
          <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
            <Field id="email" label="Email" error={errors.email?.message}>
              <Input
                id="email"
                type="email"
                autoComplete="username"
                aria-invalid={!!errors.email}
                aria-describedby={errors.email ? 'email-error' : undefined}
                {...form.register('email')}
              />
            </Field>
            <Field id="password" label="Password" error={errors.password?.message}>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                aria-invalid={!!errors.password}
                aria-describedby={errors.password ? 'password-error' : undefined}
                {...form.register('password')}
              />
            </Field>
            {error && (
              <p
                role="alert"
                className="rounded-control bg-danger-tint px-3 py-2 text-base text-danger"
              >
                {error}
              </p>
            )}
            <Button type="submit" variant="primary" disabled={busy}>
              Sign in
            </Button>
          </form>
          {mode === 'pocketbase' && (
            <>
              <div className="flex items-center gap-3 text-sm text-ink-2">
                <Separator className="flex-1" />
                or
                <Separator className="flex-1" />
              </div>
              <Button onClick={() => void run(() => auth.signInWithGoogle())} disabled={busy}>
                <GoogleMark />
                Continue with Google
              </Button>
              <p className="text-sm leading-prose text-ink-2">
                Use your club Google account. Local development accounts use email and password.
              </p>
            </>
          )}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-8">
          <div aria-hidden className="hidden flex-col gap-3 md:flex">
            <BoatStrip boatClass="8+" teamColor="navy" size="md" stretch label="An empty eight" />
            <BoatStrip
              boatClass="4x+"
              teamColor="raspberry"
              size="sm"
              label="An empty coxed quad"
            />
          </div>
          {mode === 'memory' && (
            <DemoAccounts
              busy={busy}
              onPick={(email) => void run(() => auth.signInWithPassword(email, ''))}
            />
          )}
        </div>
      </div>
    </div>
  );
}
