// The driver: the picture shown in place of the tile card's icon, its size
// (it follows the volume) and its shake.
import { reducedMotion } from "../ha";

// The driver's outer ring, as a share of the picture's radius: where the badges sit
export const DRIVER_RING = 16.7 / 20;
// The ring's color with no preset or threshold color, with a preset and without
export const RING_PLAIN = "#6b7079";
export const RING_PRESET = "#9aa0a8";

/** The driver picture, with its outer ring in a color (or none). */
export function driverPicture(ring?: string): string {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40">` +
    `<circle cx="20" cy="20" r="15.5" fill="#15171a" stroke="${ring ?? "#2a2d32"}" stroke-width="${ring ? 2.4 : 1.2}"/>` +
    `<circle cx="20" cy="20" r="12.6" fill="#24272c" stroke="#3a3e45" stroke-width="1.6"/>` +
    `<circle cx="20" cy="20" r="9.6" fill="#1a1c20"/>` +
    `<circle cx="20" cy="20" r="5.4" fill="#3d424a"/>` +
    `<circle cx="18.6" cy="18.4" r="2" fill="#5b616b" opacity=".7"/>` +
    `</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

/** The driver's scale at a volume level (0 quietest, 1 loudest): small when quiet, filling the icon when loud. */
export const driverScale = (level: number): number => 0.7 + level * 0.5;

/** Size the driver for a volume level; it springs to it, unless motion is reduced. */
export function sizeDriver(driver: HTMLElement, level: number): void {
  driver.style.transition = reducedMotion() ? "none" : "scale 350ms cubic-bezier(.3, 1.5, .5, 1)";
  driver.style.scale = String(driverScale(level));
}

/** Shake the driver, harder at a higher level; with no duration, until stopped. */
export function shake(driver: HTMLElement, level: number, duration?: number): Animation | undefined {
  if (reducedMotion() || !driver.animate) return undefined;
  const a = (.3 + level * 1.4).toFixed(2), s = (1 + level * .06).toFixed(3);
  const frames = [
    { transform: "translate(0, 0) scale(1)" },
    { transform: `translate(${a}px, ${-Number(a) / 2}px) scale(${s})` },
    { transform: "translate(0, 0) scale(1)" },
    { transform: `translate(${-Number(a)}px, ${Number(a) / 2}px) scale(${s})` },
    { transform: "translate(0, 0) scale(1)" },
  ];
  return driver.animate(frames, { duration: 90, iterations: duration ? Math.max(1, Math.round(duration / 90)) : Infinity });
}

// Material Design Icons: Bluetooth connected and off
export const BT_ON = "M14.88,16.29L13,18.17V14.41M13,5.83L14.88,7.71L13,9.58M17.71,7.71L12,2H11V9.58L6.41,5L5,6.41L10.59,12L5,17.58L6.41,19L11,14.41V22H12L17.71,16.29L13.41,12L17.71,7.71Z";
export const BT_OFF = "M13 5.83l1.88 1.88-1.6 1.6 1.41 1.41 3.02-3.02L12 2h-1v5.03l2 2zM5.41 4L4 5.41 10.59 12 5 17.59 6.41 19 11 14.41V22h1l4.29-4.29 2.3 2.29L20 18.59 5.41 4zM13 18.17v-3.76l1.88 1.88L13 18.17z";
