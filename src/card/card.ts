// custom:svs-subwoofer-card is Home Assistant's tile card, wrapped: the tile
// card still draws the name, state, actions and features, so every tile
// card option works the same way. The card adds:
// - a driver in place of the icon: its size follows the volume, its ring
//   takes the preset's color, and it shakes when the volume or preset changes;
// - a Bluetooth badge, and a tap on the driver that connects or disconnects;
// - a standby mode badge;
// - the preset, standby mode and volume as attributes for State content;
// - an optional cabinet finish behind the card, with a features style.
import { html, LitElement, nothing, svg, type TemplateResult } from "lit";
import { classMap } from "lit/directives/class-map.js";
import { EDITOR_TYPE, PRESETS_TYPE, VOLUME_TYPE } from "../const";
import { adopt, sheetOf, StatesProvider, type Config, type HassEntity, type HomeAssistant } from "../ha";
import { resolveColor } from "../subwoofer/colors";
import { connectionOf, connectionTargets } from "../subwoofer/connection";
import { isChoice, membersMixed, sibling, standbyLabel, subwooferAttributes } from "../subwoofer/device";
import { BT_OFF, BT_ON, DRIVER_RING, driverPicture, RING_PLAIN, RING_PRESET, shake, sizeDriver } from "../subwoofer/driver";
import { BEZEL, FLAT, finishTone, paint, patternOf } from "../subwoofer/finishes";
import { presetLook } from "../subwoofer/presets";
import { levelOf, sliderRange, thresholdColor, thresholdsOf } from "../subwoofer/volume";
import type { VolumeInput } from "../features/volume";
import { expanderOf, featureAreas, paintExpander, styleControls, type Area } from "./layout";
import { cardStub, checkCard, innerTileConfig } from "./options";
import { cardStyles, TILE_SHEET } from "./styles";

type Tile = HTMLElement & {
  setConfig(config: Config): void; hass?: HomeAssistant; preview?: boolean; layout?: string;
  updateComplete?: Promise<unknown>; getCardSize?(): number; getGridOptions?(): Config;
};

// How far a features style's patch or channel reaches around each control (px)
const CHANNEL_PAD: Record<string, number> = { flat: 2, console: 3 };

let tileSheet: CSSStyleSheet | undefined;

/** Home Assistant's states with one state object in place of the entity's, without copying the others (from the Prusa Connect card). */
function statesWith(states: Record<string, HassEntity>, entityId: string, stateObj: HassEntity): Record<string, HassEntity> {
  return new Proxy(states, {
    get: (target, key, receiver) => (key === entityId ? stateObj : Reflect.get(target, key, receiver)),
    getOwnPropertyDescriptor: (target, key) => {
      const descriptor = Reflect.getOwnPropertyDescriptor(target, key);
      return key === entityId && descriptor ? { ...descriptor, value: stateObj } : descriptor;
    },
  });
}

export class SvsSubwooferCard extends LitElement {
  static override styles = cardStyles;

  /** Set by the panel card: the panel draws the finish, and the card is see-through, without hover. */
  embedded = false;
  /** Set by the panel card on its group's card: the member subwoofers, whose connections and states it shows together. */
  memberEntities: string[] = [];

  private _config?: Config;
  private _hass?: HomeAssistant;
  private _tile?: Tile;
  private _preview?: boolean;
  private _layoutValue?: string;
  private _statesProvider = new StatesProvider(this);
  private _resize = new ResizeObserver(() => this._layout());
  // The tile card's hass (see _innerHass)
  private _inner?: HomeAssistant;
  private _innerState?: HassEntity;
  private _innerFor?: HassEntity;
  private _outerHass?: HomeAssistant;
  private _sourceState?: HassEntity;
  private _innerKey?: string;
  // While the volume slider moves: whether it does, the threshold color it is in, and when it stopped
  private _sliding = false;
  private _dragColor?: string;
  private _slideEnded = 0;
  private _shaking?: Animation;
  private _observed = new WeakSet<Node>();
  private _mutations?: MutationObserver;
  private _areasTimer?: ReturnType<typeof setTimeout>;
  private _areasKey?: string;
  private _settling = false;
  private _settleUntil = 0;
  private _driverRetry = false;
  private _followed?: HTMLElement;
  private _expanderResize?: ResizeObserver;
  private _expanderSurface?: HTMLElement;

