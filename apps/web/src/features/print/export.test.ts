import { createElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { parseCsvObjects } from '@srt/domain';
import { SEED_REGATTA_IDS, SEED_TEAM_IDS } from '@srt/seed';
import { fixtureStore, IDS } from '@/test/fixtures';
import { dataWrapper } from '@/test/render';
import { ExportEntriesButton } from './ExportEntriesButton';
import { ENTRY_CSV_HEADER, downloadText, entriesCsv, entriesCsvFileName } from './export';
import { loadWorkingSet, seedStore } from './test-helpers';

describe('entries CSV', () => {
  it('writes one row per entry with seats by name', async () => {
    const ws = await loadWorkingSet(fixtureStore(), IDS.regatta);
    const csv = entriesCsv(ws);
    const [header] = csv.split('\n');
    expect(header).toBe(ENTRY_CSV_HEADER.join(','));
    expect(ENTRY_CSV_HEADER).toEqual([
      'Team',
      'Event number',
      'Event',
      'Day',
      'Time',
      'Label',
      'Class',
      'Shell',
      'Oars',
      'Seat 1',
      'Seat 2',
      'Seat 3',
      'Seat 4',
      'Seat 5',
      'Seat 6',
      'Seat 7',
      'Seat 8',
      'Cox',
      'Status',
    ]);
    expect(parseCsvObjects(csv)).toEqual([
      {
        Team: 'Junior boys',
        'Event number': '12',
        Event: "Men's Junior 4+",
        Day: '2026-11-01',
        Time: '09:40',
        Label: 'V4+',
        Class: '4+',
        Shell: 'Spencer',
        Oars: '24-C · yellow-white',
        'Seat 1': 'Rowan Test',
        'Seat 2': 'Jules Fixture',
        'Seat 3': '',
        'Seat 4': '',
        'Seat 5': '',
        'Seat 6': '',
        'Seat 7': '',
        'Seat 8': '',
        Cox: '',
        Status: 'Planned',
      },
    ]);
  });

  it('keeps scratched and unscheduled entries, in schedule order, and filters by team', async () => {
    const store = fixtureStore();
    await store.create('entries', {
      regattaId: IDS.regatta,
      teamId: IDS.girls,
      label: 'W8',
      boatClass: '8+',
      eventId: IDS.event2,
      status: 'scratched',
    });
    await store.create('entries', {
      regattaId: IDS.regatta,
      teamId: IDS.boys,
      label: 'Spare 1x',
      boatClass: '1x',
      status: 'draft',
    });
    const ws = await loadWorkingSet(store, IDS.regatta);
    const rows = parseCsvObjects(entriesCsv(ws));
    expect(rows.map((r) => [r.Team, r.Label, r.Time, r.Status])).toEqual([
      ['Junior boys', 'V4+', '09:40', 'Planned'],
      ['Junior girls', 'W8', '10:20', 'Scratched'],
      ['Junior boys', 'Spare 1x', '', 'Draft'],
    ]);
    const girls = parseCsvObjects(entriesCsv(ws, { teamId: IDS.girls }));
    expect(girls.map((r) => r.Label)).toEqual(['W8']);
    expect(entriesCsvFileName(ws)).toBe('head-of-the-lake-entries.csv');
    expect(entriesCsvFileName(ws, IDS.girls)).toBe('head-of-the-lake-junior-girls-entries.csv');
  });

  it('exports the seed regatta with every team and quotes names with commas', async () => {
    const ws = await loadWorkingSet(seedStore(), SEED_REGATTA_IDS.nwYouth2025);
    const rows = parseCsvObjects(entriesCsv(ws));
    expect(rows).toHaveLength(ws.entries.length);
    expect(new Set(rows.map((r) => r.Team))).toEqual(new Set(['Junior boys', 'Junior girls']));
    const boys = parseCsvObjects(entriesCsv(ws, { teamId: SEED_TEAM_IDS.boys }));
    expect(boys[0]).toMatchObject({
      Label: 'V8',
      Day: '2025-05-16',
      Time: '08:00',
      Shell: 'Peggy',
    });
    expect(boys[0]!['Seat 8']).not.toBe('');
  });

  it('exports from a button any page can place', async () => {
    const user = userEvent.setup();
    const create = vi.fn((_blob: Blob) => 'blob:csv');
    Object.assign(URL, { createObjectURL: create, revokeObjectURL: vi.fn() });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    render(createElement(ExportEntriesButton, { regattaId: IDS.regatta, teamId: IDS.boys }), {
      wrapper: dataWrapper(fixtureStore()),
    });
    const button = screen.getByRole('button', { name: 'Export entries' });
    await waitFor(() => expect(button).toBeEnabled());
    await user.click(button);
    expect(create).toHaveBeenCalledOnce();
    const text = await create.mock.calls[0]![0].text();
    expect(text).toContain('Junior boys,12,');
  });

  it('hands the text to the browser as a download', () => {
    const create = vi.fn(() => 'blob:csv');
    const revoke = vi.fn();
    Object.assign(URL, { createObjectURL: create, revokeObjectURL: revoke });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    downloadText('entries.csv', 'a,b\n');
    expect(create).toHaveBeenCalledOnce();
    expect(click).toHaveBeenCalledOnce();
    expect(document.querySelector('a[download]')).toBeNull();
  });
});
