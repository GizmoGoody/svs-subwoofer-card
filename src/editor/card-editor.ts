// The card's editor: the tile card's own editor (without the options the
// card sets itself), then the SVS Subwoofer section with the card's own options.
import { css, html, LitElement, nothing, type TemplateResult } from "lit";
import { styleMap } from "lit/directives/style-map.js";
import { BLUETOOTH, FEATURES_STYLES, FINISH_EXTENTS, FINISHES, RANDOMIZE_LABEL } from "../const";
import { fire, same, select, StatesProvider, type Config, type HomeAssistant } from "../ha";
import { svsVolumes, withSubwooferAttributes } from "../subwoofer/device";
import { explicit, OWN_KEYS, tileConfig } from "../card/options";
import { createTileEditor, type TileEditor } from "./tile-editor";

const label = (s: Config) => s.label ?? s.name;
const helper = (s: Config) => s.helper;

export const editorStyles = css`
  #tile { display: block; }
  ha-expansion-panel {
    display: block; margin-top: 24px;
    --expansion-panel-content-padding: 0;
    border-radius: var(--ha-border-radius-md, 8px);
    --ha-card-border-radius: var(--ha-border-radius-md, 8px);
  }
  ha-expansion-panel > [slot="header"] { margin: 0; font-size: inherit; font-weight: inherit; }
  .content { padding: 12px; display: grid; gap: 16px; }
  .row { display: flex; align-items: center; gap: 12px; }
`;

const FINISH_SCHEMA = [{ name: "finish", label: "Finish", selector: select(FINISHES) }];

/** The card's own options, as the form shows them: Finish extent and Features style only with a finish. */
function optionsSchema(finish: string): Config[] {
  return [
    ...(finish === "none" ? [] : [{
      name: "finish_extent", label: "Finish extent",
      helper: "Normally set to Card. Set to Container when the SVS Subwoofer card is contained in another card (e.g. Expander card) to extend the selected Finish to that card.",
      selector: select(FINISH_EXTENTS),
    }, {
      name: "features_style", label: "Features style",
      helper: "Match style: the finish shows through the feature controls. Flat: similar to match but without grain or reflections. Console: 3D machine appearance.",
      selector: select(FEATURES_STYLES),
    }]),
    {
      name: "bluetooth", label: "Bluetooth badge",
      helper: "A tap on the driver connects or disconnects, unless Icon tap behavior (under Interactions) is set to something else. On a group subwoofer in the panel card, the badge and the tap cover its member subwoofers.",
      selector: select(BLUETOOTH),
    },
    { name: "driver_ring", label: "Driver ring", helper: "In the active preset's color, or the volume threshold's color.", selector: { boolean: {} } },
    {
      name: "standby_badge", label: "Standby mode badge",
      helper: "A letter on the driver for the standby mode: A (Auto), O (On) or T (Trigger).", selector: { boolean: {} },
    },
    {
      name: "vibration", label: "Shake when the volume or preset changes",
      helper: "The driver shakes harder at a higher volume. It stays still for anyone who has reduced motion turned on.", selector: { boolean: {} },
    },
  ];
}

const optionsData = (c: Config): Config => ({
  finish_extent: c.finish_extent ?? "card", features_style: c.features_style ?? "match", vibration: c.vibration !== false,
  bluetooth: c.bluetooth ?? "show", standby_badge: !!c.standby_badge, driver_ring: c.driver_ring !== false,
});

export class SvsSubwooferCardEditor extends LitElement {
  static override styles = editorStyles;

  /**
   * In the panel editor the card's editor is split in two: "style" shows
   * only the SVS options (without their own heading), "tile" only the tile
   * card's options. Unset, both show.
   */
  svsPart?: "style" | "tile";

  private _hass?: HomeAssistant;
  private _config?: Config;
  private _lovelace?: unknown;
  private _entityHelper?: string;
  private _tileEditor?: TileEditor;
  private _loading?: Promise<void>;
  private _statesProvider = new StatesProvider(this);

  set hass(hass: HomeAssistant) {
    this._hass = hass;
    this._setTileEditorHass();
    this.requestUpdate();
  }

  get hass(): HomeAssistant | undefined {
    return this._hass;
  }

  set lovelace(lovelace: unknown) {
    this._lovelace = lovelace;
    if (this._tileEditor) this._tileEditor.lovelace = lovelace;
  }

