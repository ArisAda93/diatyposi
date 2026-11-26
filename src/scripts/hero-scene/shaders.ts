/**
 * GLSL ES 1.00 shaders for the hero's press run (WebGL 1 and 2): the sheet of paper, the plates'
 * shadows on it, the halftone print they leave, and the plates themselves.
 *
 * Light theme: the canvas is cleared to white and every colour pass blends with
 * gl.DST_COLOR × gl.ZERO, so inks multiply like overprinting on press (C + M → blue, M + Y → red,
 * C + Y → green); the canvas is composited onto the paper with `mix-blend-mode: multiply`, so
 * white is neutral. Dark theme: cleared to black, every colour pass screens
 * (gl.ONE × gl.ONE_MINUS_SRC_COLOR) and the canvas is composited with `mix-blend-mode: screen`, so
 * black is neutral and inks combine towards light (theme.ts). `uPaper` is that neutral colour:
 * whatever fades fades towards it, so nothing that is off ever tints the page, in either theme.
 *
 * Per frame (scene.ts): the sheet (sheetFragment: face, drop shadow, hairline edge, crop marks,
 * colour strip, the impression's dot ripple and bloom, kept faint under the copy and the header),
 * then each plate's shadow (the plate flattened onto the sheet in key ink, plateShadowFragment),
 * then the halftone prints (the plates flattened in register, plateFragment with uHalftone), then
 * the plates (plateFragment, with the sheen during the hold).
 */
import { SHEET_MASK } from './sheet';

const PRECISION = /* glsl */ `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
`;

