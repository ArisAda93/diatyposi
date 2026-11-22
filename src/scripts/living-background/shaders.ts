/**
 * GLSL ES 1.00 shaders for the living background (WebGL 1 and 2).
 *
 * One instanced draw: every instance is one small arch glyph (the logo's ARCH outline, unit wide)
 * lying on the tilted sheet. The canvas is cleared to the paper colour. Each glyph writes the
 * paper printed with its ink (uBase = the paper) and the MIN blend keeps the darker value per
 * channel, so different inks still combine like overprinting (C with Y → green) but no overlap
 * darkens past what the contrast caps allow. Fallback without MIN: uBase is white and the glyphs
 * multiply the paper (gl.DST_COLOR × gl.ZERO).
 *
 * The formulas mirror math.ts (cellHash → hash, waveAt → wave, wrapRow, vignette), where they
 * are tested: keep both in step.
 */

const PRECISION = /* glsl */ `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
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

  // Mostly key (tinted towards the section accent); a share of C/M/Y accents.
  vec3 color = mix(uKey, uTint, uTintAmt);
  float cap = uCap.x;
  if (hash(cell, 0.0) < uMix.z) {
    float pick = hash(cell, 3.1);
    if (pick < uMix.x) {
      color = uCyan;
      cap = uCap.y;
    } else if (pick < uMix.y) {
      color = uMagenta;
      cap = uCap.z;
    } else {
      color = uYellow;
      cap = uCap.w;
    }
  }
  vColor = color;
  vAlpha = cap * clamp(uInkAmt.x + uInkAmt.y * w + uInkAmt.z * near, 0.0, 1.0);
  vDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
}
`;

/**
 * Ink never exceeds the glyph's cap (vAlpha ≤ cap; the caps keep text on the paper at AA, on one
 * glyph and where two overlap). It fades towards the viewport corners (vignette, with a calmer
 * but never empty centre) and into the distance (fog), so the sheet has no hard edge or horizon.
 */
export const fieldFragment = /* glsl */ `${PRECISION}
uniform vec2 uResolution;
uniform vec4 uVignette;
uniform vec3 uFog;
uniform vec3 uBase;
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
  gl_FragColor = vec4(uBase * mix(vec3(1.0), vColor, a), 1.0);
}
`;
