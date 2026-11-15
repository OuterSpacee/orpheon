// The pictures behind the README's figures, taken from the running page.
//
//   bun run dev                      (in another terminal: http://127.0.0.1:5340/)
//   bun tools/readme/shots.ts        writes shots/readme/*.png and shots/readme/film/*.png
//
// The body's pictures come from the lab page (lab/view.html), read straight off the canvas; the
// film for the animated figure is made frame by frame with the clock stopped, so it is the same
// every time. The page's own pictures are screenshots of the page, playing.
import { mkdirSync } from "node:fs";
import { chromium, type Page } from "playwright-core";

const BASE = "http://127.0.0.1:5340";
const OUT = "shots/readme";
mkdirSync(`${OUT}/film`, { recursive: true });

const browser = await chromium.launch({
  args: ["--ignore-gpu-blocklist", "--enable-unsafe-swiftshader", "--use-angle=d3d11", "--autoplay-policy=no-user-gesture-required"],
});

async function labPage(query: string, width: number, height: number): Promise<Page> {
  const context = await browser.newContext({ viewport: { width, height } });
  // No live reload in the middle of a picture.
  await context.route("**/@vite/client", (route) =>
    route.fulfill({ contentType: "text/javascript", body: "export const createHotContext = () => undefined; export const updateStyle = () => {}; export const removeStyle = () => {}; export const injectQuery = (url) => url;" }),
  );
  const page = await context.newPage();
  page.on("pageerror", (e) => console.log(`[uncaught] ${e.message}`));
  await page.goto(`${BASE}/lab/view.html?hud=0&${query}`, { waitUntil: "load" });
  for (let waited = 0; !(await page.evaluate("!!(window.lab && window.lab.ready)")); waited += 200) {
    if (waited > 60000) throw new Error(`${query}: the page never said it was ready`);
    await page.waitForTimeout(200);
  }
  await page.waitForTimeout(400);
  return page;
}

async function save(page: Page, name: string): Promise<void> {
  const png = (await page.evaluate("lab.picture()")) as string;
  await Bun.write(`${OUT}/${name}.png`, Buffer.from(png.slice(png.indexOf(",") + 1), "base64"));
  console.log(`saved ${OUT}/${name}.png`);
}

async function still(name: string, query: string, width = 1200, height = 1200): Promise<void> {
  const page = await labPage(query, width, height);
  await save(page, name);
  await page.context().close();
}

// ── the body ──
await still("hero", "t=2.2&yaw=-16&pitch=3", 2000, 1100);
for (const part of ["skin", "bone", "tongue", "palate", "nose", "air", "larynx", "lungs"]) await still(`part-${part}`, `t=2.2&solo=${part}`, 900, 900);
await still("cut", "t=2.2&cut=1", 1200, 1200);
await still("apart", "t=2.2&explode=1", 1600, 1200);
await still("front", "t=2.2&yaw=-90", 1200, 1200);
await still("airy", "t=2.2&yaw=-30&pitch=5&density=0.12", 900, 900);
await still("usual", "t=2.2&yaw=-30&pitch=5", 900, 900);
await still("dense", "t=2.2&yaw=-30&pitch=5&density=1", 900, 900);
await still("colour", "t=2.2&yaw=-30&pitch=5&colour=1", 900, 900);
for (const lids of [0, 0.35, 0.7, 1]) await still(`lids-${lids}`, `pose=a&t=1&yaw=-90&zoom=2.1&lids=${lids}`, 1000, 1000);
await still("choir", "t=6&cast=4&yaw=-12", 1800, 1000);

// ── the film: six seconds of the voice going round its poses, frame by frame ──
{
  const page = await labPage("t=0.6&yaw=-24&pitch=4", 820, 820);
  const FPS = 15;
  for (let i = 0; i < FPS * 6.5; i++) {
    await page.evaluate(`lab.step(${1 / FPS})`);
    const png = (await page.evaluate("lab.picture()")) as string;
    await Bun.write(`${OUT}/film/${String(i).padStart(3, "0")}.png`, Buffer.from(png.slice(png.indexOf(",") + 1), "base64"));
  }
  console.log(`saved ${FPS * 6.5} frames in ${OUT}/film/`);
  await page.context().close();
}

// ── the page itself, singing ──
async function app(name: string, width: number, height: number, steps: string[], wait = 3500): Promise<void> {
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: width < 600 ? 2 : 1 });
  const page = await context.newPage();
  page.on("pageerror", (e) => console.log(`[uncaught] ${e.message}`));
  await page.goto(`${BASE}/`, { waitUntil: "load" });
  await page.waitForTimeout(1500);
  await page.mouse.click(width / 2, 12);
  for (const step of steps) {
    await page.evaluate(step);
    await page.waitForTimeout(500);
  }
  await page.waitForTimeout(wait);
  await page.mouse.move(6, height - 6);
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log(`saved ${OUT}/${name}.png`);
  await context.close();
}
await app("page-sing", 1440, 900, ["orpheon.store.set({ mode: 'sing' })", "orpheon.go()"]);
await app("page-touch", 1440, 900, ["orpheon.store.set({ mode: 'touch' })"], 1500);
await app("phone-sing", 390, 844, ["orpheon.store.set({ mode: 'sing' })", "orpheon.go()"]);
await app("phone-body", 390, 844, ["orpheon.store.set({ mode: 'sing' })", "orpheon.store.set({ sheet: 'parts' })"], 1500);
await app("phone-controls", 390, 844, ["orpheon.store.set({ mode: 'sing' })", "orpheon.store.set({ sheet: 'controls' })"], 1500);
await browser.close();
