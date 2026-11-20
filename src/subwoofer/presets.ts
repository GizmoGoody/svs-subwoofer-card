// The subwoofer's presets: which are shown, and how each looks.
import { NOT_PRESETS } from "../const";
import type { Config, HassEntity } from "../ha";

// "Default" is the subwoofer's factory settings (SVS's fourth preset slot):
// not shown unless chosen
export const FACTORY_PRESET = "Default";

/** The subwoofer's presets, in its own slot order, without Manual and Mixed. */
export const presetNames = (stateObj?: HassEntity): string[] =>
  ((stateObj?.attributes.options ?? []) as string[]).filter((n) => !NOT_PRESETS.includes(n));

/** The presets shown by default: all but Default. */
export const defaultShown = (names: string[]): string[] => names.filter((n) => n !== FACTORY_PRESET);

/** The presets shown: those chosen, in the order chosen, or the defaults. */
export function shownPresets(config: Config | undefined, names: string[]): string[] {
  return Array.isArray(config?.presets_shown) ? config!.presets_shown.filter((n: string) => names.includes(n)) : defaultShown(names);
}

export interface PresetLook {
  color?: string;
  icon?: string;
}

/** The usual preset names start in green, yellow and red, with volume icons; others in the feature color. */
export function presetDefaults(name: string): PresetLook {
  const n = name.toLowerCase();
  if (n.includes("low")) return { color: "green", icon: "mdi:volume-low" };
  if (n.includes("med")) return { color: "yellow", icon: "mdi:volume-medium" };
  if (n.includes("high")) return { color: "red", icon: "mdi:volume-high" };
  return {};
}

/** A preset's color and icon: its own from the feature's settings, else its defaults. */
export const presetLook = (config: Config | undefined, name: string): PresetLook =>
  ({ ...presetDefaults(name), ...(config?.presets?.[name] ?? {}) });
