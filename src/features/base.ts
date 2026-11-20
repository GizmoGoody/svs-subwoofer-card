// What every SVS Subwoofer feature has: its configuration, Home Assistant
// and its context (the card's entity), and the entity it controls, found
// on the same device. A card for a subwoofer group controls the group; a
// card for one subwoofer, that subwoofer.
import { LitElement, type PropertyValues } from "lit";
import type { Role } from "../const";
import type { Config, FeatureContext, HassEntity, HomeAssistant } from "../ha";
import { textOn } from "../subwoofer/colors";
import { sibling } from "../subwoofer/device";

export class SvsFeature extends LitElement {
  // The entity the feature controls, by its role on the device
  static role: Role;

  protected _config?: Config;
  protected _hass?: HomeAssistant;
  protected _context?: FeatureContext;
  private _retry = false;

  constructor() {
    super();
    // Keep taps on a control from reaching the cards around it (such as an expander card)
    for (const type of ["click", "touchstart", "touchend", "mousedown", "mouseup"]) {
      this.addEventListener(type, (ev) => ev.stopPropagation());
    }
  }

  setConfig(config: Config): void {
    if (!config) throw new Error("Invalid configuration");
    this._config = config;
    this.requestUpdate();
  }

  set hass(hass: HomeAssistant) {
    this._hass = hass;
    this.requestUpdate();
  }

  get hass(): HomeAssistant | undefined {
    return this._hass;
  }

  set context(context: FeatureContext) {
    this._context = context;
    this.requestUpdate();
  }

  get context(): FeatureContext | undefined {
    return this._context;
  }

  /** The entity the feature controls, on the card's entity's device. */
  protected get _entity(): string | undefined {
    return sibling(this._hass, this._context?.entity_id, (this.constructor as typeof SvsFeature).role);
  }

  protected get _stateObj(): HassEntity | undefined {
    const id = this._entity;
    return id ? this._hass?.states[id] : undefined;
  }

  protected override shouldUpdate(_changed: PropertyValues): boolean {
    return !!(this._hass && this._config && this._context);
  }

  protected override willUpdate(): void {
    // A feature with nothing to show takes no place: neither itself nor its row among the card's features
    this._showNothing(!this._entity);
  }

  /**
   * Text that reads on a color, read where it is used. Until the browser
   * knows the color (a theme not applied yet), the feature draws again on
   * the next frame.
   */
  protected _textOn(cssValue: string): string | undefined {
    const on = textOn(this, cssValue);
    if (!on && !this._retry) {
      this._retry = true;
      requestAnimationFrame(() => {
        this._retry = false;
        this.requestUpdate();
      });
    }
    return on ?? undefined;
  }

  /**
   * A feature with nothing to show shows nothing at all: neither itself nor
   * its place among the card's features. (From the Prusa Connect card.)
   */
  private _showNothing(empty: boolean): void {
    const display = empty ? "none" : "";
    if (this.style.display !== display) this.style.display = display;
    const host = (this.getRootNode() as ShadowRoot)?.host as HTMLElement | undefined;
    if (host?.localName === "hui-card-feature" && host.style.display !== display) host.style.display = display;
  }
}
