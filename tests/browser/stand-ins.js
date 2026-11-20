/**
 * Stand-ins for the Home Assistant frontend parts the SVS Subwoofer card uses,
 * for testing the card in a plain browser page.
 *
 * They use Home Assistant's element names and structure. The hass object
 * holds the subwoofers as the svs_subwoofer integration (v1.10.1) registers
 * them: Subwoofer Left and Subwoofer Right, each with its volume, preset,
 * standby mode, connection sensor and Reconnect and Disconnect buttons, and
 * the group Subwoofer Both (device identifier group_<entry id>) with a
 * volume, preset and standby mode of its own. The devices are listed out of
 * name order, so a list sorted by name shows it.
 */

// What the card prints to the console when it loads (its badge)
window.consoleLines = [];
for (const name of ["info", "log", "groupCollapsed", "group"]) {
  const original = console[name].bind(console);
  console[name] = (...args) => {
    window.consoleLines.push(args.map(String).join(" "));
    original(...args);
  };
}

// The headless browser the tests run in draws no frames, so its
// ResizeObserver never reports. This one reports each observed element's
// new size on a timer, as the browser does after a frame.
window.ResizeObserver = class {
  constructor(callback) {
    this._callback = callback;
    this._sizes = new Map();
  }

  observe(el) {
    this._sizes.set(el, undefined);
    this._timer ??= setInterval(() => {
      const entries = [];
      for (const [target, size] of this._sizes) {
        const now = `${target.clientWidth}x${target.clientHeight}`;
        if (now !== size) {
          this._sizes.set(target, now);
          entries.push({ target, contentRect: target.getBoundingClientRect() });
        }
      }
      if (entries.length) this._callback(entries, this);
    }, 10);
  }

  unobserve(el) {
    this._sizes.delete(el);
  }

  disconnect() {
    this._sizes.clear();
    clearInterval(this._timer);
    this._timer = undefined;
  }
};

// It runs no animation frames either: these come on a timer, as a browser
// drawing at 60 frames a second gives them
window.requestAnimationFrame = (callback) => setTimeout(() => callback(performance.now()), 16);
window.cancelAnimationFrame = (id) => clearTimeout(id);

// Reduced motion, as the person's system sets it (a page sets window.reduceMotion)
const matchMedia = window.matchMedia.bind(window);
window.matchMedia = (query) => (/prefers-reduced-motion/.test(query) ? { matches: !!window.reduceMotion, media: query, addEventListener() {}, removeEventListener() {} } : matchMedia(query));

// The integration's options: preset slots named on the subwoofer, plus
// Default (slot 4) and Manual; standby modes as the integration names them
const PRESETS = ["LOW", "MEDIUM", "HIGH", "Default", "Manual"];
const STANDBY = ["Auto ON", "Trigger", "ON"];
const VOLUME = { min: -60, max: 0, step: 1, mode: "slider", unit_of_measurement: "dB" };

/** A subwoofer's or group's entities: [entity_id, translation_key, state, attributes]. */
function subwoofer(id, { volume, preset, standby, connected }) {
  const list = [
    [`number.${id}_volume`, "volume", volume, VOLUME],
    [`select.${id}_preset`, "preset", preset, { options: PRESETS }],
    [`select.${id}_standby_mode`, "standby_mode", standby, { options: STANDBY }],
  ];
  if (connected !== undefined) {
    list.push(
      [`binary_sensor.${id}_connected`, "connected", connected, { device_class: "connectivity" }],
      [`button.${id}_reconnect`, "reconnect", "unknown"],
      [`button.${id}_disconnect`, "disconnect", "unknown"],
    );
  }
  return list;
}

