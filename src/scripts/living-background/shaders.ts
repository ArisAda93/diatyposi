/**
 * GLSL ES 1.00 shaders for the living background (WebGL 1 and 2): one program, one instanced
 * draw of triangle strips, every instance one hairline of a braid (lines.ts).
 *
 * The line. Each vertex is a station along the line (t 0–1 across the viewport, a little past
 * both edges) on one side of it (−1 or +1). The vertex shader finds the line's height there
 * (`lineAt`, mirrored from lines.ts, including the pointer push) and its direction (from the
 * heights just before and after), and offsets the vertex along the normal by half the line's width
 * plus one device px for the anti-aliased edge. The fragment shader prints full ink across the
 * line's width and fades over that last pixel.
 *
 * Printing. The canvas is cleared to the paper. Light paper: each fragment writes the paper
 * printed with its ink, uBase × mix(1, ink, a) (uBase = the paper), and the MIN blend keeps the
 * darker value per channel, so crossing lines combine like overprinting (cyan over yellow reads
 * green) but no crossing darkens past what the contrast caps allow; without MIN, uBase is white
 * and the fragments multiply the paper. Dark paper (uDark = 1): each fragment writes
 * mix(uBase, ink, a), light ink on the dark paper, and the MAX blend keeps the lighter value per
 * channel; without MAX, uBase is black and the fragments screen the paper. math.ts printWith /
 * printPair mirror this.
 *
 * Text-aware ink. `textMask` is 1 inside the text rectangles (uText, drawing-buffer px, y up;
 * text-rects.ts) and falls to 0 over uFeather px outside them; every fragment prints with
 * mix(open, inside, mask): the line's design ink away from text, `inside` on it (a whisper, never
 * above the contrast-safe cap; text-rects.ts insideAlpha). TEXT_RECTS (the array size) is defined
 * in front of every source by scene.ts from the GPU's uniform limits; with 0, or uTextAll = 1, the
 * mask is 1 everywhere. The mask mirrors text-rects.ts textMaskAt and inkAlpha, where it is tested.
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

float textMask(vec2 p) {
  float m = uTextAll;
#if TEXT_RECTS > 0
  for (int i = 0; i < TEXT_RECTS; i++) {
    if (float(i) >= uTextCount) break;
    vec4 r = uText[i];
    vec2 d = max(r.xy - p, p - r.zw);
    float dist = max(d.x, d.y);
    m = max(m, 1.0 - smoothstep(0.0, uFeather, dist));
  }
#endif
  return m;
}
`;

/**
 * Per instance (lines.ts writeLines): iLine = (base, parallax, width CSS px, ink index k 0 / c 1 /
 * m 2 / y 3), iRiver and iWeave = (amp, cycles, phase, speed), iNodes = (cycles, phase, speed, 0).
 * uView is the viewport (CSS px), uScale the drawing-buffer px per CSS px (x, y), uLine =
 * (margin, river scroll phase, weave scroll phase, node floor), uPointer = (x, y CSS px, radius,
 * strength × presence), uOverscan the extra width drawn past each edge (CSS px). uOpen and uInside
 * are the inks' alphas away from text and on it, (k, c, m, y), already weighted by the section
 * accent; uOpenInk is the ink left at the widest spread (lines.ts lineInk).
 */
