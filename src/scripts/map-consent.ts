/**
 * Click-to-load map (contact page). Nothing from Google loads until the visitor presses the
 * button; then the iframe replaces the placeholder inside a box of fixed size.
 *
 * Markup contract (src/components/contact/MapEmbed.astro): `[data-map-consent]` with
 * `data-map-src` and `data-map-title`, holding `[data-map-placeholder]` and
 * `button[data-map-load]`.
 */
const initMap = (box: HTMLElement): void => {
  const button = box.querySelector<HTMLButtonElement>('[data-map-load]');
  const placeholder = box.querySelector<HTMLElement>('[data-map-placeholder]');
  const { mapSrc, mapTitle } = box.dataset;
  if (!button || !placeholder || !mapSrc || !mapTitle) return;

  button.addEventListener(
    'click',
    () => {
      // Keep the current height so swapping the placeholder for the map never shifts the layout.
      box.style.minHeight = `${box.offsetHeight}px`;

      const iframe = document.createElement('iframe');
      iframe.title = mapTitle;
      iframe.src = mapSrc;
      iframe.loading = 'lazy';
      iframe.referrerPolicy = 'no-referrer-when-downgrade';
      iframe.setAttribute('allowfullscreen', '');

      placeholder.remove();
      box.append(iframe);
      box.dataset.loaded = '';
      // The button is gone; move focus to the map so keyboard users continue from there.
      iframe.focus();
    },
    { once: true },
  );
};

document.querySelectorAll<HTMLElement>('[data-map-consent]').forEach(initMap);
