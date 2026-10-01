import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { QueryClientProvider, QueryObserver } from '@tanstack/react-query';
import { toast } from 'sonner';
import { testQueryClient } from '@/test/render';
import { formatSavedAt, offlineMessage, OfflineBanner, savedAt } from './OfflineBanner';

afterEach(() => {
  window.dispatchEvent(new Event('online'));
});

describe('the saved-at time', () => {
  const now = new Date(2026, 8, 29, 14, 5);

  it('reads as a clock time today, "yesterday", or a date', () => {
    expect(formatSavedAt(new Date(2026, 8, 29, 9, 42).getTime(), now)).toMatch(/^at 9:42\sAM$/);
    expect(formatSavedAt(new Date(2026, 8, 28, 18, 3).getTime(), now)).toMatch(
      /^yesterday at 6:03\sPM$/,
    );
    expect(formatSavedAt(new Date(2026, 8, 24, 7, 15).getTime(), now)).toMatch(
      /^on Sep 24 at 7:15\sAM$/,
    );
  });

  it('is left out when nothing is saved', () => {
    expect(offlineMessage(null)).toBe("You're offline. Editing is off until you reconnect.");
    expect(offlineMessage(new Date(2026, 8, 29, 9, 42).getTime(), now)).toMatch(
      /^You're offline\. Showing the version saved on this device at 9:42\sAM\. Editing is off until you reconnect\.$/,
    );
  });

  it('is the oldest data on screen, else the newest saved', () => {
    const qc = testQueryClient();
    expect(savedAt(qc)).toBeNull();
    qc.setQueryData(['regatta-ops', 'events'], [], { updatedAt: 1_000 });
    qc.setQueryData(['regatta-ops', 'entries'], [], { updatedAt: 3_000 });
    expect(savedAt(qc)).toBe(3_000);
    // Something on screen is watching the older one.
    const onScreen = new QueryObserver(qc, { queryKey: ['regatta-ops', 'events'], enabled: false });
    const unsubscribe = onScreen.subscribe(() => {});
    expect(savedAt(qc)).toBe(1_000);
    unsubscribe();
  });
});

describe('OfflineBanner', () => {
  function renderBanner() {
    const qc = testQueryClient();
    qc.setQueryData(['regatta-ops', 'events'], [], { updatedAt: Date.now() });
    return render(
      <QueryClientProvider client={qc}>
        <OfflineBanner />
      </QueryClientProvider>,
    );
  }

  it('shows while offline, then says so once when the connection returns', () => {
    const success = vi.spyOn(toast, 'success');
    renderBanner();
    expect(screen.queryByTestId('offline-banner')).not.toBeInTheDocument();

    act(() => void window.dispatchEvent(new Event('offline')));
    const banner = screen.getByTestId('offline-banner');
    expect(banner).toHaveTextContent(
      /^You're offline\. Showing the version saved on this device at /,
    );
    expect(banner).toHaveTextContent(/Editing is off until you reconnect\.$/);
    // Inside a polite live region, so screen readers announce it.
    expect(screen.getByRole('status')).toContainElement(banner);

    act(() => void window.dispatchEvent(new Event('online')));
    expect(screen.queryByTestId('offline-banner')).not.toBeInTheDocument();
    expect(success).toHaveBeenCalledWith('Back online. Editing is on.', {
      id: 'regatta-ops-back-online',
    });
  });

  it('says nothing about reconnecting when it was never offline', () => {
    const success = vi.spyOn(toast, 'success');
    renderBanner();
    act(() => void window.dispatchEvent(new Event('online')));
    expect(success).not.toHaveBeenCalled();
  });
});
