// PROTOTYPE: custom:svs-subwoofer-panel-card. The SVS Subwoofer card for a
// subwoofer group, with its member subwoofers below it, on one surface: the
// finish covers the whole panel, and a tap on the card shows or hides the
// member subwoofers. It stands in for an expander card holding an SVS
// Subwoofer card and one card per subwoofer.
import { html, LitElement, nothing, type TemplateResult } from "lit";
import { classMap } from "lit/directives/class-map.js";
import { CARD_TYPE, PANEL_EDITOR_TYPE } from "../const";
import type { Config, HomeAssistant } from "../ha";
import { defaultMemberNames } from "../subwoofer/device";
import { finishTone, paint, patternOf } from "../subwoofer/finishes";
import type { SvsSubwooferCard } from "./card";
import { checkPanel, headerConfig, memberConfig, membersOf, panelStub } from "./options";
import { panelStyles } from "./styles";

export class SvsSubwooferPanelCard extends LitElement {
  static override styles = panelStyles;

  private _config?: Config;
  private _hass?: HomeAssistant;
  private _open = true;
  private _header?: SvsSubwooferCard;
  private _members: SvsSubwooferCard[] = [];
  // The member subwoofers' settings the cards were made for
  private _built?: string;
  private _resize = new ResizeObserver(() => this._paint());

  static getConfigElement(): HTMLElement {
    return document.createElement(PANEL_EDITOR_TYPE);
  }

  /** A new panel: the group, with every subwoofer below it, alphabetical by name. */
  static getStubConfig(hass: HomeAssistant): Config {
    return panelStub(hass);
  }

  setConfig(config: Config): void {
    checkPanel(config);
    this._config = config;
    // The header: the SVS Subwoofer card, which shows its member subwoofers' connections and states together
    this._header ??= document.createElement(CARD_TYPE) as SvsSubwooferCard;
    this._header.embedded = true;
    this._header.memberEntities = membersOf(config).map((m) => m.entity);
    this._header.setConfig(headerConfig(config));
    if (this._hass) this._header.hass = this._hass;
    this._open = config.members_toggle === false ? true : this._storedOpen() ?? config.members_open !== false;
    this._built = undefined;
    this._buildMembers();
    this.requestUpdate();
  }

  set hass(hass: HomeAssistant) {
    this._hass = hass;
    if (this._header) this._header.hass = hass;
    if (this._built === undefined) this._buildMembers();
    for (const card of this._members) card.hass = hass;
  }

  get hass(): HomeAssistant | undefined {
    return this._hass;
  }

  getCardSize(): number {
    return 1 + (this._config?.features?.length ?? 0) + (this._open ? membersOf(this._config).length : 0);
  }

  getGridOptions(): Config {
    return { columns: 12, min_columns: 6 };
  }

  override connectedCallback(): void {
    super.connectedCallback();
    this._resize.observe(this);
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this._resize.disconnect();
  }

  // Each member subwoofer is an SVS Subwoofer card, with the panel's finish, features style and badges
  private _buildMembers(): void {
    if (!this._config || !this._hass) return;
    const members = membersOf(this._config);
    const names = defaultMemberNames(this._hass, members.map((m) => m.entity));
    this._built = JSON.stringify(members);
    this._members = members.map((member) => {
      const card = document.createElement(CARD_TYPE) as SvsSubwooferCard;
      card.embedded = true;
      card.setConfig(memberConfig(this._config!, member, names[member.entity]));
      card.hass = this._hass!;
      return card;
    });
    this.requestUpdate();
  }

  // Whether the member subwoofers are shown is remembered in this browser, per panel
  private get _storageKey(): string {
    return `svs-subwoofer-panel:${this._config?.entity}`;
  }

  private _storedOpen(): boolean | undefined {
    try {
      const v = window.localStorage.getItem(this._storageKey);
      return v === null ? undefined : v === "1";
    } catch {
      return undefined;
    }
  }

  private _toggle = (ev: CustomEvent): void => {
    if (ev.detail?.svs_subwoofer_panel !== "toggle") return;
    ev.stopPropagation();
    this._open = !this._open;
    try {
      window.localStorage.setItem(this._storageKey, this._open ? "1" : "0");
    } catch {
      // Storage can be unavailable (private windows); the panel still works
    }
    this.requestUpdate();
  };

  protected override render(): TemplateResult | typeof nothing {
    if (!this._config) return nothing;
    const tone = finishTone(this._config.finish);
    return html`<div class=${classMap({ panel: true, open: this._open, finished: !!tone, dark: tone === "dark", light: tone === "light" })}
      @ll-custom=${this._toggle}>
      <div class="clip"><canvas></canvas></div>
      <div class="header">${this._header ?? nothing}</div>
      <div class="members">${this._members}</div>
    </div>`;
  }

  protected override updated(): void {
    this._paint();
  }

  private _paint(): void {
    const panel = this.renderRoot?.querySelector<HTMLElement>(".panel");
    const canvas = panel?.querySelector("canvas");
    const finish = this._config?.finish;
    if (!panel || !canvas || !finishTone(finish)) return;
    const w = panel.clientWidth, h = panel.clientHeight;
    if (w && h) paint(canvas, finish!, patternOf(this._config), w, h);
  }
}