  static getConfigElement(): HTMLElement {
    return document.createElement(EDITOR_TYPE);
  }

  /** A new card: the group's volume, with presets and volume. */
  static getStubConfig(hass: HomeAssistant): Config {
    return cardStub(hass);
  }

  setConfig(config: Config): void {
    checkCard(config);
    this._config = { ...config, finish: config.finish ?? "none" };
    const tile = innerTileConfig(this._config);
    if (this._tile) {
      this._tile.setConfig(tile);
    } else if (customElements.get("hui-tile-card")) {
      this._createTile(tile);
    } else {
      // The tile card is loaded on demand; the card helpers load it
      window.loadCardHelpers?.().then(async (helpers) => {
        helpers.createCardElement({ type: "tile", entity: tile.entity });
        await customElements.whenDefined("hui-tile-card");
        if (!this._tile && this._config) this._createTile(innerTileConfig(this._config));
      });
    }
    this._areasKey = undefined;
    this._syncTile();
    this.requestUpdate();
  }

  private _createTile(config: Config): void {
    const tile = document.createElement("hui-tile-card") as Tile;
    tile.classList.add("tile");
    tile.setConfig(config);
    if (this._preview !== undefined) tile.preview = this._preview;
    if (this._layoutValue !== undefined) tile.layout = this._layoutValue;
    this._tile = tile;
    this._syncTile();
    // Its shadow root and own styles are in place after its first update
    Promise.resolve(tile.updateComplete).then(() => this._styleTile());
    this.requestUpdate();
  }

  set hass(hass: HomeAssistant) {
    const before = this._hass;
    this._hass = hass;
    if (!this._config) return;
    this._watchChanges(before, hass);
    this._syncTile();
    this.requestUpdate();
  }

  get hass(): HomeAssistant | undefined {
    return this._hass;
  }

  // Dashboard properties the tile card uses
  set preview(value: boolean) {
    this._preview = value;
    if (this._tile) this._tile.preview = value;
  }

  get preview(): boolean {
    return !!this._preview;
  }

  set layout(value: string) {
    this._layoutValue = value;
    if (this._tile) this._tile.layout = value;
  }

  get layout(): string | undefined {
    return this._layoutValue;
  }

  getCardSize(): number {
    return this._tile?.getCardSize?.() ?? 1 + (this._config?.features?.length ?? 0);
  }

  getGridOptions(): Config {
    return this._tile?.getGridOptions?.() ?? { columns: 6, rows: 1 + (this._config?.features?.length ?? 0), min_columns: 6, min_rows: 1 };
  }

  override connectedCallback(): void {
    super.connectedCallback();
    this._resize.observe(this);
    // The theme's colors are known only on the page: the ring takes its color now (K-13)
    this._syncTile();
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this._resize.disconnect();
    this._expanderResize?.disconnect();
    this._expanderResize = undefined;
    this._expanderSurface = undefined;
  }

  // ---------------------------------------------------------------------------
  // The subwoofer
  // ---------------------------------------------------------------------------

  private _role(role: "preset" | "standby" | "volume" | "connected"): string | undefined {
    const id = this._config?.entity;
    if (role === "volume" && this._hass?.entities?.[id]?.translation_key === "volume") return id;
    return sibling(this._hass, id, role);
  }

  private _feature(type: string): Config | undefined {
    return (this._config?.features ?? []).find((f: Config) => f?.type === `custom:${type}`);
  }

  private _mixed(role: "preset" | "standby" | "volume"): string[] | undefined {
    return this.memberEntities.length ? membersMixed(this._hass, this.memberEntities, role) : undefined;
  }

