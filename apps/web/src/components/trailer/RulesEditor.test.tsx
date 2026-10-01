import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  SRA_BOYS_TRAILER,
  SRA_DEFAULT_RULES,
  mergeRules,
  makeRule,
  type Rule,
} from '@regatta-ops/domain';
import { TooltipProvider } from '@/components/ui/menu';
import { RulesEditor } from './RulesEditor';
import type { RulesMode } from './rule-utils';

function Harness({
  mode,
  initial,
  onChange,
}: {
  mode: RulesMode;
  initial: Rule[];
  onChange: (rules: Rule[]) => void;
}) {
  const [rules, setRules] = useState(initial);
  return (
    <TooltipProvider>
      <RulesEditor
        rules={rules}
        onChange={(next) => {
          setRules(next);
          onChange(next);
        }}
        trailer={SRA_BOYS_TRAILER}
        mode={mode}
        defaults={SRA_DEFAULT_RULES}
        shells={[{ id: 'sh_peggy', name: 'Peggy', cls: '8+' }]}
      />
    </TooltipProvider>
  );
}

function setup(mode: RulesMode, initial: Rule[] = SRA_DEFAULT_RULES) {
  const onChange = vi.fn<(rules: Rule[]) => void>();
  render(<Harness mode={mode} initial={initial} onChange={onChange} />);
  const last = () => onChange.mock.calls[onChange.mock.calls.length - 1]![0];
  return { onChange, last, user: userEvent.setup() };
}

const cardFor = (sentence: string) => screen.getByRole('article', { name: new RegExp(sentence) });

describe('RulesEditor, trailer mode', () => {
  it('groups rules as Must then Prefer', () => {
    setup('trailer');
    const headings = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent);
    expect(headings).toEqual(['Must', 'Prefer']);
    expect(screen.getAllByRole('article')).toHaveLength(SRA_DEFAULT_RULES.length);
  });

  it('turns a default off in place', async () => {
    const { last, user } = setup('trailer');
    await user.click(screen.getByRole('switch', { name: /Keep heavier boats low/ }));
    const heavy = last().find((r) => r.id === 'r_heavy_low')!;
    expect(heavy).toMatchObject({ enabled: false, origin: 'trailer' });
    expect(screen.queryByText('This regatta')).not.toBeInTheDocument();
  });

  it('edits a rule’s levels with its form', async () => {
    const { last, user } = setup('trailer');
    await user.click(
      screen.getByRole('button', { name: 'Edit rule: Prefer eights on levels 5 and 4' }),
    );
    const card = cardFor('Prefer eights on levels 5 and 4');
    await user.click(within(card).getByRole('checkbox', { name: 'Level 3' }));
    expect(within(card).getByText('Prefer eights on levels 5, 4, and 3')).toBeInTheDocument();
    await user.click(within(card).getByRole('button', { name: 'Save rule' }));
    expect(last().find((r) => r.id === 'r_eights_top')!.params).toEqual({
      classes: ['8+'],
      tiers: [5, 4, 3],
    });
    expect(screen.getByText('Prefer eights on levels 5, 4, and 3')).toBeInTheDocument();
  });

  it('deletes a rule, but never the fit rule', async () => {
    const { last, user } = setup('trailer');
    expect(
      screen.queryByRole('button', { name: /Delete rule: Boats must physically fit/ }),
    ).toBeNull();
    await user.click(
      screen.getByRole('button', { name: "Delete rule: Keep each team's boats together" }),
    );
    expect(last().some((r) => r.id === 'r_team')).toBe(false);
  });

  it('resets to the defaults after asking', async () => {
    const { last, user } = setup('trailer', SRA_DEFAULT_RULES.slice(0, 3));
    await user.click(screen.getByRole('button', { name: 'Reset to defaults' }));
    const dialog = screen.getByRole('dialog', { name: 'Reset to defaults?' });
    await user.click(within(dialog).getByRole('button', { name: 'Reset to defaults' }));
    expect(last()).toEqual(SRA_DEFAULT_RULES);
    expect(screen.getByRole('button', { name: 'Reset to defaults' })).toBeDisabled();
  });
});

