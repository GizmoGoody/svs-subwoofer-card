// The features' styles: Home Assistant's feature variables. On the SVS
// card, Flat and Console give each control a solid backing
// (--svs-feature-backing), and Console (the svs-console attribute) makes the
// buttons keys that press in.
import { css } from "lit";

export const featureStyles = css`
  :host { display: block; }
  .control {
    position: relative; height: var(--feature-height, 42px);
    border-radius: var(--feature-border-radius, 12px); overflow: hidden;
    background: var(--svs-feature-backing, var(--svs-feature-scrim, transparent));
  }
  [disabled], .disabled { opacity: .5; pointer-events: none; }
`;

// Console: a key that presses in
const keyStyles = css`
  :host([svs-console]) button {
    background-image: linear-gradient(180deg, rgba(255,255,255,.35), rgba(255,255,255,0) 45%, rgba(0,0,0,.18));
    box-shadow: inset 0 1px 0 rgba(255,255,255,.55), inset 0 -2px 2px rgba(0,0,0,.3), 0 2px 3px rgba(0,0,0,.5);
    transition: transform 120ms ease-in-out, box-shadow 120ms ease-in-out;
  }
  :host([svs-console]) button:active,
  :host([svs-console]) button[aria-pressed="true"] {
    transform: translateY(1px) scale(.96);
    background-image: linear-gradient(180deg, rgba(0,0,0,.22), rgba(0,0,0,0) 55%, rgba(255,255,255,.08));
    box-shadow: inset 0 2px 4px rgba(0,0,0,.55), inset 0 -1px 0 rgba(255,255,255,.2);
  }
`;

// A row of buttons: each tinted in its color, the active one filled
export const buttonRowStyles = [featureStyles, css`
  .row { display: flex; gap: var(--feature-button-spacing, 12px); height: var(--feature-height, 42px); }
  button {
    flex: 1 1 0; min-width: 0; height: 100%; padding: 0 4px; border: 0; cursor: pointer;
    position: relative; overflow: hidden; display: grid; place-items: center;
    border-radius: var(--feature-border-radius, 12px);
    background: var(--svs-feature-backing, var(--svs-feature-scrim, transparent));
    color: var(--svs-text, var(--primary-text-color)); font: inherit; font-size: var(--ha-font-size-s, 12px); font-weight: 500;
  }
  button::before { content: ""; position: absolute; inset: 0; background: var(--c, var(--feature-color)); opacity: .2; transition: opacity 180ms ease-in-out; }
  button:hover::before { opacity: .35; }
  button[aria-pressed="true"]::before { opacity: 1; }
  button[aria-pressed="true"] { color: var(--svs-on-color, #fff); }
  button:focus-visible { outline: 2px solid var(--c, var(--feature-color)); outline-offset: 2px; }
  button > * { position: relative; }
  /* Console: a selected key keeps the color of the others and only looks
     pressed in (a filled color would cover its 3D shading) */
  :host([svs-console]) button[aria-pressed="true"]::before { opacity: .2; }
  :host([svs-console]) button[aria-pressed="true"]:hover::before { opacity: .35; }
  :host([svs-console]) button[aria-pressed="true"] { color: var(--svs-text, var(--primary-text-color)); }
  ha-icon { --mdc-icon-size: 22px; }
  span { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
`, keyStyles];

// The presets: on Console, each key in its color at full strength, as the
// volume slider shows its colors, with text that reads on that color. The
// key's shading lies over the color, so a key still looks raised, and
// pressed in when selected.
export const presetStyles = [...buttonRowStyles, css`
  .cycle { gap: 6px; grid-auto-flow: column; justify-content: center; align-items: center; }
  :host([svs-console]) button::before,
  :host([svs-console]) button:hover::before,
  :host([svs-console]) button[aria-pressed="true"]::before,
  :host([svs-console]) button[aria-pressed="true"]:hover::before { opacity: 1; }
  :host([svs-console]) button,
  :host([svs-console]) button[aria-pressed="true"] { color: var(--svs-on-color, #fff); background-image: none; }
  :host([svs-console]) button::after {
    content: ""; position: absolute; inset: 0; border-radius: inherit; pointer-events: none;
    background: linear-gradient(180deg, rgba(255,255,255,.35), rgba(255,255,255,0) 45%, rgba(0,0,0,.18));
  }
  :host([svs-console]) button:active::after,
  :host([svs-console]) button[aria-pressed="true"]::after {
    background: linear-gradient(180deg, rgba(0,0,0,.22), rgba(0,0,0,0) 55%, rgba(255,255,255,.08));
  }
  :host([svs-console]) button > * { z-index: 1; }
`];

