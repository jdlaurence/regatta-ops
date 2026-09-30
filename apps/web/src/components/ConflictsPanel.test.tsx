import { describe, expect, it } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { zonedToInstant, type Finding } from '@srt/domain';
import { MemoryStore } from '@/data/memory-store';
import { fixtureWorld, IDS } from '@/test/fixtures';
import { dataWrapper } from '@/test/render';
import { ConflictsPanel, groupFindings } from './ConflictsPanel';

const TZ = 'America/Los_Angeles';
const EVENT3 = 'event3000000001';
const ENTRY2 = 'entry2000000001';

/**
 * The fixture regatta (head race: launch lead 45, race 20, return 15) plus a girls' four on
 * Spencer at 10:55. The boys' four lands Spencer at 10:15, so the gap is 40 minutes: a hot seat.
 */
function hotSeatStore(userId: string = IDS.coach) {
  const world = fixtureWorld();
  world.events.push({
    id: EVENT3,
    regattaId: IDS.regatta,
    kind: 'race',
    eventNumber: '15',
    name: "Women's Junior 4+",
    boatClass: '4+',
    day: '2026-11-01',
    scheduledAt: zonedToInstant('2026-11-01', '10:55', TZ),
    stage: 'race',
    sortOrder: 3,
  });
  world.entries.push({
    id: ENTRY2,
    regattaId: IDS.regatta,
    eventId: EVENT3,
    teamId: IDS.girls,
    label: 'V4+',
    boatClass: '4+',
    shellId: IDS.shell,
    oarSetId: null,
    status: 'planned',
  });
  return new MemoryStore({ world, userId });
}

function renderPanel(store: MemoryStore, props: { teamId?: string } = {}) {
  const Wrapper = dataWrapper(store);
  return render(
    <Wrapper>
      <MemoryRouter>
        <ConflictsPanel regattaId={IDS.regatta} {...props} />
      </MemoryRouter>
    </Wrapper>,
  );
}

const group = (name: RegExp) =>
  screen.getByRole('heading', { level: 4, name }).parentElement as HTMLElement;

function hotSeatItem(): HTMLElement {
  const text = screen.getByText(/Spencer is used by Boys V4\+ at 9:40/);
  return text.closest('li') as HTMLElement;
}

describe('groupFindings', () => {
  const f = (id: string, severity: Finding['severity'], teamIds: string[]): Finding => ({
    id,
    code: 'SEATS_EMPTY',
    severity,
    message: id,
    entryIds: [],
    teamIds,
  });
  const findings = [
    f('e1', 'error', ['a']),
    f('w1', 'warning', ['b']),
    f('i1', 'info', ['a', 'b']),
    f('e2', 'error', ['b']),
  ];

  it('splits findings by severity, keeping their order', () => {
    const g = groupFindings(findings);
    expect(g.error.map((x) => x.id)).toEqual(['e1', 'e2']);
    expect(g.warning.map((x) => x.id)).toEqual(['w1']);
    expect(g.info.map((x) => x.id)).toEqual(['i1']);
  });

  it('filters to one team', () => {
    const g = groupFindings(findings, 'a');
    expect([...g.error, ...g.warning, ...g.info].map((x) => x.id)).toEqual(['e1', 'i1']);
  });
});

describe('ConflictsPanel', () => {
  it('groups findings by severity with team chips and links to the entries', async () => {
    renderPanel(hotSeatStore());
    await screen.findByRole('heading', { level: 3, name: /^Conflicts \d+$/ });
    expect(screen.getAllByRole('heading', { level: 4 }).map((h) => h.textContent)).toEqual([
      'Warnings 4',
      'Notes 2',
    ]);
    const item = hotSeatItem();
    expect(within(group(/^Warnings/)).getByText(/Spencer is used/)).toBeInTheDocument();
    expect(within(item).getByText('Boys')).toBeInTheDocument();
    expect(within(item).getByText('Girls')).toBeInTheDocument();
    const links = within(item).getAllByRole('link');
    expect(links.map((a) => [a.textContent, a.getAttribute('href')])).toEqual([
      ['Boys V4+ at 9:40', `/regattas/${IDS.regatta}/lineups/${IDS.boys}?entry=${IDS.entry1}`],
      ['Girls V4+ at 10:55', `/regattas/${IDS.regatta}/lineups/${IDS.girls}?entry=${ENTRY2}`],
    ]);
    expect(within(item).getByRole('button', { name: 'Acknowledge hot seat' })).toBeInTheDocument();
  });

  it('filters to a team', async () => {
    const user = userEvent.setup();
    renderPanel(hotSeatStore());
    await screen.findByRole('heading', { level: 3, name: /^Conflicts \d+$/ });
    const before = screen.getAllByRole('listitem').length;
    await user.click(screen.getByRole('combobox', { name: 'Show conflicts for' }));
    await user.click(await screen.findByRole('option', { name: 'Junior girls' }));
    await waitFor(() => expect(screen.getAllByRole('listitem').length).toBeLessThan(before));
    // Every finding left involves the girls.
    for (const li of screen.getAllByRole('listitem').filter((l) => l.dataset.findingId)) {
      expect(within(li).getByText('Girls')).toBeInTheDocument();
    }
  });

  it('starts filtered to the team it is given', async () => {
    renderPanel(hotSeatStore(), { teamId: IDS.boys });
    await screen.findByRole('heading', { level: 3, name: /^Conflicts \d+$/ });
    for (const li of screen.getAllByRole('listitem').filter((l) => l.dataset.findingId)) {
      expect(within(li).getByText('Boys')).toBeInTheDocument();
    }
  });

  it('says so when there is nothing to show', async () => {
    const world = fixtureWorld();
    world.entries = [];
    world.entry_seats = [];
    renderPanel(new MemoryStore({ world, userId: IDS.coach }));
    expect(await screen.findByText(/^No conflicts\./)).toBeInTheDocument();
  });
});

