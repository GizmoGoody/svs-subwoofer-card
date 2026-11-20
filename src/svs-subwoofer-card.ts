// SVS Subwoofer dashboard card and tile features, for the SVS Subwoofer
// integration (svs_subwoofer).
//
// Tile features (they work in any tile card, and in the SVS card):
// - custom:svs-subwoofer-presets  one button per preset, each in its own color
// - custom:svs-subwoofer-volume   a volume slider, optionally colored by volume thresholds
// - custom:svs-subwoofer-standby  the standby mode as buttons
// Each finds its entity on the same device as the card's entity, so a card
// for a subwoofer group controls the group, and a card for one subwoofer
// controls that subwoofer.
//
// custom:svs-subwoofer-card is Home Assistant's tile card, wrapped (see
// card/card.ts); custom:svs-subwoofer-panel-card (a prototype) is that card
// for a group, with its member subwoofers below it on one surface.
import { printBadge } from "@gizmogoody/card-badge";
import { CARD_TYPE, EDITOR_TYPE, PANEL_EDITOR_TYPE, PANEL_TYPE, VERSION } from "./const";
import { define, type HomeAssistant } from "./ha";
import { SvsSubwooferCard } from "./card/card";
import { SvsSubwooferPanelCard } from "./card/panel";
import { SvsSubwooferCardEditor } from "./editor/card-editor";
import { SvsSubwooferPanelCardEditor } from "./editor/panel-editor";
import { FEATURES, SvsPresetsEditor, SvsVolumeEditor } from "./features";
import { isSvs, sibling } from "./subwoofer/device";

if (!customElements.get(CARD_TYPE)) {
  for (const [tag, feature] of FEATURES) define(tag, feature);
  define(`${FEATURES[0][0]}-editor`, SvsPresetsEditor);
  define(`${FEATURES[1][0]}-editor`, SvsVolumeEditor);
  define(CARD_TYPE, SvsSubwooferCard);
  define(EDITOR_TYPE, SvsSubwooferCardEditor);
  define(PANEL_TYPE, SvsSubwooferPanelCard);
  define(PANEL_EDITOR_TYPE, SvsSubwooferPanelCardEditor);

  // Each feature is offered for any entity of a subwoofer or group that has its entity
  window.customCardFeatures = window.customCardFeatures || [];
  window.customCardFeatures.push(...FEATURES.map(([type, feature, name, configurable]) => ({
    type,
    name,
    isSupported: (hass: HomeAssistant, context?: { entity_id?: string }) =>
      isSvs(hass, context?.entity_id) && !!sibling(hass, context!.entity_id, feature.role),
    ...(configurable ? { configurable: true } : {}),
  })));

  window.customCards = window.customCards || [];
  window.customCards.push({
    type: CARD_TYPE,
    name: "SVS Subwoofer",
    description: "A tile card for an SVS subwoofer or subwoofer group, with an optional SVS cabinet finish.",
    preview: true,
    documentationURL: "https://github.com/GizmoGoody/svs-subwoofer-card",
  }, {
    type: PANEL_TYPE,
    name: "SVS Subwoofer panel (prototype)",
    description: "The SVS Subwoofer card with its member subwoofers below it, on one surface.",
    preview: true,
    documentationURL: "https://github.com/GizmoGoody/svs-subwoofer-card#svs-subwoofer-panel-card",
  });

  printBadge({
    icon: "🔊",
    name: "SVS Subwoofer Card",
    version: VERSION,
    description: "Controls an SVS subwoofer's volume, presets, and standby mode.",
    repo: "svs-subwoofer-card",
  });
}
