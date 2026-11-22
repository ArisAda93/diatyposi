/**
 * Theme decisions (src/scripts/theme.ts) and the palette: the pre-paint choice, the toggle's next
 * theme, the reveal radius, WCAG contrast of every text pair in both themes, and that global.css
 * declares exactly the palette that theme.ts exports.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  PALETTE,
  THEME_COLORS,
  contrastRatio,
  nextTheme,
  parseStoredTheme,
  resolveTheme,
  revealRadius,
  type Theme,
} from '../src/scripts/theme';

describe('parseStoredTheme', () => {
  it('accepts the two themes', () => {
    expect(parseStoredTheme('light')).toBe('light');
    expect(parseStoredTheme('dark')).toBe('dark');
  });

  it('rejects anything else', () => {
    for (const value of [null, undefined, '', 'Dark', 'auto', 'system', 1, {}]) {
      expect(parseStoredTheme(value)).toBeNull();
    }
  });
});

describe('resolveTheme (the pre-paint decision)', () => {
  it('lets a stored choice win over the system', () => {
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
  });

  it('follows the system when nothing is stored', () => {
    expect(resolveTheme(null, true)).toBe('dark');
    expect(resolveTheme(null, false)).toBe('light');
  });

  it('ignores an invalid stored value', () => {
    expect(resolveTheme('sepia', true)).toBe('dark');
    expect(resolveTheme('', false)).toBe('light');
  });
});

describe('nextTheme', () => {
  it('switches to the other theme', () => {
    expect(nextTheme('light')).toBe('dark');
    expect(nextTheme('dark')).toBe('light');
  });
});

describe('revealRadius', () => {
  it('reaches the farthest corner of the viewport', () => {
    // Toggle near the top right: the bottom-left corner is farthest.
    expect(revealRadius(1000, 36, 1200, 800)).toBeCloseTo(Math.hypot(1000, 764), 6);
    expect(revealRadius(600, 400, 1200, 800)).toBeCloseTo(Math.hypot(600, 400), 6);
    expect(revealRadius(0, 0, 300, 400)).toBe(500);
  });
});

describe('theme colours', () => {
  it('use each theme’s page paper', () => {
    expect(THEME_COLORS.light).toBe('#FAFAF7');
    expect(THEME_COLORS.dark).toBe(PALETTE.dark.paper);
  });
});

describe('contrastRatio', () => {
  it('matches the WCAG reference values', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 6);
    expect(contrastRatio('#FFFFFF', '#FFFFFF')).toBeCloseTo(1, 6);
    expect(contrastRatio('#221F20', '#FAFAF7')).toBeCloseTo(15.63, 2);
  });

  it('rejects a colour that is not #RRGGBB', () => {
    expect(() => contrastRatio('red', '#FFFFFF')).toThrow();
  });
});

describe('palette contrast (AA 4.5:1 for text) in both themes', () => {
  const themes: Theme[] = ['light', 'dark'];
  const YELLOW = '#FFF100';
  const INK_FIXED = '#221F20';

  for (const theme of themes) {
    const p = PALETTE[theme];
    const pairs: [string, string, string][] = [
      ['key on paper', p.key, p.paper],
      ['key on paper-2', p.key, p.paper2],
      ['muted on paper', p.muted, p.paper],
      ['muted on paper-2', p.muted, p.paper2],
      ['red label on paper', p.red, p.paper],
      ['red label on paper-2', p.red, p.paper2],
      ['paper text on the key fill (primary button)', p.paper, p.key],
      ['ink-muted on ink', p.inkMuted, p.ink],
      ['ink-muted on ink-2', p.inkMuted, p.ink2],
      ['selection: fixed key on yellow', INK_FIXED, YELLOW],
    ];
    for (const [name, fg, bg] of pairs) {
      it(`${theme}: ${name}`, () => {
        expect(contrastRatio(fg, bg)).toBeGreaterThanOrEqual(4.5);
      });
    }

    it(`${theme}: paper text on ink sections (light paper inside .on-ink)`, () => {
      expect(contrastRatio(PALETTE.light.paper, p.ink)).toBeGreaterThanOrEqual(4.5);
    });

    it(`${theme}: the focus ring (key) stands out from the paper (3:1)`, () => {
      expect(contrastRatio(p.key, p.paper)).toBeGreaterThanOrEqual(3);
    });
  }

  it('dark: ink sections are darker than the dark paper', () => {
    expect(contrastRatio(PALETTE.dark.paper, '#000000')).toBeGreaterThan(
      contrastRatio(PALETTE.dark.ink, '#000000'),
    );
  });
});

describe('global.css declares the exported palette', () => {
  const css = readFileSync(new URL('../src/styles/global.css', import.meta.url), 'utf8');
  /** CSS custom property per PALETTE key. */
  const names: Record<keyof (typeof PALETTE)['light'], string> = {
    paper: '--color-paper',
    paper2: '--color-paper-2',
    line: '--color-line',
    key: '--color-key',
    muted: '--color-muted',
    red: '--color-red',
    ink: '--color-ink',
    ink2: '--color-ink-2',
    inkLine: '--color-ink-line',
    inkMuted: '--color-ink-muted',
  };

  /** The declarations of the first block whose selector matches `selector`. */
  const block = (selector: RegExp): Map<string, string> => {
    const match = new RegExp(`${selector.source}\\s*\\{([^}]*)\\}`).exec(css);
    expect(match, `block ${selector.source}`).not.toBeNull();
    const decls = new Map<string, string>();
    for (const [, name, value] of (match?.[1] ?? '').matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
      if (name && value) decls.set(name, value.trim().toUpperCase());
    }
    return decls;
  };

  const expectPalette = (decls: Map<string, string>, theme: Theme): void => {
    for (const [key, name] of Object.entries(names) as [keyof typeof names, string][]) {
      expect(decls.get(name), `${theme} ${name}`).toBe(PALETTE[theme][key].toUpperCase());
    }
  };

  it('@theme holds the light palette', () => {
    expectPalette(block(/@theme/), 'light');
  });

  it('.tokens-light (and .on-ink) re-declare the light palette', () => {
    expectPalette(block(/\.tokens-light,\s*\.on-ink/), 'light');
  });

  it('the dark block holds the dark palette', () => {
    expectPalette(block(/html\[data-theme='dark'\]/), 'dark');
  });

  it('dark ink sections keep the dark ink family', () => {
    const decls = block(/html\[data-theme='dark'\] \.on-ink/);
    for (const key of ['ink', 'ink2', 'inkLine', 'inkMuted'] as const) {
      expect(decls.get(names[key]), names[key]).toBe(PALETTE.dark[key].toUpperCase());
    }
  });
});
