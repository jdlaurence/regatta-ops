// Bed zones: compartments placed along the trailer's length, each across the bed's full width. On
// SRA's trailers the riggers fill the back of the bed, with oars and slings ahead of them. A
// compartment with no position runs the whole length. Pure.

import type { CompartmentKind, Id } from '../types';
import { capitalize, joinAnd, meters } from './format';
import type { CompartmentDef, TrailerDef } from './types';

export interface ZoneSpan {
  /** cm from the front of the frame, within the frame. */
  startCm: number;
  endCm: number;
  /** Placed along the frame; false for a compartment that runs the whole length. */
  positioned: boolean;
}

export interface BedZone extends ZoneSpan {
  compartment: CompartmentDef;
  /**
   * Zones that share a stretch of the bed sit side by side across it: `row` of `rows`. A zone
   * that overlaps nothing has the full width (row 0 of 1).
   */
  row: number;
  rows: number;
}

/** Where a compartment sits along a frame of this length. Positions are kept within the frame. */
export function compartmentSpan(
  c: Pick<CompartmentDef, 'startCm' | 'endCm'>,
  frameLengthCm: number,
): ZoneSpan {
  const frame = Math.max(0, frameLengthCm || 0);
  const start = c.startCm ?? null;
  const end = c.endCm ?? null;
  if (start === null && end === null) return { startCm: 0, endCm: frame, positioned: false };
  const s = Math.min(frame, Math.max(0, start ?? 0));
  const e = Math.min(frame, Math.max(s, end ?? frame));
  return { startCm: s, endCm: e, positioned: true };
}

/**
 * The bed's compartments from the front of the trailer to the back, with where each sits.
 * Zones that overlap (two compartments that both run the whole length, say) share the width.
 */
export function bedZones(def: Pick<TrailerDef, 'compartments' | 'frameLengthCm'>): BedZone[] {
  const zones = def.compartments
    .map((compartment, index) => ({
      compartment,
      index,
      ...compartmentSpan(compartment, def.frameLengthCm),
    }))
    .sort((a, b) => a.startCm - b.startCm || a.endCm - b.endCm || a.index - b.index);

  const out: BedZone[] = [];
  let cluster: (typeof zones)[number][] = [];
  let clusterEnd = 0;
  const flush = () => {
    const rowEnds: number[] = [];
    const rows = cluster.map((z) => {
      let row = rowEnds.findIndex((end) => end <= z.startCm);
      if (row < 0) {
        row = rowEnds.length;
        rowEnds.push(z.endCm);
      } else rowEnds[row] = z.endCm;
      return row;
    });
    cluster.forEach((z, i) => {
      out.push({
        compartment: z.compartment,
        startCm: z.startCm,
        endCm: z.endCm,
        positioned: z.positioned,
        row: rows[i]!,
        rows: Math.max(1, rowEnds.length),
      });
    });
    cluster = [];
  };
  for (const z of zones) {
    if (cluster.length > 0 && z.startCm >= clusterEnd) flush();
    clusterEnd = cluster.length === 0 ? z.endCm : Math.max(clusterEnd, z.endCm);
    cluster.push(z);
  }
  if (cluster.length > 0) flush();
  return out;
}

/**
 * The bed seen from the back (the end view): the zones at the back, side by side across the
 * width, and the ones ahead of them, nearest first.
 */
export function bedFromBehind(zones: readonly BedZone[]): { back: BedZone[]; ahead: BedZone[] } {
  if (zones.length === 0) return { back: [], ahead: [] };
  const last = Math.max(...zones.map((z) => z.endCm));
  const back = zones.filter((z) => z.endCm >= last - 0.5);
  const ahead = zones
    .filter((z) => z.endCm < last - 0.5)
    .sort((a, b) => b.endCm - a.endCm || b.startCm - a.startCm);
  return { back, ahead };
}

function nameOf(c: Pick<CompartmentDef, 'label'>): string {
  return c.label.trim() || 'Bed';
}

/** A label as it reads after the first item of a list: "Slings" → "slings", "LLL box" kept. */
function listWord(label: string): string {
  if (label.length > 1 && label[1] === label[1]!.toUpperCase() && /[A-Z]/.test(label[1]!)) {
    return label;
  }
  return label.length === 0 ? label : label[0]!.toLowerCase() + label.slice(1);
}

