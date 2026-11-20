/**
 * Checks for the SVS Subwoofer card test pages. A page runs its checks in an
 * async function passed to runChecks(); the results go into
 * <pre id="report">, whose data-result is "pass" or "fail" (read by run.py).
 *
 * Every check is named by its ID in tests/SPEC.md and uses only what the card
 * shows: element tags, its configuration, hass, roles and labels, rendered
 * text, computed styles and the actions it performs.
 *
 * On the prototype (the card before the rewrite), a failed check whose ID is
 * in KNOWN_ON_PROTOTYPE is a known difference (a change or a fix made in the
 * rewrite): it is reported as KNOWN, not as a failure.
 */
const KNOWN_ON_PROTOTYPE = {
  "L-1": "change: a feature with nothing to show takes no place",
  "FE-4": "bug: a volume feature outside the panel offers Copy from main when a panel's volume with the same settings was opened before",
  "K-13": "bug: the driver ring is gray until the next state change when the card gets hass before it is on the page",
};

const problems = [];
const known = [];
const passed = [];
window.addEventListener("error", (ev) => problems.push(`Page error: ${ev.message} (${ev.filename}:${ev.lineno})`));
window.addEventListener("unhandledrejection", (ev) => problems.push(`Unhandled promise rejection: ${ev.reason}`));
const consoleError = console.error;
console.error = (...args) => {
  problems.push(`console.error: ${args.join(" ")}`);
  consoleError(...args);
};
// The card warns instead of failing when it cannot style a part; a test fails on it
const consoleWarn = console.warn;
console.warn = (...args) => {
  problems.push(`console.warn: ${args.map((a) => (a instanceof Error ? `${a.message} ${a.stack}` : a)).join(" ")}`);
  consoleWarn(...args);
};

window.check = (title, ok, message) => {
  if (ok) {
    passed.push(`${title}: ${message}`);
    return;
  }
  const id = title.split(" ")[0];
  if (window.PROTOTYPE && KNOWN_ON_PROTOTYPE[id]) known.push(`${title}: ${message} [${KNOWN_ON_PROTOTYPE[id]}]`);
  else problems.push(`${title}: ${message}`);
};
window.wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Wait until test() is true (up to ms), and return whether it became true. */
window.until = async (test, ms = 2000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try {
      if (await test()) return true;
    } catch {
      // not there yet
    }
    await wait(20);
  }
  return false;
};

/** Elements matching a selector anywhere inside an element and its shadow roots. */
window.deep = (el, selector) => {
  const roots = [el, ...(el.shadowRoot ? [el.shadowRoot] : [])];
  const out = [];
  for (const root of roots) {
    out.push(...root.querySelectorAll(selector));
    for (const child of root.querySelectorAll("*")) if (child.shadowRoot) out.push(...deep(child, selector));
  }
  return [...new Set(out)];
};

window.textOf = (el) => el?.textContent.replace(/\s+/g, " ").trim();

function place(title, element, { width = 420, height } = {}) {
  const figure = document.createElement("figure");
  figure.innerHTML = `<figcaption>${title}</figcaption>`;
  const cell = document.createElement("div");
  cell.style.cssText = `width:${width}px${height ? `;height:${height}px` : ""}`;
  cell.append(element);
  figure.append(cell);
  document.getElementById("cards").append(figure);
  return element;
}

/** Add an SVS Subwoofer card to the page (the Both group unless the config names another entity). */
window.addCard = (title, config, { hass, ...size } = {}) => {
  const card = document.createElement("svs-subwoofer-card");
  card.setConfig({ type: "custom:svs-subwoofer-card", entity: BOTH, ...config });
  card.hass = hass ?? makeHass();
  return place(title, card, size);
};

/** The deployed panel card: the group above its two subwoofers. */
window.panelConfig = (config = {}) => ({
  type: "custom:svs-subwoofer-panel-card", entity: BOTH, name: "Both", state_content: ["state", "preset"],
  features: [{ type: "custom:svs-subwoofer-presets" }, { type: "custom:svs-subwoofer-volume" }],
  members: [
    { entity: LEFT, state_content: ["state", "preset", "standby_mode"], features: [{ type: "custom:svs-subwoofer-volume" }], features_position: "inline" },
    { entity: RIGHT, state_content: ["state", "preset", "standby_mode"], features: [{ type: "custom:svs-subwoofer-volume" }], features_position: "inline" },
  ],
  ...config,
});

/** Add an SVS Subwoofer panel card to the page. */
window.addPanel = (title, config, { hass, ...size } = {}) => {
  const card = document.createElement("svs-subwoofer-panel-card");
  card.setConfig(panelConfig(config));
  card.hass = hass ?? makeHass();
  return place(title, card, size);
};

