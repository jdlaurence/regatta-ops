import { describe, expect, it } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { fixtureStore, IDS } from '@/test/fixtures';
import { dataWrapper } from '@/test/render';
import { useStoreMutation } from './hooks';
import { change } from './optimistic';
import { useRegattaWorkingSet } from './working-set';

describe('realtime while a write is in flight', () => {
  it('does not paint the echo of an earlier step over the optimistic state', async () => {
    const store = fixtureStore();
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => (release = r));
    const { result } = renderHook(
      () => ({
        ws: useRegattaWorkingSet(IDS.regatta),
        // Two steps, like a feature that saves notes and then the label.
        save: useStoreMutation<{ label: string }>({
          mutationFn: async (s, { label }) => {
            await s.update('entries', IDS.entry1, { notes: 'Step one' });
            await gate;
            await s.update('entries', IDS.entry1, { label });
          },
          optimistic: ({ label }) => [change.update('entries', IDS.entry1, { label })],
        }),
      }),
      { wrapper: dataWrapper(store) },
    );
    await waitFor(() => expect(result.current.ws.data).toBeDefined());
    const label = () => result.current.ws.data!.byId.entries.get(IDS.entry1)!.label;

    act(() => result.current.save.mutate({ label: 'Renamed' }));
    await waitFor(() => expect(label()).toBe('Renamed'));
    // Step one's echo has arrived and its batch window has passed: still the optimistic label.
    await act(() => new Promise((r) => setTimeout(r, 250)));
    expect(label()).toBe('Renamed');

    await act(async () => release());
    await waitFor(() => expect(result.current.save.isSuccess).toBe(true));
    await waitFor(() =>
      expect(result.current.ws.data!.byId.entries.get(IDS.entry1)!.notes).toBe('Step one'),
    );
    expect(label()).toBe('Renamed');
  });
});