/** "Oars and slings ahead": what rides in front of the zones seen from the back. */
export function aheadCaption(ahead: readonly BedZone[]): string | null {
  if (ahead.length === 0) return null;
  const names = ahead.map((z, i) =>
    i === 0 ? nameOf(z.compartment) : listWord(nameOf(z.compartment)),
  );
  return `${capitalize(joinAnd(names))} ahead`;
}

/** True for a zone placed at the back of the bed (not the whole length). */
export function atBackOfBed(span: ZoneSpan, frameLengthCm: number): boolean {
  return span.positioned && span.startCm > 0 && span.endCm >= frameLengthCm - 0.5;
}

/** A zone's name, saying so when it sits at the back: "Riggers (back of bed)", "Oars". */
export function zoneName(
  c: Pick<CompartmentDef, 'label' | 'startCm' | 'endCm'>,
  frameLengthCm: number,
): string {
  const name = nameOf(c);
  if (/\bback\b/i.test(name)) return name;
  return atBackOfBed(compartmentSpan(c, frameLengthCm), frameLengthCm)
    ? `${name} (back of bed)`
    : name;
}

/** The load list's container for a zone: "Boys trailer · Riggers (back of bed)". */
export function zoneContainer(
  trailerName: string,
  c: Pick<CompartmentDef, 'label' | 'startCm' | 'endCm'>,
  frameLengthCm: number,
): string {
  return `${trailerName} · ${zoneName(c, frameLengthCm)}`;
}

/**
 * Where a zone runs, in words: "from the front to 3.0 m", "3.0 to 7.0 m from the front",
 * "from 7.0 m to the back", "the whole length".
 */
export function zoneExtent(span: ZoneSpan, frameLengthCm: number): string {
  if (!span.positioned) return 'the whole length';
  const front = span.startCm <= 0;
  const back = span.endCm >= frameLengthCm - 0.5;
  if (front && back) return 'the whole length';
  if (front) return `from the front to ${meters(span.endCm)} m`;
  if (back) return `from ${meters(span.startCm)} m to the back`;
  return `${meters(span.startCm)} to ${meters(span.endCm)} m from the front`;
}

/** "Riggers, from 7.0 m to the back (5.2 m)". */
export function zoneWords(zone: BedZone, frameLengthCm: number): string {
  const extent = zoneExtent(zone, frameLengthCm);
  const length = zone.positioned ? ` (${meters(zone.endCm - zone.startCm)} m)` : '';
  return `${nameOf(zone.compartment)}, ${extent}${length}`;
}

/** What rides in the bed and is not a boat. */
export type BedLoad = 'riggers' | 'oars' | 'slings';

const LOADS: Record<BedLoad, { kinds: readonly CompartmentKind[]; label: RegExp }> = {
  riggers: { kinds: ['rigger_rack'], label: /\briggers?\b/i },
  oars: { kinds: ['oar_rack', 'oar_box', 'oar_tube'], label: /\boars?\b/i },
  slings: { kinds: [], label: /\bslings?\b/i },
};

/**
 * The compartment that holds riggers, oars, or slings: the first of the right kind (a rigger
 * rack, an oar rack, box, or tube), else the first whose label names the load ("Slings").
 */
export function compartmentFor(
  def: Pick<TrailerDef, 'compartments'>,
  load: BedLoad,
): CompartmentDef | null {
  const { kinds, label } = LOADS[load];
  return (
    def.compartments.find((c) => kinds.includes(c.kind)) ??
    def.compartments.find((c) => label.test(c.label)) ??
    null
  );
}

export interface ZoneOverlap {
  a: Id;
  b: Id;
  /** How much of the length the two share, cm. */
  cm: number;
}

/**
 * Pairs of compartments that share part of the bed, where at least one is placed along the
 * frame (two that both run the whole length share the bed side by side, which is no overlap).
 */
export function zoneOverlaps(
  def: Pick<TrailerDef, 'compartments' | 'frameLengthCm'>,
): ZoneOverlap[] {
  const spans = def.compartments.map((c) => ({ c, ...compartmentSpan(c, def.frameLengthCm) }));
  const out: ZoneOverlap[] = [];
  spans.forEach((x, i) => {
    for (const y of spans.slice(i + 1)) {
      if (!x.positioned && !y.positioned) continue;
      const cm = Math.min(x.endCm, y.endCm) - Math.max(x.startCm, y.startCm);
      if (cm > 0) out.push({ a: x.c.id, b: y.c.id, cm });
    }
  });
  return out;
}