/** The extruded arch plates. `wall` is 0 on the faces and 1 on the side walls. */
export const plateVertex = /* glsl */ `
attribute vec3 position;
attribute vec3 normal;
attribute float wall;
uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;
uniform mat3 normalMatrix;
varying vec3 vNormal;
varying float vWall;
void main() {
  vNormal = normalize(normalMatrix * normal);
  vWall = wall;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

/** Dot radius of the halftone print, as a share of its pitch (about half the area inked). */
const PRINT_DOT = '0.4';

/**
 * Faces print the pure ink (identical to the SVG logo); the side walls are shaded by a soft key
 * light from the upper left so the depth reads. uAlpha fades the plate towards uPaper (no ink).
 *
 * - uHalftone (the print left on the sheet): x is the dot pitch in device px, y the screen angle
 *   in radians; the ink is laid in round dots on that screen-space grid. x = 0 prints solid.
 * - uSheen (the hold): a soft slanted band of light across the front faces only, never the walls,
 *   mixing the ink towards white (a lighter ink under multiply, a brighter light under screen).
 *   x: the band's centre along the slant (gl_FragCoord.x + y × slant, device px), y: the slant,
 *   z: half-width (device px), w: strength (0 = none).
 */
export const plateFragment = /* glsl */ `${PRECISION}
uniform vec3 uInk;
uniform vec3 uPaper;
uniform float uAlpha;
uniform vec2 uHalftone;
uniform vec4 uSheen;
varying vec3 vNormal;
varying float vWall;
void main() {
  vec3 n = normalize(vNormal);
  float lambert = clamp(dot(n, normalize(vec3(-0.55, 0.62, 0.56))), 0.0, 1.0);
  float shade = mix(1.0, mix(0.7, 0.95, lambert), vWall);
  vec3 ink = uInk * shade;
  if (uSheen.w > 0.0) {
    // Measured in half-widths and clamped, so far from the band it never gets squared large.
    float s = (gl_FragCoord.x + gl_FragCoord.y * uSheen.y - uSheen.x) / uSheen.z;
    s = clamp(s, -8.0, 8.0);
    ink = mix(ink, vec3(1.0), exp(-s * s) * uSheen.w * (1.0 - vWall));
  }
  float cover = 1.0;
  if (uHalftone.x > 0.0) {
    float c = cos(uHalftone.y);
    float sn = sin(uHalftone.y);
    vec2 cell = fract(mat2(c, sn, -sn, c) * gl_FragCoord.xy / uHalftone.x) - 0.5;
    float aa = 0.75 / uHalftone.x;
    cover = 1.0 - smoothstep(${PRINT_DOT} - aa, ${PRINT_DOT} + aa, length(cell));
  }
  gl_FragColor = vec4(mix(uPaper, ink, uAlpha * cover), 1.0);
}
`;

/** Depth-only pass (colour writes are masked off while it runs). */
export const depthFragment = /* glsl */ `${PRECISION}
void main() {
  gl_FragColor = vec4(1.0);
}
`;

/**
 * A plate's shadow on the sheet: the plate flattened onto it, flat key ink at uAlpha. Drawn as
 * several jittered copies at a fraction of the strength each, which softens its edge while keeping
 * the arch's shape. In dark the key is light, so it is a faint glow.
 */
export const plateShadowFragment = /* glsl */ `${PRECISION}
uniform vec3 uInk;
uniform vec3 uPaper;
uniform float uAlpha;
void main() {
  gl_FragColor = vec4(mix(uPaper, uInk, uAlpha), 1.0);
}
`;

/**
 * The sheet: one quad in group space, larger than the sheet by a margin (room for the drop
 * shadow and the crop marks). The quad spans −0.5 to 0.5; uQuad is its size in sheet units (group
 * units divided by sheet.ts SheetLayout.unit, half the sheet's longer side), so vPos is the
 * position relative to the sheet's centre in sheet units (y up), within about ±1.1: everything
 * laid out in it, the ripple's dots included, follows the sheet's perspective, and no distance or
 * its square grows large enough to overflow medium float precision.
 */
export const sheetVertex = /* glsl */ `
attribute vec2 position;
uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;
uniform vec2 uQuad;
varying vec2 vPos;
void main() {
  vPos = position * uQuad;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 0.0, 1.0);
}
`;

/**
 * Everything on and around the sheet, composed in the shader over uPaper: layer by layer, inks
 * multiply in light and screen in dark (as the blend does with what follows), so the result is
 * exactly what the theme's blend would make of separate passes, in one draw.
 *
 * Uniforms (lengths in sheet units, see sheetVertex, unless noted):
 * - uGeom: xy half the sheet's size, zw the mark (the ripple's and bloom's centre).
 * - uLines: x hairline width, y anti-aliasing width, z crop mark length, w its gap from the trim.
 * - uShadow: xy the drop shadow's offset, z its blur, w the dot pitch.
 * - uStrip: x the colour strip's right end, y its centre line, z patch size, w gap between patches.
 * - uWave: x ripple radius, y ring width, z ripple strength (0–1, sizes the dots), w bloom radius.
 * - uLook (theme strengths): x face, y drop shadow, z lines, w strip.
 * - uMix: x overall alpha, y bloom strength, z mask feather (device px), w dot strength.
 * - uCopyRect, uBandRect: the copy's box and the header band in device px (gl_FragCoord space:
 *   min x, min y, max x, max y); inside them, and easing out over the feather, the fine details
 *   (hairline edge, crop marks, colour strip, ripple dots, bloom) keep at most SHEET_MASK.floor of
 *   their strength. The face and the drop shadow are left whole there (smooth, faint fields; a
 *   mask on them shows as a box). The left edge fades in over SHEET_MASK.leftFade of the sheet's
 *   width, everything included.
 */
export const sheetFragment = /* glsl */ `${PRECISION}
uniform vec3 uPaper;
uniform vec3 uCyan;
uniform vec3 uMagenta;
uniform vec3 uYellow;
uniform vec3 uKey;
uniform vec3 uBloomInk;
uniform vec4 uGeom;
uniform vec4 uLines;
uniform vec4 uShadow;
uniform vec4 uStrip;
uniform vec4 uWave;
uniform vec4 uLook;
uniform vec4 uMix;
uniform vec4 uCopyRect;
uniform vec4 uBandRect;
varying vec2 vPos;

const float MASK_FLOOR = ${SHEET_MASK.floor.toFixed(3)};
const float LEFT_FADE = ${SHEET_MASK.leftFade.toFixed(3)};

// Signed distance to a box of half-size b centred on the origin (negative inside).
float sdBox(vec2 p, vec2 b) {
  vec2 d = abs(p) - b;
  return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
}

// 1 inside the rectangle r (min x, min y, max x, max y), easing to 0 over feather outside it.
// Distances are measured in feathers and clamped first, so device px never get squared.
float nearRect(vec4 r, vec2 p, float feather) {
  vec2 d = clamp(max(r.xy - p, p - r.zw) / feather, -2.0, 2.0);
  float outside = length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
  return 1.0 - smoothstep(0.0, 1.0, outside);
}

// Coverage of a hairline segment from a to b, width w, anti-aliased over aa.
float segment(vec2 p, vec2 a, vec2 b, float w, float aa) {
  vec2 pa = p - a;
  vec2 ba = b - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return 1.0 - smoothstep(w * 0.5, w * 0.5 + aa, length(pa - ba * h));
}

