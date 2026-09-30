import { LogOut, Monitor, Moon, RotateCcw, Sun } from 'lucide-react';
import { ROLE_LABELS, useAuthActions, useCurrentUser, useResetDemo } from '@/data';
import { cn } from '@/lib/cn';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/menu';
import { useTheme, type ThemeChoice } from '../theme';

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : ''))
    .toUpperCase()
    .slice(0, 2);
}

export function Avatar({ name, className }: { name: string; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        'inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-accent-tint font-display text-xs font-semibold text-accent',
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}

/** Theme, demo reset, and sign out. `compact` shows only the avatar (tablet rail, phone). */
export function UserMenu({
  compact = false,
  side = 'top',
}: {
  compact?: boolean;
  side?: 'top' | 'bottom' | 'right';
}) {
  const user = useCurrentUser();
  const { signOut } = useAuthActions();
  const resetDemo = useResetDemo();
  const { choice, setChoice } = useTheme();
  if (!user) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          'flex min-w-0 items-center gap-2 rounded-control text-left hover:bg-surface-2',
          compact ? 'size-11 justify-center' : 'h-11 w-full px-2',
        )}
        aria-label={`Account: ${user.name}`}
      >
        <Avatar name={user.name} />
        {!compact && (
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-base font-medium text-ink">{user.name}</span>
            <span className="truncate text-xs text-ink-2">{ROLE_LABELS[user.role]}</span>
          </span>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent side={side} align="start" className="w-60">
        <DropdownMenuLabel>
          <span className="block truncate font-medium text-ink">{user.name}</span>
          <span className="block truncate">{user.email}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Theme</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={choice} onValueChange={(v) => setChoice(v as ThemeChoice)}>
          <DropdownMenuRadioItem value="light">
            <Sun aria-hidden />
            Light
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="dark">
            <Moon aria-hidden />
            Dark
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="system">
            <Monitor aria-hidden />
            Match system
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        {resetDemo && (
          <DropdownMenuItem onSelect={() => void resetDemo()}>
            <RotateCcw aria-hidden />
            Reset demo data
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onSelect={signOut}>
          <LogOut aria-hidden />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
