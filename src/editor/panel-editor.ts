// The panel card's editor: the main subwoofer's tile card options, the SVS
// Subwoofer section, then the member subwoofers, laid out like Home
// Assistant's stack card editor: a numbered tab for each member subwoofer
// (edited like any tile card), and a plus button that adds one.
import { css, html, LitElement, nothing, type TemplateResult } from "lit";
import { EDITOR_TYPE, VOLUME_TYPE } from "../const";
import { copy, fire, same, StatesProvider, type Config, type HomeAssistant } from "../ha";
import { defaultMemberNames, subwoofers, svsVolumes, withSubwooferAttributes } from "../subwoofer/device";
import { markPanelVolume } from "../features/editors";
import { membersOf, newMember, PANEL_KEYS, tileConfig } from "../card/options";
import { editorStyles, type SvsSubwooferCardEditor } from "./card-editor";
import { createTileEditor, type TileEditor } from "./tile-editor";

// Material Design Icons used by the editor
const MDI = {
  plus: "M19,13H13V19H11V13H5V11H11V5H13V11H19V13Z",
  left: "M20,11V13H8L13.5,18.5L12.08,19.92L4.16,12L12.08,4.08L13.5,5.5L8,11H20Z",
  right: "M4,11V13H16L10.5,18.5L11.92,19.92L19.84,12L11.92,4.08L10.5,5.5L16,11H4Z",
  delete: "M19,4H15.5L14.5,3H9.5L8.5,4H5V6H19M6,19A2,2 0 0,0 8,21H16A2,2 0 0,0 18,19V7H6V19Z",
  copy: "M19,21H8V7H19M19,5H8A2,2 0 0,0 6,7V21A2,2 0 0,0 8,23H19A2,2 0 0,0 21,21V7A2,2 0 0,0 19,5M16,1H4A2,2 0 0,0 2,3V17H4V3H16V1Z",
};

const VOLUME = `custom:${VOLUME_TYPE}`;
const label = (s: Config) => s.label;
const helper = (s: Config) => s.helper;

export class SvsSubwooferPanelCardEditor extends LitElement {
  static override styles = [editorStyles, css`
    .content { display: block; }
    .hint { margin: 0 0 8px; color: var(--secondary-text-color); font-size: var(--ha-font-size-s, 12px); }
    .toolbar { display: flex; align-items: center; gap: 4px; border-bottom: 1px solid var(--divider-color); margin-bottom: 16px; }
    .tabs { display: flex; flex: 1; gap: 4px; overflow-x: auto; }
    .tab {
      border: 0; background: none; padding: 12px 16px; cursor: pointer; white-space: nowrap;
      color: var(--secondary-text-color); font: inherit; font-weight: 500; border-bottom: 2px solid transparent;
    }
    .tab[aria-selected="true"] { color: var(--primary-color); border-bottom-color: var(--primary-color); }
    .tab:focus-visible { outline: 2px solid var(--primary-color); outline-offset: -2px; }
    .row-options { display: flex; align-items: center; justify-content: flex-end; gap: 4px; margin-bottom: 8px; }
    #body ha-form { display: block; margin-top: 24px; }
  `];

  private _hass?: HomeAssistant;
  private _config?: Config;
  private _lovelace?: unknown;
  // The selected tab: a member subwoofer's index, or "add"
  private _selected: number | "add" = 0;
  private _cardEditor?: SvsSubwooferCardEditor;
  private _styleEditor?: SvsSubwooferCardEditor;
  // The selected member subwoofer's tile card editor, and the index it is for
  private _memberEditor?: TileEditor;
  private _memberIndex?: number;
  private _statesProvider = new StatesProvider(this);
  // Shown once both the configuration and hass are known
  private _built = false;

  set hass(hass: HomeAssistant) {
    this._hass = hass;
    if (this._cardEditor) this._cardEditor.hass = hass;
    if (this._styleEditor) this._styleEditor.hass = hass;
    this._setMemberHass();
    if (!this._built) this._show();
  }

  get hass(): HomeAssistant | undefined {
    return this._hass;
  }

  set lovelace(lovelace: unknown) {
    this._lovelace = lovelace;
    if (this._cardEditor) this._cardEditor.lovelace = lovelace;
    if (this._memberEditor) this._memberEditor.lovelace = lovelace;
  }

  get lovelace(): unknown {
    return this._lovelace;
  }

  setConfig(config: Config): void {
    // The configuration this editor just sent comes back here: nothing to change
    if (this._config && same(config, this._config)) return;
    this._config = config;
    this._show();
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    // A volume feature opened from here is no longer the panel's
    markPanelVolume(null);
  }

  private get _members(): Config[] {
    return membersOf(this._config);
  }

  private _fire(config: Config): void {
    this._config = config;
    fire(this, "config-changed", { config });
    this.requestUpdate();
  }

  private _show(): void {
    if (!this._config || !this._hass) return;
    this._built = true;
    this._showCard();
    if (typeof this._selected === "number" && !this._members[this._selected]) this._selected = this._members.length ? 0 : "add";
    if (typeof this._selected === "number") this._loadMember(this._selected);
    this.requestUpdate();
  }

