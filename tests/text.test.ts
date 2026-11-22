import { describe, expect, it } from 'vitest';
import { capsEl } from '../src/lib/text';

describe('capsEl', () => {
  it('drops accents in Greek capitals', () => {
    expect(capsEl('Διαφήμιση – Εκτυπώσεις')).toBe('ΔΙΑΦΗΜΙΣΗ – ΕΚΤΥΠΩΣΕΙΣ');
    expect(capsEl('Υπηρεσίες')).toBe('ΥΠΗΡΕΣΙΕΣ');
    expect(capsEl('Η εταιρεία')).toBe('Η ΕΤΑΙΡΕΙΑ');
  });
  it('keeps the diaeresis', () => {
    expect(capsEl('προϊόντα')).toBe('ΠΡΟΪΟΝΤΑ');
    expect(capsEl('ΐ ΰ')).toBe('Ϊ Ϋ');
  });
  it('leaves Latin text upper-cased normally', () => {
    expect(capsEl('Offset & social media')).toBe('OFFSET & SOCIAL MEDIA');
  });
});
