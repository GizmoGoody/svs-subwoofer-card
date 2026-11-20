// SVS's cabinet finishes, drawn on a canvas behind the card: their tone,
// their colors for the features styles and the volume's loupe, and the
// drawing itself. The pattern number sets the grain or the reflections, so
// the same pattern always draws the same.
import { DEFAULT_PATTERN } from "../const";
import type { Config } from "../ha";

export type Tone = "dark" | "light";

const WOOD = ["black_ash", "black_oak"];

/** A finish's tone (its text is light on dark, dark on light), or undefined for None. */
export const finishTone = (finish?: string): Tone | undefined =>
  (!finish || finish === "none" ? undefined : finish === "gloss_white" ? "light" : "dark");

// The solid backing behind each feature control on a finish (Flat and Console)
export const BACKING: Record<Tone, string> = { dark: "#1e1f22", light: "#eceef1" };
// Each finish's base color, without grain or reflections (Flat)
export const FLAT: Record<string, string> = {
  black_ash: "#1a1a1d", black_oak: "#161617", gloss_black: "#101113", gloss_white: "#e7e9ed", fabric: "#1f1f21", grille: "#1d1e20",
};
// Each finish's color for the volume loupe's bezel
export const BEZEL: Record<string, string> = {
  black_ash: "#24211f", black_oak: "#1f1b17", gloss_black: "#101113", gloss_white: "#f3f4f6", fabric: "#1b1c1e", grille: "#2c2e33",
};

export const patternOf = (config?: Config): number => (Number.isFinite(config?.pattern) ? config!.pattern : DEFAULT_PATTERN);

function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
}

