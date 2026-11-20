// The card's and the panel's styles, and the sheets they add to Home
// Assistant's elements. Every corner, color and size comes from the theme.
import { css, unsafeCSS } from "lit";
import { BACKING } from "../subwoofer/finishes";

export const cardStyles = css`
  :host { display: block; height: 100%; }
  .frame {
    position: relative; height: 100%; box-sizing: border-box; isolation: isolate;
    /* Exactly the tile card's own corners (ha-card), from the theme */
    border-radius: var(--ha-card-border-radius, var(--ha-border-radius-lg));
  }
  /* Only the finish layers are clipped to the rounded outline; the tile
     card is not, so its callouts (such as a slider's value tooltip) can
     extend past the card's edge, as on a plain tile card */
  .clip { position: absolute; inset: 0; border-radius: inherit; overflow: hidden; pointer-events: none; }
  canvas { position: absolute; inset: 0; width: 100%; height: 100%; display: none; pointer-events: none; }
  .finished canvas { display: block; }
  .finished::after {
    content: ""; position: absolute; inset: 0; border-radius: inherit; pointer-events: none; z-index: 2;
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, .16), inset 0 -1px 0 rgba(0, 0, 0, .4);
  }
  .tile { position: relative; display: block; height: 100%; }
  .finished .tile, .through .tile {
    --ha-card-background: transparent; --card-background-color: transparent;
    --ha-card-box-shadow: none; --ha-card-border-color: transparent;
    --ha-card-backdrop-filter: none;
  }
  /* On a finish, its own text colors (--svs-text for the controls, which a
     theme does not set), and the value callout in the finish's tone */
  .tile.dark {
    --primary-text-color: rgba(255, 255, 255, .95); --secondary-text-color: rgba(235, 235, 240, .7);
    --svs-text: rgba(255, 255, 255, .95); --svs-tip-background: #2b2c30; text-shadow: 0 1px 2px rgba(0, 0, 0, .8);
    /* Match: the finish shows through the controls, dimmed enough for their text */
    --svs-feature-scrim: rgba(0, 0, 0, .45);
  }
  .tile.light {
    --primary-text-color: rgba(0, 0, 0, .85); --secondary-text-color: rgba(40, 40, 48, .62);
    --svs-text: rgba(0, 0, 0, .85); --svs-tip-background: #f6f7f9;
    --svs-feature-scrim: rgba(255, 255, 255, .45);
  }
  /* Flat and Console: no finish shows through a control */
  .tile.dark.solid { --svs-feature-backing: ${unsafeCSS(BACKING.dark)}; }
  .tile.light.solid { --svs-feature-backing: ${unsafeCSS(BACKING.light)}; }
  /* With the finish on the expander card or the panel, this card is see-through */
  .through canvas, .through::after { display: none; }
  /* Features style: a flat patch of the finish's base color, or a channel
     pressed into the panel, behind each feature control */
  #areas { position: absolute; inset: 0; pointer-events: none; }
  .area { position: absolute; box-sizing: border-box; }
  .area.flat { background: var(--flat); box-shadow: 0 0 3px 1px var(--flat); }
  .area.console {
    background: linear-gradient(180deg, rgba(0, 0, 0, .22), rgba(0, 0, 0, .08));
    box-shadow:
      inset 0 2px 3px rgba(0, 0, 0, .55), inset 0 1px 1px rgba(0, 0, 0, .4),
      inset 0 -1px 0 rgba(255, 255, 255, .14), 0 1px 0 rgba(255, 255, 255, .18);
  }
  /* No backing: a soft shadow keeps the symbol readable on any finish */
  .badge {
    position: absolute; z-index: 3; width: 18px; height: 18px; margin: -9px 0 0 -9px; padding: 0; border: 0;
    display: none; place-items: center; background: none;
    border-radius: var(--ha-border-radius-pill, 9999px);
    color: var(--secondary-text-color); pointer-events: none; cursor: default;
    filter: drop-shadow(0 0 1px rgba(0, 0, 0, .9)) drop-shadow(0 0 2px rgba(0, 0, 0, .6));
  }
  .badge.on { display: grid; }
  .badge.connected { color: var(--blue-color, #2196f3); }
  .badge.some { color: var(--warning-color, #ffa600); }
  .badge svg { width: 16px; height: 16px; }
  .standby-badge {
    position: absolute; z-index: 3; width: 14px; height: 14px; margin: -7px 0 0 -7px; display: none;
    place-items: center; pointer-events: none;
    font: 700 11px/1 var(--ha-font-family-body, inherit); color: var(--primary-text-color);
    filter: drop-shadow(0 0 1px rgba(0, 0, 0, .9)) drop-shadow(0 0 2px rgba(0, 0, 0, .6));
  }
  .standby-badge.on { display: grid; }
  /* Without a finish, the badges get a halo in the card's own color */
  .frame:not(.finished) .badge, .frame:not(.finished) .standby-badge {
    filter: drop-shadow(0 0 1px var(--ha-card-background, var(--card-background-color, #fff)))
      drop-shadow(0 0 2px var(--ha-card-background, var(--card-background-color, #fff)));
  }
  /* On a light finish, the badges get a light halo */
  .light-finish .badge, .light-finish .standby-badge {
    filter: drop-shadow(0 0 1px rgba(255, 255, 255, .95)) drop-shadow(0 0 2px rgba(255, 255, 255, .7));
  }
  .light-finish .standby-badge { color: rgba(0, 0, 0, .85); }
`;

