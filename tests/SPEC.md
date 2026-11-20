# SVS Subwoofer card: what it does

Every behavior has an ID. Each names the check that covers it:

- **browser**: `tests/browser/<page>.html`, run by `python tests/browser/run.py [bundle]` on stand-ins for Home Assistant's elements. Each check's label starts with its ID. The card loads as a module, as Home Assistant loads it, and a check reads the page a moment after an action (`settle()`), as Lit draws in a microtask.
- **unit**: `tests/unit/*.test.ts`, run by Vitest.
- **real HA**: `tests/ui/page_tests.js`, run by `tests/ui/test_card_ui.py` on the real Home Assistant frontend. The test's name is given.
- **real Home Assistant (by hand)**: what no stand-in can show. Check these on a dashboard (see the end).

Checks use only the card's public surface: element tags, config, hass, `data-key`, rendered text, roles and labels, computed styles, and the service calls the card makes. They never read private fields or class names.

The gate: both suites pass on `reference/prototype.js` (the card before the rewrite) and on `dist/svs-subwoofer-card.js`. On the prototype, these are reported as KNOWN, not failures:

| ID | Why |
| --- | --- |
| L-1 | change: a feature with nothing to show takes no place (approved) |
| FE-4 | bug: a volume feature outside the panel offers Copy from main when a panel's volume with the same settings was opened before |
| K-13 | bug: the driver ring is gray until the next state change when the card gets hass before it is on the page |

Sources: the card as deployed, README.md, the decisions in HANDOFF.md and memory (theme-agnostic, alphabetical subwoofer lists, no legacy aliases), and the owner's feedback in past sessions.

## Card (`svs-subwoofer-card`), browser: card.html

| ID | Behavior |
| --- | --- |
| K-1 | Home Assistant's tile card inside, without the card's own options, with the driver as its picture |
| K-2 | The driver's size follows the volume, over the volume slider's range |
| K-3 | The driver ring: the preset's color, else the volume threshold's color; none when off |
| K-4 | State content shows the preset and the standby mode (Auto, not Auto ON) |
| K-5 | The Bluetooth badge: shown, only when not connected, or hidden; at the driver's bottom right |
| K-6 | The standby mode badge: A, O or T at the driver's bottom left; off by default |
| K-7 | A tap on the driver disconnects a connected subwoofer and reconnects one that is not |
| K-8 | The driver shakes when the preset or volume changes; not with Shake off or reduced motion |
| K-9 | Wrong options are refused with a message |
| K-10 | A new card starts on the group's volume, with presets and volume |
| K-11 | The tile card's size and grid options |
| K-12 | Nothing around the tile card clips it, so its callouts can pass the card's edge |
| K-13 | The ring has its color from the first render, even when the card gets hass before it is on the page |

## Finishes and features style, browser: card.html

| ID | Behavior |
| --- | --- |
| F-1 | Every finish draws (Premium Black Ash, Black Oak, Gloss Black, Gloss White, Fabric, Grille) |
| F-3 | On a finish, the text takes the finish's tone |
| F-4 | Features style. Match: the theme's controls. Flat: a patch of the finish's base color behind each control (each preset key on its own). Console: keys that press in, one color selected or not; Home Assistant's toggles become a slide |
| F-5 | Finish extent Container: in an expander card, the header draws the finish across it; the cards inside are see-through |
| F-6 | The card's corners are the theme's |
| F-7 | The volume's loupe bezel is of the finish |

## Panel (`svs-subwoofer-panel-card`), browser: panel.html

| ID | Behavior |
| --- | --- |
| M-1 | The group's card above its member subwoofers, named without what they share (Left, Right); a tap on the card shows or hides them; this browser remembers which; Show at load off starts hidden |
| M-2 | With Tap the card to show or hide off, they always show and the card keeps its own tap action |
| M-3 | The finish covers the whole panel; its cards are see-through and take its finish and features style |
| M-4 | The group's badge shows its member subwoofers together (All connected, 1 of 2 connected, None connected; blue or amber); a tap on its driver reconnects those not connected, or disconnects all; a member's driver acts on that subwoofer |
| M-5 | A group whose member subwoofers disagree shows their range, their presets and M (title Standby mode: Mixed (Auto, On)); its slider spans them and a drag moves them together, keeping their difference |
| M-6 | The cards in the panel do not highlight on hover (they are parts of one surface); a card alone does |
| M-7 | Wrong member settings are refused with a message |
| M-8 | A new panel: the group, with every subwoofer below it, alphabetical by name |
| M-9 | The panel's Bluetooth badge, driver ring, standby badge and shake settings apply to its member subwoofers |

## Features, browser: features.html

