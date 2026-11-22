# Lighthouse and verification results

Production build (`npm run build`, served with `npm run preview`), Lighthouse 13.6, mobile preset (Moto G Power emulation, slow 4G, 4× CPU), headless Chromium, 22 November 2026.

## Scores (mobile, default simulated throttling)

| Page | Performance | Accessibility | Best practices | SEO | LCP | CLS |
|---|---|---|---|---|---|---|
| `/` Αρχική | 100 | 100 | 100 | 100 | 1.05 s | 0 |
| `/ypiresies/` Υπηρεσίες | 100 | 100 | 100 | 100 | 1.05 s | 0 |
| `/erga/` Έργα | 98 | 100 | 100 | 100 | 2.48 s ¹ | 0 |
| `/etaireia/` Η εταιρεία | 100 | 100 | 100 | 100 | 1.05 s | 0 |
| `/epikoinonia/` Επικοινωνία | 100 | 100 | 100 | 100 | 1.05 s | 0 |
| `/politiki-aporritou/` Πολιτική απορρήτου | 100 | 100 | 100 | 100 | 0.90 s | 0.032 |

¹ On `/erga/` the largest element is the first photograph (an 11 KB AVIF, loaded eagerly with `fetchpriority="high"`). Lighthouse's simulated estimate stays at about 2.5 s here. It barely moved in throwaway tests that preloaded the image, removed the font preloads, removed the page script, removed the logo markup, or removed every other image; it never dropped below 2.2 s. That points to the simulation model on a local HTTP/1.1 server, not to the page. With the same throttling actually applied (`throttlingMethod: devtools`), `/erga/` scores **Performance 100 with LCP 1.45 s**. Re-check on the real host (HTTP/2, CDN): the simulated figure is expected to drop there, but this has not been measured.

## Other checks run on the final build

- **Layout:** every page at 360, 390, 768, 1024, 1440, 1920 and 2560 px. No horizontal overflow, exactly one `<h1>`, every interactive target at least 44 px tall, no console errors (the 404 page's own 404 status excepted).
- **Hero moment:** plays once per session, about 1.45 s after scripts load. The plates arrive out of register with real overprint colours (multiply), snap into register and finish in the logo's knock-out stacking. With reduced motion the hero is composed immediately. See `screenshots/hero-moment-*.png`.
- **Process moment:** the poster prints Y → M → C → K as the four steps pass, at 1440, 390×844, 667×375 and 844×390. Under reduced motion every plate is printed. See `screenshots/process-moment-step*.png`.
- **Keyboard and accessibility:**
  - Mobile menu: opens, keeps focus inside, Esc closes and returns focus.
  - Work filter: `aria-pressed`, live count.
  - Lightbox: opens, arrow keys move within the filtered set, Esc returns focus to the tile.
- **Quote form, end to end:**
  - Empty submit shows an error summary and per-field errors.
  - Fixed fields clear their errors live.
  - Invalid phone, email, past date, half-typed date and short message are each caught.
  - A valid submit opens the send panel. The decoded `mailto:` subject and body (with CRLF), the Viber `draft=` link and the WhatsApp `?text=` link each contain the full message.
  - Copy button works; `?ypiresia=` pre-selects services.
- **Map:** nothing is requested from Google until "Φόρτωση χάρτη" is clicked.
- **No JavaScript:** every page's content is visible. The contact page shows direct contact links instead of the form, and the work filter is hidden.
