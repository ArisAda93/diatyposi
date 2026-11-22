/**
 * GLSL ES 1.00 shaders for the living background (WebGL 1 and 2). Two programs share the canvas:
 *
 * - The field: one instanced draw, every instance one small arch glyph (the logo's ARCH outline,
 *   unit wide) lying on the tilted sheet.
 * - The plates: one instanced draw of the logo's arch extruded into a solid plate (as in the
 *   hero), every instance one floating plate (plates.ts, scene.ts), drawn after the field.
 *
 * Printing. The canvas is cleared to the paper. Light paper: each fragment writes the paper
 * printed with its ink, uBase × mix(1, ink, a) (uBase = the paper), and the MIN blend keeps the
 * darker value per channel, so different inks still combine like overprinting (C with Y → green)
 * but no overlap darkens past what the contrast caps allow; without MIN, uBase is white and the
 * fragments multiply the paper. Dark paper (uDark = 1): each fragment writes mix(uBase, ink, a),
 * light ink on the dark paper, and the MAX blend keeps the lighter value per channel; without MAX,
 * uBase is black and the fragments screen the paper. math.ts printWith / printPair mirror this.
 *
 * Text-aware ink. `textMask` is 1 inside the text rectangles (uText, drawing-buffer px, y up;
 * text-rects.ts) and falls to 0 over uFeather px outside them; every fragment prints with
 * mix(open, cap, mask): its design ceiling away from text, exactly its contrast-safe cap on it.
 * The glyphs evaluate the mask once per glyph (in the vertex shader, on the rectangles grown by
 * the glyph's own reach, so every pixel of a glyph that touches text prints at the cap); the
 * plates, which can be large, per fragment. TEXT_RECTS (the array size) is defined in front of
 * every source by scene.ts from the GPU's uniform limits; with 0, or uTextAll = 1, the mask is 1
 * everywhere.
 *
 * Both depend on per-plate (k, c, m, y) uniforms: uCap (inside text) and uCeil (outside).
 *
 * The field formulas mirror math.ts (cellHash → hash, waveAt → wave, wrapRow, vignette) and the
 * mask mirrors text-rects.ts (textMaskAt, inkAlpha), where they are tested: keep both in step.
 */

const PRECISION = /* glsl */ `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
`;

/** `#define TEXT_RECTS n`, in front of every source (it must come before its first use). */
export const textDefine = (slots: number): string =>
  `#define TEXT_RECTS ${Math.max(0, Math.floor(slots))}\n`;

/** The text mask (see the file comment); mirrored by text-rects.ts textMaskAt. */
const TEXT_MASK = /* glsl */ `
#if TEXT_RECTS > 0
uniform vec4 uText[TEXT_RECTS];
#endif
uniform float uTextCount;
uniform float uFeather;
uniform float uTextAll;

float textMask(vec2 p, float grow) {
  float m = uTextAll;
#if TEXT_RECTS > 0
  for (int i = 0; i < TEXT_RECTS; i++) {
    if (float(i) >= uTextCount) break;
    vec4 r = uText[i];
    vec2 d = max(r.xy - p, p - r.zw);
    float dist = max(d.x, d.y) - grow;
    m = max(m, 1.0 - smoothstep(0.0, uFeather, dist));
  }
#endif
  return m;
}
`;

/** The printed colour for ink `color` at alpha `a` (see the file comment). */
const INK_OUT = /* glsl */ `
uniform vec3 uBase;
uniform float uDark;

vec3 inkOut(vec3 color, float a) {
  vec3 light = uBase * mix(vec3(1.0), color, a);
  vec3 dark = mix(uBase, color, a);
  return mix(light, dark, uDark);
}
`;

/**
 * `slot` is the instance number. Its column and row on the grid come from uGrid; the rows wrap
 * around a window that travels with the sheet (uShift, in rows), so a short grid covers a page of
 * any length. The waves and the ink of each glyph depend on its absolute cell, so the pattern
 * travels with the sheet. Near the pointer (uPointer, NDC) the glyphs swell and lift.
 */
