// The card's names, the integration's, and the option lists the card and
// its editors share.

declare const __VERSION__: string;
// Set from package.json (or the alpha workflow) when the card is built
export const VERSION: string = __VERSION__;

export const DOMAIN = "svs_subwoofer";
export const CARD_TYPE = "svs-subwoofer-card";
export const EDITOR_TYPE = "svs-subwoofer-card-editor";
export const TILE_EDITOR_TYPE = "svs-subwoofer-tile-card-editor";
export const PANEL_TYPE = "svs-subwoofer-panel-card";
export const PANEL_EDITOR_TYPE = "svs-subwoofer-panel-card-editor";
export const PRESETS_TYPE = "svs-subwoofer-presets";
export const VOLUME_TYPE = "svs-subwoofer-volume";
export const STANDBY_TYPE = "svs-subwoofer-standby";

/**
 * The entities the card and its features look for on a device, by their
 * translation key (a subwoofer group's entities have the same keys as a
 * subwoofer's).
 */
export const ROLES = {
  preset: "preset",
  volume: "volume",
  standby: "standby_mode",
  connected: "connected",
  reconnect: "reconnect",
  disconnect: "disconnect",
} as const;
export type Role = keyof typeof ROLES;

// States of the preset and standby selects that are not a choice: never shown as a button
export const NOT_PRESETS = ["Manual", "Mixed"];

export const FINISHES: [string, string][] = [
  ["none", "None (theme)"],
  ["black_ash", "Premium Black Ash"],
  ["black_oak", "Black Oak Real Wood Veneer"],
  ["gloss_black", "Piano Gloss Black"],
  ["gloss_white", "Piano Gloss White"],
  ["fabric", "Fabric"],
  ["grille", "Grille"],
];
// The same keys and values as the xTool, Prusa and Lampster cards
export const FEATURES_STYLES: [string, string][] = [["match", "Match style"], ["flat", "Flat"], ["console", "Console"]];
export const BLUETOOTH: [string, string][] = [
  ["show", "Show"],
  ["disconnected", "Show only when not connected"],
  ["off", "Hide"],
];
export const FINISH_EXTENTS: [string, string][] = [["card", "Card"], ["container", "Container"]];
export const DEFAULT_PATTERN = 4242;

// The Randomize button's name, by what it changes in each finish
export const RANDOMIZE_LABEL: Record<string, string> = {
  black_ash: "Randomize grain",
  black_oak: "Randomize grain",
  gloss_black: "Randomize reflections",
  gloss_white: "Randomize reflections",
  fabric: "Randomize reflections",
  grille: "Randomize reflections",
};
