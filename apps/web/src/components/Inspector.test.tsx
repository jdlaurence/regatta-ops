import { afterEach, describe, expect, it } from 'vitest';
import { useInspectorStore } from './Inspector';

const KEY = 'regatta-ops-inspector-open';

describe('inspector store', () => {
  afterEach(() => {
    localStorage.removeItem(KEY);
    useInspectorStore.setState({ isDesktop: true, columnOpen: true, sheetOpen: false });
  });

  it('remembers the column choice on desktop', () => {
    useInspectorStore.getState().setDesktop(true);
    useInspectorStore.getState().setOpen(false);
    expect(useInspectorStore.getState().columnOpen).toBe(false);
    expect(localStorage.getItem(KEY)).toBe('false');
  });

  it('closes for one page without forgetting the remembered choice, then restores it', () => {
    localStorage.setItem(KEY, 'true');
    useInspectorStore.getState().setDesktop(true);
    useInspectorStore.getState().setOpen(false, { remember: false });
    expect(useInspectorStore.getState().columnOpen).toBe(false);
    expect(localStorage.getItem(KEY)).toBe('true');
    useInspectorStore.getState().restoreOpen();
    expect(useInspectorStore.getState().columnOpen).toBe(true);
  });
});
