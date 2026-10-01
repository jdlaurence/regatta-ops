// Shared trailer visuals: the end, plan, and isometric views, rule cards, and the rules editor.
// Used by the trailers admin page (trailer mode) and the regatta trailer page (regatta mode).

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
export { TrailerIsometric, type TrailerIsometricProps } from './TrailerIsometric';
export { PlanView, type PlanLevel, type PlanViewProps } from './PlanView';
export {
  bedPlanGeometry,
  planViewGeometry,
  type BedPlanGeometry,
  type PlanBoat,
  type PlanLane,
  type PlanViewGeometry,
  type PlanZone,
} from './plan';
export {
  isometricGeometry,
  type IsoGeometry,
  type IsoHull,
  type IsoOverhang,
  type IsometricBoat,
} from './isometric';
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
