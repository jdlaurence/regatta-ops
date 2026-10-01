import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { RosterAthlete } from '@srt/seed';
import { openWithRememberedKey, sealRoster } from './sealed-roster';
import { UnlockPage } from './UnlockPage';

const roster: RosterAthlete[] = [
  { team: 'girls', firstName: 'Wren', lastName: 'H.', birthYear: 2010, level: 'novice', cox: true },
];

describe('UnlockPage', () => {
  it('opens the roster with the password and remembers the key', async () => {
    const sealed = await sealRoster(roster, 'harbor-oarlock', 1_000);
    const onUnlock = vi.fn();
    render(<UnlockPage sealed={sealed} onUnlock={onUnlock} />);
    await userEvent.type(screen.getByLabelText('Password'), 'harbor-oarlock');
    await userEvent.click(screen.getByRole('button', { name: 'Open the demo' }));
    await vi.waitFor(() => expect(onUnlock).toHaveBeenCalledWith(roster));
    expect(await openWithRememberedKey(sealed)).toEqual(roster);
  });

  it('says so when the password does not match', async () => {
    const sealed = await sealRoster(roster, 'harbor-oarlock', 1_000);
    const onUnlock = vi.fn();
    render(<UnlockPage sealed={sealed} onUnlock={onUnlock} />);
    await userEvent.type(screen.getByLabelText('Password'), 'wrong-guess');
    await userEvent.click(screen.getByRole('button', { name: 'Open the demo' }));
    expect(await screen.findByText(/does not match/)).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toHaveAttribute('aria-invalid', 'true');
    expect(onUnlock).not.toHaveBeenCalled();
  });

  it('says changes stay in this browser', async () => {
    render(<UnlockPage sealed={await sealRoster(roster, 'x', 1_000)} onUnlock={vi.fn()} />);
    expect(screen.getByText(/Changes are saved only in this browser/)).toBeInTheDocument();
  });

  it('asks for a password before trying', async () => {
    render(<UnlockPage sealed={await sealRoster(roster, 'x', 1_000)} onUnlock={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Open the demo' }));
    expect(screen.getByText('Enter the password.')).toBeInTheDocument();
  });
});