describe('RulesEditor, regatta mode', () => {
  it('makes a change to a default a regatta override, and undoes it back to the default', async () => {
    const { last, user } = setup('regatta');
    await user.click(screen.getByRole('switch', { name: /Keep heavier boats low/ }));
    const off = last().find((r) => r.id === 'r_heavy_low')!;
    expect(off).toMatchObject({ enabled: false, origin: 'regatta' });
    expect(within(cardFor('Keep heavier boats low')).getByText('This regatta')).toBeInTheDocument();
    // What mergeRules does with it: the override replaces the default.
    const overrides = last().filter((r) => r.origin === 'regatta');
    expect(
      mergeRules(SRA_DEFAULT_RULES, overrides).find((r) => r.id === 'r_heavy_low')!.enabled,
    ).toBe(false);

    await user.click(screen.getByRole('switch', { name: /Keep heavier boats low/ }));
    expect(last().find((r) => r.id === 'r_heavy_low')).toEqual(
      SRA_DEFAULT_RULES.find((r) => r.id === 'r_heavy_low'),
    );
    expect(screen.queryByText('This regatta')).not.toBeInTheDocument();
  });

  it('offers "Use trailer default" on a changed default instead of delete', async () => {
    const { last, user } = setup('regatta');
    await user.click(
      within(cardFor('Prefer fours on levels 3 and 2')).getByRole('radio', { name: 'High' }),
    );
    expect(last().find((r) => r.id === 'r_fours_mid')).toMatchObject({
      weight: 3,
      origin: 'regatta',
    });
    expect(screen.queryByRole('button', { name: /Delete rule: Prefer fours/ })).toBeNull();
    await user.click(screen.getByRole('button', { name: /Use trailer default: Prefer fours/ }));
    expect(last().find((r) => r.id === 'r_fours_mid')).toMatchObject({
      weight: 2,
      origin: 'trailer',
    });
  });

  it('adds a rule from the gallery as a regatta rule', async () => {
    const { last, user } = setup('regatta');
    await user.click(screen.getByRole('button', { name: 'Add rule' }));
    await user.click(screen.getByRole('menuitem', { name: /A shelf fits N boats side by side/ }));
    const form = screen.getByText(/Reads as:/).closest('form');
    // The form lists what is missing until the shelf is picked.
    expect(screen.getByText(/Pick a shelf\./)).toBeInTheDocument();
    const shelfSelect = within(form!).getByRole('combobox');
    await user.click(shelfSelect);
    await user.click(await screen.findByRole('option', { name: 'Level 3, wide side' }));
    await user.click(within(form!).getByRole('button', { name: 'Add rule' }));
    const added = last()[last().length - 1]!;
    expect(added).toMatchObject({
      type: 'shelf-lanes',
      origin: 'regatta',
      hard: true,
      params: { shelfId: 'r3', lanes: 3 },
    });
    expect(screen.getByText('Level 3, wide side fits 3 boats side by side')).toBeInTheDocument();
    expect(
      within(cardFor('Level 3, wide side fits 3 boats side by side')).getByText('This regatta'),
    ).toBeInTheDocument();
    // A rule added for this regatta can be deleted.
    await user.click(
      screen.getByRole('button', {
        name: 'Delete rule: Level 3, wide side fits 3 boats side by side',
      }),
    );
    expect(last()).toEqual(SRA_DEFAULT_RULES);
  });

  it('adds a rule without settings at once, and pins a shell by name', async () => {
    const { last, user } = setup('regatta');
    await user.click(screen.getByRole('button', { name: 'Add rule' }));
    await user.click(screen.getByRole('menuitem', { name: /Keep fragile boats in inside lanes/ }));
    expect(last()[last().length - 1]).toMatchObject({ type: 'fragile-inside', origin: 'regatta' });

    await user.click(screen.getByRole('button', { name: 'Add rule' }));
    await user.click(screen.getByRole('menuitem', { name: /Pin a shell to a spot/ }));
    await user.click(screen.getByRole('button', { name: 'Shell: Choose a shell' }));
    await user.click(await screen.findByRole('option', { name: /Peggy/ }));
    const form = screen.getByText(/Reads as:/).closest('form')!;
    await user.click(
      within(form)
        .getAllByRole('combobox')
        .find((c) => c.textContent?.includes('Choose a shelf'))!,
    );
    await user.click(await screen.findByRole('option', { name: 'Top level, narrow side' }));
    await user.click(within(form).getByRole('button', { name: 'Add rule' }));
    expect(screen.getByText('Peggy goes on the top level, narrow side')).toBeInTheDocument();
  });

  it('resets every regatta change', async () => {
    const initial = [...SRA_DEFAULT_RULES, makeRule('shelf-off', { shelfIds: ['l1'] }, 'regatta')];
    const { last, user } = setup('regatta', initial);
    await user.click(screen.getByRole('button', { name: 'Reset to defaults' }));
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Reset to defaults' }),
    );
    expect(last()).toEqual(SRA_DEFAULT_RULES);
  });
});
