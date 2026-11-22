# Lighthouse and verification results (round 2)

Production build (`npm run build`, served with `npm run preview`), Lighthouse 13.6, mobile preset (Moto G Power emulation, slow 4G, 4× CPU), headless Chromium, 22 November 2026.

## Scores (mobile, default simulated throttling)

| Page                                      | Performance | Accessibility | Best practices | SEO | LCP      | CLS   |
| ----------------------------------------- | ----------- | ------------- | -------------- | --- | -------- | ----- |
| `/` Αρχική                                | 100         | 100           | 100            | 100 | 1.05 s   | 0     |
| `/ypiresies/` Υπηρεσίες                   | 100         | 100           | 100            | 100 | 1.05 s   | 0     |
| `/erga/` Έργα                             | 95          | 100           | 100            | 100 | 2.88 s ¹ | 0     |
| `/etaireia/` Η εταιρεία                   | 100         | 100           | 100            | 100 | 1.05 s   | 0     |
| `/epikoinonia/` Επικοινωνία               | 100         | 100           | 100            | 100 | 1.05 s   | 0     |
| `/politiki-aporritou/` Πολιτική απορρήτου | 100         | 100           | 100            | 100 | 0.90 s   | 0.032 |

With the throttling actually applied (`throttlingMethod: devtools`): `/` Performance 99, LCP 1.54 s; `/erga/` Performance 99, LCP 1.55 s.

¹ On `/erga/` the largest element is the first photograph, an 11 KB AVIF loaded eagerly with `fetchpriority="high"`. Its observed LCP is about 0.15 s. Lighthouse's simulated estimate is 2.9 s. In round 1 it was 2.5 s and never dropped below 2.2 s, even in throwaway tests that removed fonts, scripts, logo markup or every other image. It rose slightly in round 2 because every page now loads the motion-layer script. This points to the simulation model on a local HTTP/1.1 server, not to the page. With applied throttling the page meets the 2.0 s target (1.55 s). Re-check on the real host (HTTP/2, CDN); this has not been measured.

Lighthouse's headless Chrome has no hardware WebGL, so these scores measure the hero's static fallback. The WebGL scene loads only after first paint and on hardware GPUs. It was checked separately with GPU-enabled headless Chrome (below). Real-phone performance has not been measured.

## Other checks run on the final build

- **Layout:** every page at 360, 390, 768, 1024, 1440, 1920 and 2560 px. No horizontal overflow, exactly one `<h1>`, and no console errors (the 404 page's own 404 status excepted). Interactive targets are at least 44 px; links inside a block that is still finishing its 3D entry are briefly scaled to 42–44 px.
- **Hero (WebGL, GPU), at 1440 and 390:**
  - The extruded CMYK plates overprint, float in an exploded stack, follow the pointer, and sit over an arch field that covers the whole sheet.
  - The intro plays once per session.
  - On scroll the plates shrink below the header band, wait under the logo and dock into it, never crossing the nav; the header turns solid.
  - Static fallback: under reduced motion, without WebGL, and when the GL context is lost before the scene starts. In all three the hero keeps its SVG arches and the header logo keeps its arches.
  - Turning on reduced motion mid-intro settles everything at once.
  - See `screenshots/motion-hero-*.png`.
- **Motion layer:**
  - Headings converge from C/M/Y and end crisp; 3D depth entries; halftone print-in of photos; tilt and magnetic buttons on pointer devices only.
  - The CMYK scroll-progress hairline runs on every page.
  - Reduced motion shows composed states, and print shows the composed page.
- **Services:**
  - Home: the plate follows hover, keyboard focus and the scroll centre, with a registration transition.
  - `/ypiresies/`: chapter frames straighten on scroll and the rail fills with reading progress.
  - See `screenshots/motion-services-*.png`.
- **Statement:** the halftone field prints in and responds to the pointer (`screenshots/motion-statement-field.png`).
- **Re-checked this round:**
  - the mobile menu;
  - the work filter and lightbox (keyboard, focus return), and the gallery without JavaScript.
- **Not re-run this round:** the process poster, the quote form end to end, and the map consent. Their behaviour code is unchanged since round 1, where these checks passed; their components only gained motion data attributes. The round-1 process frames remain valid: `screenshots/process-moment-step*.png`.
