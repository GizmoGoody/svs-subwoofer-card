// The card's pure parts (tests/SPEC.md, U-1 to U-6)
import { describe, expect, it } from "vitest";
import { explicit, innerTileConfig, memberConfig, newMember } from "../../src/card/options";
import { DARK_TEXT, LIGHT_TEXT, textOnRgb } from "../../src/subwoofer/colors";
import { connectionOf, connectionTargets } from "../../src/subwoofer/connection";
import { shortNames, standbyLabel } from "../../src/subwoofer/device";
import { levelOf, sliderRange, thresholdColor, thresholdsOf, valueAt, volumeConfig } from "../../src/subwoofer/volume";

const THRESHOLDS = [{ color: "red" }, { below: -15, color: "yellow" }, { below: -30, color: "green" }];

describe("U-1 slider range", () => {
  it("is -60 to 0 dB unless Slider from and Slider to", () => {
    expect(sliderRange({})).toEqual({ min: -60, max: 0, step: 1 });
    expect(sliderRange({ min: -30, max: -5 })).toEqual({ min: -30, max: -5, step: 1 });
  });
  it("swaps ends given the other way round, and uses the whole range for equal ends", () => {
    expect(sliderRange({ min: -5, max: -30 })).toMatchObject({ min: -30, max: -5 });
    expect(sliderRange({ min: -20, max: -20 })).toMatchObject({ min: -60, max: 0 });
  });
  it("keeps the ends within the entity's own range and step", () => {
    expect(sliderRange({ min: -90, max: 10 }, { min: -50, max: 0, step: 0.5 })).toEqual({ min: -50, max: 0, step: 0.5 });
  });
  it("converts positions and values both ways, within the range", () => {
    const range = sliderRange({ min: -40, max: 0 });
    expect(levelOf(-20, range)).toBe(0.5);
    expect(levelOf(-80, range)).toBe(0);
    expect(levelOf(5, range)).toBe(1);
    expect(valueAt(0.5, range)).toBe(-20);
    expect(valueAt(1.4, range)).toBe(0);
    expect(valueAt(-1, range)).toBe(-40);
  });
});

describe("U-2 thresholds", () => {
  it("orders the ranges, lowest first, with the open one last", () => {
    expect(thresholdsOf({ volume_thresholds: THRESHOLDS }).map((t) => t.color)).toEqual(["green", "yellow", "red"]);
    expect(thresholdsOf({})).toEqual([]);
  });
  it("gives the color of the range a volume falls in", () => {
    const t = thresholdsOf({ volume_thresholds: THRESHOLDS });
    expect([-40, -30, -20, -15, -12].map((v) => thresholdColor(t, v))).toEqual(["green", "yellow", "yellow", "red", "red"]);
    expect(thresholdColor([], -20)).toBeUndefined();
  });
});

describe("U-3 short names", () => {
  it("leaves out the words the member subwoofers share", () => {
    expect(shortNames(["Subwoofer Left", "Subwoofer Right"])).toEqual(["Left", "Right"]);
    expect(shortNames(["Den Sub Front", "Den Sub Back"])).toEqual(["Front", "Back"]);
  });
  it("never leaves a name empty, and keeps a single name whole", () => {
    expect(shortNames(["Subwoofer", "Subwoofer Two"])).toEqual(["Subwoofer", "Subwoofer Two"]);
    expect(shortNames(["Subwoofer Left"])).toEqual(["Subwoofer Left"]);
  });
  it("writes the standby modes Auto, Trigger and On", () => {
    expect(["Auto ON", "Trigger", "ON"].map(standbyLabel)).toEqual(["Auto", "Trigger", "On"]);
  });
});

