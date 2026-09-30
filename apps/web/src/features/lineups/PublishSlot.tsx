// The "Publish lineups" slot in the lineup page header (PLAN.md §4.1 Publishing). WP-K replaces
// this component's body with the publish button and the "Published 2 h ago, 3 changes since"
// line; keep the export and its props so the header needs no change.

export interface PublishSlotProps {
  regattaId: string;
  teamId: string;
}

export function PublishSlot(_props: PublishSlotProps) {
  return null;
}
