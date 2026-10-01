// Display helpers shared by the UI and the engines. Pure.

import type { Athlete, OarSet, Shell, Team } from './types';

/** "Ava Chen", or the preferred first name when set: "Ava 'AJ' Chen" → "AJ Chen". */
export function athleteName(a: Pick<Athlete, 'firstName' | 'lastName' | 'preferredName'>): string {
  const first = a.preferredName?.trim() || a.firstName;
  return `${first} ${a.lastName}`.trim();
}

/** "Ava C." for tight spaces (boat strips at xs size). */
export function athleteShortName(
  a: Pick<Athlete, 'firstName' | 'lastName' | 'preferredName'>,
): string {
  const first = a.preferredName?.trim() || a.firstName;
  return a.lastName ? `${first} ${a.lastName[0]}.` : first;
}

/** The name coaches use: nickname when set, else the full name. */
export function shellLabel(s: Pick<Shell, 'name' | 'nickname'>): string {
  return s.nickname?.trim() || s.name;
}

/** "Live.Laugh.Love (LLL)" when a nickname differs from the name. */
export function shellFullLabel(s: Pick<Shell, 'name' | 'nickname'>): string {
  const nick = s.nickname?.trim();
  return nick && nick !== s.name ? `${s.name} (${nick})` : s.name;
}

/** "24-C · yellow-white": the name, then the color code. */
export function oarSetLabel(o: Pick<OarSet, 'name' | 'color'>): string {
  return o.color ? `${o.name} · ${o.color}` : o.name;
}

export function teamLabel(t: Pick<Team, 'name' | 'shortName'>, short = false): string {
  return short ? t.shortName || t.name : t.name;
}

export const KG_PER_LB = 0.45359237;

export function kgToLb(kg: number): number {
  return kg / KG_PER_LB;
}

export function lbToKg(lb: number): number {
  return lb * KG_PER_LB;
}

export function formatWeight(kg: number | null | undefined, unit: 'kg' | 'lb'): string {
  if (kg == null) return '';
  return unit === 'kg' ? `${Math.round(kg)} kg` : `${Math.round(kgToLb(kg))} lb`;
}

/** Parse the club's weight-class labels: '165-200' → lb range in kg; 'LWT' → up to 160 lb; '<240'. */
export function parseWeightClassLabel(label: string | null | undefined): {
  minKg: number | null;
  maxKg: number | null;
} {
  const t = (label ?? '').trim().toLowerCase();
  if (!t) return { minKg: null, maxKg: null };
  const range = t.match(/^(\d{2,3})\s*[-–]\s*(\d{2,3})/);
  if (range) return { minKg: lbToKg(Number(range[1])), maxKg: lbToKg(Number(range[2])) };
  const lt = t.match(/^<\s*(\d{2,3})/);
  if (lt) return { minKg: null, maxKg: lbToKg(Number(lt[1])) };
  const gt = t.match(/^>\s*(\d{2,3})/);
  if (gt) return { minKg: lbToKg(Number(gt[1])), maxKg: null };
  if (t === 'lwt' || t.startsWith('light')) return { minKg: null, maxKg: lbToKg(160) };
  const single = t.match(/^(\d{2,3})$/);
  if (single) return { minKg: null, maxKg: lbToKg(Number(single[1])) };
  return { minKg: null, maxKg: null };
}
