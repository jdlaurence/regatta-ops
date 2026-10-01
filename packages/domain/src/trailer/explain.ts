// Rule sentences (PLAN.md §9.3.3). The sentence on a rule card is generated from the rule type
// and params, so the same rule always reads the same way.

import type { Id } from '../types';
import {
  capitalize,
  classList,
  classNoun,
  countOf,
  joinAnd,
  laneName,
  midSentence,
  possessive,
  shelfById,
  shelfName,
  shelvesPhrase,
  tiersPhrase,
} from './format';
import type { Rule, TrailerDef } from './types';

/** Names the trailer does not know: shells (for `pin`) and teams (for `team-together`). */
export interface ExplainContext {
  shellNames?: Readonly<Record<Id, string>>;
  teamNames?: Readonly<Record<Id, string>>;
}

/** The sentence shown on the rule card: "Prefer eights on levels 5 and 4". */
export function explain(rule: Rule, trailer: TrailerDef, context: ExplainContext = {}): string {
  switch (rule.type) {
    case 'fit':
      return `Boats must physically fit: ${rule.params.clearanceCm} cm between hulls, ${rule.params.gapCm} cm between ends`;
    case 'shelf-classes': {
      const shelves = shelvesPhrase(trailer, rule.params.shelfIds, 'start');
      return `${shelves.text} ${shelves.plural ? 'hold' : 'holds'} only ${classList(rule.params.classes)}`;
    }
    case 'shelf-lanes': {
      const name = rule.params.shelfId ? shelfName(trailer, rule.params.shelfId) : 'A shelf';
      return `${capitalize(name)} fits ${rule.params.lanes} ${classNoun(rule.params.classes ?? [])} side by side`;
    }
    case 'shelf-off':
      return `Don't use ${shelvesPhrase(trailer, rule.params.shelfIds, 'mid').text}`;
    case 'overhang': {
      const tiers = tiersPhrase(trailer, rule.params.tiers, 'start');
      return `${tiers.text} may stick out ${rule.params.frontMaxCm} cm in front and ${rule.params.rearMaxCm} cm behind`;
    }
    case 'max-boats': {
      const name = rule.params.shelfId ? shelfName(trailer, rule.params.shelfId) : 'A shelf';
      return `${capitalize(name)} holds at most ${countOf(rule.params.max, 'boat')}`;
    }
    case 'pin': {
      // Shell ids mean nothing to a coach; the rules editor passes names in `context`.
      const shell = context.shellNames?.[rule.params.shellId] || 'A shell';
      const place = rule.params.shelfId
        ? midSentence(shelfName(trailer, rule.params.shelfId))
        : 'a shelf';
      const lane =
        rule.params.lane == null
          ? ''
          : `, ${laneName(shelfById(trailer, rule.params.shelfId), rule.params.lane)}`;
      return `${capitalize(shell)} goes on ${place}${lane}`;
    }
    case 'class-tier': {
      const noun = classNoun(rule.params.classes);
      const tiers = tiersPhrase(trailer, rule.params.tiers, 'mid').text;
      return rule.hard ? `${capitalize(noun)} must go on ${tiers}` : `Prefer ${noun} on ${tiers}`;
    }
    case 'heavy-low':
      return 'Keep heavier boats low';
    case 'forward-bias':
      return 'Put overhang in front, over the truck, rather than behind';
    case 'side-balance':
      return 'Balance weight between the two sides';
    case 'unload-order':
      return 'Boats racing first should be easiest to reach';
    case 'team-together': {
      const ids = rule.params.teamIds ?? [];
      if (ids.length === 0) return "Keep each team's boats together";
      const names = ids.map((id) => context.teamNames?.[id] || id);
      return names.length === 1
        ? `Keep ${possessive(names[0]!)} boats together`
        : `Keep each team's boats together: ${joinAnd(names)}`;
    }
    case 'fragile-inside':
      return 'Keep fragile boats in inside lanes';
  }
}

/** How a rule is named inside another sentence: the fit rule is "must physically fit". */
export function ruleLabel(rule: Rule, trailer: TrailerDef, context: ExplainContext = {}): string {
  return rule.type === 'fit' ? 'must physically fit' : explain(rule, trailer, context);
}
