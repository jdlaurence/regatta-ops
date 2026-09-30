import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  SRA_BOYS_TRAILER,
  SRA_DEFAULT_RULES,
  THREE_WIDE_EXAMPLE_RULE,
  makeRule,
  type Rule,
} from '@srt/domain';
import { TooltipProvider } from '@/components/ui/menu';
import { RuleCard } from './RuleCard';

const byId = (id: string) => SRA_DEFAULT_RULES.find((r) => r.id === id)!;

function card(rule: Rule, props: Partial<Parameters<typeof RuleCard>[0]> = {}) {
  return render(
    <TooltipProvider>
      <RuleCard rule={rule} trailer={SRA_BOYS_TRAILER} {...props} />
    </TooltipProvider>,
  );
}

describe('RuleCard', () => {
  it.each([
    ['r_fit', 'Boats must physically fit: 15 cm between hulls, 30 cm between ends'],
    ['r_eights_top', 'Prefer eights on levels 5 and 4'],
    ['r_fours_mid', 'Prefer fours on levels 3 and 2'],
    ['r_heavy_low', 'Keep heavier boats low'],
    ['r_forward', 'Put overhang in front, over the truck, rather than behind'],
    ['r_balance', 'Balance weight between the two sides'],
    ['r_unload', 'Boats racing first should be easiest to reach'],
    ['r_team', "Keep each team's boats together"],
  ])('reads %s as a sentence', (id, sentence) => {
    card(byId(id));
    expect(screen.getByRole('article', { name: sentence })).toBeInTheDocument();
  });

  it('reads shelf and shell rules with the trailer’s own names', () => {
    card(THREE_WIDE_EXAMPLE_RULE);
    expect(screen.getByText('Level 3, wide side fits 3 fours side by side')).toBeInTheDocument();
    card(makeRule('pin', { shellId: 'sh1', shelfId: 'r5', lane: 1 }), {
      context: { shellNames: { sh1: 'Peggy' } },
    });
    expect(
      screen.getByText('Peggy goes on the top level, wide side, outside lane'),
    ).toBeInTheDocument();
  });

  it('tags Must and Prefer, and a regatta override', () => {
    card(THREE_WIDE_EXAMPLE_RULE);
    expect(screen.getByText('Must')).toBeInTheDocument();
    expect(screen.getByText('This regatta')).toBeInTheDocument();
    card(byId('r_eights_top'));
    expect(screen.getByText('Prefer')).toBeInTheDocument();
    expect(screen.getAllByText('This regatta')).toHaveLength(1);
  });

  it('toggles a rule and sets a Prefer rule’s weight', async () => {
    const onEnabledChange = vi.fn();
    const onWeightChange = vi.fn();
    card(byId('r_eights_top'), { onEnabledChange, onWeightChange });
    await userEvent.click(
      screen.getByRole('switch', { name: 'Use this rule: Prefer eights on levels 5 and 4' }),
    );
    expect(onEnabledChange).toHaveBeenCalledWith(false);
    expect(screen.getByRole('radio', { name: 'High' })).toHaveAttribute('data-state', 'on');
    await userEvent.click(screen.getByRole('radio', { name: 'Low' }));
    expect(onWeightChange).toHaveBeenCalledWith(1);
  });

  it('keeps the fit rule always on', () => {
    card(byId('r_fit'), { onEnabledChange: () => {}, onDelete: () => {} });
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
    expect(screen.getByText('Always on')).toBeInTheDocument();
  });

  it('shows a turned-off rule as off, read only', () => {
    card({ ...byId('r_heavy_low'), enabled: false }, { readOnly: true, onEdit: () => {} });
    expect(screen.getByText('(off)')).toBeInTheDocument();
    expect(screen.getByText('Weight: Low')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