// Coverage of a halftone dot of the given tone (0–1) on a square grid, shifted by offset.
float halftone(vec2 p, float pitch, vec2 offset, float tone, float aa) {
  vec2 cell = fract((p + offset) / pitch) - 0.5;
  float r = 0.45 * pitch * sqrt(clamp(tone, 0.0, 1.0));
  return (1.0 - smoothstep(r - aa, r + aa, length(cell) * pitch)) * step(0.001, tone);
}

// Patch i of the colour strip, counted from its right end (0 = K, 1 = Y, 2 = M, 3 = C).
float stripPatch(vec2 p, float i, float aa) {
  float size = uStrip.z;
  vec2 centre = vec2(uStrip.x - size * 0.5 - i * (size + uStrip.w), uStrip.y);
  return 1.0 - smoothstep(-aa * 0.5, aa * 0.5, sdBox(p - centre, vec2(size * 0.5)));
}

// One layer of ink at strength a over base: multiplied on white paper, screened on black.
vec3 inkOver(vec3 base, vec3 ink, float a, float light) {
  vec3 multiplied = base * mix(vec3(1.0), ink, a);
  vec3 screened = 1.0 - (1.0 - base) * (1.0 - ink * a);
  return mix(screened, multiplied, light);
}

void main() {
  vec2 p = vPos;
  vec2 size = uGeom.xy;
  float light = step(0.5, uPaper.r);
  float aa = uLines.y;
  float edge = sdBox(p, size);
  float inside = 1.0 - smoothstep(-aa * 0.5, aa * 0.5, edge);

  // The left edge fades in (everything); the fine details stay faint under the copy and the
  // header band (a for the smooth fields, fine for the details).
  float lead = smoothstep(-size.x, -size.x + 2.0 * size.x * LEFT_FADE, p.x);
  float a = uMix.x * lead;
  vec2 frag = gl_FragCoord.xy;
  float near = max(nearRect(uCopyRect, frag, uMix.z), nearRect(uBandRect, frag, uMix.z));
  float fine = a * (1.0 - (1.0 - MASK_FLOOR) * near);

  vec3 col = uPaper;

  // The face, and the soft drop shadow outside the edges (down and to the right).
  col = inkOver(col, uKey, inside * uLook.x * a, light);
  float shadow = 1.0 - smoothstep(-uShadow.z * 0.25, uShadow.z, sdBox(p - uShadow.xy, size));
  col = inkOver(col, uKey, shadow * (1.0 - inside) * uLook.y * a, light);

  // Hairline edge and the crop marks: L-shaped pairs just outside each corner, extending the
  // trim lines outward past a small gap (folded into one corner by symmetry).
  float lines = 1.0 - smoothstep(uLines.x * 0.5, uLines.x * 0.5 + aa, abs(edge));
  vec2 q = abs(p);
  float from = uLines.w;
  float to = uLines.w + uLines.z;
  float w = uLines.x;
  lines = max(lines, segment(q, vec2(size.x + from, size.y), vec2(size.x + to, size.y), w, aa));
  lines = max(lines, segment(q, vec2(size.x, size.y + from), vec2(size.x, size.y + to), w, aa));
  col = inkOver(col, uKey, lines * uLook.z * fine, light);

  // The colour strip near the lower right edge, C M Y K from the left.
  float strip = uLook.w * fine;
  col = inkOver(col, uCyan, stripPatch(p, 3.0, aa) * strip, light);
  col = inkOver(col, uMagenta, stripPatch(p, 2.0, aa) * strip, light);
  col = inkOver(col, uYellow, stripPatch(p, 1.0, aa) * strip, light);
  col = inkOver(col, uKey, stripPatch(p, 0.0, aa) * strip, light);

  // The impression: a ring of cyan and magenta halftone dots (grids half a pitch apart) running
  // out from the mark, its dots largest at the ring's front and shrinking behind it.
  vec2 g = p - uGeom.zw;
  float dist = length(g);
  float radius = uWave.x;
  float ring = smoothstep(radius - 2.5 * uWave.y, radius, dist) *
    (1.0 - smoothstep(radius, radius + 0.5 * uWave.y, dist)) * uWave.z;
  float pitch = uShadow.w;
  float dots = inside * uMix.w * fine;
  col = inkOver(col, uCyan, halftone(g, pitch, vec2(0.0), ring, aa) * dots, light);
  float magenta = halftone(g, pitch, vec2(0.5 * pitch), ring * 0.85, aa);
  col = inkOver(col, uMagenta, magenta * dots, light);

  // The bloom: a short soft glow on the paper at the mark.
  float fall = dist / uWave.w;
  float glow = exp(-fall * fall) * uMix.y;
  col = inkOver(col, uBloomInk, glow * inside * fine, light);

  gl_FragColor = vec4(col, 1.0);
}
`;
