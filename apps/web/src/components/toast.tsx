// Toasts (sonner), styled with the tokens. Copy rules (PLAN.md §5.5): the toast repeats the
// button's verb in the past tense ("Pack trailer" → "Trailer packed"); errors say what went
// wrong and what to do; no exclamation points, no apologies.
//
//   import { toast } from '@/components/toast';
//   toast.success('Trailer packed');
//   toast.error('This shell is out of service. Pick another or change its status in Fleet.');

import { Toaster as Sonner } from 'sonner';
import { useTheme } from '@/app/theme';

export { toast } from 'sonner';

export function Toaster() {
  const { resolved } = useTheme();
  return (
    <Sonner
      theme={resolved}
      position="bottom-right"
      offset={16}
      mobileOffset={{ bottom: 80, left: 16, right: 16 }}
      toastOptions={{
        unstyled: false,
        classNames: {
          toast:
            '!rounded-card !border !border-line !bg-surface !text-ink !shadow-popover !font-sans !text-base',
          description: '!text-ink-2',
          actionButton: '!bg-accent !text-accent-ink !rounded-control',
          cancelButton: '!bg-surface-2 !text-ink !rounded-control',
          error: '[&_[data-icon]]:!text-danger',
          success: '[&_[data-icon]]:!text-ok',
          warning: '[&_[data-icon]]:!text-warn',
          info: '[&_[data-icon]]:!text-info',
        },
      }}
    />
  );
}
