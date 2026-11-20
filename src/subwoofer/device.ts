// A subwoofer (or a subwoofer group) as the integration describes it: its
// entities, found by their translation keys on the same device, its name,
// and what the card adds to its state for State content.
import { DOMAIN, NOT_PRESETS, ROLES, type Role } from "../const";
import { known, type HassEntity, type HomeAssistant } from "../ha";

/** The entity with this role on the same device as entityId, or undefined. */
export function sibling(hass: HomeAssistant | undefined, entityId: string | undefined, role: Role): string | undefined {
  const entities = hass?.entities;
  const device = entityId ? entities?.[entityId]?.device_id : undefined;
  if (!entities || !device) return undefined;
  return Object.values(entities).find(
    (e) => e.device_id === device && e.platform === DOMAIN && e.translation_key === ROLES[role],
  )?.entity_id;
}

export const isSvs = (hass: HomeAssistant | undefined, entityId?: string): boolean =>
  !!entityId && hass?.entities?.[entityId]?.platform === DOMAIN;

/** Whether the entity belongs to a subwoofer group: its device's identifier is group_<entry id>. */
export function isGroup(hass: HomeAssistant | undefined, entityId?: string): boolean {
  const device = entityId ? hass?.devices?.[hass?.entities?.[entityId]?.device_id ?? ""] : undefined;
  return (device?.identifiers ?? []).some(([domain, id]) => domain === DOMAIN && String(id).startsWith("group_"));
}

/** Names compared as people read them: alphabetical, ignoring case. */
export const byName = (a: string, b: string): number => a.localeCompare(b, undefined, { sensitivity: "base" });

/** The SVS volume entities: every subwoofer's and, with groups, every group's, by entity id. */
export function svsVolumes(hass: HomeAssistant | undefined, groups = true): string[] {
  return Object.values(hass?.entities ?? {})
    .filter((e) => e.platform === DOMAIN && e.translation_key === ROLES.volume && (groups || !isGroup(hass, e.entity_id)))
    .map((e) => e.entity_id)
    .sort();
}

/** Every single subwoofer's volume entity (not groups), as [entity id, name], alphabetical by name. */
export function subwoofers(hass: HomeAssistant | undefined): [string, string][] {
  return svsVolumes(hass, false)
    .map((id): [string, string] => {
      const device = hass?.devices?.[hass?.entities?.[id]?.device_id ?? ""];
      return [id, device?.name_by_user || device?.name || id];
    })
    .sort((a, b) => byName(a[1], b[1]));
}

/**
 * Names without the words they all start with: "Subwoofer Left" and
 * "Subwoofer Right" become "Left" and "Right". A name is never left empty.
 */
export function shortNames(names: string[]): string[] {
  if (names.length < 2) return names;
  const words = names.map((n) => n.split(" "));
  let common = 0;
  while (words.every((w) => w.length > common + 1 && w[common] === words[0][common])) common++;
  return words.map((w) => w.slice(common).join(" "));
}

/** The names member subwoofers show by default, by entity. */
export function defaultMemberNames(hass: HomeAssistant | undefined, ids: string[]): Record<string, string> {
  const all = Object.fromEntries(subwoofers(hass));
  const names = shortNames(ids.map((id) => all[id] ?? id));
  return Object.fromEntries(ids.map((id, i) => [id, names[i]]));
}

/** The card writes the standby modes Auto, Trigger and On (the integration names them Auto ON, Trigger and ON). */
export const standbyLabel = (mode?: string): string =>
  (/^auto on$/i.test(mode ?? "") ? "Auto" : /^on$/i.test(mode ?? "") ? "On" : mode ?? "");

/** A state of the preset or standby select that is a choice: known, and not Manual or Mixed. */
export const isChoice = (stateObj?: HassEntity): stateObj is HassEntity => known(stateObj) && !NOT_PRESETS.includes(stateObj.state);

/**
 * The subwoofer's preset, standby mode and volume, as attributes of the
 * card's entity, so State content can show them next to its state. The
 * card's own entity is left out.
 */
export function subwooferAttributes(hass: HomeAssistant, entityId: string): Record<string, string> {
  const extra: Record<string, string> = {};
  for (const [role, attribute] of [["preset", "preset"], ["standby", "standby_mode"], ["volume", "volume"]] as [Role, string][]) {
    const id = sibling(hass, entityId, role);
    const stateObj = id && id !== entityId ? hass.states[id] : undefined;
    if (!known(stateObj)) continue;
    const unit = stateObj.attributes.unit_of_measurement;
    extra[attribute] = unit ? `${stateObj.state} ${unit}` : role === "standby" ? standbyLabel(stateObj.state) : stateObj.state;
  }
  return extra;
}

/** hass with the card's entity carrying the subwoofer attributes, for the editors' State content picker. */
export function withSubwooferAttributes(hass: HomeAssistant, entityId?: string): HomeAssistant {
  const stateObj = entityId ? hass.states[entityId] : undefined;
  if (!stateObj) return hass;
  const attributes = { ...stateObj.attributes, ...subwooferAttributes(hass, entityId!) };
  return { ...hass, states: { ...hass.states, [entityId!]: { ...stateObj, attributes } } };
}

/**
 * For a group in the panel card: its member subwoofers' different states
 * for a role (preset, standby or volume), in member order, or undefined
 * when they all agree (or fewer than two have one).
 */
export function membersMixed(hass: HomeAssistant | undefined, members: string[], role: Role): string[] | undefined {
  const states = members
    .map((id) => sibling(hass, id, role))
    .map((id) => (id ? hass?.states[id] : undefined))
    .filter(known)
    .map((s) => s.state);
  const distinct = [...new Set(states)];
  return states.length > 1 && distinct.length > 1 ? distinct : undefined;
}