export const lineVertex = /* glsl */ `
attribute vec2 position;
attribute vec4 iLine;
attribute vec4 iRiver;
attribute vec4 iWeave;
attribute vec4 iNodes;
uniform vec2 uView;
uniform vec2 uScale;
uniform float uTime;
uniform float uScroll;
uniform vec4 uLine;
uniform vec4 uPointer;
uniform float uOverscan;
uniform float uOpenInk;
uniform vec3 uKey;
uniform vec3 uCyan;
uniform vec3 uMagenta;
uniform vec3 uYellow;
uniform vec4 uOpen;
uniform vec4 uInside;
varying vec3 vColor;
varying float vOpen;
varying float vInside;
varying float vAcross;
varying float vHalf;

const float TAU = 6.28318530718;

// lines.ts braidY + lineAt + pointerPush; .x is y (CSS px, down), .y the spread (0 at a node).
vec2 lineAt(float x) {
  float across = x / uView.x;
  float scrolled = uScroll / uView.y;
  float band = max(1.0, uView.y + 2.0 * uLine.x);
  float v = iLine.x * band - uScroll * iLine.y;
  float centre = v - band * floor(v / band) - uLine.x;
  centre += iRiver.x * uView.y *
    sin(TAU * iRiver.y * across + iRiver.z + iRiver.w * uTime + uLine.y * scrolled);
  float spread = 0.5 - 0.5 * cos(TAU * iNodes.x * across + iNodes.y + iNodes.z * uTime);
  float open = uLine.w + (1.0 - uLine.w) * spread;
  float y = centre + iWeave.x * uView.y * open *
    sin(TAU * iWeave.y * across + iWeave.z + iWeave.w * uTime + uLine.z * scrolled);
  if (uPointer.z > 0.0 && uPointer.w != 0.0) {
    vec2 d = vec2(x, y) - uPointer.xy;
    y += uPointer.w * (d.y / uPointer.z) * exp(-dot(d, d) / (uPointer.z * uPointer.z));
  }
  return vec2(y, spread);
}

void main() {
  float x = mix(-uOverscan, uView.x + uOverscan, position.x);
  vec2 here = lineAt(x);
  float dx = 1.5;
  float dy = lineAt(x + dx).x - lineAt(x - dx).x;
  // Direction and normal in drawing-buffer px (the scale can differ per axis).
  vec2 tangent = normalize(vec2(2.0 * dx * uScale.x, dy * uScale.y));
  vec2 normal = vec2(-tangent.y, tangent.x);
  float halfWidth = max(0.5, 0.5 * iLine.z * uScale.y);
  float reach = halfWidth + 1.0;
  vec2 p = vec2(x * uScale.x, here.x * uScale.y) + normal * position.y * reach;
  vec2 size = uView * uScale;
  gl_Position = vec4(p.x / size.x * 2.0 - 1.0, 1.0 - p.y / size.y * 2.0, 0.0, 1.0);

  float ink = iLine.w;
  vec3 color = uKey;
  float open = uOpen.x;
  float inside = uInside.x;
  if (ink > 2.5) {
    color = uYellow;
    open = uOpen.w;
    inside = uInside.w;
  } else if (ink > 1.5) {
    color = uMagenta;
    open = uOpen.z;
    inside = uInside.z;
  } else if (ink > 0.5) {
    color = uCyan;
    open = uOpen.y;
    inside = uInside.y;
  }
  // Stronger where the braid's lines meet (lines.ts lineInk).
  float along = 1.0 - (1.0 - uOpenInk) * clamp(here.y, 0.0, 1.0);
  vColor = color;
  vOpen = open * along;
  vInside = inside * along;
  vAcross = position.y * reach;
  vHalf = halfWidth;
}
`;

/** Full ink across the line's width, faded over the last device px; the text mask on top. */
export const lineFragment = /* glsl */ `${PRECISION}
uniform vec3 uBase;
uniform float uDark;
${TEXT_MASK}
varying vec3 vColor;
varying float vOpen;
varying float vInside;
varying float vAcross;
varying float vHalf;

void main() {
  float cover = clamp(vHalf + 0.5 - abs(vAcross), 0.0, 1.0);
  float a = clamp(mix(vOpen, vInside, textMask(gl_FragCoord.xy)) * cover, 0.0, 1.0);
  vec3 light = uBase * mix(vec3(1.0), vColor, a);
  vec3 dark = mix(uBase, vColor, a);
  gl_FragColor = vec4(mix(light, dark, uDark), 1.0);
}
`;
