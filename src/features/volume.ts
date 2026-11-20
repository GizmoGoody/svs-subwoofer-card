// custom:svs-subwoofer-volume: a volume slider, optionally split into
// volume thresholds, each in its own color. On a group in the panel card
// whose member subwoofers' volumes differ, it spans them, and a drag moves
// them together.
import { html, nothing, type TemplateResult } from "lit";
import { classMap } from "lit/directives/class-map.js";
import { styleMap } from "lit/directives/style-map.js";
import { VOLUME_TYPE } from "../const";
import { fire, unavailable, type Config } from "../ha";
import { cssColor } from "../subwoofer/colors";
import { levelOf, sliderRange, thresholdColor, thresholdsOf, valueAt, type Range, type Threshold } from "../subwoofer/volume";
import { SvsFeature } from "./base";
import { volumeStyles } from "./styles";

// A value sent stays shown until the subwoofer reports it, or this long (ms)
const PENDING_MS = 4000;
// The arrow keys' value is sent once they stop for this long (ms)
const KEYS_MS = 600;

interface Member {
  id: string;
  value: number;
}

interface Span {
  lo: number;
  hi: number;
  members: Member[];
}

/** The event the card listens to while the slider moves: its driver follows (see the card). */
export interface VolumeInput {
  active: boolean;
  level: number;
  color?: string;
}

export class SvsVolume extends SvsFeature {
  static override styles = volumeStyles;
  static override role = "volume" as const;

  static getStubConfig(): Config {
    return { type: `custom:${VOLUME_TYPE}` };
  }

  static getConfigElement(): HTMLElement {
    return document.createElement(`${VOLUME_TYPE}-editor`);
  }

  // The value while it is dragged or keyed (a span's: how far it moved)
  private _dragging?: number;
  private _spanStart?: { at: number; span: Span };
  private _pending?: { value: number; until: number };
  private _pendingSpan?: { values: Record<string, number>; until: number };
  private _tip = false;
  private _tipTimer?: ReturnType<typeof setTimeout>;
  private _keyTimer?: ReturnType<typeof setTimeout>;
  private _pendingTimer?: ReturnType<typeof setTimeout>;

  private get _thresholds(): Threshold[] {
    return thresholdsOf(this._config);
  }

  private get _range(): Range {
    return sliderRange(this._config, this._stateObj?.attributes);
  }

  private get _attributes(): Record<string, any> {
    return this._stateObj?.attributes ?? {};
  }

  /**
   * The member subwoofers' volumes when they differ: on a group in the
   * panel card, the card lists them (svs_member_volumes); undefined when
   * there are fewer than two or they are all the same.
   */
  private get _span(): Span | undefined {
    const ids = this._attributes.svs_member_volumes;
    if (!Array.isArray(ids)) return undefined;
    const members = (ids as string[])
      .map((id) => ({ id, value: this._pendingSpan?.values[id] ?? Number(this._hass!.states[id]?.state) }))
      .filter((m) => Number.isFinite(m.value));
    if (members.length < 2) return undefined;
    const values = members.map((m) => m.value);
    const lo = Math.min(...values), hi = Math.max(...values);
    return lo === hi ? undefined : { lo, hi, members };
  }

  /** The span moved by the drag so far, in steps, never past the volume's limits. */
  private _shifted({ at, span }: { at: number; span: Span }): Span & { delta: number } {
    const a = this._attributes;
    const step = a.step ?? 1;
    const raw = Math.round(((this._dragging ?? at) - at) / step) * step;
    const delta = Math.max((a.min ?? -60) - span.lo, Math.min((a.max ?? 0) - span.hi, raw));
    return { lo: span.lo + delta, hi: span.hi + delta, delta, members: span.members.map((m) => ({ id: m.id, value: m.value + delta })) };
  }

