/**
 * Home “Μία ιδέα. Παντού.” (src/scripts/idea-journey.ts): the quote link built from the picked
 * chips, the button and status counts, the scroll timeline (position, frame, spine), and that
 * every service the section links to exists.
 */
import { describe, expect, it } from 'vitest';
import { quoteHref, routes, services } from '../src/data/site';
import { homeText } from '../src/i18n/pages/home';
import { PRESELECT_PARAM, parsePreselect } from '../src/lib/quote';
import {
  JOURNEY_STEPS,
  MARK_AT,
  MARK_PLATES,
  activeStepAt,
  countText,
  easeOutBack,
  journeyChoices,
  journeyInk,
  journeyPosition,
  journeyQuoteHref,
  spineFill,
  spineGradient,
  stageFrame,
} from '../src/scripts/idea-journey';

const copy = homeText.el.journey;
const slugs = services.map((s) => s.slug);
const choices = journeyChoices(slugs);

describe('journeyQuoteHref', () => {
  it('links to the plain quote form when nothing is picked', () => {
    expect(journeyQuoteHref([])).toBe(routes.quote);
    expect(journeyQuoteHref(['', '  '])).toBe(routes.quote);
  });

  it('pre-selects one service exactly as the single-service link does', () => {
    expect(journeyQuoteHref(['kartes-fylladia-entypa'])).toBe(
      '/epikoinonia/?ypiresia=kartes-fylladia-entypa#prosfora',
    );
    expect(journeyQuoteHref(['social-media'])).toBe(quoteHref('social-media'));
  });

  it('pre-selects several services, comma-separated, in the given order', () => {
    expect(journeyQuoteHref(['social-media', 'grafistikos-sxediasmos', 'diafimistika-dora'])).toBe(
      '/epikoinonia/?ypiresia=social-media,grafistikos-sxediasmos,diafimistika-dora#prosfora',
    );
  });

  it('drops duplicates and keeps the first appearance', () => {
    const picked = ['diafimistika-dora', 'social-media', 'diafimistika-dora', ' social-media '];
    expect(journeyQuoteHref(picked)).toBe(
      '/epikoinonia/?ypiresia=diafimistika-dora,social-media#prosfora',
    );
  });

  it('URL-encodes each slug', () => {
    const encoded = [encodeURIComponent('α β'), encodeURIComponent('x&y=z#')].join(',');
    expect(encoded).toBe('%CE%B1%20%CE%B2,x%26y%3Dz%23');
    expect(journeyQuoteHref(['α β', 'x&y=z#'])).toBe(`/epikoinonia/?ypiresia=${encoded}#prosfora`);
  });

  it('uses PRESELECT_PARAM, so the quote form pre-selects exactly the picked services', () => {
    const picked = ['epigrafes-aftokollita-vitrines', 'mplouzakia-rouxismos'];
    const url = new URL(journeyQuoteHref(picked), 'https://example.test');
    expect(url.pathname).toBe(routes.contact);
    expect(url.hash).toBe('#prosfora');
    expect(url.searchParams.has(PRESELECT_PARAM)).toBe(true);
    expect(parsePreselect(url.search, slugs)).toEqual(picked);
  });
});

describe('countText (button label and status)', () => {
  it('uses the plain label with nothing picked', () => {
    expect(countText(0, copy.chooser.cta)).toBe('Ζητήστε προσφορά');
  });
  it('uses the singular for one', () => {
    expect(countText(1, copy.chooser.cta)).toBe('Ζητήστε προσφορά για 1 επιλογή');
  });
  it('puts the number in the plural', () => {
    expect(countText(3, copy.chooser.cta)).toBe('Ζητήστε προσφορά για 3 επιλογές');
    expect(countText(6, copy.chooser.status)).toBe('Σημειώσατε 6 επιλογές.');
  });
  it('treats a negative count as none', () => {
    expect(countText(-1, copy.chooser.status)).toBe(copy.chooser.status.none);
  });
});