const DEVICES = {
  dev_right: {
    name: "Subwoofer Right", identifiers: [["svs_subwoofer", "54:B7:E5:82:D1:E3"]],
    entities: subwoofer("subwoofer_right", { volume: "-12", preset: "MEDIUM", standby: "Auto ON", connected: "on" }),
  },
  dev_both: {
    name: "Subwoofer Both", identifiers: [["svs_subwoofer", "group_01JBOTH"]],
    entities: subwoofer("subwoofer_both", { volume: "-12", preset: "MEDIUM", standby: "Auto ON" }),
  },
  dev_left: {
    name: "Subwoofer Left", identifiers: [["svs_subwoofer", "54:B7:E5:82:D1:E2"]],
    entities: subwoofer("subwoofer_left", { volume: "-12", preset: "MEDIUM", standby: "Auto ON", connected: "on" }),
  },
};

window.LEFT = "number.subwoofer_left_volume";
window.RIGHT = "number.subwoofer_right_volume";
window.BOTH = "number.subwoofer_both_volume";

/**
 * Home Assistant's hass object, with changes: { entity_id: state } or
 * { entity_id: { state, attributes } }. calls lists the actions performed.
 */
window.makeHass = (changes = {}) => {
  const hass = {
    states: {},
    entities: {},
    devices: Object.fromEntries(Object.entries(DEVICES).map(([id, d]) => [id, { id, name: d.name, name_by_user: null, identifiers: d.identifiers }])),
    themes: { darkMode: true },
    calls: [],
    formatEntityState(stateObj, state = stateObj.state) {
      const unit = stateObj.attributes.unit_of_measurement;
      return unit ? `${state} ${unit}` : state;
    },
    callWS(message) {
      return Promise.reject(new Error(`callWS stand-in: ${JSON.stringify(message)}`));
    },
    callService(domain, service, data, target) {
      hass.calls.push({ domain, service, data: { ...(data ?? {}), ...(target ?? {}) } });
      return Promise.resolve();
    },
  };
  for (const [device, { entities }] of Object.entries(DEVICES)) {
    for (const [entity_id, translation_key, state, attributes = {}] of entities) {
      hass.entities[entity_id] = { entity_id, device_id: device, platform: "svs_subwoofer", translation_key };
      hass.states[entity_id] = { entity_id, state, attributes: { friendly_name: entity_id, ...attributes } };
    }
  }
  // An entity of another integration, of the same kind
  hass.entities["number.kitchen_volume"] = { entity_id: "number.kitchen_volume", device_id: "dev_kitchen", platform: "sonos", translation_key: "volume" };
  hass.states["number.kitchen_volume"] = { entity_id: "number.kitchen_volume", state: "-20", attributes: VOLUME };
  for (const [entityId, change] of Object.entries(changes)) {
    const next = typeof change === "string" ? { state: change } : change;
    hass.states[entityId] = { ...hass.states[entityId], ...next, attributes: { ...hass.states[entityId].attributes, ...(next.attributes ?? {}) } };
  }
  return hass;
};

/** The same hass with some states changed (a new object, as Home Assistant sends). */
window.changed = (hass, changes) => {
  const next = { ...hass, states: { ...hass.states } };
  for (const [entityId, change] of Object.entries(changes)) {
    const value = typeof change === "string" ? { state: change } : change;
    next.states[entityId] = { ...hass.states[entityId], ...value, attributes: { ...hass.states[entityId].attributes, ...(value.attributes ?? {}) } };
  }
  return next;
};

// Home Assistant's named theme colors, and the card variables a theme sets
document.documentElement.style.cssText = [
  "--primary-color: #03a9f4", "--red-color: #f44336", "--green-color: #4caf50", "--yellow-color: #ffeb3b",
  "--amber-color: #ffc107", "--blue-color: #2196f3", "--orange-color: #ff9800", "--purple-color: #926bc7",
  "--warning-color: #ffa600", "--primary-text-color: #e1e1e1", "--secondary-text-color: #9b9b9b",
  "--card-background-color: #1c1c1c", "--ha-card-border-radius: 12px",
].join(";");

// ha-icon: shows its icon name
customElements.define("ha-icon", class extends HTMLElement {
  connectedCallback() {
    Object.assign(this.style, { display: "inline-block", width: "22px", height: "22px" });
  }
});