  // As on the SVS Subwoofer card's own editor: first the main subwoofer's
  // tile card options, then the SVS Subwoofer section with the card's own
  // options; both halves are the card's editor, showing the same card
  private _showCard(): void {
    if (!this._cardEditor) {
      this._styleEditor = document.createElement(EDITOR_TYPE) as SvsSubwooferCardEditor;
      this._styleEditor.svsPart = "style";
      this._cardEditor = document.createElement(EDITOR_TYPE) as SvsSubwooferCardEditor;
      this._cardEditor.svsPart = "tile";
      this._cardEditor.entityHelper = "With Member subwoofers, choose their group subwoofer.";
      // The main subwoofer's volume settings can be copied to every member subwoofer
      this._cardEditor.addEventListener("edit-sub-element", (ev) => {
        const feature = (ev as CustomEvent).detail?.config;
        markPanelVolume(feature?.type === VOLUME ? {
          key: JSON.stringify(feature),
          members: () => this._members.length,
          copyTo: (volume) => this._copyVolumeToMembers(volume),
        } : null);
      });
      for (const editor of [this._styleEditor, this._cardEditor]) {
        editor.addEventListener("config-changed", (ev) => {
          ev.stopPropagation();
          const card = (ev as CustomEvent).detail.config;
          const keep = Object.fromEntries(PANEL_KEYS.filter((k) => k in this._config!).map((k) => [k, this._config![k]]));
          this._fire({ ...card, ...keep, type: this._config!.type });
          // Editors show a change only when handed their configuration back
          // (Home Assistant does this for a card's own editor)
          this._styleEditor!.setConfig(card);
          this._cardEditor!.setConfig(card);
        });
      }
    }
    const card = { ...this._config };
    for (const key of PANEL_KEYS) delete card[key];
    for (const editor of [this._styleEditor!, this._cardEditor]) {
      editor.hass = this._hass!;
      if (this._lovelace) editor.lovelace = this._lovelace;
      editor.setConfig(card);
    }
  }

  // The main subwoofer's volume settings on every member subwoofer: each one's volume feature is replaced (or added)
  private _copyVolumeToMembers(volume: Config): void {
    const members = this._members.map((member) => {
      const features = [...(member.features ?? [])];
      const at = features.findIndex((f: Config) => f?.type === VOLUME);
      if (at >= 0) features[at] = copy(volume);
      else features.push(copy(volume));
      return { ...member, features };
    });
    this._fire({ ...this._config, members });
    // The open member subwoofer's editor is handed its new settings
    this._show();
  }

  private _select(key: number | "add"): void {
    if (typeof key === "number" && !this._members[key]) key = this._members.length ? 0 : "add";
    this._selected = key;
    if (typeof key === "number") this._loadMember(key);
    this.requestUpdate();
  }

  /** The members changed: the configuration is sent, and a tab selected. */
  private _setMembers(members: Config[], selected: number): void {
    this._fire({ ...this._config, members });
    this._memberIndex = undefined;
    this._select(selected);
  }

  /** The member subwoofer's tile card editor, made once for its tab, and handed its settings after. */
  private async _loadMember(index: number): Promise<void> {
    const member = this._members[index];
    if (!member) return;
    if (this._memberIndex === index && this._memberEditor) {
      this._memberEditor.setConfig(tileConfig({ ...member, type: "tile" }));
      this._setMemberHass();
      return;
    }
    this._memberIndex = index;
    this._memberEditor = undefined;
    const editor = await createTileEditor(member.entity);
    // Another tab was chosen meanwhile
    if (this._selected !== index || this._memberIndex !== index) return;
    // Only single subwoofers' volumes in the entity picker
    editor.svsEntities = svsVolumes(this._hass, false);
    // This member's volume settings, when opened, can copy the main subwoofer's
    editor.addEventListener("edit-sub-element", (ev) => {
      const feature = (ev as CustomEvent).detail?.config;
      markPanelVolume(feature?.type === VOLUME ? {
        key: JSON.stringify(feature),
        volume: () => (this._config?.features ?? []).find((f: Config) => f?.type === VOLUME),
      } : null);
    });
    editor.addEventListener("config-changed", (ev) => {
      ev.stopPropagation();
      const config = (ev as CustomEvent).detail.config;
      const next = { ...config };
      delete next.type;
      delete next.show_entity_picture;
      const members = [...this._members];
      members[index] = next;
      this._fire({ ...this._config, members });
      // The tile editor shows a change (a removed state content, an added
      // feature) only once its configuration is handed back
      editor.setConfig(config);
      this._setMemberHass();
    });
    this._memberEditor = editor;
    this._setMemberHass();
    if (this._lovelace) editor.lovelace = this._lovelace;
    editor.setConfig(tileConfig({ ...member, type: "tile" }));
    this.requestUpdate();
  }

  /** The member's tile editor's hass, and the states context it reads, with the subwoofer attributes. */
  private _setMemberHass(): void {
    const editor = this._memberEditor;
    const member = typeof this._memberIndex === "number" ? this._members[this._memberIndex] : undefined;
    if (!editor || !this._hass || !member) return;
    const hass = withSubwooferAttributes(this._hass, member.entity);
    this._statesProvider.states = hass.states;
    editor.hass = hass;
  }

