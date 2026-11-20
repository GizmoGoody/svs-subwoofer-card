// The card's and the panel's own options: their checks, their defaults as
// the editor writes them, and the tile card's options as the card passes
// them on. Pure, so the unit tests can check them.
import { BLUETOOTH, DEFAULT_PATTERN, FEATURES_STYLES, FINISH_EXTENTS, FINISHES, PRESETS_TYPE, VOLUME_TYPE } from "../const";
import type { Config, HomeAssistant } from "../ha";
import { isGroup, subwoofers, svsVolumes } from "../subwoofer/device";

// The panel card's own options, kept out of the card inside it
export const PANEL_KEYS = ["members", "members_open", "members_toggle"];
// Options this card adds to the tile card's
export const OWN_KEYS = ["finish", "pattern", "vibration", "bluetooth", "standby_badge", "driver_ring", "finish_extent", "features_style"];

// Option names in this card's own namespace: one that is not a current
// option is a mistake (a typo, or an option that was renamed), so the card
// says so
const OWN_PREFIXES = ["member", "finish", "bluetooth", "standby", "vibration", "pattern", "features_style", "_"];

function checkOptions(config: Config, known: string[]): void {
  const unknown = Object.keys(config).filter((k) => OWN_PREFIXES.some((p) => k.startsWith(p)) && !known.includes(k));
  if (unknown.length) throw new Error(`Unknown option${unknown.length > 1 ? "s" : ""}: ${unknown.join(", ")}`);
}

/** Check the card's options; a wrong one throws, with what is wrong. */
export function checkCard(config: Config): void {
  if (!config?.entity) throw new Error("Choose an SVS Subwoofer entity");
  checkOptions(config, OWN_KEYS);
  const finish = config.finish ?? "none";
  if (!FINISHES.some(([id]) => id === finish)) throw new Error(`Unknown finish: ${finish}`);
}

/** Check the panel's options. */
export function checkPanel(config: Config): void {
  if (!config?.entity) throw new Error("Choose an SVS Subwoofer entity");
  checkOptions(config, [...OWN_KEYS, ...PANEL_KEYS]);
  const finish = config.finish ?? "none";
  if (!FINISHES.some(([id]) => id === finish)) throw new Error(`Unknown finish: ${finish}`);
  if (config.members !== undefined && (!Array.isArray(config.members)
    || config.members.some((m: unknown) => !m || typeof m !== "object" || !(m as Config).entity))) {
    throw new Error("members must be a list of card settings, each with an entity");
  }
}

/** The tile card's own options (as its editor shows them): the card's left out, the driver as the picture. */
export function tileConfig(config: Config): Config {
  const tile: Config = { ...config, type: "tile", show_entity_picture: true };
  for (const key of [...OWN_KEYS, ...PANEL_KEYS]) delete tile[key];
  return tile;
}

// A tap on the driver connects or disconnects (see the card's ll-custom handler)
export const CONNECTION_ACTION = { action: "fire-dom-event", svs_subwoofer: "connection" };

/** The tile card inside the card: unless the card sets its own Icon tap behavior, a tap on the driver connects or disconnects. */
export function innerTileConfig(config: Config): Config {
  const tile = tileConfig(config);
  tile.icon_tap_action ??= CONNECTION_ACTION;
  return tile;
}

const oneOf = (options: [string, string][], value: unknown, fallback: string): string =>
  (options.some(([id]) => id === value) ? (value as string) : fallback);

/**
 * The configuration as the editor saves it: the card's options written
 * out, and the pattern, finish extent and features style only with a finish.
 */
export function explicit(config: Config): Config {
  const c: Config = { ...config };
  c.finish = oneOf(FINISHES, c.finish, "none");
  c.vibration = c.vibration !== false;
  c.bluetooth = oneOf(BLUETOOTH, c.bluetooth, "show");
  c.standby_badge = !!c.standby_badge;
  c.driver_ring = c.driver_ring !== false;
  if (c.finish === "none") {
    delete c.pattern;
    delete c.finish_extent;
    delete c.features_style;
  } else {
    c.pattern = Number.isFinite(c.pattern) ? c.pattern : DEFAULT_PATTERN;
    c.finish_extent = oneOf(FINISH_EXTENTS, c.finish_extent, "card");
    c.features_style = oneOf(FEATURES_STYLES, c.features_style, "match");
  }
  return c;
}

/** A new card: the group's volume (else the first subwoofer's), with presets and volume. */
export function cardStub(hass: HomeAssistant): Config {
  const volumes = svsVolumes(hass);
  const entity = volumes.find((id) => isGroup(hass, id)) ?? volumes[0] ?? "";
  return {
    entity,
    finish: "none",
    vibration: true,
    features: [{ type: `custom:${PRESETS_TYPE}` }, { type: `custom:${VOLUME_TYPE}` }],
    features_position: "bottom",
  };
}

/** A new member subwoofer: its volume, with its state and a slider beside its name. */
export const newMember = (entity: string): Config => ({
  entity,
  state_content: ["state", "preset", "standby_mode"],
  features: [{ type: `custom:${VOLUME_TYPE}` }],
  features_position: "inline",
});

/** A new panel: the group, with every subwoofer below it, alphabetical by name. */
export const panelStub = (hass: HomeAssistant): Config =>
  ({ ...cardStub(hass), members: subwoofers(hass).map(([id]) => newMember(id)) });

/** The panel's member subwoofers' settings: each with an entity. */
export const membersOf = (config?: Config): Config[] =>
  (Array.isArray(config?.members) ? config!.members : []).filter((m: unknown) => !!m && typeof m === "object" && !!(m as Config).entity);

// A tap on the panel's card shows or hides its member subwoofers
export const TOGGLE_ACTION = { action: "fire-dom-event", svs_subwoofer_panel: "toggle" };

/** The panel's card: the SVS Subwoofer card's options; a tap shows or hides the member subwoofers (with Tap the card to show or hide). */
export function headerConfig(config: Config): Config {
  const header: Config = { ...config, type: `custom:svs-subwoofer-card` };
  for (const key of PANEL_KEYS) delete header[key];
  if (config.members_toggle !== false && membersOf(config).length) header.tap_action = TOGGLE_ACTION;
  return header;
}

/** A member subwoofer's card: its own settings, with the panel's look and badges. */
export function memberConfig(config: Config, member: Config, name: string): Config {
  const own: Config = { ...member };
  delete own.type;
  return {
    bluetooth: config.bluetooth ?? "show",
    vibration: config.vibration !== false,
    standby_badge: !!config.standby_badge,
    driver_ring: config.driver_ring !== false,
    ...own,
    type: "custom:svs-subwoofer-card",
    name: member.name || name,
    finish: config.finish ?? "none",
    ...(config.pattern !== undefined ? { pattern: config.pattern } : {}),
    features_style: config.features_style ?? "match",
  };
}