// ha-tile-icon: Home Assistant's tile icon, with the entity's picture (an
// img that stays while its picture changes, as Lit keeps it). Interactive,
// a tap sends an action event, as Home Assistant's action handler does
customElements.define("ha-tile-icon", class extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" }).innerHTML = `<style>
      :host { display: block; width: 36px; height: 36px; border-radius: 50%; }
      img { width: 36px; height: 36px; display: block; border-radius: 50%; }
    </style><slot></slot>`;
    this.addEventListener("click", (ev) => {
      ev.stopPropagation();
      this.dispatchEvent(new CustomEvent("action", { bubbles: true, composed: true, detail: { action: "tap", icon: true } }));
    });
  }

  set imageUrl(url) {
    let img = this.shadowRoot.querySelector("img");
    if (!url) {
      img?.remove();
      return;
    }
    if (!img) {
      img = document.createElement("img");
      this.shadowRoot.append(img);
    }
    if (img.getAttribute("src") !== url) img.src = url;
  }
});

// ha-control-switch: Home Assistant's toggle
customElements.define("ha-control-switch", class extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" }).innerHTML = `<style>
      :host { display: block; height: var(--feature-height, 42px); }
      .switch { position: relative; height: 100%; box-sizing: border-box; border-radius: var(--feature-border-radius, 12px); padding: var(--control-switch-padding, 4px); }
      .switch .background { position: absolute; inset: 0; border-radius: inherit; background: #888; opacity: .2; }
      .switch .button { width: 50%; height: 100%; border-radius: 8px; background: #888; }
    </style><div class="switch"><div class="background"></div><div class="button"><ha-svg-icon></ha-svg-icon></div></div>`;
  }
});

// hui-card-feature: one feature, with Home Assistant's properties (feature,
// context, hass). The feature's element is made from its type, as Home
// Assistant does, and given hass, the context and its configuration
customElements.define("hui-card-feature", class extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
  }

  set setup({ config, hass, entityId }) {
    this.feature = config;
    this.context = { entity_id: entityId };
    this.hass = hass;
  }

  set hass(hass) {
    this._hass = hass;
    if (this.element) this.element.hass = hass;
    this._render();
  }

  _render() {
    if (this.element || !this.feature || !this.context || !this._hass) return;
    if (this.feature.type === "toggle") {
      this.shadowRoot.innerHTML = "<ha-control-switch></ha-control-switch>";
      this.element = this.shadowRoot.firstElementChild;
      return;
    }
    const type = this.feature.type;
    const element = document.createElement(type.startsWith("custom:") ? type.slice(7) : `hui-${type}-card-feature`);
    element.setConfig?.(this.feature);
    element.hass = this._hass;
    element.context = this.context;
    this.element = element;
    this.shadowRoot.replaceChildren(element);
  }
});

// hui-card-features: a group of features, with Home Assistant's styles
customElements.define("hui-card-features", class extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" }).innerHTML = `<style>
      :host {
        --feature-height: 42px; --feature-border-radius: var(--ha-card-features-border-radius, 12px);
        --feature-button-spacing: 12px; --feature-color: var(--tile-color, var(--primary-color));
        position: relative; width: 100%; display: grid; grid-template-columns: minmax(0, 1fr);
        gap: var(--ha-card-feature-gap, 12px); box-sizing: border-box; align-content: space-evenly;
      }
      :host([columns="2"]) { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .wide { grid-column: 1 / -1; }
    </style>`;
  }

  set setup({ features, hass, entityId, columns }) {
    if (columns > 1) this.setAttribute("columns", String(columns));
    this.items = features.map((config, index) => {
      const item = document.createElement("hui-card-feature");
      item.classList.toggle("wide", index % columns === 0 && index === features.length - 1);
      item.setup = { config, hass, entityId };
      return item;
    });
    this.shadowRoot.append(...this.items);
  }

  set hass(hass) {
    for (const item of this.items ?? []) item.hass = hass;
  }
});

// ha-tile-container: Home Assistant's tile layout (the title row's content,
// the feature beside it, the features below). Its hover highlight is
// --ha-ripple-hover-opacity, as on Home Assistant's
customElements.define("ha-tile-container", class extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" }).innerHTML = `<style>
      :host { height: 100%; width: 100%; display: flex; flex-direction: column; justify-content: space-between; --ha-ripple-hover-opacity: .04; }
      .container { display: flex; flex-direction: column; flex: 1; }
      .row { display: flex; flex-direction: column; flex: 1; min-width: 0; }
      .container.inline .row { flex-direction: row; }
      .content { position: relative; display: flex; flex-direction: row; align-items: center; padding: 0 10px; min-height: 56px; flex: 1; min-width: 0; box-sizing: border-box; gap: 10px; }
      .vertical { flex-direction: column; text-align: center; justify-content: center; padding: 10px 8px; }
      ::slotted([slot="info"]) { position: relative; min-width: 0; flex: 1; }
      ::slotted([slot="features"]) { padding: 0 12px 12px 12px; }
      .container.inline ::slotted([slot="features-inline"]) { width: calc(50% - 12px); flex: none; padding: 0 12px; padding-inline-start: 0; --feature-height: 36px; }
    </style><div class="container"><div class="row"><div class="content"><slot name="icon"></slot><slot name="info"></slot></div><slot name="features-inline"></slot></div><slot name="features"></slot></div>`;
  }

  set layout({ featurePosition, vertical }) {
    this.shadowRoot.querySelector(".container").classList.toggle("inline", featurePosition === "inline");
    this.shadowRoot.querySelector(".content").classList.toggle("vertical", !!vertical);
  }
});

// Home Assistant's action handling (handle-action): a tap performs the
// card's tap action, a tap on the icon its icon tap action. fire-dom-event
// sends ll-custom from the card with the action's configuration
function performAction(card, hass, action) {
  window.actions.push(action);
  if (action.action === "fire-dom-event") {
    card.dispatchEvent(new CustomEvent("ll-custom", { bubbles: true, composed: true, detail: action }));
  } else if (action.action === "perform-action") {
    const [domain, service] = action.perform_action.split(".");
    hass.callService(domain, service, action.data, action.target);
  }
}
window.actions = [];

// hui-tile-card: the tile card, with the options the SVS Subwoofer card
// relies on, in Home Assistant's tile layout (ha-tile-container)
customElements.define("hui-tile-card", class extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this.updateComplete = Promise.resolve();
  }

  static async getConfigElement() {
    return document.createElement("hui-tile-card-editor");
  }

  setConfig(config) {
    this.config = config;
    this.built = false;
    this.render();
  }

  set hass(hass) {
    this._hass = hass;
    this.render();
  }

  get hass() {
    return this._hass;
  }

  render() {
    if (!this.config || !this._hass) return;
    const stateObj = this._hass.states[this.config.entity];
    if (!this.built) {
      this.built = true;
      this.shadowRoot.innerHTML = `<style>
        :host { display: block; height: 100%; }
        ha-card { display: block; height: 100%; box-sizing: border-box; position: relative;
          background: var(--ha-card-background, var(--card-background-color, #222));
          border: 1px solid var(--ha-card-border-color, #444); border-radius: var(--ha-card-border-radius, 12px); }
        ha-tile-icon { flex: none; }
        ha-tile-info { display: block; color: var(--primary-text-color, #fff); }
        .primary { font-size: 14px; line-height: 20px; font-weight: 500; }
        .secondary { font-size: 12px; line-height: 16px; color: var(--secondary-text-color); }
      </style><ha-card><ha-tile-container><ha-tile-icon slot="icon"></ha-tile-icon>
        <ha-tile-info slot="info"><div class="primary"></div><div class="secondary"></div></ha-tile-info></ha-tile-container></ha-card>`;
      this.shadowRoot.querySelector("ha-card").addEventListener("click", () => performAction(this, this._hass, this.config.tap_action ?? { action: "more-info" }));
      this.shadowRoot.querySelector("ha-tile-icon").addEventListener("action", (ev) => {
        ev.stopPropagation();
        performAction(this, this._hass, this.config.icon_tap_action ?? { action: "more-info" });
      });
      // Home Assistant's computeCardFeatureLayout: with "inline" the first beside the title, the rest below
      const features = this.config.features ?? [];
      const inline = this.config.features_position === "inline";
      const beside = inline ? features.slice(0, 1) : [];
      const below = inline ? features.slice(1) : features;
      const container = this.shadowRoot.querySelector("ha-tile-container");
      container.layout = { featurePosition: this.config.features_position, vertical: this.config.vertical };
      this.groups = [];
      for (const [list, slot] of [[beside, "features-inline"], [below, "features"]]) {
        if (!list.length) continue;
        const group = document.createElement("hui-card-features");
        group.slot = slot;
        group.setup = { features: list, hass: this._hass, entityId: this.config.entity, columns: slot === "features" && inline ? Math.min(list.length, 2) : 1 };
        container.append(group);
        this.groups.push(group);
      }
    }
    this.shadowRoot.querySelector("ha-tile-icon").imageUrl = this.config.show_entity_picture ? stateObj?.attributes.entity_picture : undefined;
    this.shadowRoot.querySelector(".primary").textContent = this.config.name ?? stateObj?.attributes.friendly_name ?? this.config.entity;
    // The state content: the state (with its unit) and the attributes chosen
    const content = [].concat(this.config.state_content ?? ["state"]);
    this.shadowRoot.querySelector(".secondary").textContent = !stateObj ? "" : content
      .map((name) => (name === "state" ? this._hass.formatEntityState(stateObj) : stateObj.attributes[name]))
      .filter((v) => v !== undefined && v !== "").join(" · ");
    for (const group of this.groups ?? []) group.hass = this._hass;
  }

  getCardSize() {
    return 1 + (this.config?.features?.length ?? 0);
  }

  getGridOptions() {
    const features = this.config?.features ?? [];
    return { columns: 6, rows: 1 + features.length, min_columns: 6, min_rows: 1 + features.length };
  }
});

// hui-tile-card-editor: the tile card's editor, with its form layout in
// _schema and its helpers in _computeHelperCallback, as Home Assistant's.
// It reads the states from the states context (as its State content picker
// does), sends config-changed as Home Assistant's, and exposes what it shows
// for the tests: fields (the names in its form), helperFor(name),
// contextStates and change(config) (an edit in its form).
customElements.define("hui-tile-card-editor", class extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" }).innerHTML = "<ha-form></ha-form>";
    this._schema = () => [
      { name: "entity", selector: { entity: {} } },
      {
        name: "content", type: "expandable", flatten: true, schema: [
          { name: "name", selector: { entity_name: {} } },
          { name: "", type: "grid", schema: [{ name: "icon", selector: { icon: {} } }, { name: "color", selector: { ui_color: {} } }, { name: "show_entity_picture", selector: { boolean: {} } }] },
          { name: "state_content", selector: { ui_state_content: {} } },
        ],
      },
      { name: "interactions", type: "expandable", flatten: true, schema: [{ name: "tap_action" }, { name: "icon_tap_action" }] },
      { name: "features_position", selector: { select: { options: ["bottom", "inline"] } } },
    ];
    this._computeHelperCallback = (schema) => (schema.name === "features_position" ? "Where the features go" : undefined);
  }

  connectedCallback() {
    // The State content picker asks for the states, as Home Assistant's does (Lit context)
    const request = new Event("context-request", { bubbles: true, composed: true });
    Object.assign(request, { context: "states", subscribe: true, callback: (states) => (this.contextStates = states) });
    this.shadowRoot.firstElementChild.dispatchEvent(request);
  }

  // Like Home Assistant's, it refuses options it does not know
  setConfig(config) {
    const known = ["type", "view_layout", "layout_options", "grid_options", "visibility", "entity", "name", "icon", "color",
      "show_entity_picture", "hide_state", "state_content", "vertical", "tap_action", "hold_action", "double_tap_action",
      "icon_tap_action", "icon_hold_action", "icon_double_tap_action", "features", "features_position"];
    const unknown = Object.keys(config).find((key) => !known.includes(key));
    if (unknown) throw new Error(`At path: ${unknown} -- Expected a value of type \`never\``);
    this.config = config;
  }

  /** The schema the editor shows. */
  get schema() {
    return this._schema();
  }

  /** The names of the fields it shows. */
  get fields() {
    const names = [];
    const walk = (list) => list.forEach((s) => (Array.isArray(s.schema) ? walk(s.schema) : names.push(s.name)));
    walk(this._schema());
    return names;
  }

  helperFor(name) {
    return this._computeHelperCallback({ name });
  }

  /** Opening a feature's settings (its edit button), as Home Assistant's editor does. */
  openFeature(index) {
    const config = this.config.features[index];
    this.dispatchEvent(new CustomEvent("edit-sub-element", {
      bubbles: true, composed: true,
      detail: { config, saveConfig: () => {}, context: { entity_id: this.config.entity }, type: "feature" },
    }));
    return config;
  }

  /** An edit in its form: the whole configuration, changed. */
  change(config) {
    this.config = config;
    this.dispatchEvent(new CustomEvent("config-changed", { bubbles: true, composed: true, detail: { config } }));
  }
});

// ha-form: holds what it is given; edit(value) is an edit in the form,
// which sends value-changed with the whole value, as Home Assistant's does
customElements.define("ha-form", class extends HTMLElement {
  edit(changes) {
    const value = { ...(this.data ?? {}), ...changes };
    this.dispatchEvent(new CustomEvent("value-changed", { bubbles: true, composed: true, detail: { value } }));
  }

  /** The names of the fields it shows. */
  get fields() {
    const names = [];
    const walk = (list) => (list ?? []).forEach((s) => (Array.isArray(s.schema) ? walk(s.schema) : names.push(s.name)));
    walk(this.schema);
    return names;
  }

  field(name) {
    let found;
    const walk = (list) => (list ?? []).forEach((s) => (Array.isArray(s.schema) ? walk(s.schema) : s.name === name && (found = s)));
    walk(this.schema);
    return found;
  }

  label(name) {
    const s = this.field(name);
    return s && (this.computeLabel ? this.computeLabel(s) : s.label ?? s.name);
  }

  helper(name) {
    const s = this.field(name);
    return s && (this.computeHelper ? this.computeHelper(s) : s.helper);
  }
});
customElements.define("ha-expansion-panel", class extends HTMLElement {});
customElements.define("ha-button", class extends HTMLElement {
  connectedCallback() {
    this.setAttribute("role", "button");
  }
});
customElements.define("ha-icon-button", class extends HTMLElement {
  connectedCallback() {
    this.setAttribute("role", "button");
  }

  set label(label) {
    this._label = label;
    this.setAttribute("aria-label", label);
  }

  get label() {
    return this._label;
  }

  set disabled(disabled) {
    this._disabled = disabled;
    this.toggleAttribute("disabled", !!disabled);
  }

  get disabled() {
    return !!this._disabled;
  }

  click() {
    if (!this._disabled) super.click();
  }
});

// expander-card (custom:expander-card): its card (ha-card) holds the header
// card in .title-card-container and the cards inside below it
customElements.define("expander-card", class extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" }).innerHTML = `<style>ha-card { display: block; background: #333; }</style>
      <ha-card><div class="title-card-container"></div><div class="children-container"></div></ha-card>`;
  }

  add(header, children) {
    this.shadowRoot.querySelector(".title-card-container").append(header);
    this.shadowRoot.querySelector(".children-container").append(...children);
  }
});

window.cardHelperCalls = [];
window.loadCardHelpers = async () => ({
  createCardElement: (config) => {
    window.cardHelperCalls.push(config);
    return document.createElement(config.type === "tile" ? "hui-tile-card" : "div");
  },
});
