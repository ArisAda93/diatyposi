/**
 * Greek capitals without accents (ΔΙΑΦΗΜΙΣΗ, not ΔΙΑΦΉΜΙΣΗ), computed at build time so the HTML
 * carries real capitals and no page relies on `text-transform`. Diaeresis is kept (ϊ → Ϊ).
 */
export const capsEl = (text: string): string =>
  text.normalize('NFD').replace(/́/g, '').toLocaleUpperCase('el').normalize('NFC');