describe("U-4 saved config", () => {
  it("writes the card's options out, in a stable order", () => {
    expect(explicit({ type: "custom:svs-subwoofer-card", entity: "number.a" })).toEqual({
      type: "custom:svs-subwoofer-card", entity: "number.a", finish: "none", vibration: true, bluetooth: "show", standby_badge: false, driver_ring: true,
    });
    expect(Object.keys(explicit({ entity: "number.a", driver_ring: false, finish: "none" }))).toEqual(
      ["entity", "driver_ring", "finish", "vibration", "bluetooth", "standby_badge"]);
  });
  it("keeps the pattern, finish extent and features style only with a finish", () => {
    expect(explicit({ entity: "number.a", finish: "black_ash" })).toMatchObject({ pattern: 4242, finish_extent: "card", features_style: "match" });
    const none = explicit({ entity: "number.a", finish: "none", pattern: 7, finish_extent: "container", features_style: "flat" });
    expect(["pattern", "finish_extent", "features_style"].filter((k) => k in none)).toEqual([]);
  });
  it("saves the volume's settings that differ from the defaults; an emptied field stays out", () => {
    const type = "custom:svs-subwoofer-volume";
    expect(volumeConfig({ type }, { min: -60, max: 0, colored: false })).toEqual({ config: { type }, note: "" });
    expect(volumeConfig({ type, min: -40 }, { min: undefined, max: 0 }).config).toEqual({ type, min: -40 });
    expect(volumeConfig({ type }, { min: -10, max: -40 })).toEqual({
      config: { type, min: -40, max: -10 }, note: "Slider from and Slider to were the other way round, so they were swapped.",
    });
    expect(volumeConfig({ type }, { colored: true }).config.volume_thresholds).toEqual(
      [{ below: -30, color: "green" }, { below: -15, color: "yellow" }, { color: "red" }]);
  });
  it("keeps the panel's own options out of the card inside, and connects on a tap of the driver", () => {
    const tile = innerTileConfig({ entity: "number.a", finish: "fabric", members: [], members_open: true });
    expect(tile).toEqual({
      entity: "number.a", type: "tile", show_entity_picture: true, icon_tap_action: { action: "fire-dom-event", svs_subwoofer: "connection" },
    });
    expect(innerTileConfig({ entity: "number.a", icon_tap_action: { action: "none" } }).icon_tap_action).toEqual({ action: "none" });
  });
  it("gives member subwoofers the panel's look and badges, and their own name", () => {
    const member = memberConfig({ finish: "black_oak", bluetooth: "off", standby_badge: true }, newMember("number.l"), "Left");
    expect(member).toMatchObject({ entity: "number.l", name: "Left", finish: "black_oak", bluetooth: "off", standby_badge: true, features_style: "match" });
  });
});

describe("U-5 connection targets", () => {
  it("reconnects those not connected", () => {
    expect(connectionTargets([{ id: "a", connected: true }, { id: "b", connected: false }])).toEqual({ action: "reconnect", ids: ["b"] });
  });
  it("disconnects all when all are connected", () => {
    expect(connectionTargets([{ id: "a", connected: true }, { id: "b", connected: true }])).toEqual({ action: "disconnect", ids: ["a", "b"] });
  });
  it("names the badge's status", () => {
    expect([[true], [false], [true, true], [true, false], [false, false]].map((c) => connectionOf(c).label))
      .toEqual(["Connected", "Not connected", "All connected", "1 of 2 connected", "None connected"]);
  });
});

describe("U-6 text on a color", () => {
  it("is dark or white, whichever contrasts more (WCAG)", () => {
    expect(textOnRgb([255, 235, 59])).toBe(DARK_TEXT);   // yellow
    expect(textOnRgb([244, 67, 54])).toBe(DARK_TEXT);    // red: dark text contrasts more (5.1 to 3.7)
    expect(textOnRgb([103, 58, 183])).toBe(LIGHT_TEXT);  // deep purple
    expect(textOnRgb([63, 81, 181])).toBe(LIGHT_TEXT);   // indigo
    expect(textOnRgb([3, 169, 244])).toBe(DARK_TEXT);    // light blue
    expect(textOnRgb([255, 255, 255])).toBe(DARK_TEXT);
    expect(textOnRgb([0, 0, 0])).toBe(LIGHT_TEXT);
  });
});