describe('hot seat acknowledgment round trip', () => {
  it('turns a warning into a note with a plan, and back into a warning when a time changes', async () => {
    const user = userEvent.setup();
    const store = hotSeatStore();
    renderPanel(store);
    await screen.findByRole('heading', { level: 3, name: /^Conflicts \d+$/ });
    expect(hotSeatItem().dataset.severity).toBe('warning');

    // Acknowledge: a plan is required.
    await user.click(within(hotSeatItem()).getByRole('button', { name: 'Acknowledge hot seat' }));
    const dialog = await screen.findByRole('dialog', { name: 'Acknowledge hot seat' });
    await user.click(within(dialog).getByRole('button', { name: 'Acknowledge hot seat' }));
    expect(within(dialog).getByText(/Write a short plan/)).toBeInTheDocument();
    await user.type(
      within(dialog).getByRole('textbox', { name: 'Plan' }),
      'Girls cox meets Boys V4+ at dock B',
    );
    await user.click(within(dialog).getByRole('button', { name: 'Acknowledge hot seat' }));

    // Calm blue: the finding moves to the notes with its plan.
    await waitFor(() => expect(hotSeatItem().dataset.severity).toBe('info'));
    expect(within(group(/^Notes/)).getByText(/Spencer is used/)).toBeInTheDocument();
    expect(
      within(hotSeatItem()).getByText('Girls cox meets Boys V4+ at dock B'),
    ).toBeInTheDocument();
    expect(within(hotSeatItem()).getByRole('button', { name: 'Edit plan' })).toBeInTheDocument();
    const saved = await store.get('entries', ENTRY2);
    expect(saved).toMatchObject({
      hotSeatAckBy: IDS.coach,
      hotSeatPlan: 'Girls cox meets Boys V4+ at dock B',
    });
    expect(saved!.hotSeatFingerprint).toContain(`shell:${IDS.shell}|${IDS.entry1}@`);

    // Someone moves the later race: the acknowledgment no longer matches.
    await act(() =>
      store.update('events', EVENT3, {
        scheduledAt: zonedToInstant('2026-11-01', '10:50', TZ),
      }),
    );
    await waitFor(() => expect(hotSeatItem().dataset.severity).toBe('warning'));
    expect(
      within(hotSeatItem()).getByRole('button', { name: 'Acknowledge hot seat' }),
    ).toBeInTheDocument();
  });

  it('removes an acknowledgment', async () => {
    const user = userEvent.setup();
    const store = hotSeatStore();
    renderPanel(store);
    await screen.findByRole('heading', { level: 3, name: /^Conflicts \d+$/ });
    await user.click(within(hotSeatItem()).getByRole('button', { name: 'Acknowledge hot seat' }));
    let dialog = await screen.findByRole('dialog', { name: 'Acknowledge hot seat' });
    await user.type(within(dialog).getByRole('textbox', { name: 'Plan' }), 'Hand off at dock A');
    await user.click(within(dialog).getByRole('button', { name: 'Acknowledge hot seat' }));
    await waitFor(() => expect(hotSeatItem().dataset.severity).toBe('info'));

    await user.click(within(hotSeatItem()).getByRole('button', { name: 'Edit plan' }));
    dialog = await screen.findByRole('dialog', { name: 'Hot seat plan' });
    expect(within(dialog).getByRole('textbox', { name: 'Plan' })).toHaveValue('Hand off at dock A');
    expect(within(dialog).getByText(/Acknowledged by Casey Coach/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Remove acknowledgment' }));

    await waitFor(() => expect(hotSeatItem().dataset.severity).toBe('warning'));
    expect(await store.get('entries', ENTRY2)).toMatchObject({
      hotSeatAckBy: null,
      hotSeatPlan: '',
      hotSeatFingerprint: '',
    });
  });

  it('does not offer acknowledgment to a viewer', async () => {
    renderPanel(hotSeatStore(IDS.viewer));
    await screen.findByRole('heading', { level: 3, name: /^Conflicts \d+$/ });
    expect(hotSeatItem().dataset.severity).toBe('warning');
    expect(screen.queryByRole('button', { name: 'Acknowledge hot seat' })).toBeNull();
  });
});
