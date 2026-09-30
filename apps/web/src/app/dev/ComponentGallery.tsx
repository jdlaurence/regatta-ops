// /dev/components (dev and demo only): every shared component, for review in both themes.
// Names here are invented, like all athlete names in the repository.

import { useState, type ReactNode } from 'react';
import { Monitor, Moon, Plus, Sun } from 'lucide-react';
import {
  BOAT_CLASSES,
  TEAM_COLOR_KEYS,
  seatsFor,
  type BoatClass,
  type Finding,
  type Seat,
  type TeamColorKey,
} from '@srt/domain';
import { BoatStrip, BoatStripSkeleton, type SeatOccupant } from '@/components/BoatStrip';
import { ConflictBadge, ConflictBadges, ConflictIcon } from '@/components/ConflictBadge';
import { ClassBadge, OarChip, ShellChip, SideBadge, TeamChip, TeamDot } from '@/components/chips';
import { PageHeader } from '@/components/PageHeader';
import { EmptyState, ErrorState, PageSkeleton, Skeleton, SkeletonRows } from '@/components/states';
import { toast } from '@/components/toast';
import { Button } from '@/components/ui/button';
import { Checkbox, SegmentedControl, Switch } from '@/components/ui/controls';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogTrigger,
  Sheet,
  SheetContent,
  SheetTrigger,
} from '@/components/ui/dialog';
import { Field, Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Tooltip,
} from '@/components/ui/menu';
import { ShareGallery } from '@/features/share/ShareGallery';
import { TEAM_COLOR_LABELS } from '@/lib/team-colors';
import { RuleCardGallery, TrailerEndViewGallery, TrailerIsometricGallery } from './TrailerGallery';
import { useTheme, type ThemeChoice } from '../theme';

const NAMES: [string, string][] = [
  ['Ava', 'Chen'],
  ['Maya', 'Park'],
  ['Lena', 'Kim'],
  ['Zoe', 'Lin'],
  ['Jo', 'Reyes'],
  ['Sam', 'Tran'],
  ['Ivy', 'Moss'],
  ['Nell', 'Ortiz'],
  ['Ari', 'Lee'],
];

function crew(cls: BoatClass, empty: Seat[] = []): Partial<Record<Seat, SeatOccupant | null>> {
  const out: Partial<Record<Seat, SeatOccupant | null>> = {};
  seatsFor(cls).forEach((seat, i) => {
    if (empty.includes(seat)) return;
    const [first, last] = seat === 'cox' ? NAMES[8]! : NAMES[i % 8]!;
    out[seat] = {
      id: `${cls}-${seat}`,
      name: `${first} ${last}`,
      shortName: `${first} ${last[0]}.`,
    };
  });
  return out;
}

const CLASS_TEAM: Record<BoatClass, TeamColorKey> = {
  '1x': 'slate',
  '2x': 'cyan',
  '2-': 'bronze',
  '2+': 'ochre',
  '4x': 'green',
  '4x+': 'raspberry',
  '4+': 'navy',
  '4-': 'violet',
  '8+': 'navy',
};

const SAMPLE_FINDINGS: Finding[] = [
  {
    id: 'f1',
    code: 'SHELL_CONFLICT',
    severity: 'error',
    message:
      'Monahan is also used by Girls V8 at 10:20; only 12 minutes between the boat landing and the next race.',
    entryIds: [],
    teamIds: [],
  },
  {
    id: 'f2',
    code: 'SHELL_HOT_SEAT',
    severity: 'warning',
    message: 'Hot seat: Spencer lands from Boys 2V4+ 20 minutes before Girls V4+ launches.',
    entryIds: [],
    teamIds: [],
  },
  {
    id: 'f3',
    code: 'RERIG_NEEDED',
    severity: 'info',
    message: 'Lundberg races as a 4+ and then as a 4x+. Bring the second rigger set.',
    entryIds: [],
    teamIds: [],
  },
];

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4 border-t border-line pt-6">
      <h2 className="font-display text-lg font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2 md:flex-row md:items-center md:gap-4">
      <div className="w-32 shrink-0 text-sm text-ink-2">{label}</div>
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}

