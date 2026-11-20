// The features' settings, as Home Assistant's editor dialog opens them.
import { html, LitElement, nothing, type TemplateResult } from "lit";
import { copy, fire, same, type Config, type FeatureContext, type HomeAssistant } from "../ha";
import { sibling } from "../subwoofer/device";
import { defaultShown, presetLook, presetNames } from "../subwoofer/presets";
import { thresholdsOf, volumeConfig, volumeData } from "../subwoofer/volume";

const label = (s: Config) => s.label ?? s.name;
const helper = (s: Config) => s.helper;

/** The editors render in the light DOM, as Home Assistant's own feature editors are styled from outside. */
class LightEditor extends LitElement {
  protected _hass?: HomeAssistant;
  protected _config?: Config;

  protected override createRenderRoot(): HTMLElement {
    return this;
  }

  set hass(hass: HomeAssistant) {
    this._hass = hass;
    this.requestUpdate();
  }

  get hass(): HomeAssistant | undefined {
    return this._hass;
  }
}

// ---------------------------------------------------------------------------
// The presets
// ---------------------------------------------------------------------------
export class SvsPresetsEditor extends LightEditor {
  private _context?: FeatureContext;

  set context(context: FeatureContext) {
    this._context = context;
    this.requestUpdate();
  }

  get context(): FeatureContext | undefined {
    return this._context;
  }

  setConfig(config: Config): void {
    this._config = config;
    this.requestUpdate();
  }

  private _names(): string[] {
    const entity = sibling(this._hass, this._context?.entity_id, "preset");
    return presetNames(entity ? this._hass!.states[entity] : undefined);
  }

  protected override render(): TemplateResult | typeof nothing {
    if (!this._hass || !this._config) return nothing;
    const names = this._names();
    const shown: string[] = (this._config.presets_shown ?? defaultShown(names)).filter((n: string) => names.includes(n));
    const schema = [
      {
        name: "presets_shown", label: "Presets",
        helper: "Default is the subwoofer's factory settings (SVS's fourth preset); it is shown only if you add it.",
        selector: { select: { multiple: true, reorder: true, mode: "dropdown", options: names } },
      },
      {
        name: "style", label: "Style",
        selector: { select: { mode: "dropdown", options: [{ value: "presets_buttons", label: "Buttons" }, { value: "presets_cycle", label: "Cycle button" }] } },
      },
      ...shown.map((name) => ({
        type: "grid", name: "", schema: [
          { name: `color_${name}`, label: `${name} color`, selector: { ui_color: {} } },
          { name: `icon_${name}`, label: `${name} icon`, selector: { icon: {} } },
        ],
      })),
    ];
    const data: Config = { style: this._config.style === "presets_cycle" ? "presets_cycle" : "presets_buttons", presets_shown: shown };
    for (const name of shown) {
      const look = presetLook(this._config, name);
      data[`color_${name}`] = look.color;
      data[`icon_${name}`] = look.icon;
    }
    return html`<ha-form .hass=${this._hass} .schema=${schema} .data=${data} .computeLabel=${label}
      @value-changed=${this._changed}></ha-form>`;
  }

  private _changed = (ev: CustomEvent): void => {
    ev.stopPropagation();
    const value = ev.detail.value;
    const names = this._names();
    const presets: Config = {};
    for (const name of value.presets_shown ?? defaultShown(names)) {
      const color = value[`color_${name}`], icon = value[`icon_${name}`];
      if (color || icon) presets[name] = { ...(color ? { color } : {}), ...(icon ? { icon } : {}) };
    }
    const config: Config = { type: this._config!.type, style: value.style === "presets_cycle" ? "presets_cycle" : "presets_buttons", presets };
    // Kept only when it differs from the default (every preset but Default, in slot order)
    if (Array.isArray(value.presets_shown) && !same(value.presets_shown, defaultShown(names))) config.presets_shown = value.presets_shown;
    this._config = config;
    this.requestUpdate();
    fire(this, "config-changed", { config });
  };
}

// ---------------------------------------------------------------------------
// The volume
// ---------------------------------------------------------------------------

/**
 * The panel's volume feature whose settings are being opened: a member
 * subwoofer's, which can copy the main subwoofer's (volume), or the main
 * subwoofer's, which can be copied to every member (copyTo). Home
 * Assistant's editor dialog opens a feature's settings itself, outside the
 * panel's editor, so the panel editor marks here which feature it is, and
 * the volume settings editor opened next for that feature takes the mark.
 */
