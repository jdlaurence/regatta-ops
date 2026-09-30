// Smoke tests for the print routes on the seed world (MemoryStore), through the real router.

import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RouterProvider } from 'react-router/dom';
import { zonedToInstant } from '@srt/domain';
import { SEED_REGATTA_IDS, SEED_TEAM_IDS, SEED_TRAILER_IDS } from '@srt/seed';
import { AppProviders } from '@/app/providers';
import { createTestRouter } from '@/app/router';
import type { MemoryStore } from '@/data/memory-store';
import { testQueryClient } from '@/test/render';
import { fixtureStore, IDS } from '@/test/fixtures';
import { printLineupsPath, printLoadPath, printSchedulePath } from './links';
import { seedStore } from './test-helpers';

const NW = SEED_REGATTA_IDS.nwYouth2025;
const HOTL = SEED_REGATTA_IDS.headOfTheLake2026;
const BOYS = SEED_TEAM_IDS.boys;
const SLOW = { timeout: 8000 };

function renderAt(path: string, store: MemoryStore = seedStore()) {
  const queryClient = testQueryClient();
  const router = createTestRouter({ store, queryClient }, path);
  render(
    <AppProviders store={store} queryClient={queryClient}>
      <RouterProvider router={router} />
    </AppProviders>,
  );
  return { router };
}

const sheets = () => document.querySelectorAll('section.print-sheet');

