import { describe, expect, it } from 'vitest';
import {
  intlDigits,
  mailtoHref,
  normalizePhone,
  telHref,
  viberHref,
  whatsappHref,
} from '../src/lib/links';

describe('phone normalisation', () => {
  it('keeps a leading + and digits only', () => {
    expect(normalizePhone(' +30 210 000-0000 ')).toBe('+302100000000');
    expect(normalizePhone('(210) 000 0000')).toBe('2100000000');
  });
  it('gives international digits without +', () => {
    expect(intlDigits('+30 690 000 0000')).toBe('306900000000');
  });
  it('builds tel: links', () => {
    expect(telHref('+30 210 000 0000')).toBe('tel:+302100000000');
  });
});

describe('mailto', () => {
  it('encodes subject and body with CRLF line breaks', () => {
    const href = mailtoHref(
      'info@diatyposi.example',
      'Αίτημα προσφοράς',
      'Γεια σας\nΚάρτες & φυλλάδια',
    );
    expect(href.startsWith('mailto:info@diatyposi.example?subject=')).toBe(true);
    const url = new URL(href);
    expect(url.searchParams.get('subject')).toBe('Αίτημα προσφοράς');
    expect(url.searchParams.get('body')).toBe('Γεια σας\r\nΚάρτες & φυλλάδια');
    expect(href).toContain('%0D%0A');
    expect(href).not.toContain('+');
  });
  it('omits the query when there is nothing to prefill', () => {
    expect(mailtoHref('a@b.example')).toBe('mailto:a@b.example');
  });
});

describe('chat deep links', () => {
  it('builds app-opening WhatsApp links with international digits and prefilled text', () => {
    const href = whatsappHref('+30 697 412 2163', 'Γεια σας & καλημέρα');
    expect(href).toBe(
      `whatsapp://send?phone=306974122163&text=${encodeURIComponent('Γεια σας & καλημέρα')}`,
    );
    // The & in the text is encoded, so it never starts a new parameter.
    expect(href.match(/&/g)).toHaveLength(1);
    expect(new URL(href).searchParams.get('text')).toBe('Γεια σας & καλημέρα');
    expect(whatsappHref('306974122163')).toBe('whatsapp://send?phone=306974122163');
  });
  it('builds Viber links with an encoded + and a draft', () => {
    const href = viberHref('306900000000', 'Γεια σας');
    expect(href).toBe(
      `viber://chat?number=%2B306900000000&draft=${encodeURIComponent('Γεια σας')}`,
    );
    expect(viberHref('+30 690 000 0000')).toBe('viber://chat?number=%2B306900000000');
  });
});