/** Add one feature on its own (as in a plain tile card) to the page. */
window.addFeature = (config, { hass, entityId = BOTH } = {}) => {
  const element = document.createElement(config.type.replace("custom:", ""));
  element.setConfig(config);
  element.hass = hass ?? makeHass();
  element.context = { entity_id: entityId };
  const cell = document.createElement("div");
  cell.style.cssText = "width:420px;margin:8px 0;--feature-height:42px;--feature-color:var(--primary-color)";
  cell.append(element);
  document.getElementById("cards").append(cell);
  return element;
};

/** Add an editor to the page, with hass, and collect the configurations it sends. */
window.addEditor = (tag, config, { hass } = {}) => {
  const editor = document.createElement(tag);
  editor.sent = [];
  editor.addEventListener("config-changed", (ev) => editor.sent.push(ev.detail.config));
  editor.hass = hass ?? makeHass();
  editor.setConfig(config);
  const cell = document.createElement("div");
  cell.style.cssText = "width:520px;margin:8px 0";
  cell.append(editor);
  document.getElementById("cards").append(cell);
  return editor;
};

// Parts of a card, found by tag, role and label
window.tileOf = (card) => deep(card, "hui-tile-card")[0];
window.tilesOf = (card) => deep(card, "hui-tile-card");
window.driverOf = (card) => deep(tileOf(card) ?? card, "ha-tile-icon")[0]?.shadowRoot?.querySelector("img");
window.bluetoothBadgeOf = (card) => deep(card, '[role="img"][aria-label]').find((el) => /connected/i.test(el.getAttribute("aria-label")));
window.standbyBadgeOf = (card) => deep(card, "[title]").find((el) => /^Standby mode/.test(el.title));
window.featureOf = (card, tag) => deep(card, tag)[0];
window.buttonsOf = (feature) => [...feature.shadowRoot.querySelectorAll("button")];
window.sliderOf = (feature) => feature.shadowRoot.querySelector('[role="slider"]');
window.secondaryOf = (card) => textOf(deep(tileOf(card), "ha-tile-info")[0]?.lastElementChild);
window.shown = (el) => !!el && getComputedStyle(el).display !== "none" && getComputedStyle(el).visibility !== "hidden";

/** The ring color drawn in the driver picture (its outer circle's stroke). */
window.ringOf = (card) => {
  const src = decodeURIComponent(driverOf(card)?.getAttribute("src") ?? "");
  return src.match(/r="15\.5"[^>]*stroke="([^"]+)"/)?.[1];
};

/** A drag on the slider, as pointer events at fractions of its width. */
window.drag = (slider, fractions, { cancel = false } = {}) => {
  const rect = slider.getBoundingClientRect();
  const at = (f) => ({ clientX: rect.left + f * rect.width, clientY: rect.top + rect.height / 2, pointerId: 1, bubbles: true, composed: true });
  const [first, ...rest] = fractions;
  slider.setPointerCapture = () => {};
  slider.dispatchEvent(new PointerEvent("pointerdown", at(first)));
  for (const f of rest) slider.dispatchEvent(new PointerEvent("pointermove", at(f)));
  if (cancel) slider.dispatchEvent(new PointerEvent("pointercancel", { pointerId: 1, bubbles: true }));
  else slider.dispatchEvent(new PointerEvent("pointerup", at(fractions.at(-1))));
};

/** The calls made since a mark (hass.calls.length). */
window.callsSince = (hass, mark) => hass.calls.slice(mark);

/** A color as rgb(r, g, b), as computed styles show it. */
window.rgb = (color) => {
  const probe = document.createElement("span");
  probe.style.color = color;
  document.body.append(probe);
  const value = getComputedStyle(probe).color;
  probe.remove();
  return value;
};

/** The WCAG contrast ratio of a text color (alpha blended) on a background color. */
window.contrast = (text, background) => {
  const parse = (c) => {
    const probe = document.createElement("canvas").getContext("2d");
    probe.fillStyle = rgb(c);
    const v = probe.fillStyle;
    const m = v.match(/[\d.]+/g);
    return v.startsWith("#") ? [...v.slice(1).match(/../g).map((h) => parseInt(h, 16)), 1] : [m[0], m[1], m[2], m[3] ?? 1].map(Number);
  };
  const lum = ([r, g, b]) => {
    const lin = (v) => ((v /= 255) <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  };
  const bg = parse(background), [r, g, b, a] = parse(text);
  const fg = [r, g, b].map((v, i) => v * a + bg[i] * (1 - a));
  const [hi, lo] = [lum(fg), lum(bg)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

window.runChecks = (checks) => {
  setTimeout(async () => {
    try {
      await checks();
    } catch (err) {
      problems.push(`Checks failed: ${err.message} ${err.stack}`);
    }
    const report = document.getElementById("report");
    report.dataset.result = problems.length ? "fail" : "pass";
    report.textContent = [...problems.map((p) => `FAIL ${p}`), ...known.map((p) => `KNOWN ${p}`), ...passed.map((p) => `ok   ${p}`)].join("\n");
  }, 300);
};