function valueNoise(seed: number): (x: number, y: number, octaves: number) => number {
  const R = rng(seed), perm = new Uint8Array(512), vals = new Float32Array(256);
  for (let i = 0; i < 256; i++) { perm[i] = i; vals[i] = R(); }
  for (let i = 255; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [perm[i], perm[j]] = [perm[j], perm[i]]; }
  for (let i = 0; i < 256; i++) perm[i + 256] = perm[i];
  const sm = (t: number) => t * t * (3 - 2 * t);
  const n2 = (x: number, y: number) => {
    let xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    xi &= 255; yi &= 255;
    const a = vals[perm[perm[xi] + yi]], b = vals[perm[perm[xi + 1] + yi]];
    const c = vals[perm[perm[xi] + yi + 1]], d = vals[perm[perm[xi + 1] + yi + 1]];
    const u = sm(xf), v = sm(yf);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
  return (x, y, octaves) => {
    let sum = 0, amp = .5, f = 1, norm = 0;
    for (let k = 0; k < octaves; k++) { sum += n2(x * f, y * f) * amp; norm += amp; amp *= .5; f *= 2.03; }
    return sum / norm;
  };
}

/**
 * Draw a finish. Wood runs vertically or horizontally (a couple of degrees of
 * tilt at most) at a zoom from the pattern; gloss reflections fall at any angle.
 */
export function drawFinish(ctx: CanvasRenderingContext2D, finish: string, pattern: number, w: number, h: number): void {
  const r = rng(pattern * 31 + 7);
  const wood = WOOD.includes(finish);
  const angle = wood ? (r() < .5 ? 0 : Math.PI / 2) + (r() - .5) * .07 : r() * Math.PI;
  const zoom = wood ? .6 + r() * 1.1 : 1;
  const D = Math.ceil(Math.sqrt(w * w + h * h) / Math.min(zoom, 1)) + 20;
  const half = D / 2;
  if (finish === "fabric" || finish === "grille") {
    const img = ctx.createImageData(w, h);
    (finish === "fabric" ? drawFabric : drawGrille)(img.data, w, h, pattern);
    ctx.putImageData(img, 0, 0);
    return;
  }
  if (finish === "black_ash") {
    // Wide, wavy grey bands with a rough, porous texture on black, pinching
    // together and swirling into long ovals: the contour rings of a warped
    // noise field, stretched along the grain
    const img = ctx.createImageData(w, h), px = img.data;
    const noise = valueNoise(pattern * 7 + 1);
    const ca = Math.cos(angle), sa = Math.sin(angle);
    const period = 21 + r() * 6, warp = 3 + r() * 1.2, share = .46 + r() * .08;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const dx = x - w / 2, dy = y - h / 2;
        const u = (dx * ca + dy * sa) / zoom, v = (-dx * sa + dy * ca) / zoom;
        const t = u / period + noise(u * .008, v * .0045, 3) * warp;
        const ring = t - Math.floor(t);
        const width = share + (noise(u * .02 + 40, v * .007, 2) - .5) * .6;
        const pore = noise(u * .7 + 90, v * .05, 2);
        let tone;
        if (ring - width + (pore - .5) * .45 < 0) {
          tone = 74 + (pore - .5) * 60 + (noise(u * .9 + 7, v * .25, 1) - .5) * 30;
          if (pore < .3) tone -= 32;
        } else {
          tone = 20 + (pore - .5) * 10;
        }
        tone = Math.max(10, Math.min(120, tone));
        const o = (y * w + x) * 4;
        px[o] = tone; px[o + 1] = tone; px[o + 2] = tone + 3; px[o + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    const lx = r() * w, g = ctx.createRadialGradient(lx, 0, 0, lx, 0, Math.max(w, h) * 1.1);
    g.addColorStop(0, "rgba(255,255,255,.07)");
    g.addColorStop(1, "rgba(0,0,0,.22)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  } else if (finish === "black_oak") {
    // Matte near-black with fine, low-contrast straight grain and open pores
    ctx.fillStyle = "#151516";
    ctx.fillRect(0, 0, w, h);
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.rotate(angle);
    ctx.scale(zoom, zoom);
    const drift = (r() - .5) * .04;
    for (let j = 0; j < D / 1.4; j++) {
      const gx = -half + r() * D;
      ctx.beginPath();
      ctx.moveTo(gx, -half);
      ctx.quadraticCurveTo(gx + (r() - .5) * 3 + drift * D, 0, gx + drift * D * 2, half);
      ctx.strokeStyle = `rgba(92,92,96,${(.05 + r() * .12).toFixed(3)})`;
      ctx.lineWidth = .3 + r() * .9;
      ctx.stroke();
    }
    if (r() < .7) {
      const cx = (r() - .5) * D * .5, top = -half * (.1 + r() * .6);
      for (let k = 0; k < 14; k++) {
        const sp = 8 + k * (6 + r() * 3);
        ctx.beginPath();
        ctx.moveTo(cx - sp, half);
        ctx.quadraticCurveTo(cx - sp * .55, top + k * 9, cx, top + k * 9 - 6);
        ctx.quadraticCurveTo(cx + sp * .55, top + k * 9, cx + sp, half);
        ctx.strokeStyle = `rgba(96,94,92,${(.04 + r() * .05).toFixed(3)})`;
        ctx.lineWidth = .6 + r() * .8;
        ctx.stroke();
      }
    }
    for (let p = 0; p < D * 2.5; p++) {
      ctx.fillStyle = r() < .5 ? "rgba(0,0,0,.5)" : "rgba(110,110,114,.12)";
      ctx.fillRect(-half + r() * D, -half + r() * D, .6, 1.5 + r() * 4);
    }
    ctx.restore();
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, "rgba(255,255,255,.03)");
    g.addColorStop(1, "rgba(0,0,0,.18)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  } else {
    const dark = finish === "gloss_black";
    const g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, dark ? "#22252b" : "#fbfbfc");
    g.addColorStop(1, dark ? "#060708" : "#d8dbe0");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.rotate(angle);
    const n = 2 + Math.floor(r() * 3);
    for (let s = 0; s < n; s++) {
      const x = -half + r() * D, wd = 18 + r() * 110, peak = dark ? .05 + r() * .1 : .5 + r() * .4;
      const sg = ctx.createLinearGradient(x, 0, x + wd, 0);
      sg.addColorStop(0, "rgba(255,255,255,0)");
      sg.addColorStop(.5, `rgba(255,255,255,${peak.toFixed(3)})`);
      sg.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = sg;
      ctx.fillRect(x, -half, wd, D);
    }
    ctx.restore();
  }
}

/**
 * Speaker fabric: a near-black fine knit (two crossing fine weaves and a
 * speckle), with a very subdued sheen whose angle and place come from the
 * pattern.
 */
function drawFabric(px: Uint8ClampedArray, w: number, h: number, pattern: number): void {
  const r = rng(pattern * 31 + 7), noise = valueNoise(pattern * 7 + 3);
  const angle = r() * Math.PI, ca = Math.cos(angle), sa = Math.sin(angle);
  const cx = r() * w, cy = r() * h, reach = Math.max(w, h) * (.7 + r() * .6);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const k1 = Math.sin((x + y) * 1.9 + noise(x * .35, y * .35, 1) * 3) * .5 + .5;
      const k2 = Math.sin((x - y) * 1.7 + noise(x * .3 + 50, y * .3, 1) * 3) * .5 + .5;
      const speck = noise(x * .7 + 20, y * .7, 2);
      const d = ((x - cx) * ca + (y - cy) * sa) / reach;
      const t = 33 + (k1 * k2 - .25) * 10 + (speck - .5) * 17 + (noise(x * .02, y * .02, 2) - .5) * 5 + Math.max(0, 1 - d * d) * 4;
      const o = (y * w + x) * 4;
      px[o] = t; px[o + 1] = t; px[o + 2] = t + 2; px[o + 3] = 255;
    }
  }
}