| ID | Behavior |
| --- | --- |
| N-1 | The features' names, and the entities they are offered for (SVS Subwoofer volumes only) |
| P-1 | Presets: one button per preset, in the subwoofer's slot order; Default and Manual left out |
| P-2 | A preset button always loads its preset, even the one shown |
| P-3 | The active preset filled in its color; LOW, MEDIUM and HIGH start green, yellow and red, with volume icons |
| P-4 | The cycle button shows the active preset; a tap loads the next; from Manual, the first |
| P-5 | The active key's text reads on its color: dark or white, whichever contrasts more (WCAG) |
| P-6 | A tap on a feature does not reach the cards around it (such as an expander card's header) |
| S-1 | Standby mode as buttons: Auto, Trigger and On, styled like the preset buttons |
| S-2 | The selected mode's text reads on the feature color from the first render |
| V-1 | Volume slider range: the whole -60 to 0 dB, or Slider from and Slider to |
| V-2 | Thresholds: three ranges shown faintly; the filled part in the color of the range it ends in |
| V-3 | A drag sets the volume once, where it ends, and the slider stays there until the subwoofer reports it |
| V-4 | A cancelled drag ends where it was, not at the left end |
| V-5 | The arrow keys move the volume, sent once the keys stop |
| V-6 | While the slider moves, its value shows above it, outside the control (nothing clips it) |
| L-1 | A feature with nothing to show takes no place (it hides itself and its feature row) |

## Editors, browser: editor.html

| ID | Behavior |
| --- | --- |
| E-1 | The tile card's own editor first, then the SVS Subwoofer section |
| E-2 | The tile card's editor without the icon options; the entity picker offers only SVS Subwoofer volumes |
| E-3 | The editor writes the card's options out |
| E-5 | A finish adds Finish extent, Features style and Randomize, with their defaults |
| E-6 | The labels and helpers, word for word |
| E-7 | The State content picker sees the preset and standby mode |
| PE-1 | Panel editor: the card's options, then SVS Subwoofer, then Member subwoofers with numbered tabs |
| PE-2 | Adding a subwoofer: those not in the panel yet, alphabetical by name |
| PE-3 | Duplicate, move and remove a member subwoofer |
| PE-4 | A member subwoofer's tab: the tile card's editor, with only single subwoofers, saved without type |
| PE-5 | The main entity's helper (With Member subwoofers, choose their group subwoofer.), and only there |
| PE-6 | How the member subwoofers show (Show at load, Tap the card to show or hide) |
| FE-1 | The presets feature's settings: shown presets reorderable, each with color and icon; Default has none |
| FE-2 | The volume feature's settings: Slider from, Slider to, thresholds |
| FE-3 | Copy to members on the main volume; Copy from main on a member's; never grayed out |
| FE-4 | Copy from main shows only on a member's volume inside a panel |

## Wording and registration, browser: feedback.html

| ID | Behavior |
| --- | --- |
| B-1 | The console badge is GizmoGoody's card-badge: 🔊 SVS Subwoofer Card, its version and the repository |
| C-1 | The card picker lists SVS Subwoofer and SVS Subwoofer panel (prototype), with previews and the README link |
| W-1 | No contractions anywhere the card writes text |
| W-2 | The standby mode is written On and Auto, never ON or Auto ON |
| W-3 | The panel's subwoofers are called Member subwoofers |

## Pure parts, unit

| ID | Behavior |
| --- | --- |
| U-1 | Slider range: -60 to 0 dB unless Slider from and Slider to; positions and values convert both ways and clamp |
| U-2 | Thresholds: the color of the range a volume falls in |
| U-3 | Short names: the words the member subwoofers share are left out |
| U-4 | Saved config: only what the user set, in a stable order; emptied fields stay out |
| U-5 | Connection targets: reconnect those not connected, else disconnect all |
| U-6 | Text on a color: dark or white, whichever contrasts more (WCAG) |

## Real Home Assistant frontend, real HA

Run on the real frontend with the SVS integration at v1.10.1, on both bundles. The gallery is compared with the card as first released (`9f6ea49`); accepted differences are in `tests/ui/accepted_changes.py`.

- control: Home Assistant's tile card editor, hosted the same way
- card shows the driver and the Bluetooth badge (K-1, K-5)
- deployed panel: the group above its two subwoofers, rows hidden until a tap (M-1, M-3, M-4)
- state content: every card shows its preset, and the panel's cards do not highlight on hover (K-4, M-6)
- state content picker: the editors' states context has the subwoofer attributes (E-7)
- card editor: a removed state content stays removed (E-3)
- card editor: an added feature appears in the list
- panel editor: the card above numbered tabs, duplicate, and edits that stay (PE-1, PE-3, PE-5)
- unknown options are errors (K-9)
- volume editor: an emptied field stays empty (E-3)
- volume: a cancelled drag ends where it was, not at the left end (V-4)
- volume: the value callout shows above the slider, and nothing clips it (V-6, K-12)
- volume editor: Copy from main on a row, Copy to members on the main, never grayed out (FE-3)
- interactions: Perform action offers a target, the subwoofer's buttons among them
- connect tap and real click: connected disconnects, disconnected reconnects, groups and rows (K-7, M-4)
- connect tap: a card's own Icon tap behavior is kept
- mixed: the group shows its rows' range, presets and M, and moves them together (M-5)
- console: keys keep one color whether selected or not; preset keys at full strength (F-4)
- presets editor: reordered presets keep their order; Default is left out, with no color or icon of its own (FE-1)
- entity pickers offer only SVS Subwoofer volumes (E-2, N-1)
- standby: the selected mode's text is readable from the first render (S-2)
- readability: every control and the value callout reach 4.5:1 on every finish and style, for six feature colors (P-5)

## Real Home Assistant (by hand)

The stand-ins cannot show how Home Assistant draws, loads images or applies the theme. Check these on a dashboard after each release:

- R-1 Theme corners: the card's and the panel's finish follow your theme's card corners (`ha-card-border-radius`), and the Flat patches and Console keys follow the feature corners.
- R-2 Hover: a card alone highlights on hover like any tile card; the cards inside a panel do not.
- R-3 Finishes: each finish's grain, weave or grille looks right at your card sizes and in light and dark themes; Randomize changes the grain.
- R-4 Console: Home Assistant's own toggles (for example a switch feature) become a slide; the volume's loupe sits in a bezel of the finish.
- R-5 Expander card: Finish extent Container draws one finish behind the expander's header and the cards inside.
- R-6 The driver image: it loads at once, its size follows the volume, and it shakes on a preset or volume change.
- R-7 Interactions: Perform action's target picker offers the subwoofer's Reconnect and Disconnect buttons.
- R-8 Inline features: in the panel, the first feature sits in the right half of the card's first row.
- R-9 Tap to connect: a tap on the driver on your dashboard connects or disconnects the subwoofer (or the group's).
