// Open a page and print its uncaught errors with their stacks (the dev server's are readable).
//   bun tools/film-errors.ts [url]
import { chromium } from "playwright-core";
const browser = await chromium.launch({ args: ["--use-angle=d3d11", "--ignore-gpu-blocklist"] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on("pageerror", (e) => console.log("[uncaught]", e.message, "\n", e.stack?.split("\n").slice(0, 8).join("\n")));
page.on("console", (m) => m.type() === "error" && console.log("[error]", m.text()));
await page.goto(process.argv[2] ?? "http://127.0.0.1:5340/", { waitUntil: "load" });
await page.waitForTimeout(3000);
await browser.close();