/**
 * A perforated metal speaker grille: hexagonal holes with a vertex straight
 * up and down, dark behind them, in a brushed metal web. The web carries a
 * strong reflection band and each hole's rim catches the light on one side,
 * so the grille stands out; the reflection's angle and place come from the
 * pattern.
 */
function drawGrille(px: Uint8ClampedArray, w: number, h: number, pattern: number): void {
  const r = rng(pattern * 31 + 7), noise = valueNoise(pattern * 7 + 5);
  const R = 6, across = Math.sqrt(3) * R, down = 1.5 * R, hole = R * .8;
  const angle = r() * Math.PI, ca = Math.cos(angle), sa = Math.sin(angle);
  const cx = r() * w, cy = r() * h, reach = Math.max(w, h) * (.45 + r() * .4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      // The nearest hole center (rows offset by half a hole)
      const row = Math.round(y / down), col = Math.round((x - ((row & 1) ? across / 2 : 0)) / across);
      let best = Infinity, bx = 0, by = 0;
      for (let rr = row - 1; rr <= row + 1; rr++) {
        const shift = (rr & 1) ? across / 2 : 0;
        for (let cc = col - 1; cc <= col + 1; cc++) {
          const X = cc * across + shift, Y = rr * down, dd = (x - X) ** 2 + (y - Y) ** 2;
          if (dd < best) { best = dd; bx = X; by = Y; }
        }
      }
      // Within a hexagon whose flat sides are left and right (vertices up and down)
      const ax = Math.abs(x - bx), ay = Math.abs(y - by);
      const dist = Math.max(ax, ax * .5 + ay * .8660254) / (hole * .8660254);
      const d = ((x - cx) * ca + (y - cy) * sa) / reach, sheen = Math.max(0, 1 - d * d);
      let t;
      if (dist < 1) {
        const edge = Math.min(1, (1 - dist) * 4);
        t = 18 + (46 + (noise(bx * .05, by * .05, 2) - .5) * 10 + sheen * 14 - 18) * edge;
        if (dist > .82) t += ((x - bx) + (y - by)) / hole > 0 ? 16 * sheen + 6 : -6;
      } else {
        t = 34 + sheen * 70 + (noise(x * .5, y * .5, 1) - .5) * 8 + (noise(x * .05 + 9, y * .05, 2) - .5) * 10;
      }
      const o = (y * w + x) * 4;
      px[o] = t; px[o + 1] = t; px[o + 2] = t + 3; px[o + 3] = 255;
    }
  }
}

/** A canvas drawn with a finish at a size, again only when the finish, pattern or size changes. */
export function paint(canvas: HTMLCanvasElement, finish: string, pattern: number, w: number, h: number): void {
  const key = `${finish}|${pattern}|${w}x${h}`;
  if (canvas.dataset.drawn === key) return;
  canvas.dataset.drawn = key;
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (ctx) drawFinish(ctx, finish, pattern, w, h);
}