describe('journeyPosition (scroll timeline)', () => {
  const anchors = [500, 1100, 1700];

  it('returns -1 without steps', () => {
    expect(journeyPosition([], 400)).toBe(-1);
  });
  it('gives exactly i when step i is on the reading line', () => {
    expect(journeyPosition([400, 1000, 1600], 400)).toBe(0);
    expect(journeyPosition([-200, 400, 1000], 400)).toBe(1);
    expect(journeyPosition([-800, -200, 400], 400)).toBe(2);
  });
  it('interpolates between two steps', () => {
    expect(journeyPosition([100, 700, 1300], 400)).toBeCloseTo(0.5);
    expect(journeyPosition([-500, 100, 700], 400)).toBeCloseTo(1.5);
  });
  it('runs down to -1 one spacing before the first step, and no further', () => {
    expect(journeyPosition(anchors, 200)).toBeCloseTo(-0.5);
    expect(journeyPosition(anchors, -100)).toBe(-1);
    expect(journeyPosition(anchors, -5000)).toBe(-1);
    expect(journeyPosition([500], 400)).toBe(-1);
  });
  it('stays on the last step once every step has passed', () => {
    expect(journeyPosition([-1800, -1200, -600], 400)).toBe(2);
  });
  it('grows steadily as the page scrolls down (anchors move up)', () => {
    let previous = -Infinity;
    for (let scroll = 0; scroll <= 2000; scroll += 25) {
      const t = journeyPosition(
        anchors.map((a) => a - scroll),
        400,
      );
      expect(t).toBeGreaterThanOrEqual(previous);
      previous = t;
    }
    expect(previous).toBe(2);
  });
});

describe('activeStepAt', () => {
  it('marks no step before the first is reached', () => {
    expect(activeStepAt(-1, 7)).toBe(-1);
    expect(activeStepAt(-0.6, 7)).toBe(-1);
    expect(activeStepAt(0, 0)).toBe(-1);
  });
  it('marks the nearest step, within range', () => {
    expect(activeStepAt(-0.4, 7)).toBe(0);
    expect(activeStepAt(2.49, 7)).toBe(2);
    expect(activeStepAt(2.5, 7)).toBe(3);
    expect(activeStepAt(9, 7)).toBe(6);
  });
});

describe('stageFrame (one continuous stage)', () => {
  const last = JOURNEY_STEPS.length - 1;
  const at = (id: (typeof JOURNEY_STEPS)[number]['id']) => MARK_AT[id];

  it('is blank paper before the journey starts', () => {
    const f = stageFrame(-1);
    expect(f.draw.every((d) => d === 0)).toBe(true);
    expect(f.sketch).toBe(0);
    expect(f.sketchOpacity).toBe(0);
    expect(f.plates.every((p) => p.opacity === 0)).toBe(true);
  });

  it('shows the finished sketch on the sketchbook at the idea step, plates not printed', () => {
    const f = stageFrame(0);
    expect(f.draw[0]).toBe(1);
    expect(f.draw.slice(1).every((d) => d === 0)).toBe(true);
    expect(f.sketch).toBe(1);
    expect(f.sketchOpacity).toBe(1);
    expect(f.plates.every((p) => p.opacity === 0)).toBe(true);
    expect(f.mark).toEqual({ ...at('idea'), r: 0 });
  });

  it('holds exactly one object, fully drawn, with the mark in register on it, at each step', () => {
    JOURNEY_STEPS.forEach((step, i) => {
      if (i === 0) return;
      const f = stageFrame(i);
      f.draw.forEach((d, k) => expect(d).toBe(k === i ? 1 : 0));
      expect(f.sketchOpacity).toBe(0);
      for (const plate of f.plates) {
        expect(plate.opacity).toBe(1);
        expect(plate.shift).toBeCloseTo(0, 10);
      }
      expect(f.mark.x).toBeCloseTo(at(step.id).x);
      expect(f.mark.y).toBeCloseTo(at(step.id).y);
      expect(f.mark.s).toBeCloseTo(at(step.id).s);
      expect(f.mark.r).toBeCloseTo(0);
    });
  });

  it('prints the plates in order Y, M, C, K between the idea and the mark', () => {
    const f = stageFrame(0.45);
    const [y, m, c, k] = f.plates.map((p) => p.opacity);
    expect(MARK_PLATES.map((p) => p.id)).toEqual(['y', 'm', 'c', 'k']);
    expect(y).toBeGreaterThan(m ?? 1);
    expect(m).toBeGreaterThan(c ?? 1);
    expect(c).toBeGreaterThanOrEqual(k ?? 1);
  });

  it('draws the outgoing object out while the incoming one draws in', () => {
    const f = stageFrame(2.5);
    expect(f.draw[2]).toBeGreaterThan(0);
    expect(f.draw[2]).toBeLessThan(1);
    expect(f.draw[3]).toBeGreaterThan(0);
    expect(f.draw[3]).toBeLessThan(1);
    expect(f.draw[0]).toBe(0);
    expect(f.draw[5]).toBe(0);
  });

  it('moves the mark along an arc above the straight line, turning and back', () => {
    const from = at('card');
    const to = at('shirt');
    const mid = stageFrame(2.5).mark;
    expect(mid.y).toBeLessThan((from.y + to.y) / 2);
    expect(Math.abs(mid.r)).toBeGreaterThan(1);
    // Rests on the object for the first part of the change.
    expect(stageFrame(2.1).mark).toEqual(stageFrame(2).mark);
  });

  it('does not hop while the sketch is printed in place', () => {
    const f = stageFrame(0.5);
    expect(f.mark.x).toBe(at('idea').x);
    expect(f.mark.y).toBe(at('idea').y);
    expect(f.mark.r).toBe(0);
  });

  it('is a pure function of the position, so scrolling back reverses cleanly', () => {
    expect(stageFrame(3.37)).toEqual(stageFrame(3.37));
    expect(stageFrame(last + 3)).toEqual(stageFrame(last));
    expect(stageFrame(-4)).toEqual(stageFrame(-1));
  });

  it('keeps every value in range along the whole journey', () => {
    for (let t = -1; t <= last; t += 0.05) {
      const f = stageFrame(t);
      for (const d of f.draw) {
        expect(d).toBeGreaterThanOrEqual(0);
        expect(d).toBeLessThanOrEqual(1);
      }
      for (const p of f.plates) {
        expect(p.opacity).toBeGreaterThanOrEqual(0);
        expect(p.opacity).toBeLessThanOrEqual(1);
      }
      expect(f.mark.s).toBeGreaterThan(0);
      expect(Number.isFinite(f.mark.x) && Number.isFinite(f.mark.y)).toBe(true);
    }
  });

  it('places the mark inside the 600 × 600 view box on every object', () => {
    for (const step of JOURNEY_STEPS) {
      const place = at(step.id);
      expect(place.x).toBeGreaterThan(0);
      expect(place.x).toBeLessThan(600);
      expect(place.y).toBeGreaterThan(0);
      expect(place.y).toBeLessThan(600);
    }
  });
});

