import { describe, expect, it } from 'vitest';
import { findMentions, parseMentions } from './mentions';

const USERS = [
  { id: 'dana', name: 'Dana Whitcombe', email: 'coach.girls@example.org' },
  { id: 'danaher', name: 'Danaher Price', email: 'dp@example.org' },
  { id: 'sam1', name: 'Sam Lee', email: 'sam.lee@example.org' },
  { id: 'sam2', name: 'Sam Ortiz', email: 'sortiz@example.org' },
  { id: 'casey', name: 'Casey Coach', email: 'casey@example.org' },
];

describe('parseMentions (same rules as the server)', () => {
  it('matches full names in any case, longest first', () => {
    expect(parseMentions('@dana whitcombe can you take Hendo?', USERS)).toEqual(['dana']);
    expect(parseMentions('Ask @Danaher Price first', USERS)).toEqual(['danaher']);
  });

  it('matches email local parts and first names only one user has', () => {
    expect(parseMentions('cc @coach.girls', USERS)).toEqual(['dana']);
    expect(parseMentions('@Casey, thoughts?', USERS)).toEqual(['casey']);
    // Two users are called Sam: "@Sam" alone matches neither.
    expect(parseMentions('@Sam can you?', USERS)).toEqual([]);
    expect(parseMentions('@Sam Ortiz can you?', USERS)).toEqual(['sam2']);
  });

  it('needs a word boundary on both sides', () => {
    expect(parseMentions('mail a@coach.girls', USERS)).toEqual([]);
    expect(parseMentions('@Danaherx', USERS)).toEqual([]);
    // "@Dana" does not match inside "@Danaher Price".
    expect(parseMentions('@Danaher Price', USERS)).toEqual(['danaher']);
  });

  it('collapses whitespace inside a name and lists each person once, in order', () => {
    expect(parseMentions('@Casey  Coach and @dana whitcombe and @Casey', USERS)).toEqual([
      'casey',
      'dana',
    ]);
  });

  it('reports positions in the original text', () => {
    const text = 'Hi @Casey  Coach!';
    const [m] = findMentions(text, USERS);
    expect(text.slice(m!.start, m!.end)).toBe('@Casey  Coach');
  });
});