export const fieldVertex = /* glsl */ `
attribute vec2 position;
attribute float slot;
uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;
uniform vec2 uGrid;
uniform float uRowStart;
uniform float uShift;
uniform float uPitch;
uniform float uTime;
uniform vec2 uPointer;
uniform float uPointerAmt;
uniform float uFocus;
uniform float uAspect;
uniform vec3 uSize;
uniform vec2 uLift;
uniform vec3 uInkAmt;
uniform vec3 uMix;
uniform vec3 uKey;
uniform vec3 uCyan;
uniform vec3 uMagenta;
uniform vec3 uYellow;
uniform vec3 uTint;
uniform float uTintAmt;
uniform vec4 uCap;
uniform vec4 uCeil;
uniform vec2 uViewport;
uniform float uReach;
${TEXT_MASK}
varying vec3 vColor;
varying float vAlpha;
varying float vDepth;

float hash(vec2 p, float seed) {
  return fract(sin(mod(dot(p, vec2(12.9898, 78.233)) + seed, 6.28318530718)) * 43758.5453);
}

float wave(vec2 p, float t) {
  float w1 = sin(0.23 * p.x + 0.17 * p.y - 0.42 * t);
  float w2 = sin(-0.11 * p.x + 0.29 * p.y - 0.27 * t + 1.7);
  float w3 = sin(0.07 * (p.x - p.y) + 0.19 * t + 0.6);
  float x = clamp(0.45 + 0.28 * w1 + 0.17 * w2 + 0.1 * w3, 0.0, 1.0);
  return x * x * (3.0 - 2.0 * x);
}

void main() {
  float cols = uGrid.x;
  float rows = uGrid.y;
  float j = floor((slot + 0.5) / cols);
  float i = slot - j * cols;
  // Absolute row on the sheet (wrapRow in math.ts), then its place in the visible window.
  float row = j + rows * ceil((uRowStart - uShift - j) / rows);
  // Every other row is offset by half a pitch: a halftone screen rather than a plain grid.
  float u = i - (cols - 1.0) * 0.5 + 0.5 * mod(row, 2.0);
  vec2 cell = vec2(u, row);
  vec2 base = vec2(u, row + uShift) * uPitch;

  vec4 anchor = projectionMatrix * modelViewMatrix * vec4(base, 0.0, 1.0);
  vec2 d = (anchor.xy / anchor.w - uPointer) * vec2(uAspect, 1.0);
  float near = exp(-dot(d, d) * uFocus) * uPointerAmt;

  float w = wave(cell, uTime);
  float size = uPitch * (uSize.x + uSize.y * w + uSize.z * near);
  float lift = uPitch * (uLift.x * w + uLift.y * near);
  vec4 mv = modelViewMatrix * vec4(base + position * size, lift, 1.0);

  // The glyph's centre on screen (drawing-buffer px, y up) and its reach there: the mask is
  // taken once per glyph, on the text rectangles grown by that reach.
  vec4 centre = projectionMatrix * modelViewMatrix * vec4(base, lift, 1.0);
  float cw = max(centre.w, 1e-3);
  vec2 px = (centre.xy / cw * 0.5 + 0.5) * uViewport;
  float reach = uReach * size * projectionMatrix[1][1] * 0.5 * uViewport.y / cw;
  float text = textMask(px, reach);

  // Mostly key (tinted towards the section accent); a share of C/M/Y accents.
  vec3 color = mix(uKey, uTint, uTintAmt);
  float cap = uCap.x;
  float open = uCeil.x;
  if (hash(cell, 0.0) < uMix.z) {
    float pick = hash(cell, 3.1);
    if (pick < uMix.x) {
      color = uCyan;
      cap = uCap.y;
      open = uCeil.y;
    } else if (pick < uMix.y) {
      color = uMagenta;
      cap = uCap.z;
      open = uCeil.z;
    } else {
      color = uYellow;
      cap = uCap.w;
      open = uCeil.w;
    }
  }
  vColor = color;
  vAlpha = mix(open, cap, text) * clamp(uInkAmt.x + uInkAmt.y * w + uInkAmt.z * near, 0.0, 1.0);
  vDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
}
`;

/**
 * Ink never exceeds the glyph's alpha (≤ its cap on text). It fades towards the viewport corners
 * (vignette, with a calmer but never empty centre) and into the distance (fog), so the sheet has
 * no hard edge or horizon.
 */
