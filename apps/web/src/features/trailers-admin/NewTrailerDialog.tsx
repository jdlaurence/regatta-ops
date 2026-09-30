// "New trailer": a name and a starting layout; the trailer, its shelves, and its compartments
// are created in one batch, with default rules for its levels.

import { useId, useState } from 'react';
import { useNavigate } from 'react-router';
import { RadioGroup } from 'radix-ui';
import { newId } from '@/data';
import { toast } from '@/components/toast';
import { TrailerEndView } from '@/components/trailer/TrailerEndView';
import { Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { Field, Input } from '@/components/ui/input';
import { cn } from '@/lib/cn';
import { draftFromDef } from './draft';
import { useSaveTrailer } from './hooks';
import { TRAILER_PRESETS, defaultRulesFor, type PresetKey } from './presets';

const PREVIEWS = Object.fromEntries(
  TRAILER_PRESETS.map((p) => {
    let n = 0;
    return [
      p.key,
      p.build({ id: `preview-${p.key}`, name: p.title, newId: () => `${p.key}-${++n}` }),
    ];
  }),
);

export function NewTrailerDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const id = useId();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [preset, setPreset] = useState<PresetKey>('offset-post');
  const [tried, setTried] = useState(false);
  const save = useSaveTrailer();
  const nameError = tried && !name.trim() ? 'Enter a name.' : undefined;

  const create = async () => {
    setTried(true);
    if (!name.trim()) return;
    const trailerId = newId();
    const def = TRAILER_PRESETS.find((p) => p.key === preset)!.build({
      id: trailerId,
      name: name.trim(),
      newId,
    });
    const draft = draftFromDef(
      def,
      defaultRulesFor(def.shelves.map((s) => s.tier)),
      'Dimensions from a preset; measure and correct them.',
    );
    try {
      await save.save(null, draft);
      toast.success('Trailer added');
      onOpenChange(false);
      setName('');
      setTried(false);
      void navigate(`/trailers/${trailerId}`);
    } catch {
      // The batch hook shows the error.
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title="New trailer"
        description="Pick the closest layout. You can change every shelf after."
        className="max-w-xl"
      >
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            void create();
          }}
        >
          <Field id={`${id}-name`} label="Name" error={nameError}>
            <Input
              id={`${id}-name`}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Borrowed trailer"
              aria-invalid={nameError ? true : undefined}
              aria-describedby={nameError ? `${id}-name-error` : undefined}
            />
          </Field>
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1.5 text-sm font-medium">Layout</legend>
            <RadioGroup.Root
              value={preset}
              onValueChange={(v) => setPreset(v as PresetKey)}
              className="flex flex-col gap-2"
              aria-label="Layout"
            >
              {TRAILER_PRESETS.map((p) => (
                <RadioGroup.Item
                  key={p.key}
                  value={p.key}
                  className={cn(
                    'flex items-center gap-3 rounded-card border border-line bg-surface p-3 text-left hover:bg-surface-2',
                    'data-[state=checked]:border-accent data-[state=checked]:bg-accent-tint',
                  )}
                >
                  <span aria-hidden className="shrink-0">
                    <TrailerEndView trailer={PREVIEWS[p.key]!} size="thumb" width={72} />
                  </span>
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="text-base font-medium text-ink">{p.title}</span>
                    <span className="text-sm leading-prose text-ink-2">{p.description}</span>
                  </span>
                </RadioGroup.Item>
              ))}
            </RadioGroup.Root>
          </fieldset>
          <DialogFooter>
            <DialogClose asChild>
              <Button>Cancel</Button>
            </DialogClose>
            <Button variant="primary" type="submit" disabled={save.isPending}>
              Add trailer
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