  get lovelace(): unknown {
    return this._lovelace;
  }

  /** A helper under the entity picker of the tile card's options. */
  set entityHelper(text: string | undefined) {
    this._entityHelper = text;
    if (this._tileEditor) this._tileEditor.svsEntityHelper = text;
  }

  get entityHelper(): string | undefined {
    return this._entityHelper;
  }

  setConfig(config: Config): void {
    this._config = explicit(config);
    this._setTileEditorConfig();
    this.requestUpdate();
    if (!same(this._config, config)) this._fire();
  }

  /** The tile editor's hass, and the states its State content picker reads, with the subwoofer attributes. */
  private _setTileEditorHass(): void {
    if (!this._hass || !this._tileEditor) return;
    const hass = withSubwooferAttributes(this._hass, this._config?.entity);
    this._statesProvider.states = hass.states;
    this._tileEditor.hass = hass;
  }

  private async _setTileEditorConfig(): Promise<void> {
    if (this.svsPart === "style" || !this._config) return;
    this._loading ??= (async () => {
      const editor = await createTileEditor(this._config!.entity);
      editor.addEventListener("config-changed", (ev) => {
        // The tile card's options changed: keep the card's own and pass the whole card on
        ev.stopPropagation();
        const c = this._config!;
        const own = Object.fromEntries(OWN_KEYS.filter((k) => k in c).map((k) => [k, c[k]]));
        const next: Config = { ...(ev as CustomEvent).detail.config, ...own, type: c.type };
        // Always on: the driver is shown there
        delete next.show_entity_picture;
        this._config = next;
        this._fire();
      });
      editor.svsEntities = svsVolumes(this._hass);
      editor.svsEntityHelper = this._entityHelper;
      if (this._lovelace) editor.lovelace = this._lovelace;
      this._tileEditor = editor;
      this._setTileEditorHass();
      this.requestUpdate();
    })();
    await this._loading;
    this._setTileEditorHass();
    this._tileEditor!.setConfig(tileConfig(this._config));
  }

  protected override render(): TemplateResult | typeof nothing {
    const tile = this.svsPart === "style" ? nothing : this._tileEditor ?? html`<div id="tile"></div>`;
    if (this.svsPart === "tile") return html`${tile}`;
    if (this.svsPart === "style") return this._content();
    return html`${tile}<ha-expansion-panel outlined expanded>
      <div slot="header" role="heading" aria-level="3">SVS Subwoofer</div>${this._content()}</ha-expansion-panel>`;
  }

  private _content(): TemplateResult | typeof nothing {
    const c = this._config;
    if (!c) return nothing;
    const randomize = RANDOMIZE_LABEL[c.finish];
    return html`<div class="content">
      <ha-form .hass=${this._hass} .schema=${FINISH_SCHEMA} .data=${{ finish: c.finish }} .computeLabel=${label}
        .computeHelper=${helper} @value-changed=${this._changed}></ha-form>
      <div class="row" style=${styleMap({ display: randomize ? undefined : "none" })}>
        <ha-button @click=${this._randomize}>${randomize ?? ""}</ha-button>
      </div>
      <ha-form .hass=${this._hass} .schema=${optionsSchema(c.finish)} .data=${optionsData(c)} .computeLabel=${label}
        .computeHelper=${helper} @value-changed=${this._changed}></ha-form>
    </div>`;
  }

  // Either form changed: both forms' values make the card's options
  private _changed = (ev: CustomEvent): void => {
    ev.stopPropagation();
    const c = this._config!;
    const v = { finish: c.finish, ...optionsData(c), ...ev.detail.value };
    this._update({
      finish: v.finish ?? "none", finish_extent: v.finish_extent ?? "card", features_style: v.features_style ?? "match",
      vibration: v.vibration !== false, bluetooth: v.bluetooth ?? "show", standby_badge: !!v.standby_badge, driver_ring: v.driver_ring !== false,
    });
  };

  private _randomize = (): void => {
    this._update({ pattern: 1 + Math.floor(Math.random() * 99999) });
  };

  private _update(changes: Config): void {
    this._config = explicit({ ...this._config, ...changes });
    this.requestUpdate();
    this._fire();
  }

  private _fire(): void {
    fire(this, "config-changed", { config: this._config });
  }
}
