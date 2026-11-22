import { describe, expect, it } from 'vitest';
import { services } from '../src/data/site';
import { closestIndex, leadSentence, stepDirection } from '../src/scripts/services-showcase';
import { plateInk, railGradient, stepProgress } from '../src/scripts/services-page';

describe('leadSentence', () => {
  it('keeps the first sentence of a longer description', () => {
    expect(leadSentence('Πρώτη πρόταση. Δεύτερη πρόταση.')).toBe('Πρώτη πρόταση.');
    expect(leadSentence('Τι χρειάζεστε; Το φτιάχνουμε.')).toBe('Τι χρειάζεστε;');
  });
  it('returns a single sentence whole, colons and commas included', () => {
    const text = 'Μικρές ποσότητες ή μεγάλα τιράζ: επιλέγουμε τη μέθοδο, με προσοχή στο χρώμα.';
    expect(leadSentence(text)).toBe(text);
  });
  it('returns text without a full stop as it is, trimmed', () => {
    expect(leadSentence('  Χωρίς τελεία  ')).toBe('Χωρίς τελεία');
  });
  it('does not split inside a number such as 1.5', () => {
    expect(leadSentence('Τιμή 1.5 ευρώ ανά τεμάχιο. Άλλο.')).toBe('Τιμή 1.5 ευρώ ανά τεμάχιο.');
  });
  it('gives a non-empty lead for every service, starting its description', () => {
    for (const service of services) {
      const { description } = service.text.el;
      const lead = leadSentence(description);
      expect(lead.length).toBeGreaterThan(0);
      expect(description.startsWith(lead)).toBe(true);
    }
  });
});

describe('closestIndex (active row by viewport centre)', () => {
  it('picks the value nearest the target', () => {
    expect(closestIndex([100, 300, 500], 320)).toBe(1);
    expect(closestIndex([100, 300, 500], 460)).toBe(2);
  });
  it('picks the first on a tie', () => {
    expect(closestIndex([100, 300], 200)).toBe(0);
  });
  it('returns -1 for no candidates', () => {
    expect(closestIndex([], 200)).toBe(-1);
  });
});

describe('stepDirection', () => {
  it('is 1 moving down the list and -1 moving up', () => {
    expect(stepDirection(2, 5)).toBe(1);
    expect(stepDirection(5, 2)).toBe(-1);
  });
});

describe('plateInk (chapter plate colour)', () => {
  it('cycles C, M, Y, K', () => {
    expect([0, 1, 2, 3, 4, 5, 6, 7, 8].map(plateInk)).toEqual([
      'cyan',
      'magenta',
      'yellow',
      'key',
      'cyan',
      'magenta',
      'yellow',
      'key',
      'cyan',
    ]);
  });
  it('wraps negative indices too', () => {
    expect(plateInk(-1)).toBe('key');
  });
});

describe('stepProgress (rail fill without scroll motion)', () => {
  it('fills up to and including the active chapter', () => {
    expect(stepProgress(0, 9)).toBeCloseTo(1 / 9);
    expect(stepProgress(8, 9)).toBe(1);
  });
  it('is empty with no active chapter or no chapters', () => {
    expect(stepProgress(-1, 9)).toBe(0);
    expect(stepProgress(0, 0)).toBe(0);
  });
});

describe('railGradient', () => {
  it('has one hard-stop segment per chapter, in plate colours', () => {
    const gradient = railGradient(4);
    expect(gradient).toBe(
      'linear-gradient(to bottom, var(--color-cyan) 0.000% 25.000%, var(--color-magenta) 25.000% 50.000%, var(--color-yellow) 50.000% 75.000%, var(--color-key) 75.000% 100.000%)',
    );
  });
  it('is none without chapters', () => {
    expect(railGradient(0)).toBe('none');
  });
});