describe('easeOutBack', () => {
  it('starts at 0, overshoots and settles at 1', () => {
    expect(easeOutBack(0)).toBeCloseTo(0, 10);
    expect(easeOutBack(1)).toBe(1);
    expect(Math.max(...[0.6, 0.7, 0.8].map(easeOutBack))).toBeGreaterThan(1);
  });
});

describe('spine', () => {
  it('fills to the point the position maps to between nodes', () => {
    const nodes = [0, 100, 300];
    expect(spineFill(nodes, -1)).toBe(0);
    expect(spineFill(nodes, 0)).toBe(0);
    expect(spineFill(nodes, 0.5)).toBeCloseTo(50 / 300);
    expect(spineFill(nodes, 1)).toBeCloseTo(100 / 300);
    expect(spineFill(nodes, 1.5)).toBeCloseTo(200 / 300);
    expect(spineFill(nodes, 2)).toBe(1);
    expect(spineFill(nodes, 5)).toBe(1);
  });
  it('is empty without a length', () => {
    expect(spineFill([], 1)).toBe(0);
    expect(spineFill([40, 40], 1)).toBe(0);
  });
  it('colours the stretch to each node in the plate ink of that step, with hard stops', () => {
    expect(spineGradient([0])).toBe('none');
    expect(spineGradient([0, 0.25, 1])).toBe(
      `linear-gradient(to bottom, var(--color-${journeyInk(1)}) 0.000% 25.000%, var(--color-${journeyInk(2)}) 25.000% 100.000%)`,
    );
    expect(JOURNEY_STEPS.map((_, i) => journeyInk(i))).toEqual([
      'cyan',
      'magenta',
      'yellow',
      'key',
      'cyan',
      'magenta',
      'yellow',
    ]);
  });
});

describe('journey data', () => {
  it('links every step to an existing service chapter', () => {
    for (const step of JOURNEY_STEPS) expect(slugs).toContain(step.service);
  });

  it('offers each service of the story once, in the order of services', () => {
    const inStory = new Set<string>(JOURNEY_STEPS.map((step) => step.service));
    expect(choices).toEqual(slugs.filter((slug) => inStory.has(slug)));
    expect(new Set(choices)).toEqual(inStory);
  });

  it('follows the order it is given, drops other and repeated slugs', () => {
    const given = ['social-media', 'prosklitiria-kartes', 'kartes-fylladia-entypa', 'social-media'];
    expect(journeyChoices(given)).toEqual(['social-media', 'kartes-fylladia-entypa']);
    expect(journeyChoices([])).toEqual([]);
  });

  it('has copy for every step and a label for every chip', () => {
    for (const step of JOURNEY_STEPS) {
      expect(copy.steps[step.id].title.length).toBeGreaterThan(0);
      expect(copy.steps[step.id].text.length).toBeGreaterThan(0);
    }
    for (const slug of choices) expect(copy.chooser.options[slug].length).toBeGreaterThan(0);
    expect(Object.keys(copy.chooser.options).sort()).toEqual([...choices].sort());
  });

  it('has unique step ids', () => {
    const ids = JOURNEY_STEPS.map((step) => step.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