  /** The volume as a share of the card's volume slider's range (0 at the quietest, 1 at the loudest). */
  private _level(value?: number): number {
    const id = this._role("volume");
    const stateObj = id ? this._hass?.states[id] : undefined;
    // A group whose subwoofers' volumes differ: the loudest
    const members = this._mixed("volume")?.map(Number).filter(Number.isFinite);
    const own = Number(stateObj?.state);
    const v = value ?? (!Number.isFinite(own) && members?.length ? Math.max(...members) : own);
    if (!Number.isFinite(v)) return 0;
    return levelOf(v, sliderRange(this._feature(VOLUME_TYPE), stateObj?.attributes));
  }

  /**
   * The driver's ring: while the volume slider moves, the color of the
   * volume threshold it is in; otherwise the active preset's color; with no
   * preset (Manual), the threshold color of the volume; a neutral ring if
   * none apply. Undefined with Driver ring off.
   */
  private _ringColor(): string | undefined {
    if (this._config?.driver_ring === false) return undefined;
    if (this._dragColor) return this._resolve(this._dragColor);
    const preset = this._role("preset");
    const stateObj = preset ? this._hass?.states[preset] : undefined;
    if (isChoice(stateObj)) {
      const color = presetLook(this._feature(PRESETS_TYPE), stateObj.state).color;
      if (color) return this._resolve(color);
    }
    const thresholds = thresholdsOf(this._feature(VOLUME_TYPE));
    const volume = this._role("volume");
    const value = volume ? Number(this._hass?.states[volume]?.state) : NaN;
    const color = thresholds.length && Number.isFinite(value) ? thresholdColor(thresholds, value) : undefined;
    if (color) return this._resolve(color);
    return isChoice(stateObj) ? RING_PRESET : RING_PLAIN;
  }

  // A theme color as a value the picture can use (read on the page)
  private _resolve(color: string): string {
    return (this.isConnected && resolveColor(this, color)) || RING_PRESET;
  }

  /**
   * The Home Assistant object the tile card sees: the same, except that the
   * card's entity has the driver as its picture and the subwoofer's preset,
   * standby mode and volume as attributes. For a group in the panel card
   * whose subwoofers disagree, State content shows their presets, standby
   * modes and the range of their volumes, and the volume slider gets their
   * volumes. The changed state object is reused until any of it changes.
   */
  private _innerHass(hass: HomeAssistant): HomeAssistant {
    const entity: string = this._config!.entity;
    const stateObj = hass.states[entity];
    if (!stateObj) return hass;
    const extra: Record<string, unknown> = { ...subwooferAttributes(hass, entity), entity_picture: driverPicture(this._ringColor()) };
    let state = stateObj.state;
    if (this.memberEntities.length) {
      extra.svs_member_volumes = this.memberEntities;
      const preset = this._mixed("preset");
      if (preset && !extra.preset) extra.preset = preset.join(" / ");
      const standby = this._mixed("standby");
      if (standby && !extra.standby_mode) extra.standby_mode = standby.map(standbyLabel).join(" / ");
      const volumes = this._mixed("volume")?.map(Number).filter(Number.isFinite);
      // Home Assistant adds the unit (dB) when it shows the state
      if (volumes && volumes.length > 1 && !Number.isFinite(Number(state))) state = `${Math.min(...volumes)} to ${Math.max(...volumes)}`;
    }
    const key = JSON.stringify([extra, state]);
    if (this._sourceState !== stateObj || this._innerKey !== key) {
      this._sourceState = stateObj;
      this._innerKey = key;
      this._innerState = { ...stateObj, state, attributes: { ...stateObj.attributes, ...extra } };
    }
    if (this._outerHass === hass && this._innerFor === this._innerState && this._inner) return this._inner;
    this._outerHass = hass;
    this._innerFor = this._innerState;
    this._inner = { ...hass, states: statesWith(hass.states, entity, this._innerState!) };
    return this._inner;
  }

  /** The tile card's hass, and the same states for the parts that read them from the states context. */
  private _syncTile(): void {
    if (!this._tile || !this._hass || !this._config) return;
    const inner = this._innerHass(this._hass);
    this._statesProvider.states = inner.states;
    this._tile.hass = inner;
    this._sizeDriver();
  }

