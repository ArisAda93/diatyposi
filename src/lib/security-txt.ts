/**
 * The site's security.txt (RFC 9116): who to tell about a security problem. Pure, unit-tested in
 * tests/security.test.ts; served at /.well-known/security.txt (src/pages/.well-known/).
 */

/** How long a published file stays valid. RFC 9116 asks for less than a year; every build renews it. */
export const SECURITY_TXT_VALID_DAYS = 360;

export interface SecurityTxtInput {
  /** The address that receives reports. */
  email: string;
  /** The site's origin, e.g. https://diatyposi.com. */
  site: URL | string;
  /** The build time; Expires is this plus SECURITY_TXT_VALID_DAYS. */
  now: Date;
}

export const buildSecurityTxt = ({ email, site, now }: SecurityTxtInput): string => {
  const expires = new Date(now.getTime() + SECURITY_TXT_VALID_DAYS * 24 * 60 * 60 * 1000);
  const canonical = new URL('/.well-known/security.txt', site).href;
  return [
    `Contact: mailto:${email}`,
    `Expires: ${expires.toISOString().replace(/\.\d{3}Z$/, 'Z')}`,
    'Preferred-Languages: el, en',
    `Canonical: ${canonical}`,
    '',
  ].join('\n');
};