  protected override render(): TemplateResult {
    const stateObj = this._stateObj;
    const range = this._range;
    const { min, max } = range;
    const now = Date.now();
    if (this._pendingSpan && (now > this._pendingSpan.until
      || Object.entries(this._pendingSpan.values).every(([id, v]) => Number(this._hass!.states[id]?.state) === v))) {
      this._pendingSpan = undefined;
    }
    const span = this._spanStart ? this._shifted(this._spanStart) : this._span;
    const reported = Number(stateObj?.state);
    if (this._pending && (reported === this._pending.value || now > this._pending.until)) this._pending = undefined;
    const value = span ? span.hi : this._dragging ?? this._pending?.value ?? reported;
    const known = Number.isFinite(value);
    const at = (v: number) => ((v - min) / (max - min)) * 100;
    const pct = known ? levelOf(value, range) * 100 : 0;
    const loPct = span ? levelOf(span.lo, range) * 100 : pct;
    const thresholds = this._thresholds;
    const ranged = thresholds.length > 0;
    const unit = stateObj?.attributes.unit_of_measurement;
    const text = span ? `${span.lo} to ${span.hi}${unit ? ` ${unit}` : ""}` : unit ? `${value} ${unit}` : String(value);
    // The ranges shown faintly, with a tick between each two
    const zones: TemplateResult[] = [], ticks: TemplateResult[] = [];
    let from = min;
    for (const t of ranged ? thresholds : []) {
      const to = typeof t.below === "number" ? Math.max(min, Math.min(max, t.below)) : max;
      zones.push(html`<i style=${styleMap({ width: `${Math.max(0, at(to) - at(from))}%`, background: cssColor(t.color ?? "primary") })}></i>`);
      if (to < max && to > min) ticks.push(html`<div class="tick" style=${styleMap({ left: `${at(to)}%` })}></div>`);
      from = to;
    }
    const color = ranged && known ? thresholdColor(thresholds, value) : undefined;
    // The loupe shows the color it is on, at full strength: the volume's
    // threshold color, or the feature color without thresholds. Stretched
    // over a span, it runs from the quietest's color to the loudest's.
    const loColor = span && ranged ? thresholdColor(thresholds, span.lo) : color;
    const loupe = span && loColor !== color
      ? `linear-gradient(90deg, ${cssColor(loColor ?? "primary")}, ${cssColor(color ?? "primary")})`
      : color ? cssColor(color) : "var(--feature-color)";
    const control = {
      "--fill": color ? cssColor(color) : "var(--feature-color)", "--at": `${pct}%`, "--lo": String(loPct / 100), "--hi": String(pct / 100), "--loupe": loupe,
    };
    return html`<div class=${classMap({ control: true, ranged, span: !!span, disabled: unavailable(stateObj) })} role="slider" tabindex="0"
        aria-label="Volume" data-key="volume" aria-valuemin=${min} aria-valuemax=${max} aria-valuenow=${known ? value : nothing}
        aria-valuetext=${span ? text : nothing} style=${styleMap(control)}
        @pointerdown=${this._down} @pointermove=${this._move} @pointerup=${this._up}
        @pointercancel=${this._cancel} @lostpointercapture=${this._cancel} @keydown=${this._keyDown} @keyup=${this._keyUp}>
        <div class="zones">${zones}</div>
        <div class="fill" style=${styleMap({ left: span ? `${loPct}%` : undefined, width: `${pct - (span ? loPct : 0)}%` })}></div>
        <div class="ticks">${ticks}</div>
        <div class="handle lo" style=${styleMap({ left: `${loPct}%` })}></div>
        <div class="handle hi" style=${styleMap({ left: `${pct}%`, display: known ? undefined : "none" })}></div>
        <div class="loupe ${span ? "span" : ""}" style=${styleMap({ visibility: known ? undefined : "hidden" })}></div>
      </div>
      <span class="tooltip ${this._tip ? "visible" : ""}" aria-hidden="true"
        style=${styleMap({ "--svs-tip": String((span ? (pct + loPct) / 2 : pct) / 100) })}>${known ? text : ""}</span>`;
  }

  private get _control(): HTMLElement | null {
    return this.renderRoot.querySelector(".control");
  }

  private _valueAt(ev: PointerEvent): number {
    const rect = this._control!.getBoundingClientRect();
    return valueAt((ev.clientX - rect.left) / rect.width, this._range);
  }