describe('print routes', () => {
  it('builds the URLs other pages link to', () => {
    expect(printLineupsPath('r', 't')).toBe('/print/regattas/r/lineups/t');
    expect(
      printLineupsPath('r', 'all', { day: '2025-05-16', source: 'live', layout: 'grid' }),
    ).toBe('/print/regattas/r/lineups/all?day=2025-05-16&source=live&layout=grid');
    expect(
      printLineupsPath('r', 't', { source: 'published', layout: 'sheet', boats: 'names' }),
    ).toBe('/print/regattas/r/lineups/t?boats=names');
    expect(printSchedulePath('r')).toBe('/print/regattas/r/schedule');
    expect(printSchedulePath('r', { view: 'master', day: 'd', team: 't', source: 'live' })).toBe(
      '/print/regattas/r/schedule?view=master&day=d&team=t&source=live',
    );
    expect(printLoadPath('r', 'x')).toBe('/print/regattas/r/load/x');
  });

  it('prints the published lineup sheet, one page per day, and toggles to the live draft', async () => {
    const user = userEvent.setup();
    renderAt(printLineupsPath(NW, BOYS));
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Junior boys lineups' }),
    ).toBeInTheDocument();
    const fri = await screen.findByRole(
      'region',
      { name: 'Junior boys lineups, Fri, May 16' },
      SLOW,
    );
    expect(sheets()).toHaveLength(3);
    expect(within(fri).getByText('Published lineups')).toBeInTheDocument();
    expect(within(fri).getAllByRole('article')).toHaveLength(22);
    expect(
      within(fri).getByRole('group', { name: /^V8, Peggy, 9 of 9 seats filled/ }),
    ).toBeInTheDocument();
    expect(within(fri).getByText('Everyone coming to this regatta is boated.')).toBeInTheDocument();
    // The toolbar carries the publish status and button (not printed).
    const options = screen.getByRole('group', { name: 'Print options' });
    expect(
      await within(options).findByRole('button', { name: '1 change since' }),
    ).toBeInTheDocument();
    expect(within(options).getByRole('button', { name: 'Publish lineups' })).toBeInTheDocument();
    // No app shell around a print view.
    expect(screen.queryByRole('navigation', { name: 'Main' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('radio', { name: 'Live draft' }));
    expect(
      (await screen.findAllByText('Live draft, 1 change since publishing')).length,
    ).toBeGreaterThan(0);

    await user.click(screen.getByRole('radio', { name: 'Names' }));
    const list = (
      await screen.findAllByRole('list', { name: 'Crew, cox first, then stroke to bow' })
    )[0]!;
    expect(within(list).getAllByRole('listitem')[0]).toHaveTextContent(/^Cox/);
  });

  it('prints the lineup grid with eights and smaller boats', async () => {
    renderAt(printLineupsPath(NW, BOYS, { layout: 'grid', day: '2025-05-17' }));
    const sheet = await screen.findByRole(
      'region',
      { name: 'Junior boys lineup grid, Sat, May 17' },
      SLOW,
    );
    const tables = within(sheet).getAllByRole('table');
    expect(tables.map((t) => t.querySelector('caption')?.textContent)).toEqual([
      'Eights',
      'Fours and smaller boats',
    ]);
    const rowHeads = within(tables[0]!)
      .getAllByRole('rowheader')
      .map((h) => h.textContent);
    expect(rowHeads).toEqual([
      'Final',
      'Cox',
      '8 stroke',
      '7',
      '6',
      '5',
      '4',
      '3',
      '2',
      '1 bow',
      'Shell',
      'Oars',
    ]);
  });

  it('prints every team when the team is "all"', async () => {
    renderAt(printLineupsPath(HOTL, 'all'));
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Head of the Lake lineups' }),
    ).toBeInTheDocument();
    await screen.findByRole('region', { name: /^Evening masters lineups/ }, SLOW);
    expect(sheets()).toHaveLength(4);
    expect(screen.getAllByText('Live draft, not published yet')).toHaveLength(4);
  });

  it('prints the day schedule with logistics lines between races', async () => {
    renderAt(printSchedulePath(NW, { team: BOYS, day: '2025-05-16' }));
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Junior boys day schedule' }),
    ).toBeInTheDocument();
    const sheet = await screen.findByRole(
      'region',
      { name: 'Junior boys day schedule, Fri, May 16' },
      SLOW,
    );
    const rows = sheet.querySelectorAll('tbody tr');
    expect(rows[0]).toHaveAttribute('data-row', 'logistics');
    expect(rows[0]).toHaveTextContent('Bus Departs Hotel @ 6:15 AM');
    expect(rows[2]).toHaveAttribute('data-row', 'race');
    expect(rows[2]).toHaveTextContent(/^8:00 AMTime trialYouth Men's 8\+V8/);
    expect(sheet.querySelectorAll('tbody tr[data-row="race"]')).toHaveLength(22);
  });

  it('prints the master schedule for every team', async () => {
    renderAt(printSchedulePath(NW, { view: 'master', day: '2025-05-16' }));
    const sheet = await screen.findByRole('region', { name: 'Master schedule, Fri, May 16' }, SLOW);
    expect(
      screen.getByRole('heading', {
        level: 1,
        name: '2025 USRowing Northwest Youth Championships master schedule',
      }),
    ).toBeInTheDocument();
    const body = within(sheet).getAllByRole('row').slice(1);
    expect(body[0]).toHaveTextContent(/^8:00 AMBoysV8Peggy24-C · yellow-white/);
    expect(body[1]).toHaveTextContent(/^8:08 AMGirlsV8/);
    expect(within(sheet).getByText('Published lineups:')).toBeInTheDocument();
  });

  it('prints the load sheet shelf by shelf with the checklist', async () => {
    renderAt(printLoadPath(NW, SEED_TRAILER_IDS.boys));
    const sheet = await screen.findByRole('region', { name: 'Boys trailer load sheet' }, SLOW);
    expect(
      screen.getByRole('heading', { level: 1, name: 'Load sheet: Boys trailer' }),
    ).toBeInTheDocument();
    const shelves = within(sheet).getByRole('table', { name: 'Shelves' });
    expect(within(shelves).getAllByRole('row')[1]).toHaveTextContent(
      /^5 \(top\)Narrow side1Peggy \(Peggy's Delight\)8\+Boys/,
    );
    // The bed's zones front to back, riggers at the back (PLAN.md §4.9).
    const bed = within(sheet).getByRole('table', { name: 'Bed, front to back' });
    const zones = within(bed)
      .getAllByRole('rowheader')
      .map((h) => h.textContent);
    expect(zones).toEqual(['Oars', 'Slings', 'Riggers (back of bed)']);
    expect(within(bed).getAllByRole('row')[3]).toHaveTextContent(
      /^Riggers \(back of bed\)From 7\.6 m to the back \(4\.6 m\)Riggers for /,
    );
    const checklist = within(sheet).getByRole('region', { name: 'Checklist' });
    const shells = within(checklist).getByRole('table', { name: 'Shells' });
    expect(
      within(shells)
        .getAllByRole('columnheader')
        .map((h) => h.textContent),
    ).toEqual(['Loaded', 'Returned', 'Item', 'Qty', 'Where']);
    expect(within(checklist).getByText(/^Loaded elsewhere:/)).toBeInTheDocument();
    expect(sheet.querySelector('[data-slot="trailer-end-view"]')).not.toBeNull();
  });

  it('keeps the schedule heading the app shell test expects', async () => {
    renderAt(`/print/regattas/${IDS.regatta}/schedule`, fixtureStore());
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Head of the Lake schedule' }),
    ).toBeInTheDocument();
  });

  it("prints an acknowledged hot seat plan on both teams' sheets", async () => {
    const store = fixtureStore();
    const at = (hhmm: string) => zonedToInstant('2026-11-01', hhmm, 'America/Los_Angeles');
    await store.create('entries', {
      id: 'girlsentry00001',
      regattaId: IDS.regatta,
      eventId: IDS.event2,
      teamId: IDS.girls,
      label: 'W4+',
      boatClass: '4+',
      shellId: IDS.shell,
      status: 'planned',
      hotSeatAckBy: IDS.coach,
      hotSeatPlan: 'Girls cox meets Boys V4+ at dock B',
      hotSeatFingerprint: `shell:${IDS.shell}|${IDS.entry1}@${at('09:40')}|girlsentry00001@${at('10:20')}`,
    });
    renderAt(printLineupsPath(IDS.regatta, 'all'), store);
    const boys = await screen.findByRole('region', { name: 'Junior boys lineups, Sun, Nov 1' });
    const girls = screen.getByRole('region', { name: 'Junior girls lineups, Sun, Nov 1' });
    for (const sheet of [boys, girls]) {
      expect(within(sheet).getByText('Hot seat:').parentElement).toHaveTextContent(
        'Hot seat: Girls cox meets Boys V4+ at dock B',
      );
    }
  });

  it('says so when the team does not exist', async () => {
    renderAt(printLineupsPath(IDS.regatta, 'nosuchteam00000'), fixtureStore());
    expect(
      await screen.findByText('This team does not exist. Go back and pick another.'),
    ).toBeInTheDocument();
  });

  it('says so when the trailer does not exist', async () => {
    renderAt(printLoadPath(IDS.regatta, 'nosuchtrailer00'), fixtureStore());
    expect(
      await screen.findByText('This trailer does not exist. Go back and pick another.'),
    ).toBeInTheDocument();
  });
});
