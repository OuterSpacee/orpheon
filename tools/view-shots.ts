// Take several pictures of the body's lab page in one go.
//
//   bun tools/view-shots.ts [--size 1440x900] [--wait 300] [--eval "js"] name="query" name="query" …
//
// Each picture is lab/view.html?<query>, saved as shots/<name>.png once the page says it is
// ready. The page's errors are printed, and with --eval the result of that script for each page.
// The dev server's live reload is switched off for these pages: the other parts of the project
// are being edited all the time, and a reload in the middle of a picture hangs it.
//
// The picture is the canvas itself, read back right after the view draws a frame (with the room
// the page leaves for its controls outlined, if the address asks for one), not a screenshot of
// the window: a screenshot waits for the compositor, and with WebGL on a busy card that wait
// never ends. Pass --window to take a screenshot of the window instead.
import { chromium } from "playwright-core";

const args = process.argv.slice(2);
const flag = (name: string, fallback: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args.splice(i, 2)[1] : fallback;
};
const size = flag("size", "1440x900").split("x").map(Number);
const wait = Number(flag("wait", "300"));
const script = flag("eval", "");
const base = flag("base", "http://127.0.0.1:5340/lab/view.html");
const whole = args.includes("--window") ? (args.splice(args.indexOf("--window"), 1), true) : false;

const browser = await chromium.launch({
  args: ["--ignore-gpu-blocklist", "--enable-unsafe-swiftshader", "--use-angle=d3d11"],
});
const context = await browser.newContext({ viewport: { width: size[0], height: size[1] } });
await context.route("**/@vite/client", (route) =>
  route.fulfill({
    contentType: "text/javascript",
    body: "export const createHotContext = () => undefined; export const updateStyle = () => {}; export const removeStyle = () => {}; export const injectQuery = (url) => url;",
  }),
);
for (const arg of args) {
  const cut = arg.indexOf("=");
  const name = arg.slice(0, cut);
  const query = arg.slice(cut + 1);
  const page = await context.newPage();
  page.on("console", (m) => {
    if (m.type() === "error" || m.type() === "warning") console.log(`${name} [${m.type()}] ${m.text()}`);
  });
  let broke = false;
  page.on("pageerror", (e) => {
    broke = true;
    console.log(`${name} [uncaught] ${e.message}`);
  });
  try {
    await page.goto(`${base}?${query}`, { waitUntil: "load" });
    for (let waited = 0; !broke && !(await page.evaluate("!!(window.lab && window.lab.ready)")); waited += 200) {
      if (waited > 40000) throw new Error("the page never said it was ready");
      await page.waitForTimeout(200);
    }
    if (broke) throw new Error("the page threw");
    await page.waitForTimeout(wait);
    if (script) console.log(`${name} eval:`, JSON.stringify(await page.evaluate(script)));
    if (whole) await page.screenshot({ path: `shots/${name}.png`, timeout: 20000 });
    else {
      const png = (await page.evaluate("lab.picture()")) as string;
      await Bun.write(`shots/${name}.png`, Buffer.from(png.slice(png.indexOf(",") + 1), "base64"));
    }
    console.log(`saved shots/${name}.png`);
  } catch (e) {
    console.log(`${name} FAILED: ${(e as Error).message.split("\n")[0]}`);
  }
  await page.close();
}
await browser.close();
