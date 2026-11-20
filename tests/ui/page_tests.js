/**
 * Runs in Home Assistant's own page, with its real frontend components: the
 * SVS Subwoofer card, the panel prototype, their editors and features,
 * against the fake subwoofers. Each test acts the way the editor's form does
 * (the same events), and plays Home Assistant's part of handing every saved
 * configuration back to the editor, as the dashboard editor does.
 */
(() => {
  const hass = () => document.querySelector("home-assistant").hass;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  async function until(check, what, ms = 10000) {
    const end = Date.now() + ms;
    let last;
    while (Date.now() < end) {
      try {
        const value = await check();
        if (value) return value;
      } catch (err) {
        last = err;
      }
      await sleep(50);
    }
    throw new Error(`Timed out waiting for ${what}${last ? ` (${last})` : ""}`);
  }
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  function expectEqual(actual, expected, what) {
    if (!same(actual, expected)) throw new Error(`${what}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }

  function stage() {
    let el = document.getElementById("svs-stage");
    if (!el) {
      el = document.createElement("div");
      el.id = "svs-stage";
      Object.assign(el.style, {
        position: "absolute", left: "0", top: "0", width: "460px", padding: "16px", zIndex: "10000",
        display: "grid", gap: "12px", boxSizing: "border-box",
        background: "var(--primary-background-color)", color: "var(--primary-text-color)",
      });
      document.body.append(el);
    }
    return el;
  }

  // The dashboard's lovelace object, which the dashboard gives every editor
  function findDeep(root, selector, depth = 8) {
    const found = root.querySelector?.(selector);
    if (found || depth === 0) return found;
    for (const el of root.querySelectorAll?.("*") ?? []) {
      const hit = el.shadowRoot && findDeep(el.shadowRoot, selector, depth - 1);
      if (hit) return hit;
    }
    return null;
  }
  const lovelace = () => findDeep(document, "hui-root")?.lovelace;

  // An editor as the dashboard hosts it: hass and lovelace set, and every
  // saved configuration handed back to it (kept here for the test to check)
  function hosted(type, extra = {}) {
    const el = document.createElement(type);
    Object.assign(el, extra);
    el.hass = hass();
    if (lovelace()) el.lovelace = lovelace();
    const saved = [];
    el.addEventListener("config-changed", (ev) => {
      saved.push(ev.detail.config);
      el.setConfig(ev.detail.config);
    });
    stage().append(el);
    return { el, saved };
  }

  // The tile card's editor inside one of our editors, once it has rendered
  const tileEditorIn = (root, not) => until(() => [...(root.shadowRoot?.querySelectorAll("*") ?? [])].find(
    (e) => e !== not && e.tagName.toLowerCase().endsWith("tile-card-editor") && e.shadowRoot?.querySelector("ha-form")), "the tile card editor");
  const mainForm = (tileEditor) => tileEditor.shadowRoot.querySelector("ha-form");
  const setFormValue = (form, changes) => form.dispatchEvent(new CustomEvent("value-changed", { detail: { value: { ...form.data, ...changes } } }));
  const featuresEditor = (tileEditor) => tileEditor.shadowRoot.querySelector("hui-card-features-editor");
  const setFeatures = (tileEditor, features) => featuresEditor(tileEditor).dispatchEvent(
    new CustomEvent("features-changed", { detail: { features } }));

  const entities = () => Object.values(hass().entities).filter((e) => e.platform === "svs_subwoofer");
  // A subwoofer group is a device of its own, with identifier group_<entry id>
  const onGroup = (e) => (hass().devices[e.device_id]?.identifiers ?? [])
    .some(([domain, id]) => domain === "svs_subwoofer" && String(id).startsWith("group_"));
  const volumes = () => entities().filter((e) => e.translation_key === "volume");
  const subVolumes = () => volumes().filter((e) => !onGroup(e)).map((e) => e.entity_id).sort();
  const groupVolume = () => volumes().find(onGroup)?.entity_id;

  // The entity with this translation key on the same device as an entity
  const onDevice = (volume, key) => {
    const device = hass().entities[volume]?.device_id;
    return entities().find((e) => e.device_id === device && e.translation_key === key)?.entity_id;
  };

  // All text in a shadow tree, through every inner shadow tree
  const deepText = (root) => [...root.querySelectorAll("*")]
    .map((el) => (el.shadowRoot ? deepText(el.shadowRoot) : el.children.length ? "" : el.textContent))
    .join(" ").replace(/\s+/g, " ");

  // The states with the group's two subwoofers disagreeing: different
  // volumes, presets and standby modes, so the group reports unknown
  const mixedStates = () => {
    const states = { ...hass().states };
    const set = (id, state) => { if (id) states[id] = { ...states[id], state }; };
    const [first, second] = subVolumes();
    const group = groupVolume();
    set(group, "unknown");
    set(onDevice(group, "preset"), "unknown");
    set(onDevice(group, "standby_mode"), "unknown");
    set(first, "-20");
    set(second, "-12");
    set(onDevice(first, "preset"), "LOW");
    set(onDevice(second, "preset"), "HIGH");
    set(onDevice(first, "standby_mode"), "Auto ON");
    set(onDevice(second, "standby_mode"), "ON");
    for (const id of [first, second]) set(onDevice(id, "connected"), "on");
    return states;
  };

  // The panel card as deployed on the user's dashboard (the regression
  // baseline), for the given group and subwoofer volumes
  const deployedPanel = (group, left, right) => {
    const member = (entity, name) => ({
      entity, ...(name ? { name } : {}), state_content: ["state", "preset"], vertical: false,
      features: [
        {
          type: "custom:svs-subwoofer-presets", style: "presets_cycle",
          presets: { HIGH: { color: "red", icon: "mdi:volume-high" }, MEDIUM: { color: "yellow", icon: "mdi:volume-medium" }, LOW: { color: "green", icon: "mdi:volume-low" } },
          presets_shown: ["LOW", "MEDIUM", "HIGH"],
        },
        { type: "custom:svs-subwoofer-volume", min: -30, volume_thresholds: [{ below: -19.9999, color: "green" }, { below: -10, color: "yellow" }, { color: "red" }] },
        { type: "custom:svs-subwoofer-standby" },
      ],
      features_position: "inline",
    });
    return {
      type: "custom:svs-subwoofer-panel-card", entity: group, name: "Both", state_content: ["state", "preset"], vertical: false,
      features: [
        {
          type: "custom:svs-subwoofer-presets",
          presets: { LOW: { color: "green", icon: "mdi:volume-low" }, MEDIUM: { color: "yellow", icon: "mdi:volume-medium" }, HIGH: { color: "red", icon: "mdi:volume-high" } },
          presets_shown: ["LOW", "MEDIUM", "HIGH"],
        },
        { type: "custom:svs-subwoofer-volume", min: -30, volume_thresholds: [{ below: -19.999, color: "green" }, { below: -10, color: "yellow" }, { color: "red" }] },
      ],
      features_position: "inline", finish: "fabric", pattern: 47618, vibration: true, bluetooth: "show", standby_badge: true,
      driver_ring: true, finish_extent: "card", features_style: "console",
      members: [member(left, "Left"), member(right)], members_open: false, members_toggle: true,
    };
  };

  window.svsUiTests = async () => {
    const results = [];
    // Page errors (an element that throws while drawing) are recorded with
    // the test they happen in, and fail it
    let errors = [];
    const onError = (ev) => errors.push(String(ev.error?.stack ?? ev.error ?? ev.message ?? ev.reason?.stack ?? ev.reason));
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onError);
    // Errors Home Assistant's own editors raise when hosted outside the
    // dashboard's edit dialog (found by the control test): not ours
    let baseline = new Set();
    const firstLine = (e) => e.split("\n")[0];
    async function test(name, fn, { control = false } = {}) {
      errors = [];
      try {
        await fn();
        await sleep(200);
        if (control) {
          baseline = new Set(errors.map(firstLine));
          results.push({ name, ok: true, detail: errors.length ? `baseline errors: ${[...baseline].join("; ")}` : "" });
          stage().replaceChildren();
          return;
        }
        const ours = errors.filter((e) => !baseline.has(firstLine(e)));
        if (ours.length) throw new Error(`page errors:\n${ours.join("\n---\n")}`);
        results.push({ name, ok: true });
      } catch (err) {
        results.push({ name, ok: false, detail: String(err?.stack ?? err) });
      }
      stage().replaceChildren();
    }
    const [first, second] = subVolumes();

    // A control: Home Assistant's own tile card editor, hosted the same way.
    // If this one has page errors, the harness is missing something.
    await test("control: Home Assistant's tile card editor, hosted the same way", async () => {
      if (!lovelace()) throw new Error("no lovelace object found on the dashboard");
      const helpers = await window.loadCardHelpers();
      helpers.createCardElement({ type: "tile", entity: first });
      await customElements.whenDefined("hui-tile-card");
      const { el } = hosted((await customElements.get("hui-tile-card").getConfigElement()).tagName.toLowerCase());
      el.setConfig({ type: "tile", entity: first, state_content: ["state"] });
      await until(() => el.shadowRoot?.querySelector("ha-form"), "the tile card editor");
      await sleep(500);
    }, { control: true });

    await test("card shows the driver and the Bluetooth badge", async () => {
      const card = document.createElement("svs-subwoofer-card");
      card.setConfig({ type: "custom:svs-subwoofer-card", entity: first, features: [{ type: "custom:svs-subwoofer-volume" }] });
      card.hass = hass();
      stage().append(card);
      await until(() => card.shadowRoot.querySelector("hui-tile-card")?.shadowRoot?.querySelector("ha-tile-icon"), "the tile card");
      const img = await until(() => card.shadowRoot.querySelector("hui-tile-card").shadowRoot.querySelector("ha-tile-icon")
        .shadowRoot?.querySelector("img"), "the driver picture");
      if (!img.src.startsWith("data:image/svg")) throw new Error(`the icon is not the driver: ${img.src.slice(0, 40)}`);
      await until(() => card.shadowRoot.querySelector(".badge.on"), "the Bluetooth badge");
    });

    await test("deployed panel: the group above its two subwoofers, rows hidden until a tap", async () => {
      const group = groupVolume();
      if (!group) throw new Error("no subwoofer group volume found");
      if (!second) throw new Error("two subwoofers are needed");
      const config = deployedPanel(group, first, second);
      try { localStorage.removeItem(`svs-subwoofer-panel:${group}`); } catch (err) { /* no storage */ }
      const panel = document.createElement("svs-subwoofer-panel-card");
      panel.setConfig(config);
      panel.hass = hass();
      stage().append(panel);
      const root = panel.shadowRoot;
      const header = await until(() => root.querySelector(".header svs-subwoofer-card"), "the header card");
      await until(() => header.shadowRoot.querySelector("hui-tile-card")?.shadowRoot?.querySelector("ha-tile-icon"), "the header's tile card");
      await until(() => root.querySelector(".panel.finished"), "the fabric finish across the panel");
      if (root.querySelector(".panel.open")) throw new Error("the rows show at load (members_open is false)");
      // The header's badge shows the two subwoofers together
      const badge = await until(() => header.shadowRoot.querySelector(".badge.on"), "the header's Bluetooth badge");
      if (!/connected/i.test(badge.title)) throw new Error(`the badge says "${badge.title}"`);
      const rows = await until(() => {
        const cards = root.querySelectorAll(".members svs-subwoofer-card");
        return cards.length === 2 && cards;
      }, "the two rows");
      // A tap on the header card shows the rows
      header.shadowRoot.querySelector("hui-tile-card").dispatchEvent(new CustomEvent("ll-custom", {
        bubbles: true, composed: true, detail: { svs_subwoofer_panel: "toggle" },
      }));
      await until(() => root.querySelector(".panel.open"), "the rows to open after a tap");
      for (const row of rows) {
        await until(() => row.shadowRoot.querySelector("hui-tile-card")?.shadowRoot?.querySelector("ha-tile-icon"), "a row's tile card");
      }
      try { localStorage.removeItem(`svs-subwoofer-panel:${group}`); } catch (err) { /* no storage */ }
    });

    // What the "states" context gives an element (as Home Assistant's parts
    // that read it, such as the state content and its picker, ask for it)
    const contextStates = (el) => new Promise((resolve) => {
      const ev = new Event("context-request", { bubbles: true, composed: true });
      Object.assign(ev, { context: "states", subscribe: false, callback: (states) => resolve(states) });
      el.dispatchEvent(ev);
      setTimeout(() => resolve(undefined), 3000);
    });

    await test("state content: every card shows its preset, and the panel's cards do not highlight on hover", async () => {
      const group = groupVolume();
      if (!group || !second) throw new Error("a group of two subwoofers is needed");
      const states = { ...hass().states };
      for (const id of [group, first, second]) states[onDevice(id, "preset")] = { ...states[onDevice(id, "preset")], state: "MEDIUM" };
      const panel = document.createElement("svs-subwoofer-panel-card");
      panel.setConfig({ ...deployedPanel(group, first, second), members_open: true, members_toggle: false });
      panel.hass = { ...hass(), states };
      stage().append(panel);
      const cards = await until(() => {
        const all = [panel.shadowRoot.querySelector(".header svs-subwoofer-card"), ...panel.shadowRoot.querySelectorAll(".members svs-subwoofer-card")];
        return all.length === 3 && all.every((c) => c?.shadowRoot.querySelector("hui-tile-card")?.shadowRoot) && all;
      }, "the three cards");
      for (const card of cards) {
        const tile = card.shadowRoot.querySelector("hui-tile-card");
        const name = card._config?.name;
        await until(() => /MEDIUM/.test(deepText(tile.shadowRoot)), `${name}: the preset in the state content`)
          .catch(() => { throw new Error(`${name}'s state content says: ${deepText(tile.shadowRoot)}`); });
        const hover = getComputedStyle(tile).getPropertyValue("--ha-ripple-hover-opacity").trim();
        if (hover !== "0") throw new Error(`${name} highlights on hover (--ha-ripple-hover-opacity: ${hover || "unset"})`);
      }
    });

    await test("state content picker: the editors' states context has the subwoofer attributes", async () => {
      // The fake subwoofers have no active preset; an unknown one is left out
      const withPreset = { ...hass(), states: { ...hass().states, [onDevice(first, "preset")]: { ...hass().states[onDevice(first, "preset")], state: "MEDIUM" } } };
      const { el } = hosted("svs-subwoofer-card-editor");
      el.hass = withPreset;
      el.setConfig({ type: "custom:svs-subwoofer-card", entity: first });
      const tile = await tileEditorIn(el);
      const states = await contextStates(mainForm(tile));
      const attributes = Object.keys(states?.[first]?.attributes ?? {});
      for (const name of ["preset", "standby_mode"]) {
        if (!attributes.includes(name)) throw new Error(`the card editor's states context has no ${name}: ${attributes.join(", ")}`);
      }
      stage().replaceChildren();
      const panel = hosted("svs-subwoofer-panel-card-editor").el;
      panel.hass = withPreset;
      panel.setConfig({ type: "custom:svs-subwoofer-panel-card", entity: groupVolume() ?? first, members: [{ entity: first }] });
      const row = await tileEditorIn(panel);
      const rowAttributes = Object.keys((await contextStates(mainForm(row)))?.[first]?.attributes ?? {});
      if (!rowAttributes.includes("preset")) throw new Error(`the row editor's states context has no preset: ${rowAttributes.join(", ")}`);
    });

    await test("card editor: a removed state content stays removed", async () => {
      const { el, saved } = hosted("svs-subwoofer-card-editor");
      el.setConfig({ type: "custom:svs-subwoofer-card", entity: first, state_content: ["state", "preset", "standby_mode"] });
      const tile = await tileEditorIn(el);
      setFormValue(mainForm(tile), { state_content: ["state", "preset"] });
      await until(() => same(tile._config?.state_content, ["state", "preset"]), "the form to show two state contents");
      expectEqual(saved.at(-1).state_content, ["state", "preset"], "saved state content");
    });

    await test("card editor: an added feature appears in the list", async () => {
      const { el, saved } = hosted("svs-subwoofer-card-editor");
      el.setConfig({ type: "custom:svs-subwoofer-card", entity: first });
      const tile = await tileEditorIn(el);
      setFeatures(tile, [{ type: "custom:svs-subwoofer-volume" }]);
      await until(() => featuresEditor(tile)?.features?.length === 1, "the features list to show the new feature");
      expectEqual(saved.at(-1).features, [{ type: "custom:svs-subwoofer-volume" }], "saved features");
    });

    await test("panel editor: the card above numbered tabs, duplicate, and edits that stay", async () => {
      if (!second) throw new Error("two subwoofers are needed");
      const { el, saved } = hosted("svs-subwoofer-panel-card-editor");
      const thresholds = [{ below: -20, color: "green" }, { color: "red" }];
      el.setConfig({
        type: "custom:svs-subwoofer-panel-card", entity: groupVolume() ?? first,
        features: [{ type: "custom:svs-subwoofer-volume", min: -50, max: 0, volume_thresholds: thresholds }],
        members: [{ entity: first, state_content: ["state", "preset", "standby_mode"], features: [{ type: "custom:svs-subwoofer-volume" }], features_position: "inline" }],
      });
      const tabs = () => [...el.shadowRoot.querySelectorAll(".tab")];
      await until(() => tabs().length === 1, "the tabs");
      expectEqual(tabs().map((t) => t.textContent), ["1"], "tab labels");
      // As on the xTool card: the main subwoofer's tile card options first,
      // untouched, then the SVS Subwoofer section, then the rows' section
      const top = [...el.shadowRoot.children];
      const sections = top.filter((n) => n.localName === "ha-expansion-panel");
      expectEqual(sections.map((p) => p.querySelector('[slot="header"]')?.textContent), ["SVS Subwoofer", "Member subwoofers"], "the sections");
      if (!sections.every((p) => p.expanded)) throw new Error("a section starts collapsed");
      const [svsSection, rowsSection] = sections;
      const cardAbove = await until(() => el.shadowRoot.getElementById("card")?.querySelector("svs-subwoofer-card-editor"), "the main subwoofer's editor");
      if (!cardAbove) throw new Error("the main subwoofer's tile card options are not at the top");
      if (!(cardAbove.compareDocumentPosition(svsSection) & Node.DOCUMENT_POSITION_FOLLOWING)) throw new Error("the tile card options are not before the SVS Subwoofer section");
      if (cardAbove.shadowRoot.querySelector("ha-expansion-panel")?.style.display !== "none") throw new Error("the main subwoofer's options show the style options too");
      const style = await until(() => svsSection.querySelector("svs-subwoofer-card-editor"), "the card's style options");
      await until(() => style.shadowRoot.querySelector("#finish")?.schema?.length, "the Finish field");
      if ([...style.shadowRoot.querySelectorAll("*")].some((n) => n.localName.endsWith("tile-card-editor"))) throw new Error("the SVS Subwoofer section shows the tile card's options");
      if (!rowsSection.querySelector(".tabs")) throw new Error("the tabs are not in the rows' section");

      // State content and features stay as edited (the first tab is open)
      const tile = await tileEditorIn(el);
      setFormValue(mainForm(tile), { state_content: ["state", "preset"] });
      await until(() => same(tile._config?.state_content, ["state", "preset"]), "the row's form to show two state contents");
      expectEqual(saved.at(-1).members[0].state_content, ["state", "preset"], "saved row state content");
      setFeatures(tile, [{ type: "custom:svs-subwoofer-volume" }, { type: "custom:svs-subwoofer-presets", style: "presets_cycle" }]);
      await until(() => featuresEditor(tile)?.features?.length === 2, "the row's features list to show two features");
      expectEqual(saved.at(-1).members[0].features.length, 2, "saved row features");

      // Duplicate: the copy takes the next subwoofer
      const duplicate = [...el.shadowRoot.querySelectorAll("ha-icon-button")].find((b) => b.label === "Duplicate");
      if (!duplicate) throw new Error("no Duplicate button");
      duplicate.click();
      await until(() => tabs().length === 2, "a second tab");
      expectEqual(tabs().map((t) => t.textContent), ["1", "2"], "tab labels after duplicating");
      expectEqual(saved.at(-1).members.map((m) => m.entity), [first, second], "the rows' subwoofers");
      expectEqual(saved.at(-1).members[1].state_content, ["state", "preset"], "the copy's state content");

      // The card: its edits stay, and the rows are kept
      const cardTile = await tileEditorIn(cardAbove);
      setFormValue(mainForm(cardTile), { state_content: ["state"] });
      await until(() => same(cardTile._config?.state_content, ["state"]), "the card's form to show one state content");
      expectEqual(saved.at(-1).state_content, ["state"], "saved card state content");
      expectEqual(saved.at(-1).members.length, 2, "rows kept after a card edit");
    });

    await test("unknown options are errors", async () => {
      const panel = document.createElement("svs-subwoofer-panel-card");
      let message = "";
      try {
        panel.setConfig({ type: "custom:svs-subwoofer-panel-card", entity: first, member_features: ["volume"] });
      } catch (err) {
        message = String(err.message);
      }
      if (!message.includes("member_features")) throw new Error(`no error for member_features (got "${message}")`);
      const card = document.createElement("svs-subwoofer-card");
      message = "";
      try {
        card.setConfig({ type: "custom:svs-subwoofer-card", entity: first, finish_area: "card" });
      } catch (err) {
        message = String(err.message);
      }
      if (!message.includes("finish_area")) throw new Error(`no error for finish_area (got "${message}")`);
    });

    await test("volume editor: an emptied field stays empty", async () => {
      const { el, saved } = hosted("svs-subwoofer-volume-editor");
      el.setConfig({ type: "custom:svs-subwoofer-volume", min: -40 });
      const form = await until(() => el.querySelector("ha-form"), "the form");
      setFormValue(form, { min: undefined });
      await sleep(300);
      if (form.data.min !== undefined) throw new Error(`the field was refilled with ${form.data.min}`);
      if (!saved.length) throw new Error("nothing was saved");
    });

    await test("volume: a cancelled drag ends where it was, not at the left end", async () => {
      const calls = [];
      const feature = document.createElement("svs-subwoofer-volume");
      feature.setConfig({ type: "custom:svs-subwoofer-volume", min: -30 });
      feature.hass = { ...hass(), callService: (domain, service, data) => calls.push(data) };
      feature.context = { entity_id: first };
      stage().append(feature);
      const control = await until(() => feature.shadowRoot.querySelector(".control"), "the slider");
      // A drag at the right end (0 dB), then the browser cancels it (its
      // cancel event reports position 0)
      feature._dragging = 0;
      control.dispatchEvent(new PointerEvent("pointercancel", { clientX: 0, bubbles: true }));
      expectEqual(calls.map((c) => c.value), [0], "the value sent");
    });

    await test("volume: the value callout shows above the slider, and nothing clips it", async () => {
      const card = document.createElement("svs-subwoofer-card");
      card.setConfig({
        type: "custom:svs-subwoofer-card", entity: first, finish: "black_ash",
        features: [{ type: "custom:svs-subwoofer-volume" }],
      });
      card.hass = { ...hass(), callService: () => {} };
      stage().append(card);
      const feature = await until(() => findDeep(card.shadowRoot, "svs-subwoofer-volume"), "the volume slider");
      const control = await until(() => feature.shadowRoot.querySelector(".control[aria-valuenow]"), "the slider's value");
      const tooltip = feature.shadowRoot.querySelector(".tooltip");
      if (control.contains(tooltip)) throw new Error("the callout is inside the control, which clips");
      control.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
      await until(() => tooltip.classList.contains("visible"), "the callout to show");
      if (!/dB$/.test(tooltip.textContent)) throw new Error(`the callout says "${tooltip.textContent}"`);
      const tip = tooltip.getBoundingClientRect(), slider = control.getBoundingClientRect();
      if (tip.bottom > slider.top) throw new Error("the callout is not above the slider");
      // Only the finish is clipped to the card's outline, not the tile card
      const frame = card.shadowRoot.querySelector(".frame");
      if (getComputedStyle(frame).overflow !== "visible") throw new Error("the card's frame clips its tile card");
      if (getComputedStyle(card.shadowRoot.querySelector(".clip")).overflow !== "hidden") throw new Error("the finish is not clipped to the outline");
      const panel = document.createElement("svs-subwoofer-panel-card");
      panel.setConfig({ type: "custom:svs-subwoofer-panel-card", entity: first, finish: "black_ash", members: [{ entity: first }] });
      panel.hass = hass();
      stage().append(panel);
      const box = await until(() => panel.shadowRoot.querySelector(".panel"), "the panel");
      if (getComputedStyle(box).overflow !== "visible") throw new Error("the panel clips its rows");
      await until(() => !tooltip.classList.contains("visible"), "the callout to hide after the key", 3000);
    });

    await test("volume editor: Copy from main on a row, Copy to members on the main, never grayed out", async () => {
      if (!second) throw new Error("two subwoofers are needed");
      const main = { type: "custom:svs-subwoofer-volume", min: -40, volume_thresholds: [{ below: -20, color: "green" }, { color: "red" }] };
      const rowVolume = { type: "custom:svs-subwoofer-volume", max: -5 };
      const { el: panel, saved: savedPanel } = hosted("svs-subwoofer-panel-card-editor");
      panel.setConfig({
        type: "custom:svs-subwoofer-panel-card", entity: first, features: [main],
        members: [{ entity: second, features: [rowVolume] }],
      });
      // Opens a feature's settings the way Home Assistant's features list does;
      // the dialog then shows the settings editor, made here
      const open = (tile, index, config) => {
        featuresEditor(tile).dispatchEvent(new CustomEvent("edit-detail-element", {
          detail: { subElementConfig: { index, type: "feature", elementConfig: config } }, bubbles: true, composed: true,
        }));
        const editor = document.createElement("svs-subwoofer-volume-editor");
        editor.hass = hass();
        const saved = [];
        editor.addEventListener("config-changed", (ev) => {
          saved.push(ev.detail.config);
          editor.setConfig(ev.detail.config);
        });
        stage().append(editor);
        editor.setConfig(config);
        return { editor, saved, button: editor.querySelector("ha-button") };
      };
      const shown = (button) => getComputedStyle(button).display !== "none";

      // The row's volume: shown and enabled; it copies the main subwoofer's
      const rowTile = await tileEditorIn(panel);
      await until(() => featuresEditor(rowTile), "the row's features list");
      const row = open(rowTile, 0, rowVolume);
      if (!shown(row.button)) throw new Error("Copy from main is not shown on the row's volume");
      if (row.button.disabled) throw new Error("Copy from main is grayed out on the row's volume");
      expectEqual(row.button.textContent, "Copy from main", "the button's label");
      row.button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      expectEqual(row.saved.at(-1), main, "the copied settings");
      await until(() => row.editor.querySelector("ha-form").data.min === -40, "the form to show the copied settings");

      // The main subwoofer's own volume, even with the same settings: Copy to
      // members instead, which puts its settings on every row
      const cardEditor = panel.shadowRoot.querySelector("#card svs-subwoofer-card-editor");
      const mainTile = await tileEditorIn(cardEditor);
      await until(() => featuresEditor(mainTile), "the main subwoofer's features list");
      const changed = { ...main, min: -45 };
      const own = open(mainTile, 0, main);
      expectEqual(own.button.textContent, "Copy to members", "the main subwoofer's button");
      if (!shown(own.button) || own.button.disabled) throw new Error("Copy to members is not offered on the main subwoofer");
      own.editor.setConfig(changed);
      const before = savedPanel.length;
      own.button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await until(() => savedPanel.length > before, "the panel to save");
      expectEqual(savedPanel.at(-1).members[0].features, [changed], "the rows' volume after Copy to members");

      // A volume feature outside the panel: no button
      const alone = hosted("svs-subwoofer-volume-editor").el;
      alone.setConfig({ type: "custom:svs-subwoofer-volume", min: -33 });
      if (shown(await until(() => alone.querySelector("ha-button"), "the editor"))) throw new Error("Copy from main is shown outside the panel");
    });

    // Icon tap behavior set to Perform action, Button: Press: what the action
    // editor shows for its target, in Home Assistant's own tile card editor
    // and in the SVS Subwoofer card's, and whether a subwoofer's button can be
    // chosen. Fails when the SVS editor shows less than Home Assistant's.
    await test("interactions: Perform action offers a target, the subwoofer's buttons among them", async () => {
      const connection = entities().find((e) => e.translation_key === "reconnect")?.entity_id;
      const action = { action: "perform-action", perform_action: "button.press" };
      const deep = (root, selector, found = []) => {
        for (const el of root.querySelectorAll("*")) {
          if (el.matches(selector)) found.push(el);
          if (el.shadowRoot) deep(el.shadowRoot, selector, found);
        }
        return found;
      };
      const describe = async (label, editor) => {
        await sleep(2000);
        for (const panel of deep(editor.shadowRoot ?? editor, "ha-expansion-panel")) panel.expanded = true;
        const control = await until(() => deep(editor.shadowRoot ?? editor, "ha-service-control")[0], `${label}: the action editor`, 8000).catch(() => null);
        if (!control) return { label, control: false };
        await sleep(1500);
        const selector = control.shadowRoot.querySelector("ha-selector.target-selector");
        const inner = selector?.shadowRoot?.firstElementChild;
        const picker = inner && deep(inner.shadowRoot ?? inner, "ha-target-picker")[0];
        return {
          label,
          control: true,
          action: control.value?.action ?? control._value?.action,
          targetSelector: !!selector,
          selectorElement: inner?.localName ?? null,
          selectorDefined: inner ? !!customElements.get(inner.localName) : null,
          picker: !!picker,
          pickerText: (picker?.shadowRoot?.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 160),
          hassHasSwitch: !!control.hass?.entities?.[connection] && !!control.hass?.states?.[connection],
          hassSame: control.hass === hass(),
        };
      };
      const helpers = await window.loadCardHelpers();
      helpers.createCardElement({ type: "tile", entity: first });
      await customElements.whenDefined("hui-tile-card");
      const plainType = (await customElements.get("hui-tile-card").getConfigElement()).tagName.toLowerCase();
      const plain = hosted(plainType).el;
      plain.setConfig({ type: "tile", entity: first, icon_tap_action: action });
      const theirs = await describe("Home Assistant's tile card editor", plain);
      stage().replaceChildren();
      const svs = hosted("svs-subwoofer-card-editor").el;
      svs.setConfig({ type: "custom:svs-subwoofer-card", entity: first, icon_tap_action: action });
      const ours = await describe("the SVS Subwoofer card's editor", svs);
      const report = JSON.stringify({ connection, theirs, ours }, null, 1);
      console.log(`target diagnostic: ${report}`);
      results.push({ name: "diagnostic: the action editor's target (report only)", ok: true, detail: report });
      if (!connection) throw new Error("no Reconnect button found");
      if (theirs.picker && !ours.picker) throw new Error(`the SVS editor shows no target picker where Home Assistant's does:\n${report}`);
      if (ours.control && !ours.hassHasSwitch) throw new Error(`the SVS editor's action editor does not know the Reconnect button:\n${report}`);
    });

    // A tap on the driver connects or disconnects: the card's hass is a copy
    // with the connections set by the test, and records the actions it calls
    const tapCard = async (config, connected) => {
      const calls = [];
      const states = { ...hass().states };
      for (const [id, on] of Object.entries(connected)) states[id] = { ...states[id], state: on ? "on" : "off" };
      const fake = { ...hass(), states, callService: async (domain, service, data) => { calls.push({ domain, service, data }); } };
      const el = document.createElement(config.type.slice("custom:".length));
      el.setConfig(config);
      el.hass = fake;
      stage().append(el);
      const card = el.localName === "svs-subwoofer-panel-card"
        ? await until(() => el.shadowRoot.querySelector(".header svs-subwoofer-card"), "the header card") : el;
      const tile = await until(() => card.shadowRoot.querySelector("hui-tile-card")?._config && card.shadowRoot.querySelector("hui-tile-card"), "the tile card");
      return {
        calls,
        iconTap: tile._config.icon_tap_action,
        tap: () => tile.dispatchEvent(new CustomEvent("ll-custom", { bubbles: true, composed: true, detail: tile._config.icon_tap_action })),
      };
    };
    const pressed = (calls) => calls.filter((c) => c.domain === "button" && c.service === "press").flatMap((c) => [c.data.entity_id].flat()).sort();

    await test("connect tap: a connected subwoofer disconnects", async () => {
      const { calls, iconTap, tap } = await tapCard({ type: "custom:svs-subwoofer-card", entity: first }, { [onDevice(first, "connected")]: true });
      expectEqual(iconTap, { action: "fire-dom-event", svs_subwoofer: "connection" }, "the tile card's icon tap");
      tap();
      await until(() => calls.length, "a button press");
      expectEqual(pressed(calls), [onDevice(first, "disconnect")], "the buttons pressed");
    });

    await test("connect tap: a disconnected subwoofer reconnects", async () => {
      const { calls, tap } = await tapCard({ type: "custom:svs-subwoofer-card", entity: first }, { [onDevice(first, "connected")]: false });
      tap();
      await until(() => calls.length, "a button press");
      expectEqual(pressed(calls), [onDevice(first, "reconnect")], "the buttons pressed");
    });

    await test("connect tap: a group with one of two connected reconnects only the other", async () => {
      const group = groupVolume();
      if (!group || !second) throw new Error("a group of two subwoofers is needed");
      const { calls, tap } = await tapCard(
        { type: "custom:svs-subwoofer-panel-card", entity: group, members: [{ entity: first }, { entity: second }] },
        { [onDevice(first, "connected")]: true, [onDevice(second, "connected")]: false },
      );
      tap();
      await until(() => calls.length, "a button press");
      expectEqual(pressed(calls), [onDevice(second, "reconnect")], "the buttons pressed");
    });

    await test("connect tap: a group with both connected disconnects both", async () => {
      const group = groupVolume();
      if (!group || !second) throw new Error("a group of two subwoofers is needed");
      const { calls, tap } = await tapCard(
        { type: "custom:svs-subwoofer-panel-card", entity: group, members: [{ entity: first }, { entity: second }] },
        { [onDevice(first, "connected")]: true, [onDevice(second, "connected")]: true },
      );
      tap();
      await until(() => calls.length, "a button press");
      expectEqual(pressed(calls), [onDevice(first, "disconnect"), onDevice(second, "disconnect")].sort(), "the buttons pressed");
    });

    // A real mouse click on a driver (the tile card's icon), as on a
    // dashboard: what it presses, and whether it opens more-info instead
    const realClick = (el) => new Promise((resolve) => {
      const r = el.getBoundingClientRect();
      const id = Math.random().toString(36).slice(2);
      (window.__svsClicks ??= {})[id] = resolve;
      window.__svsClickDone ??= (done) => { window.__svsClicks[done]?.(); delete window.__svsClicks[done]; };
      window.svsRealClick(JSON.stringify({ id, x: r.left + r.width / 2, y: r.top + r.height / 2 }));
    });
    const clickDriver = async (config, connected, which) => {
      const calls = [];
      const states = { ...hass().states };
      for (const [id, on] of Object.entries(connected)) states[id] = { ...states[id], state: on ? "on" : "off" };
      const fake = { ...hass(), states, callService: async (domain, service, data) => { calls.push({ domain, service, data }); } };
      const el = document.createElement(config.type.slice("custom:".length));
      el.setConfig(config);
      el.hass = fake;
      stage().append(el);
      const moreInfo = [];
      el.addEventListener("hass-more-info", (ev) => moreInfo.push(ev.detail?.entityId), true);
      const card = await until(() => which(el), "the card to click");
      const icon = await until(() => card.shadowRoot.querySelector("hui-tile-card")?.shadowRoot?.querySelector("ha-tile-icon"), "the driver");
      await sleep(500);
      await realClick(icon);
      await sleep(800);
      return { calls, moreInfo };
    };
    const expectPressed = ({ calls, moreInfo }, buttons) => {
      if (moreInfo.length) throw new Error(`the click opened more-info for ${moreInfo.join(", ")}; pressed ${JSON.stringify(pressed(calls))}`);
      expectEqual(pressed(calls), [...buttons].sort(), "the buttons pressed");
    };

    await test("real click: a subwoofer's driver disconnects it", async () => {
      expectPressed(await clickDriver({ type: "custom:svs-subwoofer-card", entity: first },
        { [onDevice(first, "connected")]: true }, (el) => el), [onDevice(first, "disconnect")]);
    });

    await test("real click: the panel's group driver disconnects both", async () => {
      if (!groupVolume() || !second) throw new Error("a group of two subwoofers is needed");
      expectPressed(await clickDriver(
        { type: "custom:svs-subwoofer-panel-card", entity: groupVolume(), members: [{ entity: first }, { entity: second }], members_open: true },
        { [onDevice(first, "connected")]: true, [onDevice(second, "connected")]: true },
        (el) => el.shadowRoot.querySelector(".header svs-subwoofer-card"),
      ), [onDevice(first, "disconnect"), onDevice(second, "disconnect")]);
    });

    await test("real click: a row's driver in the panel reconnects that subwoofer", async () => {
      if (!groupVolume() || !second) throw new Error("a group of two subwoofers is needed");
      expectPressed(await clickDriver(
        { type: "custom:svs-subwoofer-panel-card", entity: groupVolume(), members: [{ entity: first }, { entity: second }], members_open: true, members_toggle: false },
        { [onDevice(first, "connected")]: false, [onDevice(second, "connected")]: true },
        (el) => el.shadowRoot.querySelectorAll(".members svs-subwoofer-card")[0],
      ), [onDevice(first, "reconnect")]);
    });

    await test("mixed: the group shows its rows' range, presets and M, and moves them together", async () => {
      const group = groupVolume();
      if (!group || !second) throw new Error("a group of two subwoofers is needed");
      const calls = [];
      const fake = { ...hass(), states: mixedStates(), callService: async (domain, service, data) => { calls.push({ domain, service, data }); } };
      const panel = document.createElement("svs-subwoofer-panel-card");
      panel.setConfig({ ...deployedPanel(group, first, second), state_content: ["state", "preset", "standby_mode"] });
      panel.hass = fake;
      stage().append(panel);
      const header = await until(() => panel.shadowRoot.querySelector(".header svs-subwoofer-card"), "the header card");
      const tile = await until(() => header.shadowRoot.querySelector("hui-tile-card")?.shadowRoot && header.shadowRoot.querySelector("hui-tile-card"), "the tile card");
      const text = () => deepText(tile.shadowRoot);
      await until(() => /-20 to -12/.test(text()), "the volume range in the state content").catch(() => { throw new Error(`the state content says: ${text()}`); });
      if (/dB dB/.test(text())) throw new Error(`the unit is shown twice: ${text()}`);
      if (!/LOW \/ HIGH/.test(text())) throw new Error(`no mixed presets in the state content: ${text()}`);
      if (!/Auto \/ On/.test(text())) throw new Error(`no mixed standby modes in the state content: ${text()}`);
      expectEqual(header.shadowRoot.querySelector(".standby-badge")?.textContent, "M", "the standby badge");
      const volume = await until(() => findDeep(tile.shadowRoot, "svs-subwoofer-volume"), "the volume slider");
      const control = await until(() => volume.shadowRoot.querySelector(".control.span"), "the slider spanning both volumes");
      if (!volume.shadowRoot.querySelector(".loupe.span")) throw new Error("the loupe does not stretch over the span");
      // Two steps up with the keys: each subwoofer moves by 2 dB
      control.focus();
      for (let i = 0; i < 2; i++) control.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
      await until(() => calls.length >= 2, "the volumes to be sent", 3000);
      const sent = Object.fromEntries(calls.filter((c) => c.service === "set_value").map((c) => [c.data.entity_id, c.data.value]));
      expectEqual(sent, { [first]: -18, [second]: -10 }, "the volumes sent");
    });

    await test("connect tap: a card's own Icon tap behavior is kept", async () => {
      const own = { action: "more-info" };
      const { iconTap } = await tapCard({ type: "custom:svs-subwoofer-card", entity: first, icon_tap_action: own }, {});
      expectEqual(iconTap, own, "the tile card's icon tap");
    });

    await test("console: keys keep one color whether selected or not; preset keys at full strength", async () => {
      const card = document.createElement("svs-subwoofer-card");
      card.setConfig({
        type: "custom:svs-subwoofer-card", entity: first, finish: "fabric", features_style: "console",
        features: [{ type: "custom:svs-subwoofer-standby" }, { type: "custom:svs-subwoofer-presets" }],
      });
      card.hass = hass();
      stage().append(card);
      const standby = await until(() => findDeep(card.shadowRoot, "svs-subwoofer-standby")?.shadowRoot?.querySelector('button[aria-pressed="true"]'), "the selected standby mode");
      await sleep(400);
      for (const feature of [findDeep(card.shadowRoot, "svs-subwoofer-standby"), findDeep(card.shadowRoot, "svs-subwoofer-presets")]) {
        const keys = [...feature.shadowRoot.querySelectorAll("button")];
        const on = keys.find((b) => b.getAttribute("aria-pressed") === "true");
        const off = keys.find((b) => b.getAttribute("aria-pressed") !== "true");
        if (!on || !off) continue;
        const tint = (b) => Number(getComputedStyle(b, "::before").opacity);
        if (tint(on) !== tint(off)) throw new Error(`${feature.localName}: the selected key's tint is ${tint(on)}, the others' ${tint(off)}`);
        // Preset keys show their colors at full strength, as the volume
        // slider does; each picks its own text color for that
        if (feature.localName === "svs-subwoofer-presets" && keys.some((b) => tint(b) !== 1)) {
          throw new Error(`preset keys are not at full strength: ${keys.map(tint).join(", ")}`);
        }
        if (feature.localName === "svs-subwoofer-standby" && getComputedStyle(on).color !== getComputedStyle(off).color) {
          throw new Error(`${feature.localName}: the selected key's text color differs`);
        }
        if (!getComputedStyle(on).boxShadow.includes("inset")) throw new Error(`${feature.localName}: the selected key does not look pressed in`);
        if (getComputedStyle(on).transform === "none") throw new Error(`${feature.localName}: the selected key is not pressed down`);
      }
      if (!standby) throw new Error("no selected standby mode");
    });

    await test("presets editor: reordered presets keep their order", async () => {
      const { el, saved } = hosted("svs-subwoofer-presets-editor", { context: { entity_id: first } });
      el.setConfig({ type: "custom:svs-subwoofer-presets" });
      const form = await until(() => el.querySelector("ha-form")?.data?.presets_shown?.length, "the form") && el.querySelector("ha-form");
      const reversed = [...form.data.presets_shown].reverse();
      setFormValue(form, { presets_shown: reversed });
      await until(() => same(form.data.presets_shown, reversed), "the form to keep the new order");
      expectEqual(saved.at(-1).presets_shown, reversed, "saved order");
    });

    await test("presets editor: Default is left out, with no color or icon of its own", async () => {
      const { el } = hosted("svs-subwoofer-presets-editor", { context: { entity_id: first } });
      el.setConfig({ type: "custom:svs-subwoofer-presets" });
      const form = await until(() => el.querySelector("ha-form")?.data?.presets_shown?.length && el.querySelector("ha-form"), "the form");
      const options = form.schema.find((s) => s.name === "presets_shown").selector.select.options;
      if (!options.includes("Default")) throw new Error(`the fake subwoofer has no Default preset (options ${JSON.stringify(options)})`);
      if (form.data.presets_shown.includes("Default")) throw new Error("Default is shown by default");
      const names = JSON.stringify(form.schema);
      if (names.includes("color_Default") || names.includes("icon_Default")) throw new Error("Default has a color or icon field");
    });

    await test("entity pickers offer only SVS Subwoofer volumes", async () => {
      const entityField = (schema) => {
        for (const item of schema ?? []) {
          if (item.name === "entity") return item;
          const inner = entityField(item.schema);
          if (inner) return inner;
        }
        return undefined;
      };
      const offered = (tile) => entityField(mainForm(tile).schema)?.selector?.entity?.include_entities;
      const { el } = hosted("svs-subwoofer-card-editor");
      el.setConfig({ type: "custom:svs-subwoofer-card", entity: first });
      const tile = await tileEditorIn(el);
      const cardList = await until(() => offered(tile), "the card's entity list");
      expectEqual(cardList, [...subVolumes(), ...(groupVolume() ? [groupVolume()] : [])].sort(), "the card's entities");

      stage().replaceChildren();
      const panel = hosted("svs-subwoofer-panel-card-editor").el;
      panel.setConfig({ type: "custom:svs-subwoofer-panel-card", entity: groupVolume() ?? first, members: [{ entity: first }] });
      const row = await tileEditorIn(panel);
      expectEqual(await until(() => offered(row), "the row's entity list"), subVolumes(), "a row's entities");
    });

    await test("standby: the selected mode's text is readable from the first render", async () => {
      const card = document.createElement("svs-subwoofer-card");
      card.setConfig({
        type: "custom:svs-subwoofer-card", entity: first, finish: "gloss_white", features_style: "match",
        features: [{ type: "custom:svs-subwoofer-standby" }],
      });
      card.hass = hass();
      card.style.setProperty("--feature-color", "#ffffff");
      stage().append(card);
      const standby = await until(() => findDeep(card.shadowRoot, "svs-subwoofer-standby")?.style.getPropertyValue("--svs-on-color") && findDeep(card.shadowRoot, "svs-subwoofer-standby"), "the standby text color");
      const color = standby.style.getPropertyValue("--svs-on-color");
      const featureColor = getComputedStyle(standby).getPropertyValue("--feature-color").trim();
      if (/^#f/i.test(featureColor) && color === "#fff") throw new Error(`white text on the feature color ${featureColor}`);
      const labels = [...(standby.shadowRoot ?? standby).querySelectorAll("*")].map((e) => e.textContent).join("|");
      if (/Auto On/i.test(labels)) throw new Error("the card says Auto On, not Auto");
      if (/\bON\b/.test(labels)) throw new Error("the card says ON, not On");
    });

    return results;
  };

  // ---------------------------------------------------------------------
  // Readability: the text of every control against what is under it, for
  // every finish and features style, with feature colors from black to
  // white. Run once in each color scheme (the driver switches it).
  // ---------------------------------------------------------------------
  let probe;
  function rgba(css) {
    probe ??= document.createElement("canvas").getContext("2d", { willReadFrequently: true });
    probe.clearRect(0, 0, 1, 1);
    probe.fillStyle = "rgba(0, 0, 0, 0)";
    probe.fillStyle = css;
    probe.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = probe.getImageData(0, 0, 1, 1).data;
    return [r, g, b, a / 255];
  }
  const over = (top, below) => [0, 1, 2].map((i) => top[i] * top[3] + below[i] * (1 - top[3])).concat(1);
  function luminance([r, g, b]) {
    const lin = (v) => ((v /= 255) <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  }
  const contrast = (a, b) => {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  };
  const hex = (c) => `#${c.slice(0, 3).map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`;
  // The element and its ancestors, across shadow roots
  function ancestors(el) {
    const list = [];
    for (let n = el; n; n = n.parentNode ?? n.host) if (n.nodeType === 1) list.push(n);
    return list;
  }
  // Colors of a canvas under an element: a grid over its middle
  function samples(canvas, el) {
    const c = canvas.getBoundingClientRect(), r = el.getBoundingClientRect();
    const sx = canvas.width / c.width, sy = canvas.height / c.height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    const out = [];
    for (let i = 0; i < 7; i++) {
      for (let j = 0; j < 3; j++) {
        const x = (r.left + r.width * (0.2 + 0.1 * i) - c.left) * sx, y = (r.top + r.height * (0.3 + 0.2 * j) - c.top) * sy;
        const [R, G, B, A] = ctx.getImageData(Math.floor(x), Math.floor(y), 1, 1).data;
        out.push([R, G, B, A / 255]);
      }
    }
    return out;
  }
  // What shows under an element: the first opaque background below it, or
  // the finish drawn on the card's (or the panel's) canvas
  function under(el) {
    const page = rgba(getComputedStyle(document.body).backgroundColor);
    for (const n of ancestors(el).slice(1)) {
      // The card's and the panel's own boxes are below their finish: they
      // are handled with the card (its canvas, or its background)
      if (n.matches(".frame, .panel") && n.getRootNode().host?.localName.startsWith("svs-subwoofer-")) continue;
      if (n.localName === "svs-subwoofer-card" || n.localName === "svs-subwoofer-panel-card") {
        const box = n.shadowRoot.querySelector(".frame, .panel");
        if (box.classList.contains("finished") && !box.classList.contains("through")) {
          return samples(n.shadowRoot.querySelector("canvas"), el).map((s) => over(s, page));
        }
        if (n.localName === "svs-subwoofer-panel-card") {
          const bg = rgba(getComputedStyle(box).backgroundColor);
          if (bg[3] > 0.99) return [bg];
        }
        continue;
      }
      const bg = rgba(getComputedStyle(n).backgroundColor);
      if (bg[3] > 0.99) return [bg];
    }
    return [page];
  }
  // The lowest contrast of a control's text with what it shows behind it
  function check(el, label, failures, what) {
    const style = getComputedStyle(el);
    const own = rgba(style.backgroundColor);
    const before = getComputedStyle(el, "::before");
    const tint = before.content !== "none" ? rgba(before.backgroundColor) : [0, 0, 0, 0];
    tint[3] *= Number(before.opacity || 1);
    let worst = Infinity, at;
    for (const base of under(el)) {
      const bg = over(tint, own[3] > 0.99 ? own : over(own, base));
      const fg = over(rgba(style.color), bg);
      const ratio = contrast(fg, bg);
      if (ratio < worst) [worst, at] = [ratio, `${hex(fg)} on ${hex(bg)}`];
    }
    if (worst < 4.5) failures.push(`${what}: "${label}" ${worst.toFixed(2)}:1 (${at})`);
  }

  window.svsReadability = async () => {
    const [first] = subVolumes();
    const box = stage();
    box.replaceChildren();
    const thresholds = [{ below: -30, color: "green" }, { below: -15, color: "yellow" }, { color: "red" }];
    const features = [
      { type: "custom:svs-subwoofer-presets", presets_shown: ["LOW", "MEDIUM", "HIGH", "Default"] },
      { type: "custom:svs-subwoofer-presets", style: "presets_cycle" },
      { type: "custom:svs-subwoofer-volume", volume_thresholds: thresholds },
      { type: "custom:svs-subwoofer-standby" },
    ];
    const looks = [["none", "match"]];
    for (const finish of ["black_ash", "black_oak", "gloss_black", "gloss_white", "fabric", "grille"]) {
      for (const style of ["match", "flat", "console"]) looks.push([finish, style]);
    }
    const cards = [];
    for (const [finish, style] of looks) {
      const card = document.createElement("svs-subwoofer-card");
      card.setConfig({ type: "custom:svs-subwoofer-card", entity: first, name: `${finish} ${style}`, features, finish, features_style: style });
      card.hass = { ...hass(), callService: () => {} };
      box.append(card);
      cards.push([`${finish} · ${style}`, card]);
    }
    for (const finish of ["fabric", "gloss_white"]) {
      for (const style of ["match", "flat", "console"]) {
        const panel = document.createElement("svs-subwoofer-panel-card");
        panel.setConfig({
          type: "custom:svs-subwoofer-panel-card", entity: first, finish, features_style: style, features: [features[0]],
          members: [{ entity: first, features: [features[1], features[3]], features_position: "inline" }],
        });
        panel.hass = { ...hass(), callService: () => {} };
        box.append(panel);
        cards.push([`panel ${finish} · ${style}`, panel]);
      }
    }
    await sleep(2500);
    const featureTypes = "svs-subwoofer-presets, svs-subwoofer-standby, svs-subwoofer-volume";
    const allDeep = (root, selector, found = []) => {
      for (const el of root.querySelectorAll("*")) {
        if (el.matches(selector)) found.push(el);
        if (el.shadowRoot) allDeep(el.shadowRoot, selector, found);
      }
      return found;
    };
    const results = [];
    // The theme's own feature color first, then black to white
    for (const color of [null, "#000000", "#ffffff", "#ffeb3b", "#44739e", "#f44336"]) {
      const failures = [];
      let checked = 0;
      for (const [, card] of cards) {
        for (const feature of allDeep(card.shadowRoot, featureTypes)) {
          if (color) feature.style.setProperty("--feature-color", color);
          else feature.style.removeProperty("--feature-color");
          feature._key = undefined;
          feature._render?.();
        }
      }
      await sleep(600);
      for (const [what, card] of cards) {
        for (const feature of allDeep(card.shadowRoot, featureTypes)) {
          for (const button of feature.shadowRoot.querySelectorAll("button")) {
            check(button, button.textContent.trim() || button.title || button.getAttribute("aria-label") || "icon", failures, what);
            checked++;
          }
          // The volume's value callout, shown as while a key is pressed
          const control = feature.shadowRoot.querySelector(".control[role=slider]");
          const tooltip = feature.shadowRoot.querySelector(".tooltip");
          if (control && tooltip) {
            tooltip.classList.add("visible");
            check(tooltip, tooltip.textContent, failures, `${what} (value callout)`);
            tooltip.classList.remove("visible");
            checked++;
          }
        }
      }
      results.push({
        name: `readability: ${color ? `feature color ${color}` : "the theme's feature color"} (${checked} controls)`,
        ok: failures.length === 0 && checked > 0,
        detail: failures.length ? `${failures.length} hard to read (contrast below 4.5:1):\n${failures.slice(0, 40).join("\n")}` : (checked ? "" : "nothing was checked"),
      });
    }
    box.replaceChildren();
    return results;
  };

  // The cards in every finish, for screenshots; returns the area to capture
  // and each card's place in it. Every card gets the same fixed states, with
  // every subwoofer connected, so two runs (the original card and this one)
  // show the same thing.
  // With extras, it also shows cards the original card cannot be compared on.
  window.svsUiGallery = async (extras = false) => {
    const [first, second] = subVolumes();
    const states = { ...hass().states };
    for (const e of entities().filter((x) => x.translation_key === "connected")) states[e.entity_id] = { ...states[e.entity_id], state: "on" };
    const shown = { ...hass(), states };
    const box = stage();
    box.replaceChildren();
    const features = [
      { type: "custom:svs-subwoofer-presets" },
      { type: "custom:svs-subwoofer-volume", volume_thresholds: [{ below: -30, color: "green" }, { below: -15, color: "yellow" }, { color: "red" }] },
      { type: "custom:svs-subwoofer-standby" },
    ];
    const looks = [
      ["none", "match"], ["black_ash", "match"], ["black_ash", "console"], ["black_oak", "flat"],
      ["gloss_black", "match"], ["gloss_white", "console"], ["fabric", "match"], ["grille", "console"],
    ];
    for (const [finish, style] of looks) {
      const card = document.createElement("svs-subwoofer-card");
      card.setConfig({
        type: "custom:svs-subwoofer-card", entity: first, name: `${finish} · ${style}`,
        state_content: ["state", "preset", "standby_mode"], features, features_position: "inline",
        finish, features_style: style, standby_badge: true,
      });
      card.hass = shown;
      box.append(card);
    }
    // The plain loupe (no thresholds), and no ring around the driver
    const plain = document.createElement("svs-subwoofer-card");
    plain.setConfig({
      type: "custom:svs-subwoofer-card", entity: first, name: "black_oak · console · no thresholds, no ring",
      features: [{ type: "custom:svs-subwoofer-volume" }], features_position: "inline",
      finish: "black_oak", features_style: "console", driver_ring: false,
    });
    plain.hass = shown;
    box.append(plain);
    if (second) {
      const panel = document.createElement("svs-subwoofer-panel-card");
      panel.setConfig({
        type: "custom:svs-subwoofer-panel-card", entity: groupVolume() ?? first, name: "Panel",
        finish: "black_ash", features_style: "match", features: [{ type: "custom:svs-subwoofer-presets" }, features[1]], features_position: "inline",
        members: [first, second].map((entity) => ({
          entity, state_content: ["state", "preset"], features: [{ type: "custom:svs-subwoofer-volume" }], features_position: "inline",
        })),
      });
      panel.hass = shown;
      box.append(panel);
    }
    // The panel as deployed (the regression baseline), with its rows open
    if (second && groupVolume()) {
      const deployed = document.createElement("svs-subwoofer-panel-card");
      deployed.setConfig({ ...deployedPanel(groupVolume(), first, second), members_open: true, members_toggle: false });
      deployed.hass = shown;
      box.append(deployed);
    }
    // The same panel with its subwoofers disagreeing (new in this card)
    if (extras && second && groupVolume()) {
      const mixed = document.createElement("svs-subwoofer-panel-card");
      mixed.setConfig({
        ...deployedPanel(groupVolume(), first, second), name: "Both (mixed)",
        state_content: ["state", "preset", "standby_mode"], members_open: true, members_toggle: false,
      });
      mixed.hass = { ...hass(), states: mixedStates() };
      box.append(mixed);
    }
    await sleep(2500);
    const place = (el) => {
      const r = el.getBoundingClientRect();
      return { x: r.left + window.scrollX, y: r.top + window.scrollY, width: Math.ceil(r.width), height: Math.ceil(r.height) };
    };
    const cards = [...box.children].map((el, i) => ({ name: el._config?.name ?? `${i + 1} ${el.localName}`, ...place(el) }));
    return { ...place(box), cards };
  };
})();