function Swatch({ name, varName }: { name: string; varName: string }) {
  return (
    <div className="flex items-center gap-2">
      <span
        className="size-8 shrink-0 rounded-control border border-line"
        style={{ background: `var(${varName})` }}
      />
      <span className="text-sm">
        <span className="block font-medium">{name}</span>
        <span className="text-ink-2">{varName}</span>
      </span>
    </div>
  );
}

function InteractiveStrip({ orientation }: { orientation?: 'horizontal' | 'vertical' }) {
  const [seats, setSeats] = useState(crew('4+', ['3']));
  const [selected, setSelected] = useState<Seat | null>('2');
  const [settling, setSettling] = useState<Seat | null>(null);
  return (
    <div className="flex w-full flex-col gap-2">
      <BoatStrip
        boatClass="4+"
        orientation={orientation}
        teamColor="raspberry"
        seats={seats}
        selectedSeat={selected}
        settlingSeat={settling}
        label="Girls V4+"
        onSeatClick={(s) => setSelected(s.seat)}
        onSeatKeyDown={(s, e) => {
          if (e.key === 'Delete' || e.key === 'Backspace') {
            setSeats((prev) => ({ ...prev, [s.seat]: null }));
          }
          if (e.key === 'Enter' && !s.occupant) {
            e.preventDefault();
            setSeats((prev) => ({
              ...prev,
              [s.seat]: { name: 'Rosa Diaz', shortName: 'Rosa D.' },
            }));
            setSettling(s.seat);
          }
        }}
      />
      <p className="text-sm text-ink-2">
        Click a seat to select it. Delete clears a focused seat; Enter fills an empty one.
      </p>
    </div>
  );
}

