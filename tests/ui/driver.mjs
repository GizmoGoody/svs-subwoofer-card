/**
 * Drives a headless Chrome through the Chrome DevTools Protocol, with no
 * packages to install: Node's built-in WebSocket and fetch.
 *
 * Usage: node driver.mjs <home assistant url> <access token> <output dir> <page script> <card url> [original card url]
 *
 * Opens Home Assistant logged in with the token, loads the page script
 * (which defines window.svsUiTests and window.svsUiGallery), runs the tests,
 * and saves report.json plus screenshots of the gallery in light and dark.
 * With the original card's address, it also draws the same gallery with the
 * original card and compares the two card by card.
 */
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const [, , url, token, outDir, pageScript, cardUrl, baselineUrl] = process.argv;
const chrome = process.env.CHROME ?? "google-chrome";
const port = 9333;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
mkdirSync(outDir, { recursive: true });

const browser = spawn(chrome, [
  "--headless=new", `--remote-debugging-port=${port}`,
  `--user-data-dir=${mkdtempSync(join(tmpdir(), "svs-chrome-"))}`,
  "--no-sandbox", "--disable-gpu", "--window-size=1280,2400", "about:blank",
], { stdio: ["ignore", "ignore", "pipe"] });
// Chrome's own messages, to tell why it did not start
let chromeErrors = "";
browser.stderr.on("data", (chunk) => { chromeErrors = (chromeErrors + chunk).slice(-4000); });
let chromeExit = null;
browser.on("exit", (code, signal) => { chromeExit = `exited with ${code ?? signal}`; });

