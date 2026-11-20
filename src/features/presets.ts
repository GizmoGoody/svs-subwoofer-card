// custom:svs-subwoofer-presets: one button per preset, each in its own
// color, or one button that cycles through them.
import { html, nothing, type TemplateResult } from "lit";
import { styleMap } from "lit/directives/style-map.js";
import { PRESETS_TYPE } from "../const";
import { unavailable, type Config } from "../ha";
import { cssColor } from "../subwoofer/colors";
import { presetLook, presetNames, shownPresets, type PresetLook } from "../subwoofer/presets";
import { SvsFeature } from "./base";
import { presetStyles } from "./styles";

export class SvsPresets extends SvsFeature {
  static override styles = presetStyles;
  static override role = "preset" as const;

  static getStubConfig(): Config {
    return { type: `custom:${PRESETS_TYPE}` };
  }

  static getConfigElement(): HTMLElement {
    return document.createElement(`${PRESETS_TYPE}-editor`);
  }

  protected override render(): TemplateResult {
    const stateObj = this._stateObj;
    const shown = shownPresets(this._config, presetNames(stateObj));
    const on = this._textOn("var(--feature-color)");
    if (on) this.style.setProperty("--svs-on-color", on);
    const off = unavailable(stateObj);
    const keys = this._config!.style === "presets_cycle"
      ? [this._cycleButton(shown)]
      : shown.map((name) => this._button(name, presetLook(this._config, name), stateObj?.state === name, name, name, () => this._load(name)));
    return html`<div class="row ${off ? "disabled" : ""}" role="group" aria-label="Preset">${keys}</div>`;
  }

  private _button(key: string, look: PresetLook, pressed: boolean, title: string, label: string, onClick: () => void,
    text?: string, cycle = false): TemplateResult {
    const color = look.color ? cssColor(look.color) : undefined;
    const style = { "--c": color, "--svs-on-color": color ? this._textOn(color) : undefined };
    return html`<button type="button" class=${cycle ? "cycle" : ""} data-key=${key} title=${title} aria-label=${label}
      aria-pressed=${String(pressed)} style=${styleMap(style)} @click=${(ev: Event) => {
        ev.stopPropagation();
        onClick();
      }}>${look.icon ? html`<ha-icon .icon=${look.icon} icon=${look.icon}></ha-icon>` : nothing}${
        text !== undefined || !look.icon ? html`<span>${text ?? label}</span>` : nothing}</button>`;
  }

  /**
   * One button showing the active preset; each tap loads the next one, in
   * the order shown. From Manual (or an unknown preset) it loads the first.
   */
  private _cycleButton(shown: string[]): TemplateResult {
    const current = this._stateObj?.state;
    const active = !!current && shown.includes(current);
    const next = shown.length ? shown[(shown.indexOf(current ?? "") + 1) % shown.length] : undefined;
    const look = active ? presetLook(this._config, current!) : {};
    const label = `Preset: ${current ?? "unknown"}${next ? `. Select to load ${next}` : ""}`;
    const text = current && current !== "unknown" ? current : "Preset";
    return this._button("cycle", look, active, next ? `Load ${next}` : "", label, () => next && this._load(next), text, true);
  }

  // Always sent, even for the preset already shown: loading it again puts
  // the subwoofer back to that preset's settings
  private _load(option: string): void {
    this._hass!.callService("select", "select_option", { entity_id: this._entity, option });
  }
}
