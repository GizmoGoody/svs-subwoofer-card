// custom:svs-subwoofer-standby: the standby mode as buttons (Auto, Trigger
// and On), the same buttons as the presets, in the feature color; the
// selected mode's text is dark or white to read on that color.
import { html, type TemplateResult } from "lit";
import { NOT_PRESETS, STANDBY_TYPE } from "../const";
import { unavailable, type Config } from "../ha";
import { standbyLabel } from "../subwoofer/device";
import { SvsFeature } from "./base";
import { buttonRowStyles } from "./styles";

export class SvsStandby extends SvsFeature {
  static override styles = buttonRowStyles;
  static override role = "standby" as const;

  static getStubConfig(): Config {
    return { type: `custom:${STANDBY_TYPE}` };
  }

  protected override render(): TemplateResult {
    const stateObj = this._stateObj;
    const options = ((stateObj?.attributes.options ?? []) as string[]).filter((o) => !NOT_PRESETS.includes(o));
    const on = this._textOn("var(--feature-color)");
    if (on) this.style.setProperty("--svs-on-color", on);
    return html`<div class="row ${unavailable(stateObj) ? "disabled" : ""}" role="group" aria-label="Standby mode">${options.map((option) => html`
      <button type="button" data-key=${option} aria-pressed=${String(stateObj?.state === option)} @click=${(ev: Event) => {
        ev.stopPropagation();
        this._hass!.callService("select", "select_option", { entity_id: this._entity, option });
      }}><span>${standbyLabel(option)}</span></button>`)}</div>`;
  }
}