  private _down = (ev: PointerEvent): void => {
    ev.stopPropagation();
    // No text selection, and no native drag of one, which would cancel this drag
    ev.preventDefault();
    const control = this._control!;
    control.focus({ preventScroll: true });
    control.setPointerCapture(ev.pointerId);
    this._dragging = this._valueAt(ev);
    // Subwoofers at different volumes move together, by the drag's distance
    const span = this._span;
    this._spanStart = span ? { at: this._dragging, span } : undefined;
    this._moved(true);
  };

  private _move = (ev: PointerEvent): void => {
    if (this._dragging === undefined) return;
    this._dragging = this._valueAt(ev);
    this._moved(true);
  };

  private _up = (ev: PointerEvent): void => {
    if (this._dragging === undefined) return;
    this._dragging = this._valueAt(ev);
    this._commit();
  };

  // A cancelled drag reports no position (0, the slider's left end): it
  // ends at the last position the drag reached instead
  private _cancel = (): void => {
    if (this._dragging !== undefined) this._commit();
  };

  /** Sends where the drag or the keys ended. */
  private _commit(): void {
    if (this._spanStart) {
      const moved = this._shifted(this._spanStart);
      this._spanStart = undefined;
      this._dragging = undefined;
      if (moved.delta) this._sendSpan(moved.members);
      this._moved(false, moved.hi);
      return;
    }
    const value = this._dragging!;
    this._dragging = undefined;
    this._send(value);
    this._moved(false, value);
  }

  private _keyDown = (ev: KeyboardEvent): void => {
    const { min, max, step } = this._range;
    const delta = ({ ArrowRight: step, ArrowUp: step, ArrowLeft: -step, ArrowDown: -step, PageUp: 5 * step, PageDown: -5 * step } as Record<string, number>)[ev.key];
    if (delta === undefined) return;
    ev.preventDefault();
    const span = this._spanStart ? undefined : this._span;
    if (span) this._spanStart = { at: 0, span };
    if (this._spanStart) {
      this._dragging = (this._dragging ?? 0) + delta;
    } else {
      const current = this._dragging ?? Number(this._stateObj?.state);
      if (!Number.isFinite(current)) return;
      this._dragging = Math.max(min, Math.min(max, current + delta));
    }
    this._moved(true);
    clearTimeout(this._keyTimer);
    this._keyTimer = setTimeout(() => this._keyUp(), KEYS_MS);
  };

  // After the keys, the value stays shown a moment
  private _keyUp = (): void => {
    if (this._dragging === undefined) return;
    clearTimeout(this._keyTimer);
    this._commit();
    this._showTip(true);
    this._showTip(false, 500);
  };

  private _showTip(visible: boolean, delay = 0): void {
    clearTimeout(this._tipTimer);
    if (visible || !delay) {
      this._tip = visible;
      this.requestUpdate();
    } else {
      this._tipTimer = setTimeout(() => this._showTip(false), delay);
    }
  }

  /** Draws the slider where it is, and tells the card it moves, so its driver follows and shakes. */
  private _moved(active: boolean, value = this._dragging): void {
    const level = this._spanStart ? this._shifted(this._spanStart).hi : value!;
    this._showTip(active);
    this.requestUpdate();
    const thresholds = this._thresholds;
    const detail: VolumeInput = { active, level: levelOf(level, this._range), color: thresholds.length ? thresholdColor(thresholds, level) : undefined };
    fire(this, "svs-volume-input", detail);
  }

  private _send(value: number): void {
    this._pending = { value, until: Date.now() + PENDING_MS };
    this._drawLater();
    this._hass!.callService("number", "set_value", { entity_id: this._entity, value });
  }

  /** Sets each subwoofer's own volume, so their differences stay as they were. */
  private _sendSpan(members: Member[]): void {
    this._pendingSpan = { values: Object.fromEntries(members.map((m) => [m.id, m.value])), until: Date.now() + PENDING_MS };
    this._drawLater();
    for (const m of members) this._hass!.callService("number", "set_value", { entity_id: m.id, value: m.value });
  }

  // When the wait for the subwoofer's report is over, the slider shows what it reports
  private _drawLater(): void {
    clearTimeout(this._pendingTimer);
    this._pendingTimer = setTimeout(() => this.requestUpdate(), PENDING_MS + 100);
  }
}