export const fieldFragment = /* glsl */ `${PRECISION}
uniform vec2 uResolution;
uniform vec4 uVignette;
uniform vec3 uFog;
${INK_OUT}
varying vec3 vColor;
varying float vAlpha;
varying float vDepth;
void main() {
  vec2 q = gl_FragCoord.xy / uResolution * 2.0 - 1.0;
  float r = length(q);
  float edge = (1.0 - smoothstep(uVignette.x, uVignette.y, r)) *
    mix(uVignette.z, 1.0, smoothstep(0.0, uVignette.w, r));
  float fog = mix(1.0, uFog.z, smoothstep(uFog.x, uFog.y, vDepth));
  float a = clamp(vAlpha * edge * fog, 0.0, 1.0);
  gl_FragColor = vec4(inkOut(vColor, a), 1.0);
}
`;

/**
 * The plates. Per instance: the model transform as three rows (rotation × scale | translation,
 * plates.ts plateRows) and iStyle = (ink index k 0 / c 1 / m 2 / y 3, alpha 0–1).
 *
 * Shading, so the plates read as solid without a depth buffer (nothing is depth-tested; MIN/MAX
 * keep the strongest ink per pixel whatever the order): the faces always print the strongest
 * ink of the plate (1 facing the viewer, uShade.x edge-on, and a little lighter towards the top,
 * uShade.y), the side walls lighter (uShade.z–w by how they face the light uLight), so the walls
 * show only at the silhouette, as a lit bevel. scene.ts keeps uShade.w ≤ uShade.x × uShade.y.
 * Yellow plates never fall below uYellowFloor (raised in the dark theme; shade stays ≤ 1, so the
 * caps on text still hold).
 */
export const plateVertex = /* glsl */ `
attribute vec3 position;
attribute vec3 normal;
attribute float wall;
attribute vec4 iRow0;
attribute vec4 iRow1;
attribute vec4 iRow2;
attribute vec4 iStyle;
uniform mat4 projectionMatrix;
uniform vec3 uKey;
uniform vec3 uCyan;
uniform vec3 uMagenta;
uniform vec3 uYellow;
uniform vec4 uCap;
uniform vec4 uCeil;
uniform vec3 uLight;
uniform vec4 uShade;
uniform float uYellowFloor;
uniform float uHalfHeight;
varying vec3 vColor;
varying float vOpen;
varying float vCap;

void main() {
  vec4 p = vec4(position, 1.0);
  vec3 world = vec3(dot(iRow0, p), dot(iRow1, p), dot(iRow2, p));
  vec3 n = normalize(vec3(dot(iRow0.xyz, normal), dot(iRow1.xyz, normal), dot(iRow2.xyz, normal)));
  vec3 view = normalize(-world);
  float shade;
  if (wall > 0.5) {
    shade = mix(uShade.z, uShade.w, 0.5 + 0.5 * dot(n, uLight));
  } else {
    float top = clamp(0.5 + 0.5 * position.y / uHalfHeight, 0.0, 1.0);
    shade = mix(uShade.x, 1.0, abs(dot(n, view))) * mix(1.0, uShade.y, top);
  }

  float ink = iStyle.x;
  vec3 color = uKey;
  float cap = uCap.x;
  float open = uCeil.x;
  if (ink > 2.5) {
    color = uYellow;
    cap = uCap.w;
    open = uCeil.w;
    // Dark theme: yellow keeps more of its ink on the turned faces and walls, so it reads as
    // light ink rather than a dim olive.
    shade = max(shade, uYellowFloor);
  } else if (ink > 1.5) {
    color = uMagenta;
    cap = uCap.z;
    open = uCeil.z;
  } else if (ink > 0.5) {
    color = uCyan;
    cap = uCap.y;
    open = uCeil.y;
  }
  float k = clamp(shade * iStyle.y, 0.0, 1.0);
  vColor = color;
  vOpen = open * k;
  vCap = cap * k;
  gl_Position = projectionMatrix * vec4(world, 1.0);
}
`;

/** Per fragment: the design ceiling away from text, the contrast-safe cap on it. */
export const plateFragment = /* glsl */ `${PRECISION}
${TEXT_MASK}
${INK_OUT}
varying vec3 vColor;
varying float vOpen;
varying float vCap;
void main() {
  float a = clamp(mix(vOpen, vCap, textMask(gl_FragCoord.xy, 0.0)), 0.0, 1.0);
  gl_FragColor = vec4(inkOut(vColor, a), 1.0);
}
`;
