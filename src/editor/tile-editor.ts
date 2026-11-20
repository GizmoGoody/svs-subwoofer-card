// The tile card's own editor, with the options the SVS Subwoofer card sets
// itself left out, as the Prusa Connect card does it. It is the tile card's
// editor class, so it keeps every future change to it; if a Home Assistant
// update renames its form layout, it still works and shows those options again.
import { TILE_EDITOR_TYPE } from "../const";
import type { Config, HomeAssistant } from "../ha";

// The icon is the driver, always shown as the entity's picture
const HIDDEN_TILE_OPTIONS = ["icon", "show_entity_picture"];

export type TileEditor = HTMLElement & {
  hass?: HomeAssistant; lovelace?: unknown; setConfig(config: Config): void;
  // The entities the entity picker offers (the SVS Subwoofer volumes), and a helper under it
  svsEntities?: string[]; svsEntityHelper?: string;
};

function hideOptions(schema: Config[], entities?: string[]): Config[] {
  return schema
    .filter((item) => !HIDDEN_TILE_OPTIONS.includes(item.name))
    .map((item) => {
      if (Array.isArray(item.schema)) return { ...item, schema: hideOptions(item.schema, entities) };
      if (item.name === "entity" && entities) return { ...item, selector: { entity: { include_entities: entities } } };
      return item;
    });
}

type Base = new () => HTMLElement & { _schema?: unknown; _computeHelperCallback?: unknown };

function tileEditorType(): string | null {
  if (customElements.get(TILE_EDITOR_TYPE)) return TILE_EDITOR_TYPE;
  const Base = customElements.get("hui-tile-card-editor") as Base | undefined;
  if (!Base) return null;
  customElements.define(TILE_EDITOR_TYPE, class extends Base {
    svsEntities?: string[];
    svsEntityHelper?: string;

    constructor() {
      super();
      // A helper under the entity picker, as Home Assistant's editors show one under a field
      const helper = this._computeHelperCallback;
      if (typeof helper === "function") {
        this._computeHelperCallback = (schema: Config) =>
          (schema.name === "entity" && this.svsEntityHelper) || helper.call(this, schema);
      }
      const original = this._schema;
      if (typeof original !== "function") return;
      let lastIn: unknown, lastKey: string | undefined, lastOut: unknown;
      this._schema = (...args: unknown[]) => {
        const schema = original.apply(this, args);
        const key = (this.svsEntities ?? []).join(",");
        if (schema !== lastIn || key !== lastKey) {
          lastIn = schema;
          lastKey = key;
          lastOut = Array.isArray(schema) ? hideOptions(schema, this.svsEntities) : schema;
        }
        return lastOut;
      };
    }
  });
  return TILE_EDITOR_TYPE;
}

/** The tile card's editor, once Home Assistant has loaded it (the card helpers load the tile card on demand). */
export async function createTileEditor(entity: string): Promise<TileEditor> {
  const helpers = await window.loadCardHelpers!();
  helpers.createCardElement({ type: "tile", entity });
  await customElements.whenDefined("hui-tile-card");
  const tileCard = customElements.get("hui-tile-card") as unknown as { getConfigElement(): Promise<TileEditor> };
  const original = await tileCard.getConfigElement();
  const type = tileEditorType();
  return type ? (document.createElement(type) as TileEditor) : original;
}