export default function ComponentGallery() {
  const { choice, setChoice } = useTheme();
  const [checked, setChecked] = useState(true);
  const [on, setOn] = useState(false);
  const [view, setView] = useState<'list' | 'timeline'>('list');

  return (
    <div className="flex max-w-[1100px] flex-col gap-8">
      <PageHeader
        title="Components"
        description="Every shared component, for review in light and dark."
        actions={
          <SegmentedControl<ThemeChoice>
            label="Theme"
            value={choice}
            onValueChange={setChoice}
            options={[
              { value: 'light', label: 'Light', icon: <Sun aria-hidden /> },
              { value: 'dark', label: 'Dark', icon: <Moon aria-hidden /> },
              { value: 'system', label: 'System', icon: <Monitor aria-hidden /> },
            ]}
          />
        }
      />

      <Section title="Boat strip">
        {BOAT_CLASSES.map((cls) => (
          <div key={cls} className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <ClassBadge boatClass={cls} />
              <span className="text-sm text-ink-2">xs, sm, md, print</span>
            </div>
            <BoatStrip boatClass={cls} size="xs" teamColor={CLASS_TEAM[cls]} seats={crew(cls)} />
            <BoatStrip boatClass={cls} size="sm" teamColor={CLASS_TEAM[cls]} seats={crew(cls)} />
            <BoatStrip boatClass={cls} size="md" teamColor={CLASS_TEAM[cls]} seats={crew(cls)} />
            <BoatStrip boatClass={cls} size="print" seats={crew(cls)} />
          </div>
        ))}
        <Row label="Empty seats">
          <div className="flex w-full flex-col gap-2">
            <BoatStrip
              boatClass="8+"
              size="md"
              teamColor="navy"
              seats={crew('8+', ['2', '3', 'cox'])}
            />
            <BoatStrip
              boatClass="8+"
              size="sm"
              teamColor="navy"
              seats={crew('8+', ['2', '3', 'cox'])}
            />
            <BoatStrip
              boatClass="8+"
              size="xs"
              teamColor="navy"
              seats={crew('8+', ['2', '3', 'cox'])}
            />
            <BoatStrip boatClass="4x" size="md" teamColor="green" />
          </div>
        </Row>
        <Row label="Conflicts">
          <div className="flex w-full flex-col gap-2">
            <BoatStrip
              boatClass="4+"
              size="md"
              teamColor="navy"
              seats={crew('4+')}
              conflict="error"
            />
            <BoatStrip
              boatClass="4+"
              size="md"
              teamColor="navy"
              seats={crew('4+')}
              conflict="warning"
            />
            <BoatStrip
              boatClass="4+"
              size="sm"
              teamColor="navy"
              seats={crew('4+')}
              conflict="info"
            />
            <BoatStrip
              boatClass="4x+"
              size="md"
              teamColor="raspberry"
              seats={crew('4x+')}
              seatConflicts={{ '2': 'error', cox: 'info' }}
              conflict="error"
            />
          </div>
        </Row>
        <Row label="Starboard rig">
          <BoatStrip
            boatClass="4+"
            size="md"
            teamColor="ochre"
            seats={crew('4+')}
            seatSides={{ '1': 'port', '2': 'starboard', '3': 'port', '4': 'starboard' }}
          />
        </Row>
        <Row label="Stretch">
          <BoatStrip boatClass="8+" size="md" teamColor="navy" seats={crew('8+')} stretch />
        </Row>
        <Row label="Interactive">
          <InteractiveStrip />
        </Row>
        <Row label="Loading">
          <div className="flex w-full flex-col gap-2">
            <BoatStripSkeleton size="md" />
            <BoatStripSkeleton size="sm" />
          </div>
        </Row>
      </Section>

      <Section title="Boat strip, vertical">
        <p className="max-w-prose text-sm text-ink-2">
          The lineup builder and the lineup sheet stand the hull on end, the way coaches write
          lineups: the cox on top, then stroke down to bow.
        </p>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] items-start gap-4">
          {BOAT_CLASSES.map((cls) => (
            <div key={cls} className="flex flex-col gap-2">
              <ClassBadge boatClass={cls} className="self-start" />
              <BoatStrip
                boatClass={cls}
                orientation="vertical"
                teamColor={CLASS_TEAM[cls]}
                seats={crew(cls)}
              />
            </div>
          ))}
        </div>
        <Row label="Empty seats">
          <div className="grid w-full grid-cols-[repeat(auto-fill,minmax(200px,1fr))] items-start gap-4">
            <BoatStrip
              boatClass="8+"
              orientation="vertical"
              teamColor="navy"
              seats={crew('8+', ['2', '5', 'cox'])}
            />
            <BoatStrip boatClass="4x" orientation="vertical" teamColor="green" />
            <BoatStripSkeleton orientation="vertical" seats={5} />
          </div>
        </Row>
        <Row label="Conflicts">
          <div className="grid w-full grid-cols-[repeat(auto-fill,minmax(200px,1fr))] items-start gap-4">
            <BoatStrip
              boatClass="4+"
              orientation="vertical"
              teamColor="navy"
              seats={crew('4+')}
              seatConflicts={{ '3': 'error' }}
              conflict="error"
            />
            <BoatStrip
              boatClass="4x+"
              orientation="vertical"
              teamColor="raspberry"
              seats={crew('4x+')}
              seatConflicts={{ '2': 'warning', cox: 'info' }}
              conflict="warning"
            />
            <BoatStrip
              boatClass="2-"
              orientation="vertical"
              teamColor="bronze"
              seats={crew('2-')}
              conflict="info"
            />
          </div>
        </Row>
        <Row label="Starboard rig">
          <div className="w-full max-w-[240px]">
            <BoatStrip
              boatClass="4+"
              orientation="vertical"
              teamColor="ochre"
              seats={crew('4+')}
              seatSides={{ '1': 'port', '2': 'starboard', '3': 'port', '4': 'starboard' }}
            />
          </div>
        </Row>
        <Row label="Sizes">
          <div className="grid w-full grid-cols-[repeat(auto-fill,minmax(180px,1fr))] items-start gap-4">
            <BoatStrip
              boatClass="4+"
              orientation="vertical"
              size="sm"
              teamColor="navy"
              seats={crew('4+')}
            />
            <BoatStrip
              boatClass="4+"
              orientation="vertical"
              size="xs"
              teamColor="navy"
              seats={crew('4+')}
            />
            <BoatStrip
              boatClass="4+"
              orientation="vertical"
              size="print"
              seats={crew('4+', ['2'])}
            />
          </div>
        </Row>
        <Row label="Interactive">
          <div className="w-full max-w-[260px]">
            <InteractiveStrip orientation="vertical" />
          </div>
        </Row>
      </Section>

      <Section title="Chips and badges">
        <Row label="Team chip">
          {TEAM_COLOR_KEYS.map((k) => (
            <TeamChip
              key={k}
              team={{ name: `${TEAM_COLOR_LABELS[k]} team`, shortName: k, colorKey: k }}
            />
          ))}
        </Row>
        <Row label="Team chip, small">
          <TeamChip
            size="sm"
            short
            team={{ name: 'Junior boys', shortName: 'Boys', colorKey: 'navy' }}
          />
          <TeamChip
            size="sm"
            short
            team={{ name: 'Junior girls', shortName: 'Girls', colorKey: 'raspberry' }}
          />
          <TeamDot colorKey="green" />
          <TeamDot colorKey="violet" />
        </Row>
        <Row label="Side badge">
          <SideBadge side="port" />
          <SideBadge side="starboard" />
          <SideBadge side="both" />
          <SideBadge side="none" canScull />
        </Row>
        <Row label="Class badge">
          {BOAT_CLASSES.map((c) => (
            <ClassBadge key={c} boatClass={c} />
          ))}
        </Row>
        <Row label="Shell chip">
          <ShellChip
            shell={{ name: 'Monahan', nickname: '', boatClass: '8+', status: 'in_service' }}
            teamColor="navy"
          />
          <ShellChip
            shell={{
              name: "Peggy's Delight",
              nickname: 'Peggy',
              boatClass: '8+',
              status: 'in_service',
            }}
            teamColor="raspberry"
          />
          <ShellChip
            shell={{ name: 'Lundberg', nickname: '', boatClass: '4+', status: 'limited' }}
          />
          <ShellChip
            shell={{ name: 'Snoopy', nickname: '', boatClass: '4x', status: 'out_of_service' }}
            teamColor="green"
          />
        </Row>
        <Row label="Oar chip">
          <OarChip
            oarSet={{ name: '24-C', color: 'yellow-white', type: 'sweep', status: 'in_service' }}
          />
          <OarChip oarSet={{ name: 'Blue', color: 'blue-red', type: 'scull', status: 'limited' }} />
        </Row>
        <Row label="Conflict badge">
          <ConflictBadge severity="error" count={2} />
          <ConflictBadge severity="warning" count={1} />
          <ConflictBadge severity="info" count={3} />
          <ConflictBadge severity="warning" label="Hot seat" />
          <ConflictBadge severity="info" label="Hot seat" />
          <ConflictBadges findings={SAMPLE_FINDINGS} />
        </Row>
        <Row label="Conflict icon">
          <ConflictIcon severity="error" title="Error" />
          <ConflictIcon severity="warning" title="Warning" />
          <ConflictIcon severity="info" title="Note" />
        </Row>
      </Section>

      <Section title="Controls">
        <Row label="Buttons">
          <Button variant="primary">
            <Plus aria-hidden />
            Add entry
          </Button>
          <Button>Print</Button>
          <Button variant="ghost">Cancel</Button>
          <Button variant="danger">Delete entry</Button>
          <Button variant="link">Show all shells</Button>
          <Button variant="primary" disabled>
            Auto pack trailer
          </Button>
        </Row>
        <Row label="Sizes">
          <Button size="sm">Small</Button>
          <Button size="md">Medium</Button>
          <Tooltip content="Add entry">
            <Button size="icon" aria-label="Add entry">
              <Plus aria-hidden />
            </Button>
          </Tooltip>
        </Row>
        <Row label="Fields">
          <div className="grid w-full max-w-md gap-4">
            <Field id="g-name" label="Regatta name" hint="As it appears on the published schedule.">
              <Input id="g-name" placeholder="Head of the Lake" />
            </Field>
            <Field id="g-err" label="Launch lead" error="Enter minutes between 0 and 180.">
              <Input id="g-err" aria-invalid defaultValue="-5" />
            </Field>
          </div>
        </Row>
        <Row label="Toggles">
          <label className="flex items-center gap-2">
            <Checkbox checked={checked} onCheckedChange={(v) => setChecked(v === true)} />
            Loaded
          </label>
          <label className="flex items-center gap-2">
            <Switch checked={on} onCheckedChange={setOn} />
            Keep heavier boats low
          </label>
          <SegmentedControl
            label="View"
            value={view}
            onValueChange={setView}
            options={[
              { value: 'list', label: 'List' },
              { value: 'timeline', label: 'Timeline' },
            ]}
          />
        </Row>
        <Row label="Overlays">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button>Entry actions</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem>Duplicate entry</DropdownMenuItem>
              <DropdownMenuItem>Move to another event</DropdownMenuItem>
              <DropdownMenuItem>Scratch entry</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Popover>
            <PopoverTrigger asChild>
              <Button>Why here?</Button>
            </PopoverTrigger>
            <PopoverContent>
              <p className="text-base leading-prose">
                Long boats go on the top rack (must). Heavier boats low (+12).
              </p>
            </PopoverContent>
          </Popover>
          <Dialog>
            <DialogTrigger asChild>
              <Button>New regatta</Button>
            </DialogTrigger>
            <DialogContent title="New regatta" description="Name, dates, venue, and format.">
              <Field id="d-name" label="Name">
                <Input id="d-name" />
              </Field>
              <DialogFooter>
                <DialogClose asChild>
                  <Button variant="ghost">Cancel</Button>
                </DialogClose>
                <Button variant="primary">Create regatta</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          <Sheet>
            <SheetTrigger asChild>
              <Button>Seat 3</Button>
            </SheetTrigger>
            <SheetContent side="bottom" title="Seat 3" description="Pick an athlete for seat 3.">
              <div className="p-4 text-ink-2">Candidates go here.</div>
            </SheetContent>
          </Sheet>
        </Row>
        <Row label="Toasts">
          <Button onClick={() => toast.success('Trailer packed')}>Success</Button>
          <Button
            onClick={() =>
              toast.error(
                'This shell is out of service. Pick another or change its status in Fleet.',
              )
            }
          >
            Error
          </Button>
          <Button onClick={() => toast('Updated by Sam just now')}>Plain</Button>
        </Row>
      </Section>

      <ShareGallery />

      <Section title="Trailer end view">
        <TrailerEndViewGallery />
      </Section>

      <Section title="Trailer isometric view">
        <TrailerIsometricGallery />
      </Section>

      <Section title="Rule cards and the rules editor">
        <RuleCardGallery />
      </Section>

      <Section title="States">
        <EmptyState
          title="No entries yet"
          description="Add one from an event on the schedule, or add an unscheduled entry."
          action={
            <Button variant="primary">
              <Plus aria-hidden />
              Add entry
            </Button>
          }
        />
        <ErrorState
          error={new Error('Could not reach the server. Check your connection.')}
          onRetry={() => {}}
        />
        <div className="grid gap-4 md:grid-cols-2">
          <SkeletonRows rows={3} />
          <div className="flex w-full flex-col gap-2">
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-24" />
          </div>
        </div>
        <PageSkeleton />
      </Section>

      <Section title="Tokens">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[
            ['Background', '--bg'],
            ['Surface', '--surface'],
            ['Surface 2', '--surface-2'],
            ['Line', '--line'],
            ['Line strong', '--line-strong'],
            ['Ink', '--ink'],
            ['Ink 2', '--ink-2'],
            ['Accent', '--accent'],
            ['Danger', '--danger'],
            ['Warning', '--warn'],
            ['OK', '--ok'],
            ['Info', '--info'],
          ].map(([n, v]) => (
            <Swatch key={v} name={n!} varName={v!} />
          ))}
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {TEAM_COLOR_KEYS.map((k) => (
            <div key={k} className="flex flex-col gap-1.5">
              <Swatch name={TEAM_COLOR_LABELS[k]} varName={`--team-${k}`} />
              <Swatch name="Tint" varName={`--team-${k}-tint`} />
            </div>
          ))}
        </div>
        <div className="flex flex-col gap-1">
          <p className="font-display text-3xl font-semibold">Head of the Lake 40</p>
          <p className="font-display text-2xl font-semibold">Regatta name 32</p>
          <p className="font-display text-xl font-semibold">Page title 24</p>
          <p className="text-lg">Section 20</p>
          <p className="text-md">Large body 16</p>
          <p className="text-base">Body 14: Event 14, Men&apos;s Junior 4+, Heat 1, 9:40</p>
          <p className="text-sm text-ink-2">Secondary 13</p>
          <p className="text-xs text-ink-2">Small 12</p>
          <p className="font-display text-2xl font-semibold tabular-nums">18 of 24</p>
        </div>
      </Section>
    </div>
  );
}
