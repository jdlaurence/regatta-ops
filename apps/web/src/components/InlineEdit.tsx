// Click-to-edit text (event times and names on the schedule, run of show cells).
// Shows the value as a button; clicking turns it into an input. Enter or leaving the field
// saves, Escape cancels, and focus returns to the button either way.

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

export interface InlineEditProps {
  /** The value the input starts from ('HH:mm' for times). */
  value: string;
  /** What the button shows. */
  children: ReactNode;
  /** Visible text of the button, for the accessible name ("9:52", "TBD"). */
  displayText: string;
  /** What the field is: "time of Event 14". Names read "9:52, change time of Event 14". */
  what: string;
  type?: 'text' | 'time';
  /** Allow saving an empty value (a time can be cleared to TBD). */
  allowEmpty?: boolean;
  canEdit: boolean;
  onCommit: (next: string) => void;
  className?: string;
  inputClassName?: string;
}

export function InlineEdit({
  value,
  children,
  displayText,
  what,
  type = 'text',
  allowEmpty = false,
  canEdit,
  onCommit,
  className,
  inputClassName,
}: InlineEditProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const done = useRef(false);
  const refocus = useRef(false);
  const button = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (draft === null && refocus.current) {
      refocus.current = false;
      button.current?.focus();
    }
  }, [draft]);

  if (!canEdit) return <span className={className}>{children}</span>;

  if (draft === null) {
    return (
      <button
        ref={button}
        type="button"
        aria-label={`${displayText}, change ${what}`}
        title={`Change ${what}`}
        onClick={() => {
          done.current = false;
          setDraft(value);
        }}
        className={cn(
          '-mx-1 rounded-control px-1 text-left hover:bg-surface-2 pointer-coarse:min-h-11 pointer-coarse:min-w-11',
          className,
        )}
      >
        {children}
      </button>
    );
  }

  const finish = (save: boolean) => {
    if (done.current) return;
    done.current = true;
    refocus.current = true;
    const next = draft.trim();
    setDraft(null);
    if (!save || next === value.trim()) return;
    if (!next && !allowEmpty) return;
    onCommit(next);
  };

  return (
    <input
      autoFocus
      type={type}
      value={draft}
      aria-label={what.charAt(0).toUpperCase() + what.slice(1)}
      onChange={(e) => setDraft(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          finish(true);
        } else if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          finish(false);
        }
      }}
      onBlur={() => finish(true)}
      className={cn(
        'h-8 min-w-0 rounded-control border border-line-strong bg-surface px-2 text-base text-ink pointer-coarse:h-11',
        type === 'time' && 'w-28 tabular-nums',
        inputClassName,
      )}
    />
  );
}
