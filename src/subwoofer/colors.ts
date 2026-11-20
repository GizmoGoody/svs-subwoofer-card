// Home Assistant's named colors, and text that reads on a color.

// Home Assistant's named colors (the tile card's color picker)
export const HA_COLORS = [
  "primary", "accent", "red", "pink", "purple", "deep-purple", "indigo", "blue", "light-blue", "cyan",
  "teal", "green", "light-green", "lime", "yellow", "amber", "orange", "deep-orange", "brown",
  "light-grey", "grey", "dark-grey", "blue-grey", "black", "white", "disabled",
];

/** A color as CSS: one of Home Assistant's named colors is its theme variable. */
export const cssColor = (color: string): string => (HA_COLORS.includes(color) ? `var(--${color}-color)` : color);

// The dark text: black at 85 %
export const DARK_TEXT = "rgba(0, 0, 0, .85)";
export const LIGHT_TEXT = "#fff";

/** WCAG relative luminance of an [r, g, b] color (0 to 255). */
export function luminance([r, g, b]: number[]): number {
  const lin = (v: number) => ((v /= 255) <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/**
 * Text that reads on a color: dark or white, whichever contrasts more with
 * it (the WCAG contrast ratio). The dark text is black at 85 %, so on the
 * color it is a little lighter than black.
 */
export function textOnRgb(rgb: number[]): string {
  const light = luminance(rgb);
  const dark = luminance(rgb.map((v) => v * 0.15));
  return (light + 0.05) / (dark + 0.05) > 1.05 / (light + 0.05) ? DARK_TEXT : LIGHT_TEXT;
}

/**
 * A CSS color (a variable included) as [r, g, b], read where it is used;
 * undefined while the browser cannot tell (the element is not on the page).
 */
let probe: CanvasRenderingContext2D | null | undefined;
export function rgbOf(el: Element, cssValue: string): number[] | undefined {
  let value = cssValue;
  for (let i = 0; i < 4; i++) {
    const named = value.match(/^var\((--[\w-]+)(?:,\s*(.+))?\)$/);
    if (!named) break;
    value = getComputedStyle(el).getPropertyValue(named[1]).trim() || named[2] || "";
  }
  if (!value) return undefined;
  probe ??= document.createElement("canvas").getContext("2d");
  if (!probe) return undefined;
  probe.fillStyle = "#010203";
  probe.fillStyle = value;
  const read = String(probe.fillStyle);
  if (read === "#010203" && value !== "#010203") return undefined;
  return read.startsWith("#") ? read.slice(1).match(/../g)!.map((h) => parseInt(h, 16)) : (read.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
}

/** A CSS color as #rrggbb (or as the browser writes it), read where it is used. */
export function resolveColor(el: Element, color: string): string | undefined {
  const rgb = rgbOf(el, cssColor(color));
  return rgb ? `#${rgb.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}` : undefined;
}

/** Text that reads on a CSS color, read where it is used; null while the color is not known. */
export function textOn(el: Element, cssValue: string): string | null {
  const rgb = rgbOf(el, cssValue);
  return rgb ? textOnRgb(rgb) : null;
}
