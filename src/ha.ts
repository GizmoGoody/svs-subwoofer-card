// What the card uses of Home Assistant's frontend: its types (as far as the
// card reads them), events and a few shared helpers. Taken from the Prusa
// Connect card.

export interface HassEntity {
  entity_id: string;
  state: string;
  attributes: Record<string, any>;
  last_changed?: string;
  last_updated?: string;
}

export interface EntityEntry {
  entity_id: string;
  device_id?: string | null;
  platform?: string;
  translation_key?: string | null;
}

export interface DeviceEntry {
  id: string;
  name?: string | null;
  name_by_user?: string | null;
  identifiers?: [string, string][];
}

export interface HomeAssistant {
  states: Record<string, HassEntity>;
  entities?: Record<string, EntityEntry>;
  devices?: Record<string, DeviceEntry>;
  callService(domain: string, service: string, data?: Record<string, unknown>): unknown;
  [key: string]: unknown;
}

/** A card's or a feature's configuration: its own options, checked where they are read. */
export type Config = Record<string, any>;

/** The context Home Assistant gives a tile feature: the card's entity. */
export interface FeatureContext {
  entity_id?: string;
}

export interface CardHelpers {
  createCardElement(config: Config): HTMLElement;
}

declare global {
  interface Window {
    loadCardHelpers?: () => Promise<CardHelpers>;
    customCards?: Record<string, unknown>[];
    customCardFeatures?: Record<string, unknown>[];
  }
}

/** Whether a state is known: neither unknown nor unavailable. */
export const known = (stateObj?: HassEntity): stateObj is HassEntity =>
  !!stateObj && !["unknown", "unavailable"].includes(stateObj.state);

export const unavailable = (stateObj?: HassEntity): boolean => !stateObj || stateObj.state === "unavailable";

export function fire(el: EventTarget, type: string, detail?: unknown): void {
  el.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true }));
}

/** A select selector of [value, label] pairs. */
export const select = (options: [string, string][]) => ({
  select: { mode: "dropdown", options: options.map(([value, label]) => ({ value, label })) },
});

/** Whether two option values are the same (lists and sets of options by their contents). */
export const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

/** A deep copy of a configuration. */
export const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value));

/** All elements matching selector inside root and its shadow roots, a few deep. */
export function findAllDeep(root: ParentNode | null | undefined, selector: string, depth = 5, out: Element[] = []): Element[] {
  if (!root || depth < 0) return out;
  out.push(...root.querySelectorAll(selector));
  for (const el of root.querySelectorAll("*")) if (el.shadowRoot) findAllDeep(el.shadowRoot, selector, depth - 1, out);
  return out;
}

/** The first element matching selector inside root and its shadow roots. */
export function findDeep(root: ParentNode | null | undefined, selector: string, depth = 5): Element | null {
  if (!root || depth < 0) return null;
  const found = root.querySelector(selector);
  if (found) return found;
  for (const el of root.querySelectorAll("*")) {
    const hit = el.shadowRoot && findDeep(el.shadowRoot, selector, depth - 1);
    if (hit) return hit;
  }
  return null;
}

/** Add a style sheet to a shadow root once; false when the root does not take it. */
export function adopt(root: ShadowRoot, sheet: CSSStyleSheet): boolean {
  try {
    if (!root.adoptedStyleSheets.includes(sheet)) root.adoptedStyleSheets = [...root.adoptedStyleSheets, sheet];
    return true;
  } catch {
    return false;
  }
}

export function sheetOf(css: string): CSSStyleSheet {
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(css);
  return sheet;
}

/**
 * Answers Home Assistant's "states" context inside an element, as Home
 * Assistant's own provider does (the Lit context protocol), with the states
 * the card changed, so the tile card's state content and its editor's State
 * content picker see the subwoofer attributes. A request made before the
 * states are known is answered once they are.
 */
type ContextRequest = Event & { context?: unknown; subscribe?: boolean; callback: (value: unknown, unsubscribe?: () => void) => void };
export class StatesProvider {
  private _states?: Record<string, HassEntity>;
  private _waiting: ContextRequest[] = [];
  private _subscribers = new Map<ContextRequest["callback"], () => void>();

  constructor(host: EventTarget) {
    host.addEventListener("context-request", (event) => {
      const ev = event as ContextRequest;
      if (ev.context !== "states") return;
      ev.stopPropagation();
      if (this._states === undefined) this._waiting.push(ev);
      else this._answer(ev);
    });
  }

  private _answer(ev: ContextRequest): void {
    if (!ev.subscribe) {
      ev.callback(this._states);
      return;
    }
    // The consumer expects the same unsubscribe function with every value
    const unsubscribe = () => this._subscribers.delete(ev.callback);
    this._subscribers.set(ev.callback, unsubscribe);
    ev.callback(this._states, unsubscribe);
  }

  set states(states: Record<string, HassEntity>) {
    if (states === this._states) return;
    this._states = states;
    for (const ev of this._waiting.splice(0)) this._answer(ev);
    for (const [callback, unsubscribe] of this._subscribers) callback(states, unsubscribe);
  }
}

/** Define an element once (a dashboard can load the card twice). */
export function define(name: string, element: CustomElementConstructor): void {
  if (!customElements.get(name)) customElements.define(name, element);
}

export const reducedMotion = (): boolean => !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
