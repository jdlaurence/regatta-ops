// Shared trailer visuals (WP-L): the end view, rule cards, and the rules editor. Used by the
// trailers admin page (trailer mode) and the regatta trailer page (regatta mode).

export {
  TrailerEndView,
  TrailerChip,
  laneKey,
  type EndViewBoat,
  type EndViewChip,
  type EndViewLane,
  type EndViewPlacement,
  type TrailerChipProps,
  type TrailerEndViewProps,
} from './TrailerEndView';
export {
  endViewGeometry,
  laneChips,
  rectStyle,
  type EndViewCell,
  type EndViewGeometry,
  type EndViewSize,
  type LaneGeometry,
  type Rect,
  type ShelfGeometry,
} from './geometry';
export { toEndViewBoats } from './boats';
export { cellLabel, laneLabel, sideNamesOf, sideOf, tierLabel, STYLE_LABELS } from './labels';
export { RuleCard, RuleTag, RegattaTag, type RuleCardProps } from './RuleCard';
export {
  RuleForm,
  ruleProblems,
  type RuleFormProps,
  type RuleShellOption,
  type RuleTeamOption,
} from './RuleForm';
export { RulesEditor, type RulesEditorProps } from './RulesEditor';
export {
  WEIGHT_LABELS,
  canDelete,
  isChangedDefault,
  newRule,
  sameRule,
  sameRules,
  settleChange,
  type RulesMode,
} from './rule-utils';
