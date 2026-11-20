// The volume slider's range and its thresholds: pure, so the card's driver
// and the volume feature agree, and the unit tests can check them.
import type { Config } from "../ha";

// The integration's volume range when its entity does not say
const MIN = -60, MAX = 0;

export interface Range {
  min: number;
  max: number;
  step: number;
}

export interface Threshold {
  below?: number;
  color?: string;
}

/**
 * The slider's range: the entity's own range (-60 to 0 dB), or the part of
 * it chosen in the feature (Slider from and Slider to), so the volumes
 * actually used get the whole width of the slider. Ends given the other way
 * round are swapped; equal ends give the whole range.
 */
export function sliderRange(config: Config | undefined, attributes: Record<string, any> = {}): Range {
  const lo = Number.isFinite(attributes.min) ? attributes.min : MIN;
  const hi = Number.isFinite(attributes.max) ? attributes.max : MAX;
  const clamp = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d);
  let min = clamp(config?.min, lo), max = clamp(config?.max, hi);
  if (min > max) [min, max] = [max, min];
  if (min === max) [min, max] = [lo, hi];
  return { min, max, step: Number.isFinite(attributes.step) && attributes.step > 0 ? attributes.step : 1 };
}

/** A volume as a share of the range (0 at the quietest end, 1 at the loudest), within 0 and 1. */
export const levelOf = (value: number, { min, max }: Range): number => Math.max(0, Math.min(1, (value - min) / (max - min)));

/** The volume at a share of the range, in whole steps. */
export function valueAt(share: number, { min, max, step }: Range): number {
  const f = Math.max(0, Math.min(1, share));
  return Math.round((min + f * (max - min)) / step) * step;
}

/** The volume thresholds, lowest first: [{below, color}, ..., {color}]. */
export function thresholdsOf(config?: Config): Threshold[] {
  const ranges: Threshold[] = Array.isArray(config?.volume_thresholds) ? config!.volume_thresholds : [];
  const bounded = ranges.filter((r) => typeof r?.below === "number").sort((a, b) => a.below! - b.below!);
  const rest = ranges.find((r) => r && typeof r.below !== "number");
  return rest ? [...bounded, rest] : bounded;
}

/** The color of the range a volume falls in, or undefined without thresholds. */
export function thresholdColor(thresholds: Threshold[], value: number): string | undefined {
  for (const range of thresholds) {
    if (typeof range.below !== "number" || value < range.below) return range.color;
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// The volume feature's settings, as its editor saves them
// ---------------------------------------------------------------------------

/** What the volume settings form shows for a configuration. */
export function volumeData(config: Config): Config {
  const ranges = thresholdsOf(config);
  const range = { min: config.min ?? -60, max: config.max ?? 0 };
  return ranges.length
    ? {
      ...range, colored: true,
      color_1: ranges[0]?.color, split_1: ranges[0]?.below,
      color_2: ranges[1]?.color, split_2: ranges[1]?.below,
      color_3: ranges[2]?.color,
    }
    : { ...range, colored: false };
}

/**
 * The volume's settings from its form: only what differs from the defaults
 * (the full -60 to 0 dB, no thresholds). An emptied field keeps the saved
 * value (or the default) until something is typed; ends and thresholds
 * entered the other way round are swapped, with a note saying so.
 */
export function volumeConfig(previous: Config, v: Config): { config: Config; note: string } {
  const before = thresholdsOf(previous);
  const keep = (value: unknown, fallback: number) => (typeof value === "number" && Number.isFinite(value) ? value : fallback);
  const config: Config = { type: previous.type };
  let note = "";
  let min = keep(v.min, previous.min ?? -60), max = keep(v.max, previous.max ?? 0);
  if (min > max) {
    [min, max] = [max, min];
    note = "Slider from and Slider to were the other way round, so they were swapped.";
  }
  if (min === max) {
    note = "Slider from and Slider to are the same, so the slider uses the full range.";
  } else {
    if (min !== -60) config.min = min;
    if (max !== 0) config.max = max;
  }
  if (v.colored) {
    let a = keep(v.split_1, before[0]?.below ?? -30);
    let b = keep(v.split_2, before[1]?.below ?? -15);
    let c1 = v.color_1 ?? "green", c3 = v.color_3 ?? "red";
    // Splits entered the other way round are put back in order, and the
    // outer colors move with them, so each color stays on the volumes meant
    if (a > b) {
      [a, b] = [b, a];
      [c1, c3] = [c3, c1];
      note = "The two threshold volumes were the other way round, so they were swapped, and the quietest and loudest colors moved with them.";
    } else if (a === b) {
      note = "Both threshold volumes are the same, so the middle color is not used.";
    }
    config.volume_thresholds = [{ below: a, color: c1 }, { below: b, color: v.color_2 ?? "yellow" }, { color: c3 }];
  }
  return { config, note };
}