export const volumeStyles = [featureStyles, css`
  :host { position: relative; }
  .control { cursor: pointer; touch-action: none; outline: none; user-select: none; -webkit-user-select: none; }
  /* The value callout above the slider while it moves, as on Home
     Assistant's own sliders; outside the control, which clips */
  .tooltip {
    pointer-events: none; user-select: none; position: absolute; z-index: 3;
    top: -4px; left: calc(min(max(var(--svs-tip, 0) * 100%, 0%), 100%));
    transform: translate3d(-50%, -100%, 0);
    background-color: var(--svs-tip-background, var(--clear-background-color)); color: var(--svs-text, var(--primary-text-color));
    font-size: var(--control-slider-tooltip-font-size, var(--ha-font-size-m, 14px));
    border-radius: var(--ha-border-radius-lg, 12px); padding: .2em .4em;
    opacity: 0; white-space: nowrap; box-shadow: 0 2px 5px rgba(0, 0, 0, .2);
    transition: opacity 180ms ease-in-out, left 180ms ease-in-out;
  }
  .tooltip.visible { opacity: 1; }
  .control:focus-visible { box-shadow: 0 0 0 2px var(--fill, var(--feature-color)); }
  .zones { position: absolute; inset: 0; display: flex; }
  .zones i { display: block; height: 100%; opacity: .2; }
  .control:not(.ranged) .zones { background: var(--feature-color); opacity: .2; }
  .fill { position: absolute; inset: 0 auto 0 0; background: var(--fill, var(--feature-color)); }
  .tick { position: absolute; top: 25%; bottom: 25%; width: 2px; margin-left: -1px; border-radius: 1px; background: var(--primary-text-color); opacity: .35; }
  .handle { position: absolute; top: 25%; bottom: 25%; width: 4px; margin-left: -10px; border-radius: 2px; background: #fff; box-shadow: 0 0 2px rgba(0, 0, 0, .45); }
  /* Console: no bar, so the whole range stays visible. A round loupe in a
     beveled bezel of the subwoofer's finish (--svs-bezel, set by the card)
     magnifies the color the volume is set at. */
  .loupe { display: none; }
  :host([svs-console]) .fill, :host([svs-console]) .handle { display: none; }
  :host([svs-console]) .zones i { opacity: 1; }
  :host([svs-console]) .loupe {
    --size: calc(var(--feature-height, 42px) - 4px);
    --bezel: var(--svs-bezel, var(--card-background-color, #c3c8cc));
    display: block; position: absolute; top: 50%; width: var(--size); height: var(--size);
    left: clamp(calc(var(--size) / 2 + 2px), var(--at), calc(100% - var(--size) / 2 - 2px));
    transform: translate(-50%, -50%); border-radius: 50%; pointer-events: none;
    background: conic-gradient(from 210deg,
      color-mix(in srgb, var(--bezel), #fff 45%), color-mix(in srgb, var(--bezel), #000 45%) 25%,
      color-mix(in srgb, var(--bezel), #fff 20%) 45%, color-mix(in srgb, var(--bezel), #000 50%) 65%,
      color-mix(in srgb, var(--bezel), #fff 45%) 85%, var(--bezel));
    box-shadow: 0 0 3px rgba(0,0,0,.55), inset 0 1px 0 rgba(255,255,255,.6), inset 0 -1px 0 rgba(0,0,0,.35);
  }
  :host([svs-console]) .loupe::after {
    content: ""; position: absolute; inset: 4px; border-radius: 50%;
    background:
      radial-gradient(70% 55% at 32% 25%, rgba(255,255,255,.75), rgba(255,255,255,0) 60%),
      radial-gradient(circle, rgba(0,0,0,0) 60%, rgba(0,0,0,.18)),
      var(--loupe);
    box-shadow: inset 0 0 3px rgba(0,0,0,.5);
  }
  /* Subwoofers at different volumes (a group in the panel card): the loupe
     stretches from the quietest to the loudest */
  :host([svs-console]) .loupe.span {
    left: calc(2px + var(--lo) * (100% - var(--size) - 4px));
    width: calc(var(--size) + (var(--hi) - var(--lo)) * (100% - var(--size) - 4px));
    transform: translate(0, -50%);
  }
  :host([svs-console]) .loupe.span, :host([svs-console]) .loupe.span::after { border-radius: var(--ha-border-radius-pill, 9999px); }
  .handle.lo { display: none; }
  .control.span .handle.lo { display: block; }
`];