  protected override render(): TemplateResult | typeof nothing {
    if (!this._config || !this._hass) return nothing;
    const members = this._members;
    return html`${this._cardEditor ?? nothing}
      <ha-expansion-panel outlined expanded>
        <div slot="header" role="heading" aria-level="3">SVS Subwoofer</div>
        ${this._styleEditor ?? nothing}
      </ha-expansion-panel>
      <ha-expansion-panel outlined expanded>
        <div slot="header" role="heading" aria-level="3">Member subwoofers</div>
        <div class="content">
          <p class="hint">Recommended: the subwoofers in the main subwoofer's group, so each one can also be adjusted on its own. Each numbered tab is one member subwoofer; the plus button adds one.</p>
          ${this._rowsForm()}
          <div class="toolbar">
            <div class="tabs" role="tablist" aria-label="Member subwoofers">${members.map((m, i) => html`
              <button type="button" class="tab" role="tab" aria-selected=${String(this._selected === i)}
                title=${m.name || defaultMemberNames(this._hass, [m.entity])[m.entity] || m.entity}
                @click=${() => this._select(i)}>${i + 1}</button>`)}</div>
            <ha-icon-button .path=${MDI.plus} .label=${"Add a subwoofer"} @click=${() => this._select("add")}></ha-icon-button>
          </div>
          <div id="body">${this._selected === "add" ? this._addForm() : this._memberBody(this._selected)}</div>
        </div>
      </ha-expansion-panel>`;
  }

  // How the member subwoofers show
  private _rowsForm(): TemplateResult {
    const c = this._config!;
    const schema = [
      {
        name: "members_toggle", label: "Tap the card to show or hide the member subwoofers",
        helper: "While this is on, a tap on the card does this instead of its Tap behavior (under Interactions). Icon tap behavior still works.",
        selector: { boolean: {} },
      },
      ...(c.members_toggle === false ? [] : [{ name: "members_open", label: "Show the member subwoofers at load", selector: { boolean: {} } }]),
    ];
    return html`<ha-form .hass=${this._hass} .schema=${schema} .computeLabel=${label} .computeHelper=${helper}
      .data=${{ members_toggle: c.members_toggle !== false, members_open: c.members_open !== false }}
      @value-changed=${(ev: CustomEvent) => {
        ev.stopPropagation();
        const v = ev.detail.value;
        this._fire({ ...this._config, members_toggle: v.members_toggle !== false, members_open: v.members_open !== false });
      }}></ha-form>`;
  }

  // Adding a subwoofer: those not in the panel yet, alphabetical by name
  private _addForm(): TemplateResult {
    const taken = new Set(this._members.map((m) => m.entity));
    const options = subwoofers(this._hass).filter(([id]) => !taken.has(id)).map(([value, name]) => ({ value, label: name }));
    const schema = [{ name: "entity", label: "Subwoofer to add", selector: { select: { mode: "dropdown", options } } }];
    return html`<ha-form .hass=${this._hass} .schema=${schema} .data=${{}} .computeLabel=${label}
      @value-changed=${(ev: CustomEvent) => {
        ev.stopPropagation();
        const entity = ev.detail.value.entity;
        if (entity) this._setMembers([...this._members, newMember(entity)], this._members.length);
      }}></ha-form>`;
  }

  // A member subwoofer: edited like a tile card, with buttons to duplicate, move or remove it
  private _memberBody(index: number): TemplateResult {
    const members = this._members;
    const move = (step: number) => {
      const next = [...members];
      const [item] = next.splice(index, 1);
      next.splice(index + step, 0, item);
      this._setMembers(next, index + step);
    };
    // Duplicate: the member as it is now, for the next subwoofer not yet in
    // the panel (alphabetical by name), so only the entity needs changing, if anything
    const duplicate = () => {
      const taken = new Set(members.map((m) => m.entity));
      const free = subwoofers(this._hass).map(([id]) => id).find((id) => !taken.has(id));
      const twin = copy(members[index]);
      delete twin.name;
      if (free) twin.entity = free;
      const next = [...members];
      next.splice(index + 1, 0, twin);
      this._setMembers(next, index + 1);
    };
    const remove = () => this._setMembers(members.filter((_, i) => i !== index), Math.max(0, index - 1));
    const button = (path: string, name: string, disabled: boolean, onClick: () => void) =>
      html`<ha-icon-button .path=${path} .label=${name} .disabled=${disabled} @click=${onClick}></ha-icon-button>`;
    return html`<div class="row-options">
        ${button(MDI.copy, "Duplicate", false, duplicate)}
        ${button(MDI.left, "Move before", index === 0, () => move(-1))}
        ${button(MDI.right, "Move after", index === members.length - 1, () => move(1))}
        ${button(MDI.delete, "Remove this subwoofer", false, remove)}
      </div>
      ${this._memberIndex === index ? this._memberEditor ?? nothing : nothing}`;
  }
}