let socket;
try {
  let page;
  // A busy runner can take well over 30 seconds to start Chrome
  for (let i = 0; i < 900 && !page && !chromeExit; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      page = list.find((t) => t.type === "page");
      if (!page) await sleep(100);
    } catch {
      await sleep(100);
    }
  }
  if (!page) throw new Error(`Chrome did not start (${chromeExit ?? "no page after 90 seconds"}):\n${chromeErrors}`);

  socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.onopen = resolve;
    socket.onerror = reject;
  });
  let nextId = 0;
  const pending = new Map();
  const logs = [];
  socket.onmessage = (message) => {
    const data = JSON.parse(message.data);
    if (data.id && pending.has(data.id)) {
      const { resolve, reject } = pending.get(data.id);
      pending.delete(data.id);
      if (data.error) reject(new Error(data.error.message));
      else resolve(data.result);
    } else if (data.method === "Runtime.consoleAPICalled") {
      logs.push(`${data.params.type}: ${data.params.args.map((a) => a.value ?? a.description).join(" ")}`);
    } else if (data.method === "Runtime.exceptionThrown") {
      const d = data.params.exceptionDetails;
      logs.push(`exception: ${d.exception?.description ?? d.exception?.value ?? d.text} at ${d.url ?? ""}:${d.lineNumber}`);
    }
  };
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++nextId;
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async (expression) => {
    const result = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
    }
    return result.result.value;
  };

  await send("Page.enable");
  await send("Runtime.enable");
  // Real mouse clicks for the page's tests: the page calls
  // svsRealClick('{"id", "x", "y"}'), the driver clicks there like a mouse,
  // then calls the page's __svsClickDone(id)
  await send("Runtime.addBinding", { name: "svsRealClick" });
  socket.addEventListener("message", (message) => {
    const data = JSON.parse(message.data);
    if (data.method !== "Runtime.bindingCalled" || data.params.name !== "svsRealClick") return;
    const { id, x, y } = JSON.parse(data.params.payload);
    (async () => {
      const mouse = { x, y, button: "left", clickCount: 1 };
      await send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
      await send("Input.dispatchMouseEvent", { type: "mousePressed", ...mouse });
      await sleep(60);
      await send("Input.dispatchMouseEvent", { type: "mouseReleased", ...mouse });
      // Away again, so no later test sees a control hovered
      await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 1270, y: 2390 });
      await send("Runtime.evaluate", { expression: `window.__svsClickDone?.(${JSON.stringify(id)})` });
    })().catch((err) => logs.push(`real click failed: ${err}`));
  });
  // Logged in: the frontend reads its tokens from local storage
  const base = new URL(url).origin;
  const tokens = {
    access_token: token, token_type: "Bearer", expires_in: 86400,
    hassUrl: base, clientId: `${base}/`, expires: Date.now() + 86400000, refresh_token: "",
  };
  await send("Page.addScriptToEvaluateOnNewDocument", {
    source: `localStorage.setItem("hassTokens", ${JSON.stringify(JSON.stringify(tokens))});`,
  });
  // Opens the dashboard with a card file loaded (from the address the test
  // serves it at: current Home Assistant opens its Home dashboard, which
  // loads no dashboard resources), and the page script
  async function openWith(card, label) {
    await send("Page.navigate", { url: `${base}/lovelace/test` });
    await sleep(500);
    const loaded = await evaluate(`(async () => {
      let imported = false;
      for (let i = 0; i < 600; i++) {
        const hass = document.querySelector("home-assistant")?.hass;
        if (hass?.connected && !imported) {
          imported = true;
          await import(${JSON.stringify(card)});
        }
        if (hass?.connected && customElements.get("svs-subwoofer-card") && window.loadCardHelpers) return { ok: true };
        await new Promise((r) => setTimeout(r, 100));
      }
      const hass = document.querySelector("home-assistant")?.hass;
      return {
        ok: false, url: location.href, title: document.title,
        app: !!document.querySelector("home-assistant"), hass: !!hass, connected: !!hass?.connected,
        card: !!customElements.get("svs-subwoofer-card"), helpers: !!window.loadCardHelpers,
        body: document.body?.innerText?.slice(0, 500),
      };
    })()`);
    if (!loaded.ok) {
      const shot = await send("Page.captureScreenshot", { format: "png" });
      writeFileSync(join(outDir, `not-loaded-${label}.png`), Buffer.from(shot.data, "base64"));
      throw new Error(`Home Assistant or the ${label} card did not load: ${JSON.stringify(loaded)}`);
    }
    await evaluate(readFileSync(pageScript, "utf8"));
    // Which card file this page runs, told apart by its documentation link
    return evaluate(`(window.customCards ?? []).find((c) => c.type === "svs-subwoofer-card")?.documentationURL ?? ""`);
  }

  const capture = async (rect) => (await send("Page.captureScreenshot", {
    format: "png", captureBeyondViewport: true,
    clip: { x: rect.x, y: rect.y, width: rect.width, height: rect.height, scale: 1 },
  })).data;

  // The gallery in the light and the dark scheme: the whole gallery saved as
  // gallery-<label>-<scheme>.png, and each card's picture returned
  async function gallery(label, report) {
    const cards = {};
    for (const scheme of ["light", "dark"]) {
      await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: scheme }] });
      await sleep(600);
      if (report) {
        // Every control's text against what is under it, in this scheme
        for (const result of await evaluate("window.svsReadability()")) {
          report.push({ ...result, name: `${scheme}: ${result.name}` });
        }
      }
      const shown = await evaluate(`window.svsUiGallery(${label === "new"})`);
      writeFileSync(join(outDir, `gallery-${label}-${scheme}.png`), Buffer.from(await capture(shown), "base64"));
      cards[scheme] = [];
      for (const card of shown.cards) cards[scheme].push({ name: card.name, data: await capture(card) });
    }
    return cards;
  }

  // The original card's picture, this card's, and the pixels that differ
  // (magenta), side by side; and how many pixels differ
  const compare = (before, after) => evaluate(`(async () => {
    const load = (d) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = "data:image/png;base64," + d; });
    const [a, b] = await Promise.all([load(${JSON.stringify(before)}), load(${JSON.stringify(after)})]);
    const w = Math.max(a.width, b.width), h = Math.max(a.height, b.height);
    const pixels = (img) => {
      const c = document.createElement("canvas"); c.width = w; c.height = h;
      const x = c.getContext("2d"); x.drawImage(img, 0, 0);
      return x.getImageData(0, 0, w, h).data;
    };
    const A = pixels(a), B = pixels(b);
    const out = document.createElement("canvas"); out.width = w * 3 + 16; out.height = h;
    const o = out.getContext("2d");
    o.fillStyle = "#808080"; o.fillRect(0, 0, out.width, h);
    o.drawImage(a, 0, 0); o.drawImage(b, w + 8, 0);
    const diff = o.createImageData(w, h);
    let changed = 0;
    for (let i = 0; i < A.length; i += 4) {
      const d = Math.max(Math.abs(A[i] - B[i]), Math.abs(A[i + 1] - B[i + 1]), Math.abs(A[i + 2] - B[i + 2]), Math.abs(A[i + 3] - B[i + 3]));
      const g = (A[i] + A[i + 1] + A[i + 2]) / 9;
      if (d > 24) { changed++; diff.data.set([255, 0, 255, 255], i); } else diff.data.set([g, g, g, 255], i);
    }
    o.putImageData(diff, 2 * (w + 8), 0);
    return { changed, total: w * h, sameSize: a.width === b.width && a.height === b.height, png: out.toDataURL("image/png").split(",")[1] };
  })()`);

  const newLink = await openWith(cardUrl, "new");
  const report = await evaluate("window.svsUiTests()");
  writeFileSync(join(outDir, "report.json"), JSON.stringify(report, null, 2));
  const after = await gallery("new", report);
  writeFileSync(join(outDir, "report.json"), JSON.stringify(report, null, 2));

  // The original card (as deployed before the move), in a fresh page: the
  // same gallery, compared card by card. A card fails when more than 0.1 %
  // of its pixels differ, or its size changed.
  if (baselineUrl) {
    const originalLink = await openWith(baselineUrl, "original");
    report.push({
      name: "compare: the second page runs the original card, not this one",
      ok: !!originalLink && originalLink !== newLink,
      detail: `original: ${originalLink || "(none)"}; new: ${newLink || "(none)"}`,
    });
    const before = await gallery("original");
    mkdirSync(join(outDir, "compare"), { recursive: true });
    for (const scheme of ["light", "dark"]) {
      for (const [i, old] of before[scheme].entries()) {
        const name = `compare ${scheme}: ${old.name}`;
        const now = after[scheme].find((c) => c.name === old.name);
        if (!now) {
          report.push({ name, ok: false, detail: "the new gallery has no card with this name" });
          continue;
        }
        const c = await compare(old.data, now.data);
        const slug = `${scheme}-${String(i + 1).padStart(2, "0")}-${old.name.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase()}`;
        writeFileSync(join(outDir, "compare", `${slug}.png`), Buffer.from(c.png, "base64"));
        report.push({
          name,
          ok: c.sameSize && c.changed / c.total <= 0.001,
          detail: `${c.changed} of ${c.total} pixels differ${c.sameSize ? "" : ", and the size changed"} (compare/${slug}.png: original, new, difference)`,
        });
      }
    }
    writeFileSync(join(outDir, "report.json"), JSON.stringify(report, null, 2));
  }
  writeFileSync(join(outDir, "console.log"), logs.join("\n"));
  console.log(JSON.stringify(report.map(({ name, ok, detail }) => ({ name, ok, detail })), null, 2));
} catch (err) {
  writeFileSync(join(outDir, "report.json"), JSON.stringify([{ name: "driver", ok: false, detail: String(err?.stack ?? err) }], null, 2));
  console.error(err);
} finally {
  socket?.close();
  browser.kill();
}