  // The driver picture inside the tile card's icon; undefined if the tile
  // card ever changes how it shows a picture (the card then does not move it)
  private get _driver(): HTMLElement | undefined {
    const icon = this._tile?.shadowRoot?.querySelector("ha-tile-icon");
    return (icon?.shadowRoot?.querySelector("img") ?? icon?.querySelector("img") ?? undefined) as HTMLElement | undefined;
  }

  // The driver's size follows the volume: small when quiet, filling the icon when loud
  private _sizeDriver(level = this._level()): void {
    const driver = this._driver;
    if (!driver) {
      // The tile card renders after this card; try again once it has
      if (this._tile && !this._driverRetry) {
        this._driverRetry = true;
        Promise.resolve(this._tile.updateComplete).then(() => {
          this._driverRetry = false;
          if (this._driver) this._sizeDriver();
        });
      }
      return;
    }
    // The badges follow the driver as it grows and shrinks
    if (this._followed !== driver) {
      this._followed = driver;
      driver.addEventListener("transitionend", () => this._placeBadges());
    }
    sizeDriver(driver, level);
    this._placeBadges();
  }

  // A preset or volume change from anywhere shakes the driver briefly, harder at a higher volume
  private _watchChanges(before: HomeAssistant | undefined, hass: HomeAssistant): void {
    if (!before) return;
    const changed = (id?: string) => !!id && before.states[id] !== undefined
      && before.states[id]?.state !== hass.states[id]?.state && hass.states[id]?.state !== "unavailable";
    // The slider shakes the driver itself; its own volume change arriving afterwards does not shake it again
    const fromSlider = this._sliding || Date.now() - this._slideEnded < 2500;
    if (changed(this._role("preset")) || (changed(this._role("volume")) && !fromSlider)) this._shake(this._level(), 650);
  }

  private _sliderMoved = (ev: CustomEvent<VolumeInput>): void => {
    const { active, level, color } = ev.detail;
    this._sliding = active;
    // The ring shows the threshold color while the slider moves
    const dragColor = active ? color : undefined;
    if (dragColor !== this._dragColor) {
      this._dragColor = dragColor;
      this._syncTile();
    }
    if (!active) this._slideEnded = Date.now();
    this._sizeDriver(level);
    this._shake(level, active ? undefined : 450);
  };

  /** Shake the driver; with no duration, until the slider stops. */
  private _shake(level: number, duration?: number): void {
    if (this._config?.vibration === false) return;
    const driver = this._driver;
    if (!driver) return;
    this._shaking?.cancel();
    this._shaking = shake(driver, level, duration);
  }

  /** The connection sensors the badge shows: the subwoofer's own, or for a group in the panel card, its member subwoofers'. */
  private get _sensors(): string[] {
    const own = this._role("connected");
    if (own) return [own];
    return this.memberEntities.map((id) => sibling(this._hass, id, "connected")).filter((id): id is string => !!id);
  }

  /**
   * A tap on the driver: when all the subwoofers the badge shows are
   * connected, press each one's Disconnect button; otherwise press Reconnect
   * on those that are not connected. A group outside the panel card has no
   * subwoofers to act on.
   */
  private _connection = (ev: CustomEvent): void => {
    if (ev.detail?.svs_subwoofer !== "connection") return;
    ev.stopPropagation();
    const hass = this._hass;
    if (!hass) return;
    const { action, ids } = connectionTargets(this._sensors.map((id) => ({ id, connected: hass.states[id]?.state === "on" })));
    const buttons = ids.map((id) => sibling(hass, id, action)).filter(Boolean);
    if (buttons.length) hass.callService("button", "press", { entity_id: buttons });
  };

  // ---------------------------------------------------------------------------
  // Drawing
  // ---------------------------------------------------------------------------

