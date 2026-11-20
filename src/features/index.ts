import { PRESETS_TYPE, STANDBY_TYPE, VOLUME_TYPE } from "../const";
import type { SvsFeature } from "./base";
import { SvsPresetsEditor, SvsVolumeEditor } from "./editors";
import { SvsPresets } from "./presets";
import { SvsStandby } from "./standby";
import { SvsVolume } from "./volume";

export { SvsPresets, SvsPresetsEditor, SvsStandby, SvsVolume, SvsVolumeEditor };

// The features, in the order Home Assistant's feature picker lists them: [tag, element, name, has settings]
export const FEATURES: [string, typeof SvsFeature, string, boolean][] = [
  [PRESETS_TYPE, SvsPresets, "SVS Subwoofer presets", true],
  [VOLUME_TYPE, SvsVolume, "SVS Subwoofer volume", true],
  [STANDBY_TYPE, SvsStandby, "SVS Subwoofer standby mode", false],
];
export const FEATURE_TAGS = FEATURES.map(([tag]) => tag);