export interface PanelVolume {
  key: string;
  volume?: () => Config | undefined;
  members?: () => number;
  copyTo?: (volume: Config) => void;
}
let panelVolume: PanelVolume | null = null;
export const markPanelVolume = (mark: PanelVolume | null): void => {
  panelVolume = mark;
};

/** The mark for this configuration, taken once: another editor opened later with the same settings is not the panel's. */
function takePanelVolume(config: Config): PanelVolume | null {
  if (panelVolume?.key !== JSON.stringify(config)) return null;
  const mark = panelVolume;
  panelVolume = null;
  return mark;
}

export class SvsVolumeEditor extends LightEditor {
  // What the form shows: the configuration's values, or what is being typed
  private _data: Config = {};
  private _note = "";
  // Opened for a panel's volume feature (see PanelVolume)
  private _panel?: PanelVolume | null;

  setConfig(config: Config): void {
    // The configuration this editor just sent comes back here: the fields
    // already show it (an emptied field included), so they are left alone
    const echo = !!this._config && same(config, this._config);
    if (this._panel === undefined) this._panel = takePanelVolume(config);
    this._config = config;
    if (!echo) this._data = volumeData(config);
    this.requestUpdate();
  }

  protected override render(): TemplateResult | typeof nothing {
    if (!this._config) return nothing;
    const on = !!this._data.colored;
    const db = { number: { mode: "box", step: 1, min: -60, max: 0, unit_of_measurement: "dB" } };
    const split = { number: { mode: "box", step: 1, min: -60, max: 0 } };
    const schema = [
      { type: "grid", name: "", schema: [{ name: "min", label: "Slider from", selector: db }, { name: "max", label: "Slider to", selector: db }] },
      { name: "colored", label: "Volume thresholds", helper: "Split the slider into three volume ranges, each with its own color.", selector: { boolean: {} } },
      ...(on ? [
        { type: "grid", name: "", schema: [
          { name: "color_1", label: "Quietest color", selector: { ui_color: {} } },
          { name: "split_1", label: "Up to (dB)", selector: split },
        ] },
        { type: "grid", name: "", schema: [
          { name: "color_2", label: "Middle color", selector: { ui_color: {} } },
          { name: "split_2", label: "Up to (dB)", selector: split },
        ] },
        { name: "color_3", label: "Loudest color", selector: { ui_color: {} } },
      ] : []),
    ];
    // Copy from main: on a member's volume, when the main subwoofer has one.
    // Copy to members: on the main subwoofer's volume, when the panel has members.
    const toMembers = !!this._panel?.copyTo && (this._panel.members?.() ?? 0) > 0;
    const fromMain = !!this._panel?.volume?.();
    return html`<style>.note { color: var(--secondary-text-color); font-size: var(--ha-font-size-s, 12px); margin-top: 8px; min-height: 1em; }</style>
      <ha-button style=${toMembers || fromMain ? "" : "display: none"} @click=${this._copy}>${toMembers ? "Copy to members" : "Copy from main"}</ha-button>
      <ha-form .hass=${this._hass} .schema=${schema} .data=${this._data} .computeLabel=${label} .computeHelper=${helper}
        @value-changed=${this._changed}></ha-form>
      <div class="note" role="status">${this._note}</div>`;
  }

  private _copy = (): void => {
    // The main subwoofer's range and thresholds go to every member
    if (this._panel?.copyTo) {
      this._panel.copyTo(copy(this._config!));
      this._note = "Copied to every member subwoofer.";
      this.requestUpdate();
      return;
    }
    // The main subwoofer's range and thresholds replace this member's
    const volume = this._panel?.volume?.();
    if (!volume) return;
    this._config = { ...copy(volume), type: this._config!.type };
    this._data = volumeData(this._config);
    this._note = "";
    this.requestUpdate();
    fire(this, "config-changed", { config: this._config });
  };

  private _changed = (ev: CustomEvent): void => {
    ev.stopPropagation();
    const v = ev.detail.value;
    const { config, note } = volumeConfig(this._config!, v);
    const toggled = !!v.colored !== thresholdsOf(this._config).length > 0;
    this._config = config;
    this._note = note;
    // Turning thresholds on or off shows their fields with their values;
    // otherwise the fields keep what is in them (an emptied field included)
    this._data = toggled ? volumeData(config) : v;
    this.requestUpdate();
    fire(this, "config-changed", { config });
  };
}
