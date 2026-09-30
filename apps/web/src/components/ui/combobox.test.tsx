import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Combobox, filterOptions, type ComboboxOption } from './combobox';

const options: ComboboxOption[] = [
  { value: 'lll', label: 'LLL', keywords: ['Live.Laugh.Love'], group: 'Compatible' },
  { value: 'peggy', label: 'Peggy', keywords: ["Peggy's Delight"], group: 'Compatible' },
  { value: 'spencer', label: 'Spencer', group: 'Other shells', disabled: true },
];

describe('filterOptions', () => {
  it('matches labels and keywords, every word, accent-insensitive', () => {
    expect(filterOptions(options, 'laugh').map((o) => o.value)).toEqual(['lll']);
    expect(filterOptions(options, 'peg del').map((o) => o.value)).toEqual(['peggy']);
    expect(filterOptions(options, '').length).toBe(3);
  });
});

describe('Combobox', () => {
  it('opens, filters, and picks with the keyboard', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<Combobox label="Shell" options={options} value={null} onValueChange={onValueChange} />);
    await user.click(screen.getByRole('button', { name: /shell/i }));
    const search = screen.getByRole('combobox', { name: /search shell/i });
    expect(screen.getByText('Compatible')).toBeInTheDocument();
    await user.type(search, 'peg');
    await user.keyboard('{Enter}');
    expect(onValueChange).toHaveBeenCalledWith('peggy');
  });

  it('offers a clear row and skips disabled options', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(
      <Combobox
        label="Shell"
        options={options}
        value="lll"
        clearable="No shell"
        onValueChange={onValueChange}
      />,
    );
    await user.click(screen.getByRole('button', { name: /shell: lll/i }));
    expect(screen.getByRole('option', { name: /no shell/i })).toBeInTheDocument();
    await user.click(screen.getByRole('option', { name: /spencer/i }));
    expect(onValueChange).not.toHaveBeenCalled();
    await user.click(screen.getByRole('option', { name: /no shell/i }));
    expect(onValueChange).toHaveBeenCalledWith(null);
  });
});
