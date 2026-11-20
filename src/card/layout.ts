// What the card measures and styles in the tile card it wraps: the areas
// the feature controls take (for Flat and Console), the Console look of
// the controls, and the finish across an expander card around it.
import { adopt, findAllDeep, findDeep, sheetOf } from "../ha";
import { FEATURE_TAGS } from "../features";
import { drawFinish } from "../subwoofer/finishes";
import { HA_CONTROL_SHEET } from "./styles";

export interface Area {
  x: number;
  y: number;
  w: number;
  h: number;
  radius: number;
}

/** A box in an element's own pixels (the card can be scaled in the editor). */
export function boxIn(frame: HTMLElement, el: Element): Omit<Area, "radius"> | null {
  const origin = frame.getBoundingClientRect();
  const scale = origin.width / frame.offsetWidth || 1;
  const r = el.getBoundingClientRect();
  if (!r.width || !r.height) return null;
  return { x: (r.left - origin.left) / scale, y: (r.top - origin.top) / scale, w: r.width / scale, h: r.height / scale };
}

/**
 * The areas the feature controls take, in the frame's own pixels: each
 * control, except that each preset and standby button counts on its own
 * (so the finish shows between them). Read from the tile card's rendered
 * layout; if it ever changes, the areas are simply not drawn. watch is
 * given each shadow root the features render into, so they are measured
 * again when they change.
 */
export function featureAreas(frame: HTMLElement, tileRoot: ShadowRoot, watch: (root?: Node | null) => void): Area[] {
  const areas: Area[] = [];
  for (const group of tileRoot.querySelectorAll("hui-card-features")) {
    watch(group.shadowRoot);
    for (const wrap of group.shadowRoot?.querySelectorAll("hui-card-feature") ?? []) {
      const inner: ParentNode = wrap.shadowRoot ?? wrap;
      watch(wrap.shadowRoot);
      const ours = findDeep(inner, FEATURE_TAGS.join(", "));
      watch(ours?.shadowRoot);
      const keys = [...(ours?.shadowRoot?.querySelectorAll("button, [role=slider]") ?? [])];
      const element = [...inner.children].find((c) => c.tagName !== "STYLE");
      for (const el of keys.length ? keys : element ? [element] : []) {
        const b = boxIn(frame, el);
        if (b) areas.push({ ...b, radius: parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0 });
      }
    }
  }
  return areas;
}

let haControlSheet: CSSStyleSheet | undefined;

/** Console: the SVS features' buttons become keys, and Home Assistant's toggles a slide. */
export function styleControls(tileRoot: ShadowRoot | null | undefined, keys: boolean): void {
  for (const el of findAllDeep(tileRoot, FEATURE_TAGS.join(", "))) el.toggleAttribute("svs-console", keys);
  for (const el of findAllDeep(tileRoot, "ha-control-switch")) {
    const root = el.shadowRoot;
    if (!root) continue;
    if (!adopt(root, (haControlSheet ??= sheetOf(HA_CONTROL_SHEET)))) {
      console.warn("SVS Subwoofer card: could not style Home Assistant's toggle");
      return;
    }
    el.toggleAttribute("svs-slide", keys);
  }
}

/** The expander card (custom:expander-card) an element sits in, and whether the element is its header (title card). */
export function expanderOf(el: Element): { expander: HTMLElement; header: boolean } | undefined {
  let header = false;
  for (let node: Node | null = el; node; node = node.parentNode ?? (node as ShadowRoot).host ?? null) {
    if ((node as Element).classList?.contains("title-card-container")) header = true;
    if ((node as Element).localName === "expander-card") return { expander: node as HTMLElement, header };
  }
  return undefined;
}

const EXPANDER_STYLE = "svs-subwoofer-finish";

/**
 * With Finish extent Container, the finish covers the whole expander card,
 * so the header and the cards inside it read as one card: the header card
 * draws it on the expander's own card. This styles the expander card from
 * outside; if a change to that card breaks it, the expander keeps its usual
 * background. Returns the expander's card, to be watched for its size.
 */
export function paintExpander(expander: HTMLElement, finish: string | undefined, pattern: number): HTMLElement | undefined {
  const root = expander.shadowRoot;
  if (!root) return undefined;
  let style = root.getElementById(EXPANDER_STYLE);
  if (!finish) {
    style?.remove();
    return undefined;
  }
  const surface = root.querySelector<HTMLElement>("ha-card");
  if (!surface) return undefined;
  const w = surface.clientWidth, h = surface.clientHeight;
  if (!w || !h) return surface;
  const key = `${finish}|${pattern}|${w}x${h}`;
  if (style?.dataset.drawn === key) return surface;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return surface;
  drawFinish(ctx, finish, pattern, w, h);
  if (!style) {
    style = document.createElement("style");
    style.id = EXPANDER_STYLE;
    root.append(style);
  }
  style.dataset.drawn = key;
  style.textContent = `ha-card { background: url("${canvas.toDataURL()}") center / 100% 100% no-repeat !important; ` +
    "box-shadow: inset 0 1px 0 rgba(255, 255, 255, .16), inset 0 -1px 0 rgba(0, 0, 0, .4) !important; }";
  return surface;
}