  private _bluetooth(): TemplateResult {
    const mode = this._config!.bluetooth ?? "show";
    const sensors = this._hass ? this._sensors : [];
    const status = connectionOf(sensors.map((id) => this._hass!.states[id]?.state === "on"));
    const shown = sensors.length > 0 && (mode === "show" || (mode === "disconnected" && !status.all));
    return html`<span class=${classMap({ badge: true, on: shown, connected: status.all, some: status.some })} role="img" data-key="bluetooth"
      title=${status.label} aria-label=${status.label}><svg viewBox="0 0 24 24" aria-hidden="true">${
        svg`<path fill="currentColor" d=${status.all || status.some ? BT_ON : BT_OFF}></path>`}</svg></span>`;
  }

  // The standby mode's first letter: A (Auto On), O (On), T (Trigger); M (Mixed) on a group whose member subwoofers' modes differ
  private _standby(): TemplateResult {
    const id = this._role("standby");
    const stateObj = id ? this._hass?.states[id] : undefined;
    const mixed = this._mixed("standby");
    const letter = !this._config!.standby_badge ? "" : mixed ? "M" : isChoice(stateObj) ? stateObj.state.trim()[0].toUpperCase() : "";
    const title = !letter ? "" : mixed ? `Standby mode: Mixed (${mixed.map(standbyLabel).join(", ")})` : `Standby mode: ${standbyLabel(stateObj?.state)}`;
    return html`<span class="standby-badge ${letter ? "on" : ""}" data-key="standby" title=${title} aria-hidden="true">${letter}</span>`;
  }

  protected override render(): TemplateResult | typeof nothing {
    const c = this._config;
    if (!c) return nothing;
    const tone = finishTone(c.finish);
    return html`<div class=${classMap({ frame: true, finished: !!tone, through: this._through, "light-finish": tone === "light" })}
      @svs-volume-input=${this._sliderMoved} @ll-custom=${this._connection}>
      <div class="clip"><canvas></canvas><div id="areas"></div></div>
      ${this._standby()}
      ${this._tile ?? nothing}
      ${this._bluetooth()}
    </div>`;
  }

  /** See-through: the panel or the expander card around it draws the finish. */
  private get _through(): boolean {
    return this.embedded || (!!finishTone(this._config?.finish) && this._config?.finish_extent === "container");
  }

  protected override updated(): void {
    this._layout();
  }

  private get _frame(): HTMLElement | null {
    return this.renderRoot?.querySelector(".frame") ?? null;
  }

  private _styleTile(): void {
    const root = this._tile?.shadowRoot;
    if (root && !adopt(root, (tileSheet ??= sheetOf(TILE_SHEET)))) console.warn("SVS Subwoofer card: could not style the tile card");
  }

  private _layout(): void {
    const c = this._config, frame = this._frame;
    if (!c || !frame) return;
    const tone = finishTone(c.finish);
    // The volume loupe's bezel is of the finish (the theme's card color without one)
    if (BEZEL[c.finish]) this.style.setProperty("--svs-bezel", BEZEL[c.finish]);
    else this.style.removeProperty("--svs-bezel");
    if (this._tile) {
      this._tile.classList.toggle("dark", tone === "dark");
      this._tile.classList.toggle("light", tone === "light");
      this._tile.classList.toggle("solid", !!tone && (c.features_style ?? "match") !== "match");
      this._tile.classList.toggle("embedded", this.embedded);
      this._styleTile();
    }
    this._placeBadges();
    if (!this.embedded) this._paintExpander();
    this._drawAreas();
    const canvas = frame.querySelector("canvas");
    if (!tone || this._through || !canvas) return;
    const w = frame.clientWidth, h = frame.clientHeight;
    if (w && h) paint(canvas, c.finish, patternOf(c), w, h);
  }

  /** With Finish extent Container, the header of an expander card draws the finish across it. */
  private _paintExpander(): void {
    const found = expanderOf(this);
    if (!found?.header) return;
    const c = this._config!;
    const on = !!finishTone(c.finish) && c.finish_extent === "container";
    const surface = paintExpander(found.expander, on ? c.finish : undefined, patternOf(c));
    if (surface && surface !== this._expanderSurface) {
      this._expanderSurface = surface;
      this._expanderResize?.disconnect();
      let timer: ReturnType<typeof setTimeout> | undefined;
      this._expanderResize = new ResizeObserver(() => {
        clearTimeout(timer);
        timer = setTimeout(() => this._paintExpander(), 150);
      });
      this._expanderResize.observe(surface);
    }
  }