export const panelStyles = css`
  :host { display: block; }
  .panel {
    position: relative; isolation: isolate; box-sizing: border-box;
    border-radius: var(--ha-card-border-radius, var(--ha-border-radius-lg));
    background: var(--ha-card-background, var(--card-background-color, #fff));
    -webkit-backdrop-filter: var(--ha-card-backdrop-filter, none); backdrop-filter: var(--ha-card-backdrop-filter, none);
    border: var(--ha-card-border-width, 1px) solid var(--ha-card-border-color, var(--divider-color, #e0e0e0));
    box-shadow: var(--ha-card-box-shadow, none);
    color: var(--primary-text-color);
  }
  canvas { position: absolute; inset: 0; width: 100%; height: 100%; display: none; pointer-events: none; }
  /* Only the finish is clipped to the outline, so the members' callouts can
     extend past the panel's edge */
  .clip { position: absolute; inset: 0; border-radius: inherit; overflow: hidden; pointer-events: none; z-index: -1; }
  .finished { -webkit-backdrop-filter: none; backdrop-filter: none; border-color: transparent; }
  .finished canvas { display: block; }
  .finished::after {
    content: ""; position: absolute; inset: 0; border-radius: inherit; pointer-events: none;
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, .16), inset 0 -1px 0 rgba(0, 0, 0, .4);
  }
  .dark { --primary-text-color: rgba(255, 255, 255, .95); --divider-color: rgba(255, 255, 255, .14); }
  .light { --primary-text-color: rgba(0, 0, 0, .85); --divider-color: rgba(0, 0, 0, .12); }
  .members { display: grid; }
  .panel:not(.open) .members { display: none; }
`;

/**
 * In the panel card, the cards are parts of one surface: no hover highlight
 * of their own (a tap still shows). The tile card's container sets its own
 * hover opacity on itself, so it is overridden from the tile card's shadow
 * root, where the container sits.
 */
export const TILE_SHEET = ":host(.embedded) ha-tile-container { --ha-ripple-hover-opacity: 0; }";

/**
 * Console styling for Home Assistant's own toggle feature: a slide with a
 * beveled tab. This styles parts inside Home Assistant's controls; if an
 * update renames them, they keep their usual look.
 */
export const HA_CONTROL_SHEET = `
  :host([svs-slide]) .switch .background,
  :host([svs-slide]) .switch:hover .background,
  :host([svs-slide]) .switch:focus-visible .background { opacity: 0 !important; }
  :host([svs-slide]) { --control-switch-padding: 0px !important; }
  :host([svs-slide]) .switch { padding: 0 !important; }
  :host([svs-slide]) .switch .button {
    position: relative;
    background-color: var(--control-switch-on-color);
    background-image: linear-gradient(180deg, rgba(255,255,255,.4), rgba(255,255,255,.05) 40%, rgba(0,0,0,.05) 60%, rgba(0,0,0,.3));
    box-shadow:
      inset 0 1px 0 rgba(255,255,255,.6), inset 0 -1px 0 rgba(0,0,0,.35),
      inset 1px 0 0 rgba(255,255,255,.25), inset -1px 0 0 rgba(0,0,0,.25),
      0 1px 2px rgba(0,0,0,.55);
  }
  :host([svs-slide]) .switch .button ha-svg-icon,
  :host([svs-slide]) .switch .button slot { display: none; }
`;
