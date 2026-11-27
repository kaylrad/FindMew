// Text colours for anything written on a MyMew wall.
// Start from the wall's negative (each RGB channel inverted), then move it toward black or
// white only as far as needed to pass WCAG contrast. A plain negative of a mid-tone wall is
// not enough on its own: the negative of Senja's #575965 is #a8a69a, which is only 2.8:1.
const BLACK = [0, 0, 0];
const WHITE = [255, 255, 255];
export const MIN_TEXT_CONTRAST = 4.5;

const toRgb = (hex) => [0, 2, 4].map((i) => parseInt(hex.replace('#', '').slice(i, i + 2), 16));
const toHex = (rgb) =>
  '#' + rgb.map((value) => Math.round(value).toString(16).padStart(2, '0')).join('');
const linear = (value) => {
  const v = value / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};
const luminance = ([r, g, b]) => 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
// Rounded so the contrast checked here is the contrast of the hex colour actually rendered.
const mix = (from, to, amount) =>
  from.map((value, i) => Math.round(value + (to[i] - value) * amount));
const asRgb = (color) => (typeof color === 'string' ? toRgb(color) : color);

export function contrastRatio(a, b) {
  const [x, y] = [luminance(asRgb(a)), luminance(asRgb(b))];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

export function negativeColor(hex) {
  return toHex(toRgb(hex).map((value) => 255 - value));
}

const cache = new Map();
/** Returns { wall, negative, ink, muted }: ink for headings, muted for secondary text. */
export function wallTextColors(wall) {
  if (cache.has(wall)) return cache.get(wall);
  const base = toRgb(wall);
  const negative = toRgb(negativeColor(wall));
  const extreme = contrastRatio(BLACK, base) >= contrastRatio(WHITE, base) ? BLACK : WHITE;
  const closestPassing = (target) => {
    for (let step = 0; step <= 40; step++) {
      const color = mix(negative, extreme, step / 40);
      if (contrastRatio(color, base) >= target) return color;
    }
    return extreme;
  };
  // Aim for 7:1 (WCAG AAA); a mid-tone wall cannot reach it, so take nearly the best possible.
  const ink = closestPassing(Math.min(7, contrastRatio(extreme, base) - 0.3));
  let muted = closestPassing(MIN_TEXT_CONTRAST);
  if (contrastRatio(muted, base) > 7) {
    // The negative of a light wall is already very dark; soften it toward the wall for hierarchy.
    let softer = muted;
    for (let step = 1; step <= 40; step++) {
      const color = mix(muted, base, step / 40);
      if (contrastRatio(color, base) < MIN_TEXT_CONTRAST) break;
      softer = color;
    }
    muted = softer;
  }
  const colors = { wall, negative: toHex(negative), ink: toHex(ink), muted: toHex(muted) };
  cache.set(wall, colors);
  return colors;
}

/** CSS custom properties consumed by mew-customization.css. */
export function wallTextStyle(wall, prefix = '--mew-wall') {
  const colors = wallTextColors(wall);
  return {
    [prefix]: colors.wall,
    [prefix + '-ink']: colors.ink,
    [prefix + '-muted']: colors.muted,
  };
}
