/**
 * Home “Μία ιδέα. Παντού.” (src/scripts/idea-journey.ts): the quote link built from the picked
 * chips, the button and status counts, the active-step picker, and that every service the
 * section links to exists.
 */
import { describe, expect, it } from 'vitest';
import { quoteHref, routes, services } from '../src/data/site';
import { homeText } from '../src/i18n/pages/home';
import { PRESELECT_PARAM, parsePreselect } from '../src/lib/quote';
import {
  JOURNEY_CHOICES,
  JOURNEY_STEPS,
  countText,
  journeyQuoteHref,
  pickActiveStep,
} from '../src/scripts/idea-journey';

const copy = homeText.el.journey;
const slugs = services.map((s) => s.slug);

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
    expect(countText(1, copy.chooser.cta)).toBe('Ζητήστε προσφορά για 1 προϊόν');
  });
  it('puts the number in the plural', () => {
    expect(countText(3, copy.chooser.cta)).toBe('Ζητήστε προσφορά για 3 προϊόντα');
    expect(countText(6, copy.chooser.status)).toBe('Σημειώσατε 6 προϊόντα.');
  });
  it('treats a negative count as none', () => {
    expect(countText(-1, copy.chooser.status)).toBe(copy.chooser.status.none);
  });
});

describe('pickActiveStep (viewport-centre rule)', () => {
  it('returns -1 without steps', () => {
    expect(pickActiveStep([], 400)).toBe(-1);
  });
  it('keeps the first step while none has reached the line', () => {
    expect(pickActiveStep([500, 1100, 1700], 400)).toBe(0);
  });
  it('picks the last step whose top is at or above the line', () => {
    expect(pickActiveStep([-300, 200, 800], 400)).toBe(1);
    expect(pickActiveStep([-900, -300, 400], 400)).toBe(2);
  });
  it('stays on the last step once every step has passed', () => {
    expect(pickActiveStep([-1800, -1200, -600], 400)).toBe(2);
  });
});

describe('journey data', () => {
  it('links every step to an existing service chapter', () => {
    for (const step of JOURNEY_STEPS) expect(slugs).toContain(step.service);
  });

  it('offers one chip per product in the story, in story order, each an existing service', () => {
    const inStory = [...new Set(JOURNEY_STEPS.map((step) => step.service))];
    expect([...JOURNEY_CHOICES]).toEqual(inStory);
    for (const slug of JOURNEY_CHOICES) expect(slugs).toContain(slug);
  });

  it('has copy for every step and a label for every chip', () => {
    for (const step of JOURNEY_STEPS) {
      expect(copy.steps[step.id].title.length).toBeGreaterThan(0);
      expect(copy.steps[step.id].text.length).toBeGreaterThan(0);
    }
    for (const slug of JOURNEY_CHOICES) {
      expect(copy.chooser.options[slug].length).toBeGreaterThan(0);
    }
    expect(Object.keys(copy.chooser.options).sort()).toEqual([...JOURNEY_CHOICES].sort());
  });

  it('has unique step ids', () => {
    const ids = JOURNEY_STEPS.map((step) => step.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