  // Draw again when elements are added in the tile card (features render late)
  private _watchAdded = (root?: Node | null): void => {
    if (!root || this._observed.has(root)) return;
    this._observed.add(root);
    this._mutations ??= new MutationObserver(() => {
      clearTimeout(this._areasTimer);
      this._areasTimer = setTimeout(() => this._drawAreas(), 0);
    });
    this._mutations.observe(root, { childList: true, subtree: true });
  };

  /** The features style drawn: Match without a finish. */
  private get _featuresStyle(): string {
    return finishTone(this._config?.finish) ? this._config!.features_style ?? "match" : "match";
  }

  private _drawAreas(): void {
    const frame = this._frame, box = this.renderRoot?.querySelector<HTMLElement>("#areas");
    const root = this._tile?.shadowRoot;
    if (!frame || !box) return;
    const style = this._featuresStyle;
    styleControls(root, style === "console");
    if (style === "match" || !root) {
      box.replaceChildren();
      this._areasKey = undefined;
    } else {
      this._watchAdded(root);
      const pad = CHANNEL_PAD[style] ?? 0;
      const areas: Area[] = featureAreas(frame, root, this._watchAdded).map((b) => ({
        x: b.x - pad, y: b.y - pad, w: b.w + 2 * pad, h: b.h + 2 * pad, radius: Math.min(b.radius + pad, (b.h + 2 * pad) / 2),
      }));
      const key = style + JSON.stringify(areas.map((a) => [a.x, a.y, a.w, a.h, a.radius].map(Math.round)));
      if (key !== this._areasKey) {
        this._areasKey = key;
        box.style.setProperty("--flat", FLAT[this._config!.finish] ?? "transparent");
        box.replaceChildren(...areas.map((a) => {
          const el = document.createElement("div");
          el.className = `area ${style}`;
          Object.assign(el.style, { left: `${a.x}px`, top: `${a.y}px`, width: `${a.w}px`, height: `${a.h}px`, borderRadius: `${a.radius}px` });
          return el;
        }));
      }
    }
    // The tile card can move its features without changing size (fonts
    // loading, the editor preview opening): check again for about a second
    if (this._settling) return;
    this._settleUntil = performance.now() + 1200;
    this._settling = true;
    const check = () => {
      if (performance.now() > this._settleUntil || !this.isConnected) {
        this._settling = false;
        return;
      }
      this._drawAreas();
      setTimeout(check, 100);
    };
    setTimeout(check, 100);
  }

  /**
   * The badges sit on the driver's own edge (the driver grows and shrinks
   * with the volume): Bluetooth down and to the right, the standby mode down
   * and to the left, each about half over the driver.
   */
  private _placeBadges(): void {
    const frame = this._frame;
    const badges = [...(frame?.querySelectorAll<HTMLElement>(".badge.on, .standby-badge.on") ?? [])];
    if (!frame || !badges.length) return;
    const driver = this._driver;
    const target = driver ?? this._tile?.shadowRoot?.querySelector("ha-tile-icon");
    if (!target) return;
    const outer = frame.getBoundingClientRect(), box = target.getBoundingClientRect();
    if (!box.width) return;
    const scale = outer.width / frame.offsetWidth || 1;
    const r = (box.width / 2 / scale) * (driver ? DRIVER_RING : 1);
    const cx = (box.left - outer.left) / scale + box.width / 2 / scale;
    const cy = (box.top - outer.top) / scale + box.height / 2 / scale;
    const ring = r * 0.7071;
    for (const badge of badges) {
      badge.style.left = `${badge.classList.contains("standby-badge") ? cx - ring : cx + ring}px`;
      badge.style.top = `${cy + ring}px`;
    }
  }
}
