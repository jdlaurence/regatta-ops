// Comments on an entry, an event, or a load plan. Everyone signed in can comment, viewers
// included; authors edit and delete their own comments (admins may delete any). "@" opens a list
// of people; picking one inserts "@Full Name", and the server (or MemoryStore in demo mode)
// resolves it into `comment.mentions` and emails them. New comments from others arrive through
// realtime: the comments collection is invalidated on every change.
//
// For many rows at once, count with one query: useCommentCounts('event', eventIds), then pass
// `count` to CommentCount so it does not query per row.

import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { Ellipsis, MessageSquare, Pencil, Trash2 } from 'lucide-react';
import type { Comment, CommentTarget, User } from '@regatta-ops/domain';
import {
  change,
  findMentions,
  newId,
  parseMentions,
  useCan,
  useCurrentUser,
  useDelete,
  useList,
  useStoreMutation,
  useUpdate,
  type ListQuery,
  type MentionUser,
} from '@/data';
import { cn } from '@/lib/cn';
import { relativeTime } from '@/lib/relative-time';
import { EmptyState, ErrorState, SkeletonRows } from './states';
import { Button } from './ui/button';
import { Dialog, DialogClose, DialogContent, DialogFooter } from './ui/dialog';
import { Label, Textarea } from './ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './ui/menu';

// ---------------------------------------------------------------------------
// Queries

function threadQuery(targetType: CommentTarget, targetId: string): ListQuery<Comment> {
  return { where: { targetType, targetId }, sort: ['created', 'id'] };
}

/** Comment counts for many targets of one type with a single query (event rows, say). */
export function useCommentCounts(
  targetType: CommentTarget,
  targetIds: readonly string[],
): Map<string, number> {
  const q = useList(
    'comments',
    { where: { targetType }, in: { targetId: [...targetIds] } },
    { enabled: targetIds.length > 0 },
  );
  return useMemo(() => {
    const counts = new Map<string, number>();
    for (const c of q.data ?? []) counts.set(c.targetId, (counts.get(c.targetId) ?? 0) + 1);
    return counts;
  }, [q.data]);
}

// ---------------------------------------------------------------------------
// Mentions in the composer

const WORD = /[A-Za-z0-9_À-ɏ]/;

/**
 * The "@..." being typed at the caret, if any: the "@" must start the text or follow a
 * non-word character, and what follows it must look like the start of a name.
 */
export function mentionAtCaret(
  text: string,
  caret: number,
): { start: number; query: string } | null {
  const before = text.slice(0, caret);
  const at = before.lastIndexOf('@');
  if (at === -1) return null;
  if (at > 0 && WORD.test(before[at - 1]!)) return null;
  const query = before.slice(at + 1);
  if (query.length > 40 || /[\n@]/.test(query) || /^\s|\s{2}/.test(query)) return null;
  return { start: at, query };
}

/** People whose name starts with the query, or has a word that does; best matches first. */
export function suggestUsers<U extends Pick<User, 'id' | 'name'>>(
  users: readonly U[],
  query: string,
  limit = 6,
): U[] {
  const q = query.trim().toLowerCase().replace(/\s+/g, ' ');
  const scored: { u: U; score: number }[] = [];
  for (const u of users) {
    const name = u.name.toLowerCase();
    if (!q) scored.push({ u, score: 1 });
    else if (name.startsWith(q)) scored.push({ u, score: 0 });
    else if (name.split(' ').some((w) => w.startsWith(q))) scored.push({ u, score: 1 });
  }
  return scored
    .sort((a, b) => a.score - b.score || a.u.name.localeCompare(b.u.name))
    .slice(0, limit)
    .map((s) => s.u);
}

const IS_MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || '');
const SUBMIT_HINT = IS_MAC ? '⌘ Enter' : 'Ctrl+Enter';

function Initials({ user, className }: { user: User | undefined; className?: string }) {
  const name = user?.name ?? '?';
  const initials = name
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
  if (user?.avatarUrl) {
    return (
      <img
        src={user.avatarUrl}
        alt=""
        className={cn('size-8 shrink-0 rounded-full object-cover', className)}
      />
    );
  }
  return (
    <span
      aria-hidden
      className={cn(
        'inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-surface-2 text-xs font-medium text-ink-2',
        className,
      )}
    >
      {initials}
    </span>
  );
}

export interface MentionComposerProps {
  users: readonly User[];
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onCancel?: () => void;
  /** Accessible name of the text box. */
  label: string;
  submitLabel: string;
  placeholder?: string;
  autoFocus?: boolean;
  disabled?: boolean;
}

