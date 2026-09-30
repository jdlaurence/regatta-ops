import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

// tailwind-merge must know SRT's theme names, or it mistakes `text-md` (a size) for a color and
// drops it when merged with `text-ink`.
const twMerge = extendTailwindMerge({
  override: {
    theme: {
      text: ['xs', 'sm', 'base', 'md', 'lg', 'xl', '2xl', '3xl'],
      radius: ['control', 'card', 'boat'],
      shadow: ['popover'],
      font: ['display', 'sans'],
      color: [
        'bg',
        'surface',
        'surface-2',
        'line',
        'line-strong',
        'ink',
        'ink-2',
        'accent',
        'accent-ink',
        'accent-tint',
        'danger',
        'danger-tint',
        'warn',
        'warn-tint',
        'ok',
        'ok-tint',
        'info',
        'info-tint',
        'scrim',
        'team',
        'team-tint',
        'team-navy',
        'team-navy-tint',
        'team-raspberry',
        'team-raspberry-tint',
        'team-ochre',
        'team-ochre-tint',
        'team-green',
        'team-green-tint',
        'team-violet',
        'team-violet-tint',
        'team-cyan',
        'team-cyan-tint',
        'team-bronze',
        'team-bronze-tint',
        'team-slate',
        'team-slate-tint',
      ],
    },
  },
});

/** Join class names and resolve Tailwind conflicts (last wins). */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
