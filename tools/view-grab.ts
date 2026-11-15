// Check what the pointer finds and what dragging asks for, with real mouse events on the lab page.
//
//   bun tools/view-grab.ts [--size 1280x800] [query]
//
// Sweeps the mouse over a grid and prints a map of the part found under each spot (a letter per
// part, capital where a drag would move something), then drags from one spot of each kind of
// handle, down and then forward, and prints the pose values each drag asked for.
import { chromium } from "playwright-core";
import { LAYERS } from "../src/contract.ts";

const args = process.argv.slice(2);
const flag = (name: string, fallback: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args.splice(i, 2)[1] : fallback;
};
const [w, h] = flag("size", "1280x800").split("x").map(Number);
const query = args[0] ?? "pose=a&t=3&cut=1";
const LETTER: Record<string, string> = { skin: "s", bone: "b", tongue: "t", lips: "l", palate: "p", nose: "n", air: "a", larynx: "x", lungs: "u", sound: "o" };

const browser = await chromium.launch({ args: ["--ignore-gpu-blocklist", "--use-angle=d3d11"] });
const page = await browser.newPage({ viewport: { width: w, height: h } });
await page.route("**/@vite/client", (route) =>
  route.fulfill({ contentType: "text/javascript", body: "export const createHotContext = () => undefined; export const updateStyle = () => {}; export const removeStyle = () => {}; export const injectQuery = (url) => url;" }),
);
page.on("pageerror", (e) => console.log(`[uncaught] ${e.message}`));
await page.goto(`http://127.0.0.1:5340/lab/view.html?${query}&hud=0`, { waitUntil: "load" });
await page.waitForFunction("window.lab && window.lab.ready", undefined, { timeout: 60000 });
const frames = () => page.evaluate("new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))");

const COLS = 40;
const ROWS = 22;
const handles = new Map<string, { x: number; y: number }>();
const rows: string[] = [];
for (let r = 0; r < ROWS; r++) {
  let line = "";
  for (let c = 0; c < COLS; c++) {
    const x = Math.round(((c + 0.5) / COLS) * w);
    const y = Math.round(((r + 0.5) / ROWS) * h);
    await page.mouse.move(x, y);
    await frames();
    const [id, cursor] = (await page.evaluate("[lab.hovered(), document.querySelector('canvas').style.cursor]")) as [string | null, string];
    const letter = id ? LETTER[id] : ".";
    line += cursor === "grab" ? letter.toUpperCase() : letter;
    if (cursor === "grab" && id && !handles.has(id)) handles.set(id, { x, y });
  }
  rows.push(line);
}
console.log(rows.join("\n"));
console.log(LAYERS.map((l) => `${LETTER[l.id]} ${l.id}`).join("  "), "  (capital: a drag moves it)");

for (const [id, at] of handles) {
  await page.evaluate("lab.grabs.length = 0");
  await page.mouse.move(at.x, at.y);
  await frames();
  await page.mouse.down();
  for (let i = 1; i <= 4; i++) {
    await page.mouse.move(at.x, at.y + i * 10);
    await frames();
  }
  const down = await page.evaluate("JSON.stringify(lab.grabs.at(-1) ?? null)");
  for (let i = 1; i <= 4; i++) {
    await page.mouse.move(at.x + i * 10, at.y + 40);
    await frames();
  }
  const forward = await page.evaluate("JSON.stringify(lab.grabs.at(-1) ?? null)");
  await page.mouse.up();
  console.log(`${id} at ${at.x},${at.y}: 40 px down ${down}; then 40 px forward ${forward}`);
}
await browser.close();
