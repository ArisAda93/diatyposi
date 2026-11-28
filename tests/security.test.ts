import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import config from '../astro.config.mjs';
import { buildSecurityTxt, SECURITY_TXT_VALID_DAYS } from '../src/lib/security-txt';
import { THEME_BOOT_SCRIPT } from '../src/scripts/theme-boot';

/** public/_headers as { path pattern: { header (lower case): [values] } }; `!` lines are skipped. */
const parseHeaders = (text: string): Record<string, Record<string, string[]>> => {
  const rules: Record<string, Record<string, string[]>> = {};
  let current: Record<string, string[]> | undefined;
  for (const line of text.split('\n')) {
    if (!line.trim() || line.trimStart().startsWith('#')) continue;
    if (!/^\s/.test(line)) {
      current = rules[line.trim()] ??= {};
      continue;
    }
    const entry = line.trim();
    if (!current || entry.startsWith('!')) continue;
    const colon = entry.indexOf(':');
    const name = entry.slice(0, colon).trim().toLowerCase();
    (current[name] ??= []).push(entry.slice(colon + 1).trim());
  }
  return rules;
};

const headers = parseHeaders(readFileSync(new URL('../public/_headers', import.meta.url), 'utf8'));

/** The headers of one path pattern; fails the test when the pattern is missing. */
const rule = (pattern: string): Record<string, string[]> => {
  const found = headers[pattern];
  if (!found) throw new Error(`public/_headers has no ${pattern} rule`);
  return found;
};

describe('public/_headers', () => {
  const all = rule('/*');

  it('sends the security headers on every response', () => {
    expect(all['strict-transport-security']).toEqual(['max-age=63072000; includeSubDomains']);
    expect(all['content-security-policy']).toEqual(["frame-ancestors 'none'"]);
    expect(all['x-frame-options']).toEqual(['DENY']);
    expect(all['x-content-type-options']).toEqual(['nosniff']);
    expect(all['referrer-policy']).toEqual(['strict-origin-when-cross-origin']);
    expect(all['cross-origin-opener-policy']).toEqual(['same-origin']);
    expect(all['cross-origin-resource-policy']).toEqual(['same-origin']);
  });

  it('turns off the browser features the site never uses', () => {
    const policy = all['permissions-policy']?.[0] ?? '';
    for (const feature of ['camera', 'microphone', 'geolocation', 'payment', 'usb']) {
      expect(policy).toContain(`${feature}=()`);
    }
  });

  it('never sends noindex (the site is open to search engines)', () => {
    expect(JSON.stringify(headers).toLowerCase()).not.toContain('noindex');
  });

  it('caches fingerprinted build files for a year', () => {
    expect(rule('/_astro/*')['cache-control']).toEqual(['public, max-age=31536000, immutable']);
  });

  it('lets other sites show the share image', () => {
    expect(rule('/og.jpg')['cross-origin-resource-policy']).toEqual(['cross-origin']);
  });
});

describe('Content-Security-Policy (security.csp in astro.config.mjs)', () => {
  const csp = config.security?.csp;
  if (!csp || typeof csp !== 'object') throw new Error('security.csp is not configured');
  const directives = csp.directives ?? [];

  it('loads everything from the site itself, frames only from Google Maps', () => {
    expect(directives).toContain("default-src 'self'");
    expect(directives).toContain("object-src 'none'");
    expect(directives).toContain("base-uri 'self'");
    expect(directives).toContain("form-action 'self'");
    expect(directives).toContain('frame-src https://maps.google.com https://www.google.com');
  });

  it('allows unsafe-inline only for style attributes, never for scripts', () => {
    const inline = (csp.styleDirective?.resources ?? []).filter((entry) =>
      JSON.stringify(entry).includes('unsafe-inline'),
    );
    expect(inline).toEqual([{ resource: "'unsafe-inline'", kind: 'attribute' }]);
    expect(JSON.stringify(csp.scriptDirective ?? {})).not.toContain('unsafe');
  });

  it('carries the hash of the inline pre-paint theme script', () => {
    const hash = `sha256-${createHash('sha256').update(THEME_BOOT_SCRIPT).digest('base64')}`;
    expect(csp.scriptDirective?.hashes).toContain(hash);
  });
});

describe('buildSecurityTxt', () => {
  const now = new Date('2026-11-28T10:00:00.000Z');
  const text = buildSecurityTxt({
    email: 'shop@example.com',
    site: 'https://diatyposi.com',
    now,
  });

  it('names the contact, languages and canonical address', () => {
    expect(text).toContain('Contact: mailto:shop@example.com\n');
    expect(text).toContain('Preferred-Languages: el, en\n');
    expect(text).toContain('Canonical: https://diatyposi.com/.well-known/security.txt\n');
  });

  it('expires less than a year after the build, in RFC 3339 without milliseconds', () => {
    expect(SECURITY_TXT_VALID_DAYS).toBeLessThan(365);
    expect(text).toContain('Expires: 2027-11-23T10:00:00Z\n');
  });
});
