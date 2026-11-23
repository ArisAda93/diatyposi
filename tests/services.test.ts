import { describe, expect, it } from 'vitest';
import { services } from '../src/data/site';
import { closestIndex, leadSentence, stepDirection } from '../src/scripts/services-showcase';
import {
  centredScroll,
  chipScrollBehavior,
  edgesAttr,
  indexState,
  itemInView,
  plateInk,
  railGradient,
  scrollEdges,
  stepProgress,
} from '../src/scripts/services-page';

describe('services (owner order)', () => {
  it('lists the ten services in the order the owner asked for, 3D printing third', () => {
    expect(services.map((s) => s.slug)).toEqual([
      'diafimistika-dora',
      'mplouzakia-rouxismos',
      '3d-ektyposeis',
      'grafistikos-sxediasmos',
      'banners-afises-mousamades',
      'epigrafes-aftokollita-vitrines',
      'social-media',
      'psifiakes-offset-ektyposeis',
      'kartes-fylladia-entypa',
      'prosklitiria-kartes',
    ]);
    expect(services.map((s) => s.text.el.title)).toEqual([
      'Διαφημιστικά δώρα & προσωποποιημένα προϊόντα',
      'Εκτυπώσεις σε μπλουζάκια & επαγγελματικό ρουχισμό',
      'Τρισδιάστατες εκτυπώσεις (3D printing)',
      'Γραφιστικός σχεδιασμός & δημιουργία λογοτύπων',
      'Διαφημιστικά banners, αφίσες & μουσαμάδες',
      'Επιγραφές, αυτοκόλλητα & βιτρίνες καταστημάτων',
      'Σχεδιασμός διαφημιστικού υλικού για τα social media',
      'Ψηφιακές & offset εκτυπώσεις',
      'Επαγγελματικές κάρτες, φυλλάδια & έντυπα',
      'Προσκλητήρια, κάρτες & ειδικές κατασκευές',
    ]);
  });
  it('has ten unique slugs', () => {
    const slugs = services.map((s) => s.slug);
    expect(slugs).toHaveLength(10);
    expect(new Set(slugs).size).toBe(10);
  });
});

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

describe('indexState (index entries while reading)', () => {
  it('marks chapters before the one in view as read, it as current, the rest as ahead', () => {
    expect([0, 1, 2, 3].map((i) => indexState(i, 2))).toEqual(['read', 'read', 'current', 'ahead']);
  });
  it('marks everything ahead with no chapter in view or an unknown chapter', () => {
    expect(indexState(0, -1)).toBe('ahead');
    expect(indexState(-1, 3)).toBe('ahead');
  });
});

describe('centredScroll (current chip in the middle of the chip row)', () => {
  it('centres the item in the visible width', () => {
    // Item 100 wide at 500 in a 300-wide view of 1200: (300 - 100) / 2 = 100 either side.
    expect(centredScroll(500, 100, 300, 1200)).toBe(400);
  });
  it('stays at the start for an item near the start', () => {
    expect(centredScroll(20, 100, 300, 1200)).toBe(0);
  });
  it('stops at the end of the scroll range for an item near the end', () => {
    expect(centredScroll(1150, 50, 300, 1200)).toBe(900);
  });
  it('does not scroll when everything fits', () => {
    expect(centredScroll(100, 80, 600, 500)).toBe(0);
  });
});

describe('scrollEdges (which sides of a chip row hide chips)', () => {
  it('hides chips only past the end at rest', () => {
    expect(scrollEdges(0, 390, 1200)).toEqual({ start: false, end: true });
  });
  it('hides chips on both sides in the middle of the range', () => {
    expect(scrollEdges(400, 390, 1200)).toEqual({ start: true, end: true });
  });
  it('hides chips only before the start at the end of the range', () => {
    expect(scrollEdges(810, 390, 1200)).toEqual({ start: true, end: false });
  });
  it('treats sub-pixel positions near either end as resting there', () => {
    expect(scrollEdges(0.6, 390, 1200)).toEqual({ start: false, end: true });
    expect(scrollEdges(809.4, 390, 1200)).toEqual({ start: true, end: false });
  });
  it('treats overscroll past either end (iOS rubber-banding) as resting at that end', () => {
    expect(scrollEdges(-30, 390, 1200)).toEqual({ start: false, end: true });
    expect(scrollEdges(860, 390, 1200)).toEqual({ start: true, end: false });
  });
  it('hides nothing when every chip fits', () => {
    expect(scrollEdges(0, 900, 640)).toEqual({ start: false, end: false });
  });
});

describe('chipScrollBehavior (how the chip row moves to the current chip)', () => {
  it('jumps before the visitor has acted (deep link, scroll restoration), so nothing cuts it off', () => {
    expect(chipScrollBehavior(false, false)).toBe('auto');
  });
  it('glides once the visitor has acted', () => {
    expect(chipScrollBehavior(true, false)).toBe('smooth');
  });
  it('always jumps under reduced motion', () => {
    expect(chipScrollBehavior(true, true)).toBe('auto');
    expect(chipScrollBehavior(false, true)).toBe('auto');
  });
});

describe('itemInView (is the current chip visible in the row)', () => {
  // A 390 px row scrolled to 400, with 32 px fades: the clear band is 432–758.
  it('is true for a chip wholly inside the clear band', () => {
    expect(itemInView(500, 120, 400, 390, 32)).toBe(true);
    expect(itemInView(432, 326, 400, 390, 32)).toBe(true);
  });
  it('is false for a chip under a fade or past either edge', () => {
    expect(itemInView(420, 100, 400, 390, 32)).toBe(false);
    expect(itemInView(700, 100, 400, 390, 32)).toBe(false);
    expect(itemInView(1100, 100, 400, 390, 32)).toBe(false);
    expect(itemInView(0, 100, 400, 390, 32)).toBe(false);
  });
  it('is false for the chip of a deep-linked chapter while the row still rests at the start', () => {
    // Chip 07 sits about 1100 px in; the row has not moved.
    expect(itemInView(1100, 180, 0, 390, 32)).toBe(false);
  });
  it('uses the full width without an inset', () => {
    expect(itemInView(400, 390, 400, 390)).toBe(true);
  });
});

describe('edgesAttr (data-edges for the fade)', () => {
  it('names the sides that hide chips, start first', () => {
    expect(edgesAttr({ start: true, end: true })).toBe('start end');
    expect(edgesAttr({ start: true, end: false })).toBe('start');
    expect(edgesAttr({ start: false, end: true })).toBe('end');
  });
  it('is empty when nothing is hidden', () => {
    expect(edgesAttr({ start: false, end: false })).toBe('');
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