/** A comment box with @-mention autocomplete. Enter picks a person; Ctrl/⌘+Enter submits. */
export function MentionComposer({
  users,
  value,
  onChange,
  onSubmit,
  onCancel,
  label,
  submitLabel,
  placeholder = 'Write a comment. Type @ to mention someone.',
  autoFocus,
  disabled,
}: MentionComposerProps) {
  const id = useId();
  const listId = `${id}-people`;
  const ref = useRef<HTMLTextAreaElement>(null);
  const [caret, setCaret] = useState(value.length);
  const [active, setActive] = useState(0);
  /** The "@" position whose list was closed with Escape. */
  const [dismissedAt, setDismissedAt] = useState<number | null>(null);
  const pendingCaret = useRef<number | null>(null);

  const found = mentionAtCaret(value, caret);
  // A full name followed by a space is a finished mention: close the list.
  const finished =
    !!found &&
    /\s$/.test(found.query) &&
    users.some((u) => u.name.toLowerCase() === found.query.trim().toLowerCase());
  const mention = finished ? null : found;
  const matches = mention ? suggestUsers(users, mention.query) : [];
  const open = !!mention && mention.start !== dismissedAt && matches.length > 0;
  const activeIndex = Math.min(active, Math.max(matches.length - 1, 0));

  useLayoutEffect(() => {
    if (pendingCaret.current === null || !ref.current) return;
    ref.current.setSelectionRange(pendingCaret.current, pendingCaret.current);
    pendingCaret.current = null;
  });

  const insert = (user: User) => {
    if (!mention) return;
    const text = `@${user.name} `;
    const next = value.slice(0, mention.start) + text + value.slice(caret);
    const at = mention.start + text.length;
    pendingCaret.current = at;
    setCaret(at);
    setActive(0);
    onChange(next);
    ref.current?.focus();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (open) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActive((i) => Math.min(i + 1, matches.length - 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActive((i) => Math.max(i - 1, 0));
        return;
      }
      if ((e.key === 'Enter' && !e.metaKey && !e.ctrlKey) || e.key === 'Tab') {
        e.preventDefault();
        insert(matches[activeIndex]!);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        setDismissedAt(mention!.start);
        return;
      }
    }
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      if (value.trim() && !disabled) onSubmit();
      return;
    }
    if (e.key === 'Escape' && onCancel) {
      e.preventDefault();
      e.stopPropagation();
      onCancel();
    }
  };

  const syncCaret = () => setCaret(ref.current?.selectionStart ?? value.length);
  const optionId = (i: number) => `${id}-person-${i}`;

  return (
    <div className="flex flex-col gap-2">
      <div className="relative">
        <Label htmlFor={`${id}-text`} className="sr-only">
          {label}
        </Label>
        <Textarea
          ref={ref}
          id={`${id}-text`}
          value={value}
          placeholder={placeholder}
          autoFocus={autoFocus}
          disabled={disabled}
          rows={3}
          aria-autocomplete="list"
          aria-controls={open ? listId : undefined}
          aria-activedescendant={open ? optionId(activeIndex) : undefined}
          aria-describedby={`${id}-hint`}
          onChange={(e) => {
            onChange(e.target.value);
            setCaret(e.target.selectionStart ?? e.target.value.length);
            setActive(0);
          }}
          onSelect={syncCaret}
          onClick={syncCaret}
          onKeyDown={onKeyDown}
          className="min-h-20 resize-y pointer-coarse:text-md"
        />
        {open && (
          <ul
            id={listId}
            role="listbox"
            aria-label="People to mention"
            className="absolute top-full left-0 z-50 mt-1 flex w-72 max-w-full flex-col rounded-card border border-line bg-surface p-1 shadow-popover"
          >
            {matches.map((u, i) => (
              <li
                key={u.id}
                id={optionId(i)}
                role="option"
                aria-selected={i === activeIndex}
                // Keep focus in the text box.
                onMouseDown={(e) => {
                  e.preventDefault();
                  insert(u);
                }}
                onMouseEnter={() => setActive(i)}
                className={cn(
                  'flex h-9 cursor-pointer items-center gap-2 rounded-control px-2 text-base pointer-coarse:h-11',
                  i === activeIndex && 'bg-surface-2',
                )}
              >
                <Initials user={u} className="size-6 text-[11px]" />
                <span className="truncate">{u.name}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span id={`${id}-hint`} className="text-sm text-ink-2">
          {SUBMIT_HINT} to {submitLabel.toLowerCase()}
        </span>
        <div className="flex gap-2">
          {onCancel && (
            <Button size="sm" variant="ghost" onClick={onCancel}>
              Cancel
            </Button>
          )}
          <Button
            size="sm"
            variant="primary"
            disabled={disabled || !value.trim()}
            onClick={onSubmit}
          >
            {submitLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// A comment

/** The body with @-mentions highlighted: the server's `mentions`, or the text when absent. */
export function CommentBody({
  comment,
  users,
  meId,
}: {
  comment: Pick<Comment, 'body' | 'mentions'>;
  users: readonly User[];
  meId?: string | null;
}) {
  const parts = useMemo(() => {
    const candidates: MentionUser[] = comment.mentions
      ? users.filter((u) => comment.mentions!.includes(u.id))
      : [...users];
    const matches = findMentions(comment.body, candidates);
    const out: ReactNode[] = [];
    let last = 0;
    matches.forEach((m, i) => {
      if (m.start > last) out.push(comment.body.slice(last, m.start));
      const me = m.userId === meId;
      out.push(
        <span
          key={i}
          data-mention={m.userId}
          className={cn(
            'rounded-[4px] font-medium',
            me ? 'bg-accent-tint px-0.5 text-ink' : 'text-accent',
          )}
        >
          {comment.body.slice(m.start, m.end)}
        </span>,
      );
      last = m.end;
    });
    if (last < comment.body.length) out.push(comment.body.slice(last));
    return out;
  }, [comment.body, comment.mentions, users, meId]);
  return (
    <p className="text-base leading-prose break-words whitespace-pre-wrap text-ink">{parts}</p>
  );
}

function useMinuteClock(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);
  return now;
}

function CommentItem({
  comment,
  users,
  me,
  now,
}: {
  comment: Comment;
  users: readonly User[];
  me: User | null;
  now: Date;
}) {
  const author = users.find((u) => u.id === comment.authorId);
  const own = !!me && comment.authorId === me.id;
  const canDelete = own || me?.role === 'admin';
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(comment.body);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const update = useUpdate('comments', { errorMessage: 'The comment was not saved. Try again.' });
  const remove = useDelete('comments', { errorMessage: 'The comment was not deleted. Try again.' });
  const edited =
    !!comment.created &&
    !!comment.updated &&
    new Date(comment.updated).getTime() - new Date(comment.created).getTime() > 2000;
  const created = comment.created ?? '';

  const save = () => {
    const body = draft.trim();
    if (!body) return;
    if (body !== comment.body) {
      update.mutate({ id: comment.id, patch: { body, mentions: parseMentions(body, users) } });
    }
    setEditing(false);
  };

  return (
    <li className="flex gap-3">
      <Initials user={author} />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-center gap-2">
          <div className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2">
            <span className="text-base font-medium text-ink">{author?.name ?? 'Someone'}</span>
            {created && (
              <time
                dateTime={created}
                title={new Date(created).toLocaleString()}
                className="text-sm text-ink-2"
              >
                {relativeTime(created, now)}
              </time>
            )}
            {edited && <span className="text-sm text-ink-2">· edited</span>}
          </div>
          {(own || canDelete) && !editing && (
            // Not modal: the delete dialog opens from it, and a modal menu would fight the dialog
            // over focus and pointer events.
            <DropdownMenu modal={false}>
              <DropdownMenuTrigger asChild>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label={`Comment actions, ${author?.name ?? 'comment'}`}
                  className="-my-1 text-ink-2"
                >
                  <Ellipsis aria-hidden />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {own && (
                  <DropdownMenuItem
                    onSelect={() => {
                      setDraft(comment.body);
                      setEditing(true);
                    }}
                  >
                    <Pencil aria-hidden />
                    Edit comment
                  </DropdownMenuItem>
                )}
                {canDelete && (
                  <DropdownMenuItem onSelect={() => setConfirmDelete(true)}>
                    <Trash2 aria-hidden />
                    Delete comment
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
        {editing ? (
          <MentionComposer
            users={users}
            value={draft}
            onChange={setDraft}
            onSubmit={save}
            onCancel={() => setEditing(false)}
            label="Edit comment"
            submitLabel="Save comment"
            autoFocus
          />
        ) : (
          <CommentBody comment={comment} users={users} meId={me?.id} />
        )}
      </div>
      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent
          title="Delete comment"
          description="The comment is removed for everyone. This cannot be undone."
        >
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="ghost">Cancel</Button>
            </DialogClose>
            <Button
              variant="danger"
              onClick={() => {
                remove.mutate(comment.id);
                setConfirmDelete(false);
              }}
            >
              Delete comment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </li>
  );
}

// ---------------------------------------------------------------------------
// The thread

export interface CommentsThreadProps {
  targetType: CommentTarget;
  /** The entry, event, or load plan id. */
  targetId: string;
  /** Heading above the thread; null hides it (the host has its own). Default "Comments". */
  title?: string | null;
  className?: string;
}

/**
 * The comments on one entry, event, or load plan, oldest first, with a composer at the end.
 * Loading, empty, and error states included; the empty state invites the first comment.
 */
export function CommentsThread({
  targetType,
  targetId,
  title = 'Comments',
  className,
}: CommentsThreadProps) {
  const me = useCurrentUser();
  const canComment = useCan('comment');
  const comments = useList('comments', threadQuery(targetType, targetId));
  const usersQuery = useList('users', { sort: 'name' });
  const users = usersQuery.data ?? [];
  const now = useMinuteClock();
  const [draft, setDraft] = useState('');
  const headingId = useId();

  const post = useStoreMutation<{ id: string; body: string; authorId: string }, Comment>({
    mutationFn: (store, { id, body, authorId }) =>
      store.create('comments', { id, targetType, targetId, authorId, body }),
    optimistic: ({ id, body, authorId }) => {
      const at = new Date().toISOString();
      return [
        change.create('comments', {
          id,
          targetType,
          targetId,
          authorId,
          body,
          mentions: parseMentions(body, users),
          created: at,
          updated: at,
        }),
      ];
    },
    errorMessage: 'The comment was not posted. Try again.',
    // Put the text back so nothing typed is lost.
    onError: (_err, vars) => setDraft((d) => d || vars.body),
  });

  const submit = () => {
    const body = draft.trim();
    if (!body || !me) return;
    post.mutate({ id: newId(), body, authorId: me.id });
    setDraft('');
  };

  const list = comments.data ?? [];
  return (
    <section
      aria-labelledby={title ? headingId : undefined}
      aria-label={title ? undefined : 'Comments'}
      className={cn('flex flex-col gap-4', className)}
    >
      {title && (
        <h3 id={headingId} className="flex items-baseline gap-2 text-md font-medium text-ink">
          {title}{' '}
          {list.length > 0 && (
            <span className="text-sm font-normal text-ink-2 tabular-nums">{list.length}</span>
          )}
        </h3>
      )}
      {comments.isPending ? (
        <SkeletonRows rows={2} />
      ) : comments.isError ? (
        <ErrorState
          title="Comments did not load."
          error={comments.error}
          onRetry={() => void comments.refetch()}
        />
      ) : list.length === 0 ? (
        <EmptyState
          className="py-4"
          title="No comments yet"
          description={
            canComment
              ? 'Leave a note for the other coaches below. Type @ and a name to let someone know by email.'
              : 'Nobody has commented here yet.'
          }
        />
      ) : (
        <ol className="flex flex-col gap-4">
          {list.map((c) => (
            <CommentItem key={c.id} comment={c} users={users} me={me} now={now} />
          ))}
        </ol>
      )}
      {canComment && me && (
        <MentionComposer
          users={users}
          value={draft}
          onChange={setDraft}
          onSubmit={submit}
          label="Add a comment"
          submitLabel="Post comment"
        />
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// The count

export interface CommentCountProps {
  targetType: CommentTarget;
  targetId: string;
  /** A count you already have (from useCommentCounts); skips the per-target query. */
  count?: number;
  /** Show "0" instead of nothing when there are no comments. */
  showZero?: boolean;
  className?: string;
}

/** A small speech-bubble count for rows and headers. Renders nothing at zero by default. */
export function CommentCount({
  targetType,
  targetId,
  count,
  showZero = false,
  className,
}: CommentCountProps) {
  const q = useList('comments', threadQuery(targetType, targetId), {
    enabled: count === undefined,
  });
  const n = count ?? q.data?.length ?? 0;
  if (n === 0 && !showZero) return null;
  const text = `${n} ${n === 1 ? 'comment' : 'comments'}`;
  return (
    <span
      title={text}
      className={cn(
        'inline-flex h-5 shrink-0 items-center gap-1 rounded-control border border-line bg-surface px-1.5 text-xs font-medium text-ink-2 tabular-nums',
        className,
      )}
    >
      <MessageSquare className="size-3" aria-hidden />
      <span aria-hidden>{n}</span>
      <span className="sr-only">{text}</span>
    </span>
  );
}
