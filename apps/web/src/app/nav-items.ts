// Navigation entries shared by the side nav, the tablet rail, and the phone bars (PLAN.md §5.3).

import {
  CalendarClock,
  ClipboardCheck,
  LayoutDashboard,
  Rows3,
  Settings,
  Truck,
  UserCheck,
  Users,
  Warehouse,
  Container,
  type LucideIcon,
} from 'lucide-react';

export interface RegattaTab {
  /** Path segment under /regattas/:id ('' is the overview). */
  segment: string;
  label: string;
  icon: LucideIcon;
  /** Shown in the phone's bottom tab bar. */
  phone: boolean;
}

export const REGATTA_TABS: RegattaTab[] = [
  { segment: '', label: 'Overview', icon: LayoutDashboard, phone: false },
  { segment: 'schedule', label: 'Schedule', icon: CalendarClock, phone: true },
  { segment: 'lineups', label: 'Lineups', icon: Rows3, phone: true },
  { segment: 'availability', label: 'Availability', icon: UserCheck, phone: false },
  { segment: 'trailer', label: 'Trailer', icon: Truck, phone: true },
  { segment: 'load', label: 'Load list', icon: ClipboardCheck, phone: true },
];

export function regattaPath(regattaId: string, segment = ''): string {
  return segment ? `/regattas/${regattaId}/${segment}` : `/regattas/${regattaId}`;
}

export interface ClubSection {
  to: string;
  label: string;
  icon: LucideIcon;
}

export const CLUB_SECTIONS: ClubSection[] = [
  { to: '/fleet/shells', label: 'Fleet', icon: Warehouse },
  { to: '/trailers', label: 'Trailers', icon: Container },
  { to: '/teams', label: 'Teams', icon: Users },
  { to: '/settings', label: 'Settings', icon: Settings },
];
